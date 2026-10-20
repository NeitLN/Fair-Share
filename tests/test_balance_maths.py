"""Net balances and suggested settlements (app/services/balances.py). Pure: no database needed.

The property tests run thousands of random households with a fixed seed, so a failure is
reproducible, and check what US-06/US-07 promise for every one of them.
"""

import random

import pytest

from app.services.balances import net, suggest_settlements
from app.services.splitting import equal_split


def apply(nets: dict[int, int], transfers) -> dict[int, int]:
    """The nets after everyone pays what was suggested (paying raises your net)."""
    after = dict(nets)
    for debtor, creditor, amount in transfers:
        after[debtor] += amount
        after[creditor] -= amount
    return after


def test_net_formula():
    # paid 300k, owes 100k of shares, sent 0, received 50k back: the others still owe 150k
    assert net(paid=300_000, owed=100_000, sent=0, received=50_000) == 150_000


def test_one_debtor_one_creditor():
    assert suggest_settlements({1: 50_000, 2: -50_000}) == [(2, 1, 50_000)]


def test_the_biggest_debtor_pays_the_biggest_creditor_first():
    # Minh (2) paid dinner 300k for 3, Duy Anh (3) paid 60k of groceries for 3
    nets = {1: -120_000, 2: 200_000, 3: -80_000}
    assert suggest_settlements(nets) == [(1, 2, 120_000), (3, 2, 80_000)]


def test_everyone_settled_means_no_transfers():
    assert suggest_settlements({1: 0, 2: 0, 3: 0}) == []
    assert suggest_settlements({}) == []


def test_ties_go_to_the_lower_member_id():
    assert suggest_settlements({4: 10, 2: 10, 9: -10, 7: -10}) == [(7, 2, 10), (9, 4, 10)]


def test_balances_that_do_not_sum_to_zero_are_refused():
    with pytest.raises(ValueError):
        suggest_settlements({1: 10, 2: -9})


def random_nets(rng: random.Random) -> dict[int, int]:
    members = rng.sample(range(1, 500), rng.randint(1, 10))
    nets = {m: rng.randint(-5_000_000, 5_000_000) for m in members[:-1]}
    nets[members[-1]] = -sum(nets.values())  # make them sum to 0, as real balances do
    return nets


def test_property_suggestions_clear_every_balance_in_at_most_k_minus_1_transfers():
    rng = random.Random(12112026)
    for _ in range(5000):
        nets = random_nets(rng)
        transfers = suggest_settlements(nets)
        with_balance = sum(1 for amount in nets.values() if amount != 0)
        assert len(transfers) <= max(with_balance - 1, 0)
        assert all(amount == 0 for amount in apply(nets, transfers).values())
        for debtor, creditor, amount in transfers:
            assert amount > 0
            assert nets[debtor] < 0 < nets[creditor]  # only debtors pay, only creditors receive


def test_property_nets_of_random_expenses_and_settlements_sum_to_zero():
    """Built the same way the endpoint does: totals per member, then net()."""
    rng = random.Random(29102026)
    for _ in range(500):
        members = list(range(1, rng.randint(3, 8)))  # 2 to 7 members
        paid, owed, sent, received = ({m: 0 for m in members} for _ in range(4))
        for _ in range(rng.randint(0, 15)):  # expenses, split equally
            amount = rng.randint(1, 2_000_000)
            paid[rng.choice(members)] += amount
            participants = rng.sample(members, rng.randint(1, len(members)))
            for m, share in equal_split(amount, participants).items():
                owed[m] += share
        for _ in range(rng.randint(0, 5)):  # settlements
            a, b = rng.sample(members, 2)
            amount = rng.randint(1, 500_000)
            sent[a] += amount
            received[b] += amount
        nets = {m: net(paid[m], owed[m], sent[m], received[m]) for m in members}
        assert sum(nets.values()) == 0
