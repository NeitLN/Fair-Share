"""Settings, read from environment variables in one place (docs/ARCHITECTURE.md §8).

Nothing environment-specific is hard-coded anywhere else: routes receive a Settings object.
"""

import os
from dataclasses import dataclass

# Bump on every release; /api/version and the pipeline's smoke test report it.
APP_VERSION = "1.2.2"


@dataclass(frozen=True)
class Settings:
    app_name: str = "sdp-starter"
    app_env: str = "development"
    # None = no database configured: the API still starts and /health/db answers 503.
    database_url: str | None = None
    # Render sets RENDER_GIT_COMMIT to the commit it built; the smoke test compares it.
    commit: str = "unknown"
    # Seconds a request waits for a database connection before it gets a 503.
    db_timeout: float = 5.0

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            app_name=os.getenv("APP_NAME", cls.app_name),
            app_env=os.getenv("APP_ENV", cls.app_env),
            database_url=os.getenv("DATABASE_URL") or None,
            commit=os.getenv("RENDER_GIT_COMMIT", cls.commit),
        )
