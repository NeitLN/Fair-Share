"""The migration runner (app/migrate.py), the v1 schema's rules, and the demo seed.

All of these need a real PostgreSQL. Throw-away migrations are written to a temporary folder with
versions starting "9xx_test" and removed again after each test.
"""
import logging
import threading

import psycopg
import pytest
from psycopg import errors

from app.auth import password_matches
from app.migrate import DEMO_HOUSEHOLD, DEMO_OWNER, MIGRATIONS_DIR, SEED_FILE, migrate, seed

pytestmark = pytest.mark.db

TABLES = {"households", "members", "expenses", "expense_shares", "settlements"}


@pytest.fixture
def conn(db_url):
    """A connection whose changes are always rolled back, so tests leave no data behind."""
    migrate(db_url)
    with psycopg.connect(db_url) as conn:
        yield conn
        conn.rollback()


@pytest.fixture
def scratch(db_url, tmp_path):
    """A temporary migrations folder; whatever its files did is undone afterwards."""
    yield tmp_path
    with psycopg.connect(db_url, autocommit=True) as conn:
        conn.execute("DELETE FROM schema_migrations WHERE version LIKE '9__\\_test%'")
        conn.execute("DROP TABLE IF EXISTS migrate_test_ok, migrate_test_slow, migrate_test_half")


def test_fresh_and_repeated_runs_reach_the_same_schema(db_url):
    migrate(db_url)
    assert migrate(db_url) == []  # second run: nothing left to apply
    with psycopg.connect(db_url) as conn:
        tables = {
            row[0]
            for row in conn.execute(
                "SELECT tablename FROM pg_tables WHERE schemaname = 'public'"
            )
        }
        versions = {row[0] for row in conn.execute("SELECT version FROM schema_migrations")}
    assert TABLES <= tables
    assert "notes" not in tables
    assert {path.stem for path in MIGRATIONS_DIR.glob("*.sql")} <= versions


def test_a_new_file_is_applied_once(db_url, scratch):
    (scratch / "900_test_ok.sql").write_text("CREATE TABLE migrate_test_ok (id int);")
    assert migrate(db_url, scratch) == ["900_test_ok"]
    assert migrate(db_url, scratch) == []


def test_a_failing_file_is_rolled_back_completely(db_url, scratch):
    (scratch / "900_test_half.sql").write_text(
        "CREATE TABLE migrate_test_half (id int); SELECT no_such_function();"
    )
    with pytest.raises(errors.UndefinedFunction):
        migrate(db_url, scratch)
    with psycopg.connect(db_url) as conn:
        table = conn.execute("SELECT to_regclass('migrate_test_half')").fetchone()[0]
        recorded = conn.execute(
            "SELECT count(*) FROM schema_migrations WHERE version = '900_test_half'"
        ).fetchone()[0]
    assert table is None  # the first statement was undone too
    assert recorded == 0  # and the file will be tried again on the next start


