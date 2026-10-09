from __future__ import annotations

import json
import sqlite3
import time
from typing import Any

from fastapi import APIRouter, Depends, Query

from .. import db
from ..config import Settings
from ..deps import CurrentUser, get_conn, get_settings_dep, require_admin, require_client_header
from ..errors import APIError
from ..schemas import AdminCreateTrainee
from ..security import hash_password

router = APIRouter(prefix="/api/admin", tags=["admin"], dependencies=[Depends(require_client_header), Depends(require_admin)])


@router.get("/trainees")
def trainees(conn: sqlite3.Connection = Depends(get_conn)) -> list[dict[str, Any]]:
    rows = conn.execute(
        """SELECT u.id, u.username, u.display_name, u.is_active, u.is_dev_account, u.created_at,
                  p.industry, p.designation, p.experience, p.pathway, p.language,
                  (SELECT COUNT(*) FROM mission_sessions s WHERE s.user_id = u.id) AS sessions,
                  (SELECT COUNT(*) FROM mission_sessions s WHERE s.user_id = u.id AND s.outcome IN ('mastery','pass')) AS passes,
                  (SELECT MAX(s.started_at) FROM mission_sessions s WHERE s.user_id = u.id) AS last_activity
           FROM users u JOIN profiles p ON p.user_id = u.id WHERE u.role = 'trainee' ORDER BY u.username"""
    ).fetchall()
    return [dict(r) for r in rows]


@router.post("/trainees", status_code=201)
def create_trainee(body: AdminCreateTrainee, conn: sqlite3.Connection = Depends(get_conn),
                   settings: Settings = Depends(get_settings_dep)) -> dict[str, Any]:
    if conn.execute("SELECT 1 FROM users WHERE username = ?", (body.username,)).fetchone():
        raise APIError(409, "USERNAME_TAKEN", "That username is already registered.")
    now = time.time()
    with db.transaction(conn):
        cur = conn.execute(
            "INSERT INTO users (username, password_hash, role, display_name, created_at) VALUES (?, ?, 'trainee', ?, ?)",
            (body.username, hash_password(body.password, settings.pbkdf2_iterations), body.display_name, now),
        )
        conn.execute("INSERT INTO profiles (user_id, updated_at) VALUES (?, ?)", (cur.lastrowid, now))
    return {"id": cur.lastrowid, "username": body.username}


@router.get("/sessions")
def sessions(user_id: int | None = Query(default=None, ge=1), mission_id: str | None = Query(default=None, max_length=64),
             limit: int = Query(default=100, ge=1, le=500), conn: sqlite3.Connection = Depends(get_conn)) -> list[dict[str, Any]]:
    sql = ("SELECT s.id, s.user_id, u.username, s.mission_id, s.state, s.experience, s.pathway, s.retry_count, s.started_at, "
           "s.ended_at, s.end_reason, s.score, s.outcome, s.result FROM mission_sessions s JOIN users u ON u.id = s.user_id WHERE 1=1")
    params: list[Any] = []
    if user_id is not None:
        sql += " AND s.user_id = ?"
        params.append(user_id)
    if mission_id is not None:
        sql += " AND s.mission_id = ?"
        params.append(mission_id)
    sql += " ORDER BY s.started_at DESC LIMIT ?"
    params.append(limit)
    out = []
    for r in conn.execute(sql, params).fetchall():
        d = dict(r)
        d["result"] = json.loads(d["result"]) if d["result"] else None
        out.append(d)
    return out


@router.get("/sessions/{session_id}")
def session_detail(session_id: str, conn: sqlite3.Connection = Depends(get_conn), _: CurrentUser = Depends(require_admin)) -> dict[str, Any]:
    row = conn.execute("SELECT * FROM mission_sessions WHERE id = ?", (session_id,)).fetchone()
    if row is None:
        raise APIError(404, "SESSION_NOT_FOUND", "That training session was not found.")
    events = conn.execute(
        "SELECT seq, type, target, value, client_ts, server_ts, accepted, outcome, detail FROM mission_events WHERE session_id = ? ORDER BY seq",
        (session_id,),
    ).fetchall()
    d = dict(row)
    d["engine_state"] = json.loads(d["engine_state"])
    d["result"] = json.loads(d["result"]) if d["result"] else None
    return {"session": d, "events": [{**dict(e), "detail": json.loads(e["detail"] or "{}")} for e in events]}
