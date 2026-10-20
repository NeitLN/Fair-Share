"""The pure parts of AI Quick add: matching names to members, the request budget, the draft."""

import datetime as dt

import pytest

from app.errors import ApiError
from app.routers.ai import UNRESOLVED, pick_client_ip, to_draft
from app.services.gemini import ExpenseDraft as Found
from app.services.names import match_member, normalize
from app.services.rate_limit import AiBudget

MEMBERS = {1: "Tiến", 2: "Minh", 3: "Duy Anh"}
TODAY = dt.date(2026, 10, 21)


@pytest.mark.parametrize(
    "written, expected",
    [
        ("Tiến", 1),
        ("tien", 1),
        ("TIEN", 1),
        ("  Tiến ", 1),
        ("Duy Anh", 3),
        ("duy anh", 3),
        ("Duy", 3),
        ("Anh", 3),
        ("Hùng", None),
        ("", None),
    ],
)
def test_names_match_ignoring_case_accents_and_spaces(written, expected):
    assert match_member(written, MEMBERS) == expected


def test_d_with_stroke_is_d():
    assert normalize("Đức đi chợ") == "duc di cho"


def test_an_ambiguous_word_matches_nobody():
    members = {1: "Minh Anh", 2: "Duy Anh"}
    assert match_member("Anh", members) is None
    assert match_member("Minh Anh", members) == 1


class FakeClock:
    def __init__(self):
        self.now = 0.0

    def __call__(self):
        return self.now


def test_five_requests_per_minute_per_ip():
    clock = FakeClock()
    budget = AiBudget(clock=clock)
    assert all(budget.try_spend("1.1.1.1") for _ in range(5))
    assert not budget.try_spend("1.1.1.1")
    assert budget.try_spend("2.2.2.2")  # another person is not blocked
    clock.now = 61
    assert budget.try_spend("1.1.1.1")  # a minute later it works again


def test_global_budget_per_minute_and_per_day():
    clock = FakeClock()
    budget = AiBudget(per_minute=10, per_day=12, clock=clock)
    assert all(budget.try_spend(f"10.0.0.{i}") for i in range(10))
    assert not budget.try_spend("10.0.0.99")  # 11th in the same minute, from a new IP
    clock.now = 61
    assert budget.try_spend("10.0.0.50") and budget.try_spend("10.0.0.51")
    assert not budget.try_spend("10.0.0.52")  # 13th today
    clock.now = 24 * 3600 + 62
    assert budget.try_spend("10.0.0.52")


def test_a_refused_request_does_not_use_up_the_budget():
    clock = FakeClock()
    budget = AiBudget(per_ip_per_minute=1, per_minute=2, clock=clock)
    assert budget.try_spend("a")
    assert not budget.try_spend("a")  # refused: must not count in the global window
    assert budget.try_spend("b")


def test_draft_matches_names_and_splits_between_everyone():
    found = Found(
        description="Dinner", amount=240_000, payer="minh", everyone=True, spent_at="2026-10-20"
    )
    result = to_draft(found, MEMBERS, TODAY)
    assert result.draft.payer_id == 2
    assert result.draft.split.member_ids == [1, 2, 3]
    assert result.draft.spent_at == dt.date(2026, 10, 20)
    assert result.draft.source == "ai"
    assert result.warnings == []


def test_draft_warns_about_what_the_user_must_check():
    found = Found(description="Taxi", amount=None, payer="Hùng", participants=["Tien", "Lan"])
    result = to_draft(found, MEMBERS, TODAY)
    assert result.draft.payer_id is None
    assert result.draft.split.member_ids == [1]
    assert result.draft.spent_at == TODAY  # no date given: today in Vietnam
    codes = [(w.code, w.name) for w in result.warnings]
    assert codes == [("unknown_member", "Hùng"), ("unknown_member", "Lan"), ("no_amount", None)]


