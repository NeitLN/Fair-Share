"""Fair-Share API: builds the FastAPI app.

Uvicorn starts `app.main:app` (see the Dockerfile). Tests call create_app() with their own
Settings, so each test gets a fresh app without touching environment variables.
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI

from app import errors
from app.config import APP_VERSION, Settings
from app.db import create_pool
from app.routers import system


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings.from_env()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        # Start-up: open the pool without waiting, so a paused database cannot block start-up.
        pool = None
        if settings.database_url:
            pool = create_pool(settings.database_url, settings.db_timeout)
            pool.open(wait=False)
        app.state.pool = pool
        try:
            yield
        finally:  # shut-down: close the connections cleanly
            if pool is not None:
                pool.close()

    app = FastAPI(title=settings.app_name, version=APP_VERSION, lifespan=lifespan)
    app.state.settings = settings
    errors.install(app)
    app.include_router(system.router)
    return app


app = create_app()
