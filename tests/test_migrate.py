"""The migration runner (app/migrate.py), the v1 schema's rules, and the demo seed.

All of these need a real PostgreSQL. Throw-away migrations are written to a temporary folder with
versions starting "9xx_test" and removed again after each test.
"""
import threading

import psycopg
import pytest
from psycopg import errors

from app.migrate import MIGRATIONS_DIR, SEED_FILE, migrate

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
        " WHERE e.description = 'Mì gói và trứng'"
    ).fetchone()[0]
    from_ai = conn.execute("SELECT count(*) FROM expenses WHERE source = 'ai'").fetchone()[0]
    assert (sharers, from_ai) == (2, 1)