def test_draft_with_nobody_named_is_split_between_everyone_with_a_warning():
    found = Found(description="Rent", amount=3_000_000, payer=None)
    result = to_draft(found, MEMBERS, TODAY)
    assert result.draft.split.member_ids == [1, 2, 3]
    assert [w.code for w in result.warnings] == ["no_payer", "participants_assumed"]


def test_idle_ips_are_forgotten():
    clock = FakeClock()
    budget = AiBudget(clock=clock)
    for i in range(100):
        budget.try_spend(f"10.1.0.{i}")
    clock.now = 61
    budget.try_spend("10.1.0.200")  # only try_spend, as in production
    assert list(budget.per_ip.hits) == ["10.1.0.200"]


def test_an_amount_the_api_would_refuse_is_left_for_the_user():
    found = Found(description="Typo", amount=10**15, payer="Minh", everyone=True)
    result = to_draft(found, MEMBERS, TODAY)
    assert result.draft.amount is None
    assert [w.code for w in result.warnings] == ["no_amount"]


def test_one_unknown_name_gives_one_warning():
    found = Found(
        description="Cafe", amount=50_000, payer="Lan", participants=["Lan", "lan", "Tiến"]
    )
    result = to_draft(found, MEMBERS, TODAY)
    assert [(w.code, w.name) for w in result.warnings] == [("unknown_member", "Lan")]
    assert result.draft.split.member_ids == [1]


def test_more_people_than_one_expense_allows_is_a_clear_error():
    crowd = {i: f"Member {i}" for i in range(1, 52)}
    found = Found(description="Party", amount=5_100_000, payer="Member 1", everyone=True)
    with pytest.raises(ApiError) as error:
        to_draft(found, crowd, TODAY)
    assert error.value.status == 422 and error.value.code == "too_many_participants"


@pytest.mark.parametrize(
    "forwarded, peer, hops, expected",
    [
        # Render (from the live logs): the visitor, then two proxy entries that change every time.
        ("198.51.100.7, 172.70.1.2, 10.201.3.4", "10.0.0.1", 3, "198.51.100.7"),
        ("1.2.3.4, 198.51.100.7, 172.70.1.2, 10.201.3.4", "10.0.0.1", 3, "198.51.100.7"),
        ("172.70.1.2, 10.201.3.4", "10.0.0.1", 3, UNRESOLVED),  # fewer entries than proxies
        ("", "10.0.0.1", 3, UNRESOLVED),
        ("198.51.100.7, 172.70.1.2", "10.0.0.1", 2, "198.51.100.7"),
        # Compose: nginx appends the browser's address.
        ("1.2.3.4, 192.168.1.20", "172.18.0.3", 1, "192.168.1.20"),
        ("not-an-ip, 172.70.1.2", "10.0.0.1", 2, UNRESOLVED),
        ("2001:DB8::0:1, 172.70.1.2", None, 2, "2001:db8::/64"),  # one key per /64
        ("2001:db8::9:8:7:6, 172.70.1.2", None, 2, "2001:db8::/64"),  # same line, new address
        ("::ffff:198.51.100.7, 172.70.1.2", None, 2, "198.51.100.7"),
        ("1.2.3.4", "203.0.113.9", 0, "203.0.113.9"),  # 0 = the header is ignored
        ("", None, 0, UNRESOLVED),
    ],
)
def test_the_visitor_is_found_behind_the_configured_proxies(forwarded, peer, hops, expected):
    assert pick_client_ip(forwarded, peer, hops) == expected


def test_a_retry_counts_globally_but_not_against_the_visitor():
    clock = FakeClock()
    budget = AiBudget(per_ip_per_minute=2, per_minute=3, clock=clock)
    assert budget.try_spend("a")
    assert budget.try_spend_retry()
    assert budget.try_spend("a")  # the retry did not use the visitor's own limit
    assert not budget.try_spend_retry()  # but it did use the global one: 3 calls this minute
    assert not budget.try_spend("b")
