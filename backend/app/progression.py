"""Mission availability and unlock rules."""
from __future__ import annotations

import sqlite3
from typing import Any

from .config import Settings
from .content import MissionDef, load_catalogue, load_missions
from .scoring import PASSING_OUTCOMES

AVAILABLE = "available"
LOCKED = "locked"
UPCOMING = "upcoming"


def passed_missions(conn: sqlite3.Connection, user_id: int) -> dict[str, dict[str, Any]]:
    rows = conn.execute(
        "SELECT mission_id, attempts, best_score, best_outcome, passed FROM progress WHERE user_id = ?", (user_id,)
    ).fetchall()
    return {r["mission_id"]: dict(r) for r in rows}


def mission_for(missions: dict[str, tuple[MissionDef, str, dict]], category: str, level: int, designation: str) -> MissionDef | None:
    for mission, _, _ in missions.values():
        if mission.category == category and mission.level == level and designation in mission.designations:
            return mission
    return None


def mission_status(conn: sqlite3.Connection, settings: Settings, user_id: int, mission: MissionDef, designation: str) -> tuple[str, str | None]:
    """Returns (status, reason)."""
    missions = load_missions(settings.shared_dir)
    progress = passed_missions(conn, user_id)
    if designation not in mission.designations:
        return LOCKED, "designation_ineligible"
    for prereq in mission.prerequisites.missions:
        if not progress.get(prereq, {}).get("passed"):
            return LOCKED, "prerequisite_mission"
    if mission.level > 1:
        prev = mission_for(missions, mission.category, mission.level - 1, designation)
        if prev is None or not progress.get(prev.id, {}).get("passed"):
            return LOCKED, "previous_level"
    return AVAILABLE, None


def mission_grid(conn: sqlite3.Connection, settings: Settings, user_id: int, industry: str, designation: str) -> list[dict[str, Any]]:
    catalogue = load_catalogue(settings.shared_dir)
    missions = load_missions(settings.shared_dir)
    progress = passed_missions(conn, user_id)
    des = catalogue.designation(industry, designation)
    if des is None:
        return []
    grid = []
    for category in des.categories:
        levels = []
        prev_passed = True
        for lv in catalogue.levels:
            mission = mission_for(missions, category, lv.level, designation)
            if mission is None:
                # No playable content exists yet. Also report whether it would be locked.
                levels.append({"level": lv.level, "status": UPCOMING, "missionId": None, "lockedByProgress": not prev_passed})
                prev_passed = False
                continue
            status, reason = mission_status(conn, settings, user_id, mission, designation)
            p = progress.get(mission.id)
            levels.append({
                "level": lv.level, "status": status, "reason": reason, "missionId": mission.id,
                "titleKey": mission.titleKey, "subtitleKey": mission.subtitleKey,
                "attempts": p["attempts"] if p else 0,
                "bestScore": p["best_score"] if p else None,
                "bestOutcome": p["best_outcome"] if p else None,
                "passed": bool(p and p["passed"]),
            })
            prev_passed = bool(p and p["passed"])
        grid.append({"category": category, "levels": levels})
    return grid
