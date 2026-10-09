"""Idempotent seeding: catalogue + mission content, and optional local accounts."""
from __future__ import annotations

import json
import logging
import sqlite3
import time

from . import db
from .config import Settings
from .content import load_catalogue, load_missions
from .security import hash_password

log = logging.getLogger("openindustri")

# Clearly identified local development accounts. Disable with OI_SEED_DEV_ACCOUNTS=0.
DEV_ACCOUNTS = [
    {"username": "trainee.dev", "password": "Trainee#2026", "role": "trainee", "display_name": "Dev Trainee",
     "profile": {"industry": "oil_gas", "designation": "og_mech_maint", "experience": "fresher", "pathway": "standard"}},
    {"username": "trainee.new", "password": "Trainee#2026", "role": "trainee", "display_name": "Dev Trainee (no profile)",
     "profile": None},
    {"username": "admin.dev", "password": "Admin#2026", "role": "admin", "display_name": "Dev Administrator", "profile": None},
]


def sync_content(conn: sqlite3.Connection, settings: Settings) -> None:
    catalogue = load_catalogue(settings.shared_dir)
    missions = load_missions(settings.shared_dir)
    with db.transaction(conn):
        for i, ind in enumerate(catalogue.industries):
            conn.execute(
                "INSERT INTO industries (id, accent, sort_order) VALUES (?, ?, ?) "
                "ON CONFLICT(id) DO UPDATE SET accent=excluded.accent, sort_order=excluded.sort_order",
                (ind.id, ind.accent, i),
            )
            for j, cat in enumerate(ind.categories):
                conn.execute(
                    "INSERT INTO categories (id, industry_id, sort_order) VALUES (?, ?, ?) "
                    "ON CONFLICT(id) DO UPDATE SET industry_id=excluded.industry_id, sort_order=excluded.sort_order",
                    (cat, ind.id, j),
                )
            for j, des in enumerate(ind.designations):
                conn.execute(
                    "INSERT INTO designations (id, industry_id, sort_order) VALUES (?, ?, ?) "
                    "ON CONFLICT(id) DO UPDATE SET industry_id=excluded.industry_id, sort_order=excluded.sort_order",
                    (des.id, ind.id, j),
                )
                conn.execute("DELETE FROM designation_categories WHERE designation_id = ?", (des.id,))
                for cat in des.categories:
                    conn.execute("INSERT INTO designation_categories VALUES (?, ?)", (des.id, cat))
        for mission_id, (mission, checksum, raw) in missions.items():
            existing = conn.execute("SELECT version, checksum FROM missions WHERE id = ?", (mission_id,)).fetchone()
            if existing and existing["version"] == mission.version and existing["checksum"] != checksum:
                log.warning("Mission %s content changed without a version bump", mission_id)
            conn.execute(
                "INSERT INTO missions (id, version, industry_id, category_id, level, definition, checksum, is_playable) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, 1) ON CONFLICT(id) DO UPDATE SET version=excluded.version, "
                "industry_id=excluded.industry_id, category_id=excluded.category_id, level=excluded.level, "
                "definition=excluded.definition, checksum=excluded.checksum, is_playable=1",
                (mission_id, mission.version, mission.industry, mission.category, mission.level, json.dumps(raw), checksum),
            )
            conn.execute("DELETE FROM mission_designations WHERE mission_id = ?", (mission_id,))
            for d in mission.designations:
                conn.execute("INSERT INTO mission_designations VALUES (?, ?)", (mission_id, d))
        known = set(missions)
        for row in conn.execute("SELECT id FROM missions").fetchall():
            if row["id"] not in known:
                conn.execute("UPDATE missions SET is_playable = 0 WHERE id = ?", (row["id"],))


def _create_user(conn: sqlite3.Connection, settings: Settings, username: str, password: str, role: str,
                 display_name: str, dev: bool, profile: dict | None) -> None:
    now = time.time()
    cur = conn.execute(
        "INSERT INTO users (username, password_hash, role, display_name, is_dev_account, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        (username, hash_password(password, settings.pbkdf2_iterations), role, display_name, int(dev), now),
    )
    p = profile or {}
    conn.execute(
        "INSERT INTO profiles (user_id, industry, designation, experience, pathway, language, updated_at) VALUES (?, ?, ?, ?, ?, 'en', ?)",
        (cur.lastrowid, p.get("industry"), p.get("designation"), p.get("experience"), p.get("pathway", "standard"), now),
    )


def seed_accounts(conn: sqlite3.Connection, settings: Settings) -> None:
    with db.transaction(conn):
        if settings.seed_dev_accounts:
            for acc in DEV_ACCOUNTS:
                if conn.execute("SELECT 1 FROM users WHERE username = ?", (acc["username"],)).fetchone():
                    continue
                _create_user(conn, settings, acc["username"], acc["password"], acc["role"], acc["display_name"], True, acc["profile"])
                log.warning("Created DEVELOPMENT account %s (%s) - for local use only", acc["username"], acc["role"])
        # Safe first-run mechanism: an admin is only bootstrapped from explicit environment variables.
        if settings.bootstrap_admin_username and settings.bootstrap_admin_password:
            has_admin = conn.execute("SELECT 1 FROM users WHERE role = 'admin' AND is_dev_account = 0").fetchone()
            if not has_admin:
                if len(settings.bootstrap_admin_password) < 10:
                    raise ValueError("OI_BOOTSTRAP_ADMIN_PASSWORD must be at least 10 characters")
                _create_user(conn, settings, settings.bootstrap_admin_username, settings.bootstrap_admin_password,
                             "admin", "Administrator", False, None)
                log.warning("Bootstrapped administrator account %s", settings.bootstrap_admin_username)


def initialise(settings: Settings) -> None:
    conn = db.connect(settings.db_path)
    try:
        db.migrate(conn)
        sync_content(conn, settings)
        seed_accounts(conn, settings)
    finally:
        conn.close()
