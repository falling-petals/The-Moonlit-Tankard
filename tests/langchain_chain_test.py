"""Exercise the application boundary through the real LangChain/OpenAI client."""

import asyncio
import json
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from unittest.mock import patch

from pydantic import SecretStr, ValidationError
from langchain_core.runnables import RunnableLambda

from server.chain import create_chain, invoke_reply, parse_reply, partial_speech, stream_reply
from server.config import ModelConfig
from server.schemas import ChatInput


def payload(**changes):
    value = {
        "staff": {"id": "qingya", "name": "青芽", "personality": "细心", "memories": ["喜欢花茶"]},
        "context": {}, "message": "你好", "stream": True,
    }
    value.update(changes)
    return ChatInput.model_validate(value)


class ConfigurationAndSchemaTests(unittest.TestCase):
    def test_environment_key_stays_private_and_local_http_is_allowed(self):
        config = ModelConfig.from_environment({
            "AI_DASHSCOPE_API_KEY": "mock-private-credential",
            "DASHSCOPE_API_KEY": "second-choice", "OPENAI_API_KEY": "third-choice",
            "AI_BASE_URL": "http://127.0.0.1:12345/v1/", "AI_MODEL": "qwen-test",
        })
        self.assertEqual(config.api_key.get_secret_value(), "mock-private-credential")
        self.assertEqual(config.base_url, "http://127.0.0.1:12345/v1")
        self.assertTrue(config.public_status()["configured"])
        self.assertNotIn("mock-private-credential", repr(config))
        self.assertNotIn("mock-private-credential", json.dumps(config.public_status()))
        self.assertFalse(ModelConfig.from_environment({}).public_status()["configured"])
        fallback = ModelConfig.from_environment({"AI_DASHSCOPE_API_KEY": " ", "OPENAI_API_KEY": "fallback-only", "OPENAI_BASE_URL": "https://example.com/v1"})
        self.assertEqual(fallback.api_key.get_secret_value(), "fallback-only")
        self.assertEqual(fallback.base_url, "https://example.com/v1")
        self.assertEqual(fallback.model, "gpt-4.1-mini")
        openai_default = ModelConfig.from_environment({"OPENAI_API_KEY": "fallback-only"})
        self.assertEqual(openai_default.base_url, "https://api.openai.com/v1")
        self.assertEqual(openai_default.model, "gpt-4.1-mini")

    def test_insecure_remote_or_credential_bearing_urls_are_rejected(self):
        for base in ["http://example.com/v1", "https://user:password@example.com/v1", "https://example.com/v1?key=x", "ftp://localhost/v1", "http://localhost.evil.test/v1"]:
            with self.subTest(base=base), self.assertRaises(ValueError):
                ModelConfig.from_environment({"AI_BASE_URL": base})

    def test_input_rejects_provider_injection_and_oversized_content(self):
        for changes in [{"key": "x"}, {"config": {}}, {"provider": "x"}, {"message": "x" * 501}, {"context": {"x": "a" * 9000}}]:
            with self.subTest(changes=list(changes)), self.assertRaises(ValidationError):
                payload(**changes)
        with self.assertRaises(ValidationError):
            payload(staff={"id": "a", "name": "A", "memories": ["x"] * 13})

    def test_reply_sanitizes_optional_actions_but_rejects_missing_speech(self):
        reply = parse_reply('```json\n{"speech":"  已经收好啦。  ","memory":"喜欢茶", "suggestion":"invented","emotion":"hacked","plan":{"type":"restock","drink":"ale","low":12,"target":6}}\n```')
        self.assertEqual(reply.speech, "已经收好啦。")
        self.assertIsNone(reply.suggestion)
        self.assertIsNone(reply.plan)
        self.assertIsNone(reply.emotion)
        for raw in ['{}', '{"speech":"  "}', '{"speech":123}', '{"speech":"' + 'x' * 361 + '"}']:
            with self.subTest(raw=raw[:40]), self.assertRaises(ValueError):
                parse_reply(raw)

    def test_plan_restock_numbers_are_strict_and_known_values_survive(self):
        for plan in [{"type": []}, {"type": {}}, {"type": "restock", "drink": "ale", "low": True, "target": 12}, {"type": "restock", "drink": "ale", "low": 6.0, "target": 12}, {"type": "restock", "drink": "unknown", "low": 6, "target": 12}, {"type": "restock", "drink": "ale", "low": 6, "target": 41}]:
            self.assertIsNone(parse_reply(json.dumps({"speech": "好", "plan": plan})).plan)
        for plan in [{"type": "policy", "value": "clean-first"}, {"type": "restock", "drink": "tea", "low": 0, "target": 40}]:
            self.assertEqual(parse_reply(json.dumps({"speech": "好", "plan": plan})).model_dump()["plan"], plan)

    def test_partial_speech_handles_escapes_and_surrogate_pairs_at_each_split(self):
        raw = '{"memory":"speech is private", "nested":{"speech":"不要显示"}, "speech":"你好\\n\\"店主\\"\\ud83c\\udf7b，欢迎！", "emotion":"happy"}'
        expected = '你好\n"店主"🍻，欢迎！'
        previous = ''
        for offset in range(len(raw) + 1):
            current = partial_speech(raw[:offset])
            self.assertTrue(expected.startswith(current), (offset, repr(current)))
            self.assertTrue(current.startswith(previous))
            self.assertFalse(any(0xD800 <= ord(char) <= 0xDFFF for char in current))
            previous = current
        self.assertEqual(previous, expected)


