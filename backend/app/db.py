"""SQLite access with a small, explicitly versioned migration list.

Each migration is applied once inside a transaction and recorded in
`schema_migrations`. Never edit an applied migration; append a new one.
"""
from __future__ import annotations

import sqlite3
import time
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

MIGRATIONS: list[tuple[int, str]] = [
    (
        1,
        """
        CREATE TABLE users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE COLLATE NOCASE,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL CHECK (role IN ('trainee', 'admin')),
            display_name TEXT NOT NULL,
            is_active INTEGER NOT NULL DEFAULT 1,
            is_dev_account INTEGER NOT NULL DEFAULT 0,
            created_at REAL NOT NULL
        );
        CREATE TABLE profiles (
            user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
            industry TEXT,
            designation TEXT,
            experience TEXT CHECK (experience IS NULL OR experience IN ('fresher', 'mid', 'senior')),
            pathway TEXT NOT NULL DEFAULT 'standard' CHECK (pathway IN ('standard', 'pip')),
            language TEXT NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'ta', 'hi')),
            updated_at REAL NOT NULL
        );
        CREATE TABLE auth_sessions (
            token_hash TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            created_at REAL NOT NULL,
            expires_at REAL NOT NULL,
            revoked INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX idx_auth_sessions_user ON auth_sessions(user_id);

        CREATE TABLE industries (
            id TEXT PRIMARY KEY,
            accent TEXT NOT NULL,
            sort_order INTEGER NOT NULL
        );
        CREATE TABLE designations (
            id TEXT PRIMARY KEY,
            industry_id TEXT NOT NULL REFERENCES industries(id),
            sort_order INTEGER NOT NULL
        );
        CREATE TABLE categories (
            id TEXT PRIMARY KEY,
            industry_id TEXT NOT NULL REFERENCES industries(id),
            sort_order INTEGER NOT NULL
        );
        CREATE TABLE designation_categories (
            designation_id TEXT NOT NULL REFERENCES designations(id),
            category_id TEXT NOT NULL REFERENCES categories(id),
            PRIMARY KEY (designation_id, category_id)
        );
        CREATE TABLE missions (
            id TEXT PRIMARY KEY,
            version INTEGER NOT NULL,
            industry_id TEXT NOT NULL REFERENCES industries(id),
            category_id TEXT NOT NULL REFERENCES categories(id),
            level INTEGER NOT NULL CHECK (level BETWEEN 1 AND 5),
            definition TEXT NOT NULL,
            checksum TEXT NOT NULL,
            is_playable INTEGER NOT NULL DEFAULT 1
        );
        CREATE TABLE mission_designations (
            mission_id TEXT NOT NULL REFERENCES missions(id),
            designation_id TEXT NOT NULL REFERENCES designations(id),
            PRIMARY KEY (mission_id, designation_id)
        );

        CREATE TABLE mission_sessions (
            id TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            mission_id TEXT NOT NULL REFERENCES missions(id),
            mission_version INTEGER NOT NULL,
            state TEXT NOT NULL,
            experience TEXT NOT NULL,
            pathway TEXT NOT NULL,
            retry_count INTEGER NOT NULL DEFAULT 0,
            started_at REAL NOT NULL,
            ended_at REAL,
            end_reason TEXT,
            paused_at REAL,
            paused_ms INTEGER NOT NULL DEFAULT 0,
            last_seq INTEGER NOT NULL DEFAULT 0,
            engine_state TEXT NOT NULL,
            score INTEGER,
            outcome TEXT,
            result TEXT
        );
        CREATE INDEX idx_mission_sessions_user ON mission_sessions(user_id, mission_id);

        CREATE TABLE mission_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL REFERENCES mission_sessions(id) ON DELETE CASCADE,
            seq INTEGER NOT NULL,
            type TEXT NOT NULL,
            target TEXT,
            value TEXT,
            client_ts REAL,
            server_ts REAL NOT NULL,
            accepted INTEGER NOT NULL,
            outcome TEXT NOT NULL,
            detail TEXT,
            UNIQUE (session_id, seq)
        );

        CREATE TABLE progress (
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            mission_id TEXT NOT NULL REFERENCES missions(id),
            attempts INTEGER NOT NULL DEFAULT 0,
            best_score INTEGER,
            best_outcome TEXT,
            passed INTEGER NOT NULL DEFAULT 0,
            last_session_id TEXT,
            updated_at REAL NOT NULL,
            PRIMARY KEY (user_id, mission_id)
        );
        """,
    ),
]


def connect(path: Path) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path, timeout=10, isolation_level=None, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA busy_timeout = 5000")
    return conn


@contextmanager
def transaction(conn: sqlite3.Connection) -> Iterator[sqlite3.Connection]:
    """Explicit BEGIN IMMEDIATE / COMMIT so that concurrent writers serialise safely."""
    conn.execute("BEGIN IMMEDIATE")
    try:
        yield conn
    except BaseException:
        conn.execute("ROLLBACK")
        raise
    else:
        conn.execute("COMMIT")


def migrate(conn: sqlite3.Connection) -> list[int]:
    conn.execute("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at REAL NOT NULL)")
    applied = {row[0] for row in conn.execute("SELECT version FROM schema_migrations")}
    newly: list[int] = []
    for version, sql in MIGRATIONS:
        if version in applied:
            continue
        with transaction(conn):
            for statement in [s.strip() for s in sql.split(";") if s.strip()]:
                conn.execute(statement)
            conn.execute("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)", (version, time.time()))
        newly.append(version)
    return newly
