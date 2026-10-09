from __future__ import annotations

import sqlite3
from typing import Any

from fastapi import APIRouter, Depends

from ..config import Settings
from ..content import load_catalogue, load_missions
from ..deps import CurrentUser, current_user, get_conn, get_settings_dep, require_trainee
from ..errors import APIError
from ..progression import mission_grid, mission_status
from .profile import load_me

router = APIRouter(prefix="/api", tags=["catalogue"])


@router.get("/catalogue")
def catalogue(settings: Settings = Depends(get_settings_dep)) -> dict[str, Any]:
    """Public, non-personal catalogue: industries, designations, categories, levels."""
    cat = load_catalogue(settings.shared_dir)
    return cat.model_dump(exclude={"missions"})


@router.get("/industries/{industry_id}/designations")
def designations(industry_id: str, settings: Settings = Depends(get_settings_dep)) -> list[dict[str, Any]]:
    ind = load_catalogue(settings.shared_dir).industry(industry_id)
    if ind is None:
        raise APIError(404, "UNKNOWN_INDUSTRY", "That industry does not exist.")
    return [d.model_dump() for d in ind.designations]


@router.get("/missions")
def missions(user: CurrentUser = Depends(require_trainee), conn: sqlite3.Connection = Depends(get_conn),
             settings: Settings = Depends(get_settings_dep)) -> dict[str, Any]:
    me = load_me(conn, user.id)
    if not me.profile.complete:
        raise APIError(409, "PROFILE_INCOMPLETE", "Complete your industry, designation and experience before selecting missions.")
    return {
        "industry": me.profile.industry,
        "designation": me.profile.designation,
        "categories": mission_grid(conn, settings, user.id, me.profile.industry, me.profile.designation),
    }


@router.get("/missions/{mission_id}")
def mission_definition(mission_id: str, user: CurrentUser = Depends(current_user), conn: sqlite3.Connection = Depends(get_conn),
                       settings: Settings = Depends(get_settings_dep)) -> dict[str, Any]:
    entry = load_missions(settings.shared_dir).get(mission_id)
    if entry is None:
        raise APIError(404, "MISSION_NOT_FOUND", "That mission does not exist.")
    mission, _, raw = entry
    if user.role == "trainee":
        me = load_me(conn, user.id)
        status, reason = mission_status(conn, settings, user.id, mission, me.profile.designation or "")
        if status != "available":
            raise APIError(403, "MISSION_LOCKED", "This mission is not available for your profile yet.", {"reason": reason})
    return raw


@router.get("/progress")
def progress(user: CurrentUser = Depends(require_trainee), conn: sqlite3.Connection = Depends(get_conn)) -> dict[str, Any]:
    rows = conn.execute(
        "SELECT mission_id, attempts, best_score, best_outcome, passed, last_session_id, updated_at FROM progress WHERE user_id = ?",
        (user.id,),
    ).fetchall()
    sessions = conn.execute(
        "SELECT id, mission_id, state, retry_count, started_at, ended_at, end_reason, score, outcome FROM mission_sessions "
        "WHERE user_id = ? ORDER BY started_at DESC LIMIT 50",
        (user.id,),
    ).fetchall()
    return {
        "missions": [dict(r) for r in rows],
        "sessions": [
            {"id": s["id"], "missionId": s["mission_id"], "state": s["state"], "retryCount": s["retry_count"],
             "startedAt": s["started_at"], "endedAt": s["ended_at"], "endReason": s["end_reason"],
             "score": s["score"], "outcome": s["outcome"]}
            for s in sessions
        ],
    }
