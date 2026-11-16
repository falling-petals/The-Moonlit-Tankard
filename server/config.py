"""Environment-only model configuration; credentials never enter public status."""

from dataclasses import dataclass, field
import ipaddress
import math
import os
from collections.abc import Mapping
from urllib.parse import urlsplit

from pydantic import SecretStr


DEFAULT_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1"
DEFAULT_MODEL = "qwen-plus"


def _validate_base_url(value: str) -> str:
    base = value.strip().rstrip("/")
    try:
        parsed = urlsplit(base)
        port = parsed.port
        hostname = parsed.hostname
        if not hostname or parsed.username is not None or parsed.password is not None or parsed.query or parsed.fragment:
            raise ValueError
        local = hostname.lower() == "localhost"
        if not local:
            try:
                local = ipaddress.ip_address(hostname).is_loopback
            except ValueError:
                local = False
        if parsed.scheme != "https" and not (parsed.scheme == "http" and local):
            raise ValueError
        if port is not None and not 1 <= port <= 65535:
            raise ValueError
        if any(ord(char) < 33 for char in base) or "\\" in base:
            raise ValueError
    except (ValueError, TypeError):
        raise ValueError("模型地址需要使用 HTTPS 或本机回环地址，且不能含凭据、查询参数或片段。") from None
    return base


@dataclass(frozen=True, slots=True)
class ModelConfig:
    api_key: SecretStr = field(default_factory=lambda: SecretStr(""), repr=False)
    base_url: str = DEFAULT_BASE_URL
    model: str = DEFAULT_MODEL
    timeout: float = 25.0

    def __post_init__(self) -> None:
        if not isinstance(self.api_key, SecretStr):
            raise TypeError("api_key must be a SecretStr")
        object.__setattr__(self, "base_url", _validate_base_url(self.base_url))
        model = self.model.strip()
        if not model or len(model) > 160 or any(ord(char) < 32 for char in model):
            raise ValueError("模型名称无效。")
        object.__setattr__(self, "model", model)
        if not math.isfinite(self.timeout) or self.timeout <= 0:
            raise ValueError("模型超时时间无效。")

    @classmethod
    def from_environment(cls, environment: Mapping[str, str] | None = None) -> "ModelConfig":
        env = os.environ if environment is None else environment

        def first(*names: str, default: str = "") -> str:
            return next((env[name].strip() for name in names if env.get(name, "").strip()), default)

        dashscope_key = first("AI_DASHSCOPE_API_KEY", "DASHSCOPE_API_KEY")
        openai_only = not dashscope_key and bool(first("OPENAI_API_KEY"))
        return cls(
            api_key=SecretStr(first("AI_DASHSCOPE_API_KEY", "DASHSCOPE_API_KEY", "OPENAI_API_KEY")),
            base_url=first("AI_BASE_URL", "OPENAI_BASE_URL", default="https://api.openai.com/v1" if openai_only else DEFAULT_BASE_URL),
            model=first("AI_MODEL", default="gpt-4.1-mini" if openai_only else DEFAULT_MODEL),
        )

    def public_status(self) -> dict[str, str | bool]:
        return {
            "service": "moonlit-tankard-langchain",
            "configured": bool(self.api_key.get_secret_value().strip()),
            "model": self.model,
            "baseUrl": self.base_url,
            "framework": "LangChain Python",
        }
