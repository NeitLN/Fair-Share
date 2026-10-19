"""How an expense is split into shares (docs/ARCHITECTURE.md §4). Pure: no database, no FastAPI.

Money is whole đồng, so an amount rarely divides evenly. The rule: everyone gets
`amount // n`, and the `amount % n` đồng left over go one each to the participants with the lowest
member ids. The shares therefore always add up to the amount exactly, and the same input always
gives the same split.
"""

from collections.abc import Iterable


def equal_split(amount: int, member_ids: Iterable[int]) -> dict[int, int]:
    """{member_id: share}, in member id order. equal_split(100_000, [3, 1, 2]) gives
    {1: 33_334, 2: 33_333, 3: 33_333}."""
    ids = sorted(set(member_ids))
    if not ids:
        raise ValueError("an expense needs at least one participant")
    base, remainder = divmod(amount, len(ids))
    return {member_id: base + (1 if i < remainder else 0) for i, member_id in enumerate(ids)}


def is_equal_split(amount: int, shares: dict[int, int]) -> bool:
    """True if these shares are exactly what equal_split gives for the same participants.

    The database stores only the shares; this tells the edit form which kind of split to show.
    """
    return bool(shares) and equal_split(amount, shares) == shares
