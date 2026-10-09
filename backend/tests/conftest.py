from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.routers.auth import reset_lockouts

H = {"x-oi-client": "web"}


@pytest.fixture()
def settings(tmp_path: Path) -> Settings:
    return Settings(db_path=tmp_path / "test.db", pbkdf2_iterations=1000)


@pytest.fixture()
def client(settings: Settings):
    reset_lockouts()
    with TestClient(create_app(settings)) as c:
        c.headers.update(H)
        yield c


def login(c: TestClient, username: str = "trainee.dev", password: str = "Trainee#2026", portal: str = "trainee"):
    return c.post("/api/auth/login", json={"username": username, "password": password, "portal": portal})


@pytest.fixture()
def trainee(client: TestClient) -> TestClient:
    assert login(client).status_code == 200
    return client


@pytest.fixture()
def make_client(settings: Settings):
    """Additional independent clients sharing the same database."""
    clients = []

    def _make() -> TestClient:
        c = TestClient(create_app(settings))
        c.__enter__()
        c.headers.update(H)
        clients.append(c)
        return c

    yield _make
    for c in clients:
        c.__exit__(None, None, None)
