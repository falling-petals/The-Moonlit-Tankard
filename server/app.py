"""Loopback-only game host and LangChain API. No credential is sent to the browser."""

import asyncio
from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
import json
from pathlib import Path
from urllib.parse import urlsplit

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
import httpx
from openai import APIConnectionError, APIStatusError, APITimeoutError
from pydantic import ValidationError

from .chain import DialogueService, invoke_reply, stream_reply
from .config import ModelConfig
from .schemas import ChatInput

ROOT = Path(__file__).resolve().parents[1]
MAX_BODY = 128 * 1024
LOCAL_HOSTS = {"127.0.0.1", "localhost", "::1"}
PUBLIC_ROOT = {"index.html", "style.css", "party.css", "intro.css", "tutorial.css", "cellar.css"}


class ClientGone(Exception):
    pass


async def invoke_while_connected(request: Request, invocation):
    async def wait_disconnect():
        while (await request.receive())["type"] != "http.disconnect":
            pass
    work = asyncio.create_task(invocation)
    disconnected = asyncio.create_task(wait_disconnect())
    try:
        done, _pending = await asyncio.wait({work, disconnected}, return_when=asyncio.FIRST_COMPLETED)
        if disconnected in done:
            raise ClientGone()
        return await work
    finally:
        work.cancel()
        disconnected.cancel()
        await asyncio.gather(work, disconnected, return_exceptions=True)


class CancellableStream(StreamingResponse):
    """ASGI 2.4 send errors alone cannot notice a disconnect while a model is silent."""
    def __init__(self, content, *, release: Callable):
        super().__init__(content, media_type="application/x-ndjson")
        self.release = release

    async def __call__(self, scope, receive, send):
        writer = asyncio.create_task(self.stream_response(send))
        disconnected = asyncio.create_task(self.listen_for_disconnect(receive))
        try:
            done, _pending = await asyncio.wait({writer, disconnected}, return_when=asyncio.FIRST_COMPLETED)
            if writer in done:
                try:
                    await writer
                except OSError:
                    pass
        finally:
            writer.cancel()
            disconnected.cancel()
            await asyncio.gather(writer, disconnected, return_exceptions=True)
            try:
                await self.body_iterator.aclose()
            finally:
                self.release()


def error_response(code: str, message: str, status: int) -> JSONResponse:
    return JSONResponse({"error": {"code": code, "message": message}}, status_code=status)


def safe_error(error: Exception) -> tuple[str, str, int]:
    # Never include str(error), provider response bodies, headers or model configuration.
    if isinstance(error, (TimeoutError, APITimeoutError, httpx.TimeoutException)):
        return "timeout", "模型回复超时，店员仍在正常工作。", 504
    if isinstance(error, APIStatusError):
        if error.status_code == 401:
            return "credentials", "模型凭据无效，请检查本机环境变量并重启服务。", 502
        if error.status_code == 403:
            return "permission", "模型权限或额度不足，请检查本机模型配置。", 502
        if error.status_code == 429:
            return "rate_limit", "调用较频繁，稍后再试。", 429
        return "provider", "模型接口暂不可用，请检查本机模型与接口配置。", 502
    if isinstance(error, (APIConnectionError, httpx.NetworkError)):
        return "connection", "无法连接模型，请检查本机网络和接口配置。", 502
    if isinstance(error, (ValueError, ValidationError)):
        return "invalid_reply", "模型回复格式不完整，请重试。", 502
    return "provider", "模型回复失败，请稍后重试。", 502


def _local_origin(value: str) -> tuple[str, str, int] | None:
    try:
        url = urlsplit(value)
        if url.scheme not in {"http", "https"} or url.hostname not in LOCAL_HOSTS or url.username or url.password:
            return None
        if url.path not in {"", "/"} or url.query or url.fragment:
            return None
        return url.scheme, url.hostname, url.port or (443 if url.scheme == "https" else 80)
    except ValueError:
        return None


