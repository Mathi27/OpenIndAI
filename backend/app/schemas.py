"""Typed request/response schemas for the HTTP API."""
from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from .content import EventType, Experience, Language, Pathway

_ID = r"^[a-z0-9_\-]{1,64}$"


class _In(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


# ---------------------------------------------------------------- auth
class LoginRequest(_In):
    username: str = Field(min_length=1, max_length=32)
    password: str = Field(min_length=1, max_length=128)
    portal: Literal["trainee", "admin"]


class RegisterRequest(_In):
    username: str = Field(min_length=3, max_length=32, pattern=r"^[A-Za-z0-9._\-]+$")
    password: str = Field(min_length=8, max_length=128)
    display_name: str = Field(min_length=1, max_length=60)

    @field_validator("password")
    @classmethod
    def _strength(cls, v: str) -> str:
        if not any(ch.isalpha() for ch in v) or not any(ch.isdigit() for ch in v):
            raise ValueError("Password must contain at least one letter and one number.")
        return v


class UserOut(BaseModel):
    id: int
    username: str
    role: str
    displayName: str
    isDevAccount: bool


class ProfileOut(BaseModel):
    industry: str | None
    designation: str | None
    experience: Experience | None
    pathway: Pathway
    language: Language
    complete: bool


class MeOut(BaseModel):
    user: UserOut
    profile: ProfileOut


class ProfileUpdate(_In):
    displayName: str | None = Field(default=None, min_length=1, max_length=60)
    industry: str | None = Field(default=None, pattern=_ID)
    designation: str | None = Field(default=None, pattern=_ID)
    experience: Experience | None = None
    pathway: Pathway | None = None
    language: Language | None = None


# ---------------------------------------------------------------- sessions
class StartSessionRequest(_In):
    missionId: str = Field(pattern=_ID)
    abandonOpen: bool = False


class EventIn(_In):
    seq: int = Field(ge=1, le=100000)
    type: EventType
    target: str | None = Field(default=None, pattern=_ID)
    value: str | None = Field(default=None, pattern=_ID)
    clientTs: float | None = Field(default=None, ge=0)


class EventBatch(_In):
    events: list[EventIn] = Field(min_length=1, max_length=50)


class EventResult(BaseModel):
    seq: int
    accepted: bool
    outcome: str
    detail: dict[str, Any]


class SessionOut(BaseModel):
    id: str
    missionId: str
    missionVersion: int
    state: str
    experience: Experience
    pathway: Pathway
    retryCount: int
    startedAt: float
    endedAt: float | None
    endReason: str | None
    lastSeq: int
    hintBudget: int
    engine: dict[str, Any]
    focusConcepts: list[str]
    result: dict[str, Any] | None


class EventsResponse(BaseModel):
    results: list[EventResult]
    session: SessionOut


class AdminCreateTrainee(RegisterRequest):
    pass
