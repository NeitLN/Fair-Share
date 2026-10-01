"""Test configuration for the Week 4 stack.

``app.main`` reads ``DATABASE_URL`` at import time (the Week 4 requirement is
to crash at start when the variable is missing). Tests import the app, so a
value must exist in the environment *before* that import happens. The default
below does not need to reach a live database for the tests that never touch
PostgreSQL; those that do are skipped unless RUN_DB_TESTS is set.
"""

import os

os.environ.setdefault("DATABASE_URL", "postgresql://app:test@localhost:5432/appdb")