class LocalOnlyMiddleware:
    """Keep the ASGI receive channel intact so disconnects reach the generation task."""
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        request = Request(scope)
        expected = _local_origin(f'{request.url.scheme}://{request.headers.get("host", "")}')
        origin = request.headers.get("origin")
        if expected is None or (origin is not None and _local_origin(origin) != expected) or request.headers.get("sec-fetch-site") == "cross-site":
            return await error_response("local_only", "请从本机游戏页面访问。", 403)(scope, receive, send)

        async def public_headers(message):
            if message["type"] == "http.response.start":
                headers = [(key, value) for key, value in message["headers"] if key.lower() not in {b"cache-control", b"referrer-policy", b"x-content-type-options"}]
                message["headers"] = headers + [(b"cache-control", b"no-store"), (b"referrer-policy", b"no-referrer"), (b"x-content-type-options", b"nosniff")]
            await send(message)
        await self.app(scope, receive, public_headers)


def create_app(config: ModelConfig | None = None, *, invoke: Callable = invoke_reply,
               stream: Callable = stream_reply) -> FastAPI:
    config = config if config is not None else ModelConfig.from_environment()
    service = DialogueService(config) if invoke is invoke_reply or stream is stream_reply else None

    @asynccontextmanager
    async def lifespan(_app):
        try:
            yield
        finally:
            if service is not None:
                await service.aclose()

    async def run_invoke(payload):
        return await service.invoke(payload) if invoke is invoke_reply else await invoke(payload, config)

    def run_stream(payload):
        return service.stream(payload) if stream is stream_reply else stream(payload, config)

    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan)
    app.add_middleware(LocalOnlyMiddleware)
    active = asyncio.Lock()

    @app.exception_handler(RequestValidationError)
    async def invalid_request(_request: Request, _error: RequestValidationError):
        return error_response("invalid_request", "对话请求格式无效。", 422)

    @app.get("/api/ai/status")
    async def status():
        return config.public_status()

    @app.post("/api/ai/chat")
    async def chat(request: Request):
        try:
            body = bytearray()
            async for chunk in request.stream():
                body.extend(chunk)
                if len(body) > MAX_BODY:
                    return error_response("too_large", "对话请求过大。", 413)
            payload = ChatInput.model_validate_json(body)
        except (ValueError, ValidationError):
            return error_response("invalid_request", "对话请求格式无效。", 422)
        if not config.public_status()["configured"]:
            return error_response("not_configured", "本机服务尚未配置模型凭据，请设置环境变量后重启。经营可以继续。", 503)
        if active.locked():
            return error_response("busy", "伙伴正在回应，稍等片刻。", 429)
        await active.acquire()
        released = False

        def release_once():
            nonlocal released
            if not released:
                released = True
                active.release()

        if not payload.stream:
            try:
                result = await invoke_while_connected(request, run_invoke(payload))
                return {"reply": result}
            except ClientGone:
                return error_response("cancelled", "对话已取消。", 499)
            except Exception as error:
                return error_response(*safe_error(error))
            finally:
                release_once()

        async def events() -> AsyncIterator[str]:
            upstream = run_stream(payload)
            try:
                async for event in upstream:
                    yield json.dumps(event, ensure_ascii=False, allow_nan=False) + "\n"
            except asyncio.CancelledError:
                raise
            except Exception as error:
                code, message, _status = safe_error(error)
                yield json.dumps({"type": "error", "code": code, "message": message}, ensure_ascii=False) + "\n"
            finally:
                try:
                    await upstream.aclose()
                finally:
                    release_once()
        return CancellableStream(events(), release=release_once)

    @app.get("/{path:path}")
    async def static_file(path: str):
        path = path or "index.html"
        target = (ROOT / path).resolve()
        if not target.is_relative_to(ROOT) or not target.is_file():
            return error_response("not_found", "文件不存在。", 404)
        relative = target.relative_to(ROOT)
        permitted = str(relative).replace("\\", "/") in PUBLIC_ROOT
        if relative.parts[0] == "src":
            permitted = target.suffix.lower() in {".js", ".css"}
        elif relative.parts[0] == "assets":
            permitted = target.suffix.lower() in {".html", ".js", ".css", ".json", ".png", ".jpg", ".jpeg", ".svg", ".webp", ".mp3", ".wav", ".ogg"}
        if not permitted or any(part.startswith(".") for part in relative.parts):
            return error_response("not_found", "文件不存在。", 404)
        return FileResponse(target)

    return app
