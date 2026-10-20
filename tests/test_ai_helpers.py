"""The pure parts of AI Quick add: matching names to members, the request budget, the draft."""

import datetime as dt

import pytest

from app.routers.ai import to_draft
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
