"""OpenIndustri-AI FastAPI application."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from .config import Settings, get_settings
from .errors import install_error_handlers
from .routers import admin, auth, catalogue, profile, sessions
from .seed import initialise


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        initialise(settings)
        yield

    app = FastAPI(title="OpenIndustri-AI API", version="0.1.0", lifespan=lifespan)
    app.state.settings = settings
    install_error_handlers(app)
    for r in (auth.router, profile.router, catalogue.router, sessions.router, admin.router):
        app.include_router(r)

    @app.get("/api/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    return app


logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
app = create_app()
