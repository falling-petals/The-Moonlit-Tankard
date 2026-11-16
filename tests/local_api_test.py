"""Public local API, output sanitation, file boundaries and real disconnect cancellation."""
import asyncio
import json
import socket
import threading
import unittest

import httpx
from pydantic import SecretStr
import uvicorn

from server.app import create_app
from server.config import ModelConfig

PAYLOAD = {"staff": {"id": "qingya", "name": "DeepSeek"}, "context": {}, "message": "你好"}
FAKE_KEY = "local-api-test-private-value"


class LocalAPITests(unittest.IsolatedAsyncioTestCase):
    def app(self, **options):
        return create_app(ModelConfig(api_key=SecretStr(FAKE_KEY)), **options)

    async def client(self, app, **kwargs):
        return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://127.0.0.1:4173", trust_env=False, **kwargs)

    async def test_status_uses_real_framework_identity_without_credentials(self):
        async with await self.client(self.app()) as client:
            response = await client.get("/api/ai/status")
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["service"], "moonlit-tankard-langchain")
            self.assertEqual(response.json()["framework"], "LangChain Python")
            self.assertTrue(response.json()["configured"])
            self.assertNotIn(FAKE_KEY, response.text)

    async def test_unconfigured_service_keeps_game_available_without_model_call(self):
        async with await self.client(create_app(ModelConfig())) as client:
            self.assertEqual((await client.get("/")).status_code, 200)
            response = await client.post("/api/ai/chat", json=PAYLOAD)
            self.assertEqual(response.status_code, 503)
            self.assertEqual(response.json()["error"]["code"], "not_configured")

    async def test_invalid_and_large_inputs_do_not_echo_private_data(self):
        async with await self.client(self.app()) as client:
            response = await client.post("/api/ai/chat", json={**PAYLOAD, "key": FAKE_KEY})
            self.assertEqual(response.status_code, 422)
            self.assertNotIn(FAKE_KEY, response.text)
            self.assertEqual((await client.post("/api/ai/chat", content=b"x" * 140_000)).status_code, 413)
            self.assertEqual((await client.post("/api/ai/chat", content=b"{")).status_code, 422)

    async def test_only_local_same_origin_requests_are_allowed(self):
        async with await self.client(self.app()) as client:
            for headers in [{"Origin": "https://outside.example"}, {"Origin": "null"}, {"Host": "outside.example"}, {"Sec-Fetch-Site": "cross-site"}]:
                self.assertEqual((await client.get("/api/ai/status", headers=headers)).status_code, 403)
            response = await client.post("/api/ai/chat", json=PAYLOAD, headers={"Origin": "http://localhost:4173"})
            self.assertEqual(response.status_code, 403)

    async def test_static_game_assets_work_and_private_project_files_stay_private(self):
        async with await self.client(self.app()) as client:
            for path in ["/", "/src/app.js", "/assets/manifest.json", "/assets/characters.html"]:
                response = await client.get(path)
                self.assertEqual(response.status_code, 200, path)
                self.assertEqual(response.headers["referrer-policy"], "no-referrer")
            for path in ["/.env", "/.git/config", "/.venv/pyvenv.cfg", "/server/config.py", "/AGENTS.md", "/uv.lock", "/assets/", "/tools/launch.py", "/assets/../server/config.py"]:
                self.assertEqual((await client.get(path)).status_code, 404, path)

    async def test_stream_partial_reply_and_error_are_safe_and_lock_is_released(self):
        async def stream(payload, _config):
            yield {"type": "speech", "speech": "你好"}
            if payload.message == "失败":
                raise ValueError(FAKE_KEY)
            yield {"type": "reply", "reply": {"speech": "你好", "memory": "", "suggestion": None}}

        async with await self.client(self.app(stream=stream)) as client:
            for text in ["失败", "正常"]:
                response = await client.post("/api/ai/chat", json={**PAYLOAD, "message": text})
                self.assertEqual(response.status_code, 200)
                values = [json.loads(line) for line in response.text.splitlines()]
                self.assertEqual(values[0], {"type": "speech", "speech": "你好"})
                self.assertEqual(values[-1]["type"], "error" if text == "失败" else "reply")
                self.assertNotIn(FAKE_KEY, response.text)

    async def test_nonstream_timeouts_are_redacted(self):
        async def fail(_payload, _config):
            raise TimeoutError(FAKE_KEY)
        async with await self.client(self.app(invoke=fail)) as client:
            response = await client.post("/api/ai/chat", json={**PAYLOAD, "stream": False})
            self.assertEqual(response.status_code, 504)
            self.assertEqual(response.json()["error"]["code"], "timeout")
            self.assertNotIn(FAKE_KEY, response.text)

    async def test_real_browser_disconnect_cancels_pending_generation(self):
        stopped = threading.Event()
        async def stream(_payload, _config):
            try:
                yield {"type": "speech", "speech": "半句话"}
                await asyncio.sleep(20)
            finally:
                stopped.set()
        sock = socket.socket()
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
        server = uvicorn.Server(uvicorn.Config(self.app(stream=stream), log_level="critical", access_log=False))
        thread = threading.Thread(target=lambda: server.run(sockets=[sock]), daemon=True)
        thread.start()
        try:
            for _ in range(100):
                if server.started:
                    break
                await asyncio.sleep(.02)
            async with httpx.AsyncClient(base_url=f"http://127.0.0.1:{port}", trust_env=False) as client:
                async with client.stream("POST", "/api/ai/chat", json=PAYLOAD) as response:
                    async for line in response.aiter_lines():
                        if line:
                            self.assertEqual(json.loads(line)["type"], "speech")
                            break
            self.assertTrue(await asyncio.to_thread(stopped.wait, 2), "disconnect must promptly close upstream")
        finally:
            server.should_exit = True
            await asyncio.to_thread(thread.join, 3)
            sock.close()

    async def test_nonstream_disconnect_releases_slot_for_next_request(self):
        started, stopped = threading.Event(), threading.Event()
        async def invoke(_payload, _config):
            if _payload.message == "下一条":
                return {"speech": "下一条已收到", "memory": "", "suggestion": None}
            started.set()
            try:
                await asyncio.sleep(20)
            finally:
                stopped.set()
        sock = socket.socket()
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
        server = uvicorn.Server(uvicorn.Config(self.app(invoke=invoke), log_level="critical", access_log=False))
        thread = threading.Thread(target=lambda: server.run(sockets=[sock]), daemon=True)
        thread.start()
        try:
            for _ in range(100):
                if server.started:
                    break
                await asyncio.sleep(.02)
            async with httpx.AsyncClient(base_url=f"http://127.0.0.1:{port}", trust_env=False) as client:
                task = asyncio.create_task(client.post("/api/ai/chat", json={**PAYLOAD, "stream": False}))
                self.assertTrue(await asyncio.to_thread(started.wait, 2))
                task.cancel()
                with self.assertRaises(asyncio.CancelledError):
                    await task
                self.assertTrue(await asyncio.to_thread(stopped.wait, 2))
                response = await client.post("/api/ai/chat", json={**PAYLOAD, "stream": False, "message": "下一条"})
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json()["reply"]["speech"], "下一条已收到")
        finally:
            server.should_exit = True
            await asyncio.to_thread(thread.join, 3)
            sock.close()


if __name__ == "__main__":
    unittest.main()
