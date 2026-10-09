"""Runtime configuration, read from environment variables with safe local defaults."""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
REPO_DIR = BACKEND_DIR.parent
SHARED_DIR = REPO_DIR / "shared"


def _bool(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    db_path: Path = field(default_factory=lambda: Path(os.environ.get("OI_DB_PATH", BACKEND_DIR / "data" / "openindustri.db")))
    shared_dir: Path = SHARED_DIR
    # Session lifetime for the login cookie.
    auth_ttl_seconds: int = int(os.environ.get("OI_AUTH_TTL_SECONDS", str(8 * 3600)))
    # Mission sessions older than this cannot be restored.
    mission_restore_ttl_seconds: int = int(os.environ.get("OI_MISSION_RESTORE_TTL", str(24 * 3600)))
    pbkdf2_iterations: int = int(os.environ.get("OI_PBKDF2_ITERATIONS", "310000"))
    seed_dev_accounts: bool = _bool("OI_SEED_DEV_ACCOUNTS", True)
    bootstrap_admin_username: str | None = os.environ.get("OI_BOOTSTRAP_ADMIN_USERNAME")
    bootstrap_admin_password: str | None = os.environ.get("OI_BOOTSTRAP_ADMIN_PASSWORD")
    cookie_name: str = "oi_session"
    cookie_secure: bool = _bool("OI_COOKIE_SECURE", False)
    login_max_failures: int = 5
    login_lockout_seconds: int = 60


def get_settings() -> Settings:
    return Settings()
