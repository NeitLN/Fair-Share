"""Fair-Share API: builds the FastAPI app.

Uvicorn starts `app.main:app` (see the Dockerfile). Tests call create_app() with their own
Settings, so each test gets a fresh app without touching environment variables.
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import errors
from app.config import APP_VERSION, Settings
from app.db import create_pool
from app.migrate import prepare_database
from app.routers import ai, balances, expenses, households, members, settlements, system
from app.services.gemini import GeminiClient
from app.services.rate_limit import AiBudget


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings.from_env()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        # Start-up: bring the schema up to date (skipped with a log line if the database is down).
        prepare_database(settings)
        # Then open the pool without waiting, so a paused database cannot block start-up.
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
    # AI Quick add: one client and one request budget per app (tests get fresh ones per app).
    app.state.gemini = GeminiClient(settings.gemini_api_key, settings.gemini_model,
                                    settings.ai_timeout)
    app.state.ai_budget = AiBudget()
    if settings.allowed_origins:
        # Only the listed origins (never "*"); the SPA sends JSON, so Content-Type must be allowed
        # for the browser's preflight. No cookies are used, so credentials stay off.
        app.add_middleware(
            CORSMiddleware,
            allow_origins=list(settings.allowed_origins),
            allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
            allow_headers=["Content-Type"],
            max_age=600,
        )
    errors.install(app)
    app.include_router(system.router)
    app.include_router(households.router)
    app.include_router(members.router)
    app.include_router(expenses.router)
    app.include_router(settlements.router)
    app.include_router(balances.router)
    app.include_router(ai.router)
    return app


app = create_app()
