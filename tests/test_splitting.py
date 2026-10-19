"""The equal split rule (app/services/splitting.py). Pure functions: no database needed."""

import random

import pytest

from app.services.splitting import equal_split, is_equal_split


def test_even_amount_splits_evenly():
    assert equal_split(240_000, [1, 2, 3]) == {1: 80_000, 2: 80_000, 3: 80_000}


def test_leftover_dong_go_to_the_lowest_member_ids():
    assert equal_split(100_000, [1, 2, 3]) == {1: 33_334, 2: 33_333, 3: 33_333}
    assert equal_split(100_001, [1, 2, 3]) == {1: 33_334, 2: 33_334, 3: 33_333}


def test_order_of_the_participants_does_not_matter():
    assert equal_split(100_000, [9, 4, 7]) == {4: 33_334, 7: 33_333, 9: 33_333}


def test_amount_smaller_than_the_number_of_people():
    assert equal_split(2, [5, 6, 7]) == {5: 1, 6: 1, 7: 0}


def test_one_participant_pays_everything():
    assert equal_split(450_000, [3]) == {3: 450_000}


def test_no_participants_is_an_error():
    with pytest.raises(ValueError):
        equal_split(1000, [])


def test_shares_always_add_up_exactly_and_differ_by_at_most_one_dong():
    rng = random.Random(20261112)  # fixed seed: the same 2 000 cases on every run
    for _ in range(2000):
        amount = rng.randint(1, 50_000_000)
        ids = rng.sample(range(1, 1000), rng.randint(1, 12))
        shares = equal_split(amount, ids)
        assert sum(shares.values()) == amount
        assert set(shares) == set(ids)
        assert max(shares.values()) - min(shares.values()) <= 1
        # the bigger shares are exactly the lowest ids
        ordered = [shares[i] for i in sorted(ids)]
        assert ordered == sorted(ordered, reverse=True)


def test_is_equal_split_recognises_the_equal_split_only():
    assert is_equal_split(100_000, {1: 33_334, 2: 33_333, 3: 33_333})
    assert not is_equal_split(100_000, {1: 33_333, 2: 33_334, 3: 33_333})  # wrong person
    assert not is_equal_split(100_000, {1: 50_000, 2: 25_000, 3: 25_000})
    assert not is_equal_split(100_000, {})
