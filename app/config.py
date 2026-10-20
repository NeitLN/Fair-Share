"""Settings, read from environment variables in one place (docs/ARCHITECTURE.md §8).

Nothing environment-specific is hard-coded anywhere else: routes receive a Settings object.
"""

import os
from dataclasses import dataclass

# Bump on every release; /api/version and the pipeline's smoke test report it.
APP_VERSION = "1.2.2"


@dataclass(frozen=True)
class Settings:
    app_name: str = "fair-share"
    app_env: str = "development"
    # Browser origins allowed to call the API from another site (the Render Static Site).
    # Empty = no CORS headers at all: same-origin only, as in Docker Compose behind nginx.
    allowed_origins: tuple[str, ...] = ()
    # None = no database configured: the API still starts and /health/db answers 503.
    database_url: str | None = None
    # Render sets RENDER_GIT_COMMIT to the commit it built; the smoke test compares it.
    commit: str = "unknown"
    # Seconds a request waits for a database connection before it gets a 503.
    db_timeout: float = 5.0
    # Load db/seed.sql into an empty database at start-up. Set only by compose.yml, never on Render.
    seed_demo_data: bool = False
    # AI Quick add (docs/ARCHITECTURE.md §6). No key = the feature answers "not available" and the
    # manual form keeps working. The key is a secret: never log it, never return it.
    gemini_api_key: str | None = None
    # A configuration value, so a retired model is a Render setting change, not a code change.
    gemini_model: str = "gemini-3.5-flash-lite"
    # Seconds to wait for Gemini before giving up; the user then fills in the form by hand. On the
    # live server gemini-3.5-flash-lite answered in 7-9 s, so 10 s cut off answers that were coming.
    ai_timeout: float = 20.0
    # How many proxies in front of the API each append one X-Forwarded-For entry; the visitor's
    # address is that many entries from the end. Render: 3 (Cloudflare adds the visitor, two more
    # proxies follow; read from the "quick add:" log lines, where CF-Connecting-IP is entry -3).
    # Docker Compose: nginx (1). 0 = ignore the header and use the connecting address.
    forwarded_hops: int = 1

    def __post_init__(self):
        # A negative value would quietly put every visitor on Render in one shared limit.
        if self.forwarded_hops < 0:
            raise ValueError("FORWARDED_HOPS must be 0 or more")
        # 0 would make the socket non-blocking: every Gemini call would fail at once.
        if self.ai_timeout <= 0:
            raise ValueError("AI_TIMEOUT must be more than 0 seconds")

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            app_name=os.getenv("APP_NAME", cls.app_name),
            app_env=os.getenv("APP_ENV", cls.app_env),
            database_url=os.getenv("DATABASE_URL") or None,
            # ALLOWED_ORIGINS=https://fair-share-web.onrender.com,http://localhost:5173
            allowed_origins=tuple(
                origin.strip().rstrip("/")
                for origin in os.getenv("ALLOWED_ORIGINS", "").split(",")
                if origin.strip()
            ),
            commit=os.getenv("RENDER_GIT_COMMIT", cls.commit),
            seed_demo_data=os.getenv("SEED_DEMO_DATA", "").lower() in ("1", "true"),
            gemini_api_key=os.getenv("GEMINI_API_KEY") or None,
            gemini_model=os.getenv("GEMINI_MODEL") or cls.gemini_model,
            ai_timeout=float(os.getenv("AI_TIMEOUT") or cls.ai_timeout),
            # Render sets RENDER=true in every service, so the default needs no dashboard setting.
            forwarded_hops=int(os.getenv("FORWARDED_HOPS") or (3 if os.getenv("RENDER") else 1)),
        )

    def __repr__(self) -> str:
        # A Settings object can end up in a log or a traceback: never show the AI key.
        key = "set" if self.gemini_api_key else "not set"
        return (f"Settings(app_name={self.app_name!r}, app_env={self.app_env!r}, "
                f"gemini_api_key={key})")
