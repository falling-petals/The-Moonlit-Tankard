"""Bounded browser input and validated, non-executable character proposals."""

import json
import math
import unicodedata
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, StrictInt, ValidationError, field_validator


class InputModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class MemoryInput(InputModel):
    type: str = Field(default="preference", max_length=40)
    text: str = Field(max_length=320)
    day: int = Field(default=1, ge=0, le=1_000_000_000)
    source: str = Field(default="dialogue", max_length=80)


class StaffInput(InputModel):
    id: str = Field(default="", max_length=80)
    name: str = Field(min_length=1, max_length=80)
    personality: str = Field(default="友善细心", max_length=600)
    memories: list[Annotated[str, Field(max_length=320)] | MemoryInput] = Field(default_factory=list, max_length=12)


def _bounded_json(value: Any, depth: int = 0) -> None:
    if depth > 10:
        raise ValueError("经营上下文层级过多。")
    if value is None or isinstance(value, bool):
        return
    if isinstance(value, (int, float)):
        if isinstance(value, float) and not math.isfinite(value):
            raise ValueError("经营上下文包含无效数值。")
        return
    if isinstance(value, str):
        if len(value) > 4000:
            raise ValueError("经营上下文文本过长。")
        return
    if isinstance(value, dict):
        if len(value) > 100:
            raise ValueError("经营上下文字段过多。")
        for key, item in value.items():
            if not isinstance(key, str) or len(key) > 100:
                raise ValueError("经营上下文字段名称无效。")
            _bounded_json(item, depth + 1)
        return
    if isinstance(value, list):
        if len(value) > 100:
            raise ValueError("经营上下文列表过长。")
        for item in value:
            _bounded_json(item, depth + 1)
        return
    raise ValueError("经营上下文必须为 JSON 数据。")


class ChatInput(InputModel):
    staff: StaffInput
    context: dict[str, Any] = Field(default_factory=dict)
    message: str = Field(min_length=1, max_length=500)
    stream: bool = True

    @field_validator("message")
    @classmethod
    def nonempty_message(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("请输入对话内容。")
        return value.strip()

    @field_validator("context")
    @classmethod
    def bounded_context(cls, value: dict[str, Any]) -> dict[str, Any]:
        _bounded_json(value)
        if len(json.dumps(value, ensure_ascii=False, allow_nan=False)) > 48_000:
            raise ValueError("经营上下文过大。")
        return value


Policy = Literal["clean-first", "urgent-first", "balanced"]
Drink = Literal["ale", "citrus", "tea", "coffee", "berry", "cocoa", "cider", "mead", "moonwine"]
Emotion = Literal["neutral", "happy", "sad", "angry", "thinking", "surprised", "working", "tired"]
Suggestion = Literal["tasting", "party", "recipe", "quick", "premium"]


class PolicyPlan(BaseModel):
    type: Literal["policy"]
    value: Policy


class RestockPlan(BaseModel):
    type: Literal["restock"]
    drink: Drink
    low: StrictInt = Field(ge=0, le=40)
    target: StrictInt = Field(ge=0, le=40)

    @field_validator("target")
    @classmethod
    def target_above_threshold(cls, value: int, info: Any) -> int:
        if value < info.data.get("low", 0):
            raise ValueError("target must be at least low")
        return value


class Reply(BaseModel):
    model_config = ConfigDict(extra="ignore")

    speech: str = Field(min_length=1, max_length=360)
    memory: str = Field(default="", max_length=160)
    suggestion: Suggestion | None = None
    plan: PolicyPlan | RestockPlan | None = None
    emotion: Emotion | None = None

    @field_validator("speech", mode="before")
    @classmethod
    def normalize_speech(cls, value: Any) -> str:
        if not isinstance(value, str):
            raise ValueError("模型回复缺少有效内容。")
        if any(0xD800 <= ord(char) <= 0xDFFF for char in value):
            raise ValueError("模型回复包含无效字符。")
        return unicodedata.normalize("NFC", value.strip()).replace("\r\n", "\n")

    @field_validator("memory", mode="before")
    @classmethod
    def normalize_memory(cls, value: Any) -> str:
        if not isinstance(value, str):
            return ""
        return ''.join(char for char in value.strip() if not 0xD800 <= ord(char) <= 0xDFFF)[:160]

    @field_validator("suggestion", mode="before")
    @classmethod
    def sanitize_suggestion(cls, value: Any) -> Any:
        return value if isinstance(value, str) and value in {"tasting", "party", "recipe", "quick", "premium"} else None

    @field_validator("emotion", mode="before")
    @classmethod
    def sanitize_emotion(cls, value: Any) -> Any:
        return value if isinstance(value, str) and value in {"neutral", "happy", "sad", "angry", "thinking", "surprised", "working", "tired"} else None

    @field_validator("plan", mode="before")
    @classmethod
    def sanitize_plan(cls, value: Any) -> PolicyPlan | RestockPlan | None:
        if isinstance(value, (PolicyPlan, RestockPlan)):
            return value
        if not isinstance(value, dict):
            return None
        kind = value.get("type")
        if not isinstance(kind, str):
            return None
        model = {"policy": PolicyPlan, "restock": RestockPlan}.get(kind)
        if model is None:
            return None
        try:
            return model.model_validate(value)
        except ValidationError:
            return None
