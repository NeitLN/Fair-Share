"""Who owes whom (docs/ARCHITECTURE.md §4). Pure: no database, no FastAPI.

    net(m) = paid by m - shares of m + settlements sent by m - settlements received by m

Positive: the household owes m. Negative: m owes the household. Every expense adds its amount to
the payer and the same total, split into shares, to the participants; every settlement adds the
same amount to both sides. So the nets of a household always sum to exactly 0.
"""

import heapq


def net(paid: int, owed: int, sent: int, received: int) -> int:
    return paid - owed + sent - received


def suggest_settlements(nets: dict[int, int]) -> list[tuple[int, int, int]]:
    """A short list of (from_member_id, to_member_id, amount) that brings every net to 0.

    Greedy: the member who owes the most pays the member who is owed the most, as much as one of
    them needs; repeat. Each transfer settles at least one person completely, and the last one
    settles two, so k members with a non-zero balance need at most k - 1 transfers. Ties are
    broken by the lower member id, so the same balances always give the same suggestion.
    """
    if sum(nets.values()) != 0:
        raise ValueError("balances must sum to 0")
    # heapq is a min-heap: store (-amount, member_id) to pop the largest amount first.
    creditors = [(-amount, m) for m, amount in nets.items() if amount > 0]
    debtors = [(amount, m) for m, amount in nets.items() if amount < 0]  # amount < 0: most first
    heapq.heapify(creditors)
    heapq.heapify(debtors)

    transfers = []
    while creditors and debtors:
        credit, creditor = heapq.heappop(creditors)
        debt, debtor = heapq.heappop(debtors)
        amount = min(-credit, -debt)
        transfers.append((debtor, creditor, amount))
        if -credit > amount:
            heapq.heappush(creditors, (credit + amount, creditor))
        if -debt > amount:
            heapq.heappush(debtors, (debt + amount, debtor))
    return transfers
