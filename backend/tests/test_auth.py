from __future__ import annotations

import time

from .conftest import login


def test_login_success_sets_httponly_cookie(client):
    r = login(client)
    assert r.status_code == 200
    assert r.json()["user"]["role"] == "trainee"
    cookie = r.headers["set-cookie"].lower()
    assert "httponly" in cookie and "samesite=strict" in cookie


def test_wrong_password(client):
    r = login(client, password="wrong-pass1")
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "INVALID_CREDENTIALS"


def test_unknown_user_same_error(client):
    r = login(client, username="nobody")
    assert r.status_code == 401 and r.json()["error"]["code"] == "INVALID_CREDENTIALS"


def test_empty_input_is_validation_error(client):
    r = client.post("/api/auth/login", json={"username": "", "password": "", "portal": "trainee"})
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "VALIDATION_ERROR"
    assert {f["field"] for f in r.json()["error"]["details"]} == {"username", "password"}


def test_admin_portal_does_not_grant_admin(client):
    r = login(client, portal="admin")
    assert r.status_code == 403 and r.json()["error"]["code"] == "NOT_ADMIN"
    assert client.get("/api/auth/me").status_code == 401


def test_admin_must_use_admin_portal(client):
    assert login(client, "admin.dev", "Admin#2026", "trainee").json()["error"]["code"] == "USE_ADMIN_PORTAL"
    assert login(client, "admin.dev", "Admin#2026", "admin").status_code == 200


def test_trainee_cannot_reach_admin_api(trainee):
    r = trainee.get("/api/admin/trainees")
    assert r.status_code == 403 and r.json()["error"]["code"] == "ADMIN_REQUIRED"


def test_admin_api_requires_auth(client):
    assert client.get("/api/admin/trainees").status_code == 401


def test_logout_revokes(trainee):
    assert trainee.get("/api/auth/me").status_code == 200
    assert trainee.post("/api/auth/logout").status_code == 204
    assert trainee.get("/api/auth/me").status_code == 401


def test_session_expiry(settings, client):
    import sqlite3

    login(client)
    conn = sqlite3.connect(settings.db_path)
    conn.execute("UPDATE auth_sessions SET expires_at = ?", (time.time() - 1,))
    conn.commit()
    conn.close()
    r = client.get("/api/auth/me")
    assert r.status_code == 401 and r.json()["error"]["code"] == "SESSION_EXPIRED"


def test_lockout_after_repeated_failures(client):
    for _ in range(5):
        login(client, password="bad-pass99")
    r = login(client)
    assert r.status_code == 429


def test_register_validation_and_duplicate(client):
    r = client.post("/api/auth/register", json={"username": "a", "password": "short", "display_name": "A"})
    assert r.status_code == 422
    r = client.post("/api/auth/register", json={"username": "new.user", "password": "Password1", "display_name": "New"})
    assert r.status_code == 201 and r.json()["profile"]["complete"] is False
    r = client.post("/api/auth/register", json={"username": "NEW.user", "password": "Password1", "display_name": "New"})
    assert r.status_code == 409


def test_csrf_header_required(client):
    r = client.post("/api/auth/login", json={"username": "x", "password": "y", "portal": "trainee"}, headers={"x-oi-client": ""})
    assert r.status_code == 403


def test_password_not_stored_in_plaintext(settings, client):
    import sqlite3

    conn = sqlite3.connect(settings.db_path)
    (h,) = conn.execute("SELECT password_hash FROM users WHERE username = 'trainee.dev'").fetchone()
    assert "Trainee#2026" not in h and h.startswith("pbkdf2_sha256$")
