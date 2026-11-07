"""app/services/sentence.py: a reading with named amounts keeps only what the sentence writes.
The readings below are what the live model returned for the quickstart corpus of specs/009."""

import pytest

from app.services.gemini import ExpenseDraft as Found
from app.services.gemini import NamedAmount, Rest
from app.services.sentence import (
    amounts_written,
    held_to_sentence,
    name_written,
    rest_written,
    speaker_written,
)


@pytest.mark.parametrize(
    ("text", "amounts"),
    [
        ("lẩu 500k Tiến trả, Minh 200k, Lan 100k", {500_000, 200_000, 100_000}),
        ("điện 1tr2", {1_200_000}),
        ("điện 1tr25", {1_250_000}),
        ("tiền nhà 1,5 triệu", {1_500_000}),
        ("tiền nhà 3.5tr", {3_500_000}),
        ("ăn sáng 240 nghìn", {240_000}),
        ("chợ 350.000đ", {350_000}),
        ("chợ 200000", {200_000}),
        ("2 mình trả", {2}),  # "m" of "mình" is not "million"
        ("2 trả", {2}),
        ("tiền nhà 1 triệu 200k", {1_000_000, 200_000}),
    ],
)
def test_amounts_written(text, amounts):
    assert amounts_written(text) == amounts


@pytest.mark.parametrize(
    ("text", "amount"),
    [("điện 1 triệu 2", 1_200_000), ("điện 1 triệu 2", 1_000_000),
     ("tiền nhà 2 triệu rưỡi", 2_500_000), ("lẩu nửa triệu", 500_000)],
)
def test_amounts_written_in_words_give_the_total(text, amount):
    assert amount in amounts_written(text)


def test_a_name_is_written_ignoring_accents_and_by_one_word_of_it():
    assert name_written("Tiến", "500k tien tra")
    assert name_written("Duy Anh", "350k Duy trả")
    assert not name_written("Tiến", "lẩu 500k, Minh 200k, còn lại mình")
    assert not name_written("Duy Anh", "anh trả 350k")  # "anh" alone is an everyday word


def test_mình_is_never_the_name_minh_but_minh_without_accents_is():
    assert not name_written("Minh", "lẩu 600k, Lan 200k, mình 100k")
    assert name_written("Minh", "lau 600k, Lan 200k, minh 100k")
    assert not name_written("Tiến", "tiền chợ 350k Duy Anh trả")  # "tiền" is money, not Tiến


def test_the_speaker_keeps_the_accents_so_minh_is_not_minh():
    assert speaker_written("còn lại mình") and speaker_written("rest me")
    assert not speaker_written("Minh 200k")


def test_the_rest_is_written():
    assert rest_written("còn lại chia đều") and rest_written("split the rest")
    assert rest_written("Lan chịu phần dư")
    assert not rest_written("tiền chợ 350k Duy Anh trả, Lan 50k, Minh 100k")


def reading(**fields):
    base = {"description": "Lẩu", "amount": 500_000, "payer": "Tiến", "spent_at": "2026-11-07"}
    return Found(**{**base, **fields})


def test_a_guessed_person_for_the_rest_is_dropped_so_the_payer_takes_it():
    found = reading(
        amount=350_000,
        payer="Duy Anh",
        named_amounts=[NamedAmount("Lan", 50_000), NamedAmount("Minh", 100_000)],
        rest=Rest("person", ["Tiến"]),
    )
    held = held_to_sentence(found, "tiền chợ 350k Duy Anh trả, Lan 50k, Minh 100k")
    assert held.rest == Rest() and held.shares_readable and held.payer == "Duy Anh"


def test_a_guessed_payer_is_dropped():
    found = reading(
        named_amounts=[NamedAmount("Minh", 200_000), NamedAmount("Lan", 100_000)],
        rest=Rest("person", ["ME"]),
    )
    held = held_to_sentence(found, "lẩu 500k, Minh 200k, Lan 100k, còn lại mình")
    assert held.payer is None and held.rest == Rest("person", ["ME"]) and held.shares_readable


def test_a_total_that_is_not_written_is_dropped():
    found = reading(
        amount=1_000_000,
        named_amounts=[NamedAmount("Tiến", 500_000), NamedAmount("Minh", 500_000)],
    )
    held = held_to_sentence(found, "500k Tiến trả, Minh 500k")
    assert held.amount is None and held.payer == "Tiến"


@pytest.mark.parametrize(
    ("named", "rest"),
    [
        ([NamedAmount("Lan", 100_000)], Rest()),  # a name the sentence never writes
        ([NamedAmount("Minh", 150_000)], Rest()),  # an amount it never writes
        ([NamedAmount("ME", 100_000)], Rest()),  # the speaker, never written
        ([NamedAmount("Minh", 200_000)], Rest("person", ["Lan"])),  # "còn lại" someone unwritten
    ],
)
def test_shares_the_sentence_never_writes_are_unreadable(named, rest):
    found = reading(named_amounts=named, rest=rest)
    held = held_to_sentence(found, "lẩu 500k Tiến trả, Minh 200k, còn lại chia đều")
    assert not held.shares_readable


def test_a_sentence_as_written_is_kept_as_it_was():
    found = reading(
        payer="Minh",
        amount=900_000,
        named_amounts=[NamedAmount("Lan", 400_000)],
        rest=Rest("equal", ["Tiến", "Duy Anh"]),
    )
    text = "điện 900k Minh trả, Lan 400k, còn lại chia đều cho Tiến và Duy Anh"
    assert held_to_sentence(found, text) == found


def test_amounts_written_in_a_way_not_read_here_are_not_held_against_it():
    found = reading(amount=500_000, named_amounts=[NamedAmount("Minh", 200_000)])
    held = held_to_sentence(found, "lẩu năm trăm Tiến trả, Minh hai trăm")
    assert held.amount == 500_000 and held.shares_readable


def test_people_sharing_the_rest_equally_are_kept_without_còn_lại():
    found = reading(
        amount=600_000,
        named_amounts=[NamedAmount("Minh", 200_000)],
        rest=Rest("equal", ["Lan", "Duy Anh"]),
    )
    text = "lẩu 600k Tiến trả, Minh 200k, Lan với Duy Anh chia đều"
    assert held_to_sentence(found, text) == found
    others = reading(named_amounts=[NamedAmount("Minh", 200_000)], rest=Rest("equal", []))
    text = "lẩu 500k Tiến trả, Minh 200k, mấy người kia chia đều"
    assert held_to_sentence(others, text) == others


@pytest.mark.parametrize("rest", [Rest("person", ["Lan"]), Rest("equal", ["Lan"]), Rest("equal")])
def test_a_rest_never_mentioned_but_for_written_people_is_blocked_not_given_to_the_payer(rest):
    found = reading(
        amount=350_000,
        payer="Duy Anh",
        named_amounts=[NamedAmount("Lan", 50_000), NamedAmount("Minh", 100_000)],
        rest=rest,
    )
    held = held_to_sentence(found, "tiền chợ 350k Duy Anh trả, Lan 50k, Minh 100k")
    assert not held.shares_readable


def test_mình_read_as_minh_is_no_payer_and_unreadable_shares():
    found = reading(
        amount=600_000,
        payer="Minh",
        named_amounts=[NamedAmount("Lan", 200_000), NamedAmount("Minh", 100_000)],
    )
    held = held_to_sentence(found, "lẩu 600k, Lan 200k, mình 100k")
    assert held.payer is None and not held.shares_readable
