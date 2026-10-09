from __future__ import annotations

import sqlite3
import threading
import time

from fastapi import APIRouter, Depends, Request, Response

from .. import db
from ..config import Settings
from ..deps import CurrentUser, current_user, get_conn, get_settings_dep, require_client_header
from ..errors import APIError
from ..schemas import LoginRequest, MeOut, RegisterRequest
from ..security import dummy_verify, hash_password, new_token, token_digest, verify_password
from .profile import load_me

router = APIRouter(prefix="/api/auth", tags=["auth"], dependencies=[Depends(require_client_header)])

_failures: dict[str, list[float]] = {}
_lock = threading.Lock()


def _check_lockout(username: str, settings: Settings) -> None:
    now = time.time()
    with _lock:
        recent = [t for t in _failures.get(username, []) if now - t < settings.login_lockout_seconds]
        _failures[username] = recent
        if len(recent) >= settings.login_max_failures:
            raise APIError(429, "TOO_MANY_ATTEMPTS", "Too many failed sign-in attempts. Please wait a minute and try again.")


def _record_failure(username: str) -> None:
    with _lock:
        _failures.setdefault(username, []).append(time.time())


def reset_lockouts() -> None:
    with _lock:
        _failures.clear()


def _issue_session(conn: sqlite3.Connection, response: Response, settings: Settings, user_id: int) -> None:
    token = new_token()
    now = time.time()
    with db.transaction(conn):
        conn.execute(
            "INSERT INTO auth_sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
            (token_digest(token), user_id, now, now + settings.auth_ttl_seconds),
        )
        conn.execute("DELETE FROM auth_sessions WHERE expires_at < ?", (now - 86400,))
    response.set_cookie(
        settings.cookie_name, token, max_age=settings.auth_ttl_seconds, httponly=True,
        samesite="strict", secure=settings.cookie_secure, path="/",
    )


@router.post("/login", response_model=MeOut)
def login(body: LoginRequest, response: Response, conn: sqlite3.Connection = Depends(get_conn),
          settings: Settings = Depends(get_settings_dep)) -> MeOut:
    key = body.username.lower()
    _check_lockout(key, settings)
    row = conn.execute("SELECT id, password_hash, role, is_active FROM users WHERE username = ?", (body.username,)).fetchone()
    if row is None:
        dummy_verify(body.password, settings.pbkdf2_iterations)
        _record_failure(key)
        raise APIError(401, "INVALID_CREDENTIALS", "Incorrect username or password.")
    if not verify_password(body.password, row["password_hash"]):
        _record_failure(key)
        raise APIError(401, "INVALID_CREDENTIALS", "Incorrect username or password.")
    if not row["is_active"]:
        raise APIError(403, "ACCOUNT_DISABLED", "This account is disabled.")
    # The portal selection never grants a role; it must match the stored role.
    if body.portal == "admin" and row["role"] != "admin":
        raise APIError(403, "NOT_ADMIN", "This account does not have administrator access.")
    if body.portal == "trainee" and row["role"] != "trainee":
        raise APIError(403, "USE_ADMIN_PORTAL", "Administrator accounts must sign in through Admin Login.")
    _issue_session(conn, response, settings, row["id"])
    return load_me(conn, row["id"])


@router.post("/register", response_model=MeOut, status_code=201)
def register(body: RegisterRequest, response: Response, conn: sqlite3.Connection = Depends(get_conn),
             settings: Settings = Depends(get_settings_dep)) -> MeOut:
    if conn.execute("SELECT 1 FROM users WHERE username = ?", (body.username,)).fetchone():
        raise APIError(409, "USERNAME_TAKEN", "That username is already registered.")
    now = time.time()
    with db.transaction(conn):
        cur = conn.execute(
            "INSERT INTO users (username, password_hash, role, display_name, created_at) VALUES (?, ?, 'trainee', ?, ?)",
            (body.username, hash_password(body.password, settings.pbkdf2_iterations), body.display_name, now),
        )
        user_id = cur.lastrowid
        conn.execute("INSERT INTO profiles (user_id, updated_at) VALUES (?, ?)", (user_id, now))
    _issue_session(conn, response, settings, user_id)
    return load_me(conn, user_id)


@router.post("/logout", status_code=204)
def logout(request: Request, response: Response, conn: sqlite3.Connection = Depends(get_conn),
           settings: Settings = Depends(get_settings_dep)) -> Response:
    token = request.cookies.get(settings.cookie_name)
    if token:
        with db.transaction(conn):
            conn.execute("UPDATE auth_sessions SET revoked = 1 WHERE token_hash = ?", (token_digest(token),))
    response.delete_cookie(settings.cookie_name, path="/")
    response.status_code = 204
    return response


@router.get("/me", response_model=MeOut)
def me(user: CurrentUser = Depends(current_user), conn: sqlite3.Connection = Depends(get_conn)) -> MeOut:
    return load_me(conn, user.id)
