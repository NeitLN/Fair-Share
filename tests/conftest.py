# tests/conftest.py — pytest loads this BEFORE any test module.
#
# app/main.py reads DATABASE_URL at import time and crashes if it is missing.
# The CI runner has no database and no .env, so we give it a harmless dummy
# value here. The tests below never open a database connection.
import os

os.environ.setdefault("DATABASE_URL", "postgresql://unused@localhost/none")
os.environ.setdefault("APP_ENV", "test")
