"""Endpoints about the running service itself, not about households or expenses."""

from typing import Annotated

from fastapi import APIRouter, Depends, Request
from psycopg import Connection

from app.config import APP_VERSION, Settings
from app.db import get_conn

router = APIRouter(tags=["system"])


def get_settings(request: Request) -> Settings:
    return request.app.state.settings


SettingsDep = Annotated[Settings, Depends(get_settings)]


@router.get("/")
def root(settings: SettingsDep):
    """Proves the app is reachable. Open /docs for the interactive API page."""
    return {
        "app": settings.app_name,
        "version": APP_VERSION,
        "env": settings.app_env,
        "message": "Fair-Share API. Interactive docs at /docs",
    }


@router.get("/health")
def health():
    """Liveness for Render, the Compose health check and the pipeline.

    Fast, no login, touches nothing: never query the database here, or a paused database would
    make Render restart a perfectly healthy API.
    """
    return {"status": "ok"}


@router.get("/health/db")
def health_db(conn: Annotated[Connection, Depends(get_conn)]):
    """Readiness: one query against PostgreSQL. Failures are a 503 with a safe message."""
    n = conn.execute("SELECT count(*) FROM notes").fetchone()[0]
    return {"db": "ok", "notes": n}


@router.get("/api/version")
def version(settings: SettingsDep):
    """Which build is live. After a merge, the pipeline waits until commit = the merged SHA."""
    return {
        "app": settings.app_name,
        "version": APP_VERSION,
        "env": settings.app_env,
        "commit": settings.commit,
    }
