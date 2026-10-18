"""Endpoints about the running service itself, not about households or expenses."""

from typing import Annotated

import psycopg
from fastapi import APIRouter, Depends, Request
from psycopg import Connection

from app.config import APP_VERSION, Settings
from app.db import get_conn
from app.errors import ApiError

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
    try:
        n = conn.execute("SELECT count(*) FROM notes").fetchone()[0]
    except psycopg.errors.UndefinedTable as exc:
        # Reachable but empty (e.g. a new Supabase project before its schema is created):
        # not ready, which is a 503 like every other readiness failure, not a server bug (500).
        raise ApiError(503, "database_not_initialized", "The database has no schema yet") from exc
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