def test_two_instances_starting_together_apply_a_file_once(db_url, scratch):
    # Without the advisory lock both would run CREATE TABLE and one would fail.
    (scratch / "901_test_slow.sql").write_text(
        "SELECT pg_sleep(0.5); CREATE TABLE migrate_test_slow (id int);"
    )
    results, failures = [], []

    def start():
        try:
            results.append(migrate(db_url, scratch))
        except Exception as exc:  # reported by the assert below
            failures.append(exc)

    threads = [threading.Thread(target=start) for _ in range(2)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    assert failures == []
    assert sorted(results) == [[], ["901_test_slow"]]


# --- Rules the schema enforces, whatever the API does ---------------------------------------


def _household(conn, name="Test house") -> int:
    sql = "INSERT INTO households (name) VALUES (%s) RETURNING id"
    return conn.execute(sql, (name,)).fetchone()[0]


def _member(conn, household_id: int, name: str) -> int:
    return conn.execute(
        "INSERT INTO members (household_id, name) VALUES (%s, %s) RETURNING id",
        (household_id, name),
    ).fetchone()[0]


def _expense(conn, household_id: int, payer_id: int, amount: int = 90_000) -> int:
    return conn.execute(
        "INSERT INTO expenses (household_id, description, amount, payer_id)"
        " VALUES (%s, 'Dinner', %s, %s) RETURNING id",
        (household_id, amount, payer_id),
    ).fetchone()[0]


def test_member_names_are_unique_per_household_ignoring_case(conn):
    house = _household(conn)
    _member(conn, house, "Minh")
    with pytest.raises(errors.UniqueViolation):
        _member(conn, house, "minh")


def test_the_same_name_is_fine_in_another_household(conn):
    _member(conn, _household(conn, "A"), "Minh")
    _member(conn, _household(conn, "B"), "Minh")


@pytest.mark.parametrize("name", ["", "x" * 61])
def test_household_name_is_1_to_60_characters(conn, name):
    with pytest.raises(errors.CheckViolation):
        _household(conn, name)


def test_amount_must_be_positive(conn):
    house = _household(conn)
    with pytest.raises(errors.CheckViolation):
        _expense(conn, house, _member(conn, house, "Minh"), amount=0)


def test_payer_must_belong_to_the_household(conn):
    house, other = _household(conn, "A"), _household(conn, "B")
    stranger = _member(conn, other, "Tiến")
    with pytest.raises(errors.ForeignKeyViolation):
        _expense(conn, house, stranger)


def test_a_member_with_an_expense_cannot_be_deleted(conn):
    house = _household(conn)
    minh = _member(conn, house, "Minh")
    _expense(conn, house, minh)
    with pytest.raises(errors.ForeignKeyViolation):
        conn.execute("DELETE FROM members WHERE id = %s", (minh,))


def test_deleting_a_household_after_its_expenses_removes_everything_in_it(conn):
    house = _household(conn)
    minh, anh = _member(conn, house, "Minh"), _member(conn, house, "Duy Anh")
    expense = _expense(conn, house, minh)
    conn.execute(
        "INSERT INTO expense_shares (expense_id, member_id, share_amount)"
        " VALUES (%s, %s, 45000), (%s, %s, 45000)",
        (expense, minh, expense, anh),
    )
    conn.execute(
        "INSERT INTO settlements (household_id, from_member_id, to_member_id, amount)"
        " VALUES (%s, %s, %s, 45000)",
        (house, anh, minh),
    )
    # The two statements the API runs (see the comment at the top of 001_init.sql).
    conn.execute("DELETE FROM expenses WHERE household_id = %s", (house,))
    conn.execute("DELETE FROM households WHERE id = %s", (house,))
    left = conn.execute(
        "SELECT (SELECT count(*) FROM members WHERE household_id = %s)"
        " + (SELECT count(*) FROM expenses WHERE household_id = %s)"
        " + (SELECT count(*) FROM expense_shares WHERE expense_id = %s)"
        " + (SELECT count(*) FROM settlements WHERE household_id = %s)",
        (house, house, expense, house),
    ).fetchone()[0]
    assert left == 0


def test_a_member_who_only_shares_an_expense_cannot_be_deleted(conn):
    house = _household(conn)
    minh, anh = _member(conn, house, "Minh"), _member(conn, house, "Duy Anh")
    expense = _expense(conn, house, minh)
    conn.execute(
        "INSERT INTO expense_shares (expense_id, member_id, share_amount) VALUES (%s, %s, 90000)",
        (expense, anh),
    )
    with pytest.raises(errors.ForeignKeyViolation):
        conn.execute("DELETE FROM members WHERE id = %s", (anh,))


def test_a_member_cannot_pay_themselves(conn):
    house = _household(conn)
    minh = _member(conn, house, "Minh")
    with pytest.raises(errors.CheckViolation):
        conn.execute(
            "INSERT INTO settlements (household_id, from_member_id, to_member_id, amount)"
            " VALUES (%s, %s, %s, 1000)",
            (house, minh, minh),
        )


# --- Demo seed ----------------------------------------------------------------------------


def test_seed_fills_only_an_empty_database(conn):
    seed_sql = SEED_FILE.read_text(encoding="utf-8")
    conn.execute("DELETE FROM households")  # rolled back by the fixture
    conn.execute(seed_sql)
    conn.execute(seed_sql)  # a restart must not add a second demo household
    counts = conn.execute(
        "SELECT (SELECT count(*) FROM households), (SELECT count(*) FROM members),"
        " (SELECT count(*) FROM expenses), (SELECT count(*) FROM settlements)"
    ).fetchone()
    assert counts == (1, 3, 5, 1)


def test_seed_gives_each_demo_member_an_account(conn):
    conn.execute("DELETE FROM households")  # rolled back by the fixture
    conn.execute(SEED_FILE.read_text(encoding="utf-8"))
    rows = conn.execute(
        "SELECT u.email, u.display_name, hu.role, m.name FROM household_users hu"
        " JOIN users u ON u.id = hu.user_id JOIN members m ON m.id = hu.member_id ORDER BY m.id"
    ).fetchall()
    assert rows == [
        (DEMO_OWNER, "Tiến", "owner", "Tiến"),
        ("minh@demo.local", "Minh", "member", "Minh"),
        ("duyanh@demo.local", "Duy Anh", "member", "Duy Anh"),
    ]
    # The password written in the README signs in
    stored = conn.execute("SELECT password_hash FROM users WHERE email = %s", (DEMO_OWNER,))
    assert password_matches(stored.fetchone()[0], "fairshare-demo")


def test_a_new_demo_household_belongs_to_the_demo_accounts_again(conn):
    """Review of #166: delete the demo household and restart: its accounts stay, so the new demo
    household must be linked to them, not to accounts the seed could not create."""
    seed_sql = SEED_FILE.read_text(encoding="utf-8")
    conn.execute("DELETE FROM households")  # rolled back by the fixture
    conn.execute(seed_sql)
    conn.execute("DELETE FROM expenses")
    conn.execute("DELETE FROM households")
    conn.execute(seed_sql)
    linked = conn.execute(
        "SELECT u.email, hu.role FROM household_users hu JOIN users u ON u.id = hu.user_id"
        " ORDER BY hu.member_id"
    ).fetchall()
    assert linked == [
        (DEMO_OWNER, "owner"), ("minh@demo.local", "member"), ("duyanh@demo.local", "member")
    ]


def test_seed_logs_which_demo_account_to_sign_in_with(db_url, tmp_path, caplog):
    # Every page needs an account (docs/ACCOUNTS.md): CLEAN_CLONE.md reads the demo account here.
    migrate(db_url)
    with psycopg.connect(db_url, autocommit=True) as conn:
        user = conn.execute(
            "INSERT INTO users (email, password_hash, display_name) VALUES (%s, 'x', 'Tiến')"
            " ON CONFLICT DO NOTHING RETURNING id",
            (DEMO_OWNER,),
        ).fetchone()
        key = conn.execute(
            "INSERT INTO households (name) VALUES (%s) RETURNING id, access_key", (DEMO_HOUSEHOLD,)
        ).fetchone()
    no_data = tmp_path / "seed.sql"
    no_data.write_text("SELECT 1", encoding="utf-8")
    caplog.set_level(logging.INFO, logger="uvicorn.error")
    try:
        seed(db_url, no_data)
    finally:
        with psycopg.connect(db_url, autocommit=True) as conn:
            conn.execute("DELETE FROM households WHERE id = %s", (key[0],))
            if user:
                conn.execute("DELETE FROM users WHERE id = %s", (user[0],))
    assert f"sign in as {DEMO_OWNER}" in caplog.text
    assert key[1] not in caplog.text and "#k=" not in caplog.text


def test_the_demo_name_in_the_seed_is_the_one_the_log_looks_for():
    assert f"'{DEMO_HOUSEHOLD}'" in SEED_FILE.read_text(encoding="utf-8")


def test_seed_expenses_add_up_and_cover_two_months_up_to_today(conn):
    conn.execute("DELETE FROM households")  # rolled back by the fixture
    conn.execute(SEED_FILE.read_text(encoding="utf-8"))

    # Every expense's shares add up to its amount, as the API guarantees for its own
    unbalanced = conn.execute(
        "SELECT e.description FROM expenses e JOIN expense_shares s ON s.expense_id = e.id"
        " GROUP BY e.id HAVING sum(s.share_amount) <> e.amount"
    ).fetchall()
    assert unbalanced == []

    # Last month and this month, never a day after today, whatever today is
    months, future = conn.execute(
        "SELECT count(DISTINCT date_trunc('month', spent_at)),"
        " count(*) FILTER (WHERE spent_at > current_date) FROM expenses"
    ).fetchone()
    assert (months, future) == (2, 0)
    assert conn.execute("SELECT settled_at <= current_date FROM settlements").fetchone()[0]

    # One split leaves someone out, and one expense came from Quick add
    sharers = conn.execute(
        "SELECT count(*) FROM expense_shares s JOIN expenses e ON e.id = s.expense_id"
        " WHERE e.description = 'Instant noodles and eggs'"
    ).fetchone()[0]
    from_ai = conn.execute("SELECT count(*) FROM expenses WHERE source = 'ai'").fetchone()[0]
    assert (sharers, from_ai) == (2, 1)
