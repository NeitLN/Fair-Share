"""Placing named amounts (specs/009-ai-custom-split): pure arithmetic, no model, no database.

House of the spec: Tiến 1, Minh 2, Lan 3, Duy Anh 4. A name is given as its candidate member ids
(what app/services/names.match_candidates found): [] is nobody, two ids is ambiguous.
"""

import pytest

from app.services.allocation import Allocated, Blocked, Named, Target, allocate

HOUSE = [1, 2, 3, 4]
TIEN, MINH, LAN, DUY = 1, 2, 3, 4
K = 1000


def n(member, amount, written=None):
    candidates = member if isinstance(member, list) else [member]
    return Named(candidates, amount * K, written or f"m{member}")


def t(member, written=None):
    candidates = member if isinstance(member, list) else [member]
    return Target(candidates, written or f"m{member}")


def place(total, payer, named, rest="none", targets=(), unsupported="none", readable=True):
    return allocate(
        total=None if total is None else total * K,
        payer_id=payer,
        named=list(named),
        rest_kind=rest,
        rest_targets=list(targets),
        unsupported=unsupported,
        readable=readable,
        household=HOUSE,
    )


def shares_in_k(result):
    assert isinstance(result, Allocated), result
    return {member: amount // K for member, amount in result.shares.items()}


def assert_named_kept(result, named, total):
    """The invariant: the shares add up, and no named amount was changed to make them."""
    assert sum(result.shares.values()) == total * K
    for entry in named:
        assert result.shares[entry.candidates[0]] >= entry.amount


# --- US1: named amounts, the rest to the payer (the spec's table) -------------------------------

TABLE = [
    # "lẩu 500k Tiến trả, Minh 200k, Lan 100k"
    (500, TIEN, [n(MINH, 200), n(LAN, 100)], "none", [], {MINH: 200, LAN: 100, TIEN: 200}),
    # "lẩu 500k Tiến trả, Minh 200k": Tiến takes the rest though he was not named
    (500, TIEN, [n(MINH, 200)], "none", [], {MINH: 200, TIEN: 300}),
    # "500k Tiến trả, Tiến 100k, Minh 200k, còn lại Lan"
    (500, TIEN, [n(TIEN, 100), n(MINH, 200)], "person", [t(LAN)], {TIEN: 100, MINH: 200, LAN: 200}),
    # "500k Tiến trả, Lan 100k, Minh 200k, còn lại Lan"
    (500, TIEN, [n(LAN, 100), n(MINH, 200)], "person", [t(LAN)], {LAN: 300, MINH: 200}),
    # "500k Tiến trả, Minh 500k": the payer is not added
    (500, TIEN, [n(MINH, 500)], "none", [], {MINH: 500}),
    # "lẩu 500k, Minh 200k, Lan 100k, còn lại mình" typed by Tiến: no payer needed
    (
        500,
        None,
        [n(MINH, 200), n(LAN, 100)],
        "person",
        [t(TIEN, "ME")],
        {MINH: 200, LAN: 100, TIEN: 200},
    ),
]


@pytest.mark.parametrize("total, payer, named, rest, targets, expected", TABLE)
def test_the_spec_table(total, payer, named, rest, targets, expected):
    result = place(total, payer, named, rest, targets)
    assert shares_in_k(result) == expected
    assert_named_kept(result, named, total)


def test_the_rest_to_the_payer_is_said_so():
    result = place(500, TIEN, [n(MINH, 200), n(LAN, 100)])
    assert (result.rest_to, result.rest_amount, result.rest_to_payer) == (TIEN, 200 * K, True)


def test_an_explicit_rest_taker_does_not_depend_on_the_payer():
    result = place(500, TIEN, [n(MINH, 200)], "person", [t(LAN)])
    assert (result.rest_to, result.rest_amount, result.rest_to_payer) == (LAN, 300 * K, False)


def test_exact_total_has_no_rest():
    result = place(500, TIEN, [n(MINH, 300), n(LAN, 200)])
    assert shares_in_k(result) == {MINH: 300, LAN: 200}
    assert (result.rest_to, result.rest_amount, result.rest_to_payer) == (None, 0, False)


def test_the_payer_named_with_an_amount_also_takes_the_rest():
    result = place(500, TIEN, [n(TIEN, 100), n(MINH, 200)])
    assert shares_in_k(result) == {TIEN: 300, MINH: 200}


def test_whole_dong_are_never_rounded():
    result = allocate(
        total=100_001,
        payer_id=TIEN,
        named=[Named([MINH], 33_333, "Minh")],
        rest_kind="none",
        rest_targets=[],
        unsupported="none",
        readable=True,
        household=HOUSE,
    )
    assert result.shares == {TIEN: 66_668, MINH: 33_333}


# --- US2: amounts that cannot be placed safely ---------------------------------------------------


def blocked(result, reason):
    assert isinstance(result, Blocked), result
    assert result.reason == reason
    return result


def test_over_the_total_gives_both_figures_and_the_amounts_as_read():
    result = blocked(place(500, LAN, [n(MINH, 300), n(DUY, 300)]), "over_total")
    assert (result.named_sum, result.total) == (600 * K, 500 * K)
    assert result.preview == {MINH: 300 * K, DUY: 300 * K}


def test_an_unknown_name_blocks_even_when_the_rest_adds_up():
    # "500k Tiến trả, Minh 500k, Hùng 100k": Minh 500k alone adds up, but it is not what was said
    result = blocked(place(500, TIEN, [n(MINH, 500), n([], 100, "Hùng")]), "unknown_member")
    assert result.name == "Hùng"
    assert result.preview == {MINH: 500 * K}


def test_a_name_meaning_several_members_blocks():
    result = blocked(place(500, TIEN, [n([MINH, DUY], 200, "Anh")]), "ambiguous_member")
    assert result.name == "Anh"


def test_an_unknown_or_ambiguous_rest_taker_blocks():
    assert place(500, TIEN, [n(MINH, 200)], "person", [t([], "Hùng")]).reason == "unknown_member"
    assert place(500, TIEN, [n(MINH, 200)], "person", [t([MINH, DUY], "Anh")]).reason == (
        "ambiguous_member"
    )


def test_two_amounts_for_one_member_block():
    # "Tiến 100k, Tien 50k": the names differ, the member does not
    named = [n(TIEN, 100, "Tiến"), n(TIEN, 50, "Tien")]
    result = blocked(place(500, LAN, named), "duplicate_member")
    assert result.name == "Tien"


def test_the_payer_or_rest_taker_with_a_named_amount_is_not_a_duplicate():
    assert isinstance(place(500, TIEN, [n(TIEN, 100)], "person", [t(TIEN)]), Allocated)


def test_a_rest_with_nobody_to_take_it_blocks():
    result = blocked(place(500, None, [n(MINH, 200)]), "no_rest_taker")
    assert result.remainder == 300 * K


def test_no_payer_is_fine_when_nothing_is_left():
    assert shares_in_k(place(500, None, [n(MINH, 200), n(LAN, 300)])) == {MINH: 200, LAN: 300}


def test_no_total_blocks_and_is_never_guessed():
    blocked(place(None, TIEN, [n(MINH, 200), n(LAN, 100)]), "no_total")


@pytest.mark.parametrize("reason", ["fraction_or_percent", "several_payers", "paid_amount"])
def test_ways_of_sharing_we_cannot_read_block(reason):
    blocked(place(600, TIEN, [n(MINH, 200)], unsupported=reason), reason)


def test_a_payer_who_does_not_share_cannot_take_the_rest():
    blocked(place(500, TIEN, [n(MINH, 200)], unsupported="payer_not_sharing"), "payer_not_sharing")


def test_a_payer_who_does_not_share_is_fine_when_someone_else_takes_the_rest():
    result = place(500, TIEN, [n(MINH, 200)], "person", [t(LAN)], unsupported="payer_not_sharing")
    assert shares_in_k(result) == {MINH: 200, LAN: 300}
    exact = place(500, TIEN, [n(MINH, 500)], unsupported="payer_not_sharing")
    assert shares_in_k(exact) == {MINH: 500}


def test_shares_the_model_gave_badly_block():
    result = blocked(place(500, TIEN, [], readable=False), "unreadable_shares")
    assert result.preview == {}


def test_a_rest_for_a_person_without_exactly_one_name_blocks():
    blocked(place(500, TIEN, [n(MINH, 200)], "person", []), "unreadable_shares")
    blocked(place(500, TIEN, [n(MINH, 200)], "person", [t(LAN), t(DUY)]), "unreadable_shares")


# --- US3: "còn lại chia đều" --------------------------------------------------------------------


def test_the_rest_split_equally_between_those_without_an_amount():
    # "điện 900k Minh trả, Lan 400k, còn lại chia đều": 500k over Tiến, Minh, Duy Anh
    result = place(900, MINH, [n(LAN, 400)], "equal")
    assert result.shares == {LAN: 400_000, TIEN: 166_667, MINH: 166_667, DUY: 166_666}
    assert (result.rest_to, result.rest_amount, result.rest_to_payer) == (None, 500 * K, False)


def test_a_named_zero_counts_as_named():
    result = place(900, MINH, [n(LAN, 400), n(DUY, 0)], "equal")
    assert result.shares == {LAN: 400_000, DUY: 0, TIEN: 250_000, MINH: 250_000}


def test_the_payer_with_a_named_amount_is_not_in_the_equal_group():
    result = place(900, MINH, [n(MINH, 100), n(LAN, 200)], "equal")
    assert result.shares == {MINH: 100_000, LAN: 200_000, TIEN: 300_000, DUY: 300_000}


def test_the_rest_split_between_the_people_named_after_it():
    # "còn lại chia đều cho Tiến và Duy Anh"
    result = place(900, MINH, [n(LAN, 400)], "equal", [t(TIEN), t(DUY)])
    assert shares_in_k(result) == {LAN: 400, TIEN: 250, DUY: 250}


def test_a_named_person_after_chia_deu_adds_their_portion():
    result = place(900, MINH, [n(TIEN, 100), n(LAN, 400)], "equal", [t(TIEN), t(DUY)])
    assert shares_in_k(result) == {TIEN: 300, LAN: 400, DUY: 200}


def test_no_rest_keeps_the_named_amounts():
    result = place(900, MINH, [n(LAN, 400), n(TIEN, 500)], "equal")
    assert shares_in_k(result) == {LAN: 400, TIEN: 500}


def test_everyone_named_and_a_rest_to_share_blocks():
    named = [n(TIEN, 100), n(MINH, 100), n(LAN, 100), n(DUY, 100)]
    result = blocked(place(900, MINH, named, "equal"), "nobody_for_equal_rest")
    assert result.remainder == 500 * K


def test_an_unknown_name_after_chia_deu_never_shrinks_the_group():
    result = place(900, MINH, [n(LAN, 400)], "equal", [t(TIEN), t([], "Hùng")])
    blocked(result, "unknown_member")


def test_every_allocation_adds_up_and_keeps_the_named_amounts():
    cases = [row[:5] for row in TABLE] + [
        (900, MINH, [n(LAN, 400)], "equal", []),
        (900, MINH, [n(TIEN, 100), n(LAN, 400)], "equal", [t(TIEN), t(DUY)]),
        (777, LAN, [n(TIEN, 1), n(MINH, 2)], "equal", []),
    ]
    for total, payer, named, rest, targets in cases:
        assert_named_kept(place(total, payer, named, rest, targets), named, total)
