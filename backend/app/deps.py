"""Request-scoped dependencies: DB connection, settings, authenticated user."""
from __future__ import annotations

import sqlite3
import time
from collections.abc import Iterator
from dataclasses import dataclass

from fastapi import Depends, Request

from . import db
from .config import Settings
from .errors import APIError
from .security import token_digest


def get_settings_dep(request: Request) -> Settings:
    return request.app.state.settings


def get_conn(settings: Settings = Depends(get_settings_dep)) -> Iterator[sqlite3.Connection]:
    conn = db.connect(settings.db_path)
    try:
        yield conn
    finally:
        conn.close()


@dataclass(frozen=True)
class CurrentUser:
    id: int
    username: str
    role: str
    display_name: str
    is_dev_account: bool


def require_client_header(request: Request) -> None:
    """Simple CSRF defence on top of SameSite=Strict cookies: state-changing
    requests must carry a custom header that cross-site forms cannot set."""
    if request.method in ("POST", "PUT", "PATCH", "DELETE") and request.headers.get("x-oi-client") != "web":
        raise APIError(403, "CLIENT_HEADER_MISSING", "Missing client header.")


def current_user(
    request: Request,
    conn: sqlite3.Connection = Depends(get_conn),
    settings: Settings = Depends(get_settings_dep),
) -> CurrentUser:
    token = request.cookies.get(settings.cookie_name)
    if not token:
        raise APIError(401, "NOT_AUTHENTICATED", "Please sign in to continue.")
    row = conn.execute(
        """SELECT s.expires_at, s.revoked, u.id, u.username, u.role, u.display_name, u.is_active, u.is_dev_account
           FROM auth_sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?""",
        (token_digest(token),),
    ).fetchone()
    if row is None or row["revoked"]:
        raise APIError(401, "NOT_AUTHENTICATED", "Your session is not valid. Please sign in again.")
    if row["expires_at"] < time.time():
        raise APIError(401, "SESSION_EXPIRED", "Your session has expired. Please sign in again.")
    if not row["is_active"]:
        raise APIError(403, "ACCOUNT_DISABLED", "This account is disabled.")
    return CurrentUser(row["id"], row["username"], row["role"], row["display_name"], bool(row["is_dev_account"]))


def require_trainee(user: CurrentUser = Depends(current_user)) -> CurrentUser:
    if user.role != "trainee":
        raise APIError(403, "TRAINEE_ONLY", "This action is available to trainee accounts only.")
    return user


def require_admin(user: CurrentUser = Depends(current_user)) -> CurrentUser:
    if user.role != "admin":
        raise APIError(403, "ADMIN_REQUIRED", "Administrator access is required.")
    return user