class ModelHandler(BaseHTTPRequestHandler):
    requests = []
    status = 200
    fragments = []

    def log_message(self, *args):
        pass

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        self.requests.append({"path": self.path, "body": body})
        self.send_response(self.status)
        if self.status != 200:
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"error":{"message":"mock upstream failure", "type":"rate_limit_error", "code":"rate_limit"}}')
            return
        self.send_header("Content-Type", "text/event-stream" if body["stream"] else "application/json")
        self.end_headers()
        if body["stream"]:
            for index, part in enumerate(self.fragments):
                delta = {"content": part}
                if index == 0:
                    delta["role"] = "assistant"
                chunk = {"id": "mock-chat", "object": "chat.completion.chunk", "created": 1, "model": "qwen-test", "choices": [{"index": 0, "delta": delta, "finish_reason": "stop" if index == len(self.fragments) - 1 else None}]}
                self.wfile.write(("data: " + json.dumps(chunk) + "\n\n").encode())
                self.wfile.flush()
            self.wfile.write(b'data: [DONE]\n\n')
        else:
            self.wfile.write(json.dumps({"id": "mock-chat", "object": "chat.completion", "created": 1, "model": "qwen-test", "choices": [{"index": 0, "message": {"role": "assistant", "content": ''.join(self.fragments)}, "finish_reason": "stop"}], "usage": {"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2}}).encode())


class RealLangChainTests(unittest.IsolatedAsyncioTestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), ModelHandler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def setUp(self):
        ModelHandler.requests = []
        ModelHandler.status = 200
        ModelHandler.fragments = ['{"speech":"你', '好\\ud83c', '\\udf7b", "memory":"", "suggestion":"tasting", "emotion":"happy"}']
        self.config = ModelConfig(api_key=SecretStr("mock-private-credential"), base_url=f"http://127.0.0.1:{self.server.server_port}/v1", model="qwen-test")

    async def test_real_chain_streams_visible_speech_and_validated_reply(self):
        history = [{"role": "staff", "text": f"历史{i}"} for i in range(8)]
        context = {"gold": 77, "workArrangement": {"current": "优先收桌，已生效", "pending": None}, "recentDialogue": history}
        staff = {"id": "qingya", "name": "青芽", "personality": "细心", "memories": ["喜欢花茶", "等待店主应用收桌安排"]}
        events = [event async for event in stream_reply(payload(context=context, staff=staff), self.config)]
        self.assertEqual(events[-1]["reply"]["speech"], "你好🍻")
        self.assertEqual(events[-1]["reply"]["suggestion"], "tasting")
        speech_events = [event["speech"] for event in events if event["type"] == "speech"]
        self.assertIn("你", speech_events)
        self.assertEqual(speech_events[-1], "你好🍻")
        request = ModelHandler.requests[0]
        self.assertEqual(request["path"], "/v1/chat/completions")
        body = request["body"]
        self.assertTrue(body["stream"])
        self.assertEqual(body["temperature"], .75)
        self.assertEqual(body["max_tokens"], 360)
        self.assertEqual(body["response_format"], {"type": "json_object"})
        self.assertFalse(body["enable_thinking"])
        self.assertNotIn("stream_options", body)
        system = body["messages"][0]["content"]
        self.assertIn("青芽", system)
        self.assertIn("喜欢花茶", system)
        self.assertIn("pending为null", system)
        self.assertIn("即使旧对话或记忆提过等待应用", system)
        self.assertTrue(system.endswith('当前工作安排事实：{"current":"优先收桌，已生效","pending":null}'))
        prompt = json.dumps(body["messages"], ensure_ascii=False)
        self.assertNotIn("历史0", prompt)
        self.assertNotIn("历史1", prompt)
        self.assertIn("历史2", prompt)
        self.assertIn("优先收桌，已生效", prompt)
        self.assertIn("77", prompt)
        self.assertNotIn("mock-private-credential", prompt)

    async def test_nonstream_uses_real_chain_and_429_never_retries(self):
        reply = await invoke_reply(payload(stream=False), self.config)
        self.assertEqual(reply["speech"], "你好🍻")
        self.assertFalse(ModelHandler.requests[0]["body"]["stream"])
        ModelHandler.requests = []
        ModelHandler.status = 429
        with self.assertRaises(Exception):
            await invoke_reply(payload(stream=False), self.config)
        self.assertEqual(len(ModelHandler.requests), 1)

    async def test_inherited_langsmith_tracing_is_disabled(self):
        # A successful call with remote tracing inherited must never create a tracing client.
        with patch.dict("os.environ", {"LANGCHAIN_TRACING_V2": "true", "LANGSMITH_TRACING": "true"}), patch("langsmith.client.Client.create_run", side_effect=AssertionError("Remote tracing attempted")) as create_run:
            await invoke_reply(payload(stream=False), self.config)
            create_run.assert_not_called()

    async def test_total_timeout_closes_upstream(self):
        closed = asyncio.Event()

        class SlowChain:
            async def astream(self, value, config=None):
                try:
                    yield '{"speech":"好'
                    await asyncio.sleep(10)
                finally:
                    closed.set()

        config = ModelConfig(api_key=SecretStr("mock"), base_url=self.config.base_url, model="mock", timeout=.03)
        with self.assertRaises(TimeoutError):
            async for _ in stream_reply(payload(), config, chain=SlowChain()):
                pass
        self.assertTrue(closed.is_set())

    async def test_cancellation_closes_upstream_and_emits_no_final_reply(self):
        started = asyncio.Event()
        closed = asyncio.Event()
        events = []

        class SlowChain:
            async def astream(self, value, config=None):
                try:
                    yield '{"speech":"好'
                    started.set()
                    await asyncio.sleep(10)
                finally:
                    closed.set()

        async def consume():
            async for event in stream_reply(payload(), self.config, chain=SlowChain()):
                events.append(event)

        task = asyncio.create_task(consume())
        await asyncio.wait_for(started.wait(), 1)
        task.cancel()
        with self.assertRaises(asyncio.CancelledError):
            await task
        self.assertTrue(closed.is_set())
        self.assertFalse(any(event["type"] == "reply" for event in events))

    async def test_consumer_closing_between_chunks_closes_upstream(self):
        closed = asyncio.Event()

        class PausedChain:
            async def astream(self, value, config=None):
                try:
                    yield '{"speech":"好'
                    await asyncio.sleep(10)
                finally:
                    closed.set()

        stream = stream_reply(payload(), self.config, chain=PausedChain())
        self.assertEqual(await anext(stream), {"type": "speech", "speech": "好"})
        await stream.aclose()
        self.assertTrue(closed.is_set())

    async def test_service_reuses_one_chain_and_closes_real_sdk_clients(self):
        from server.chain import DialogueService
        constructed = []

        def build(config):
            chain = create_chain(config)
            constructed.append(chain)
            return chain

        service = DialogueService(self.config)
        try:
            with patch("server.chain.create_chain", side_effect=build):
                self.assertEqual((await service.invoke(payload()))["speech"], "你好🍻")
                events = [event async for event in service.stream(payload())]
                self.assertEqual(events[-1]["reply"]["speech"], "你好🍻")
            self.assertEqual(len(constructed), 1)
            model = constructed[0].steps[2]
            self.assertFalse(model.root_client.is_closed())
            self.assertFalse(model.root_async_client.is_closed())
        finally:
            await service.aclose()
        self.assertTrue(model.root_client.is_closed())
        self.assertTrue(model.root_async_client.is_closed())
        await service.aclose()
        with self.assertRaises(RuntimeError):
            await service.invoke(payload())


class DialogueServiceLifecycleTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.config = ModelConfig(api_key=SecretStr("mock"))

    async def test_delayed_construction_keeps_event_loop_responsive(self):
        from server.chain import DialogueService
        release = threading.Event()
        started = threading.Event()

        def build(config):
            started.set()
            release.wait(2)
            return RunnableLambda(lambda value: '{"speech":"好"}')

        service = DialogueService(self.config)
        with patch("server.chain.create_chain", side_effect=build):
            task = asyncio.create_task(service.invoke(payload()))
            before = time.monotonic()
            try:
                await asyncio.sleep(.03)
                self.assertLess(time.monotonic() - before, .5)
                self.assertTrue(started.is_set())
                self.assertFalse(task.done())
            finally:
                release.set()
                await task
                await service.aclose()

    async def test_cancelled_initial_request_does_not_poison_cached_construction(self):
        from server.chain import DialogueService
        release = threading.Event()
        started = threading.Event()
        builds = []

        def build(config):
            builds.append(1)
            started.set()
            release.wait(2)
            return RunnableLambda(lambda value: '{"speech":"继续工作"}')

        service = DialogueService(self.config)
        with patch("server.chain.create_chain", side_effect=build):
            task = asyncio.create_task(service.invoke(payload()))
            try:
                self.assertTrue(await asyncio.to_thread(started.wait, 1))
                task.cancel()
                with self.assertRaises(asyncio.CancelledError):
                    await task
                next_request = asyncio.create_task(service.invoke(payload()))
                release.set()
                self.assertEqual((await next_request)["speech"], "继续工作")
                self.assertEqual(len(builds), 1)
            finally:
                release.set()
                await service.aclose()

    async def test_timeout_includes_construction_and_shutdown_awaits_it(self):
        from server.chain import DialogueService
        release = threading.Event()
        started = threading.Event()

        def build(config):
            started.set()
            release.wait(2)
            return RunnableLambda(lambda value: '{"speech":"好"}')

        config = ModelConfig(api_key=SecretStr("mock"), timeout=.03)
        service = DialogueService(config)
        with patch("server.chain.create_chain", side_effect=build):
            try:
                with self.assertRaises(TimeoutError):
                    await service.invoke(payload())
                self.assertTrue(started.is_set())
                close = asyncio.create_task(service.aclose())
                await asyncio.sleep(.02)
                self.assertFalse(close.done())
                release.set()
                await close
            finally:
                release.set()
                await service.aclose()


if __name__ == "__main__":
    unittest.main()
