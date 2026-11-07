"""Place the amounts a quick add sentence names (specs/009-ai-custom-split). Pure: no model, no
database, no FastAPI.

Gemini only reports what the sentence says: the total, the amounts given to named people and
what it says about the rest. The split is worked out here with fixed arithmetic, so a reading can
be wrong but the money never is:

    share of a member = the amount named for them (0 if none) + their part of the rest
    rest              = total − the named amounts

The rest goes to the person the sentence names ("còn lại Lan"), is split equally ("còn lại chia
đều"), or else goes to the payer (the owner's decision, 07/11). Named amounts are never scaled,
dropped or changed, and their sum is compared with the total before anything else. When something
cannot be placed safely the result is Blocked: the form then keeps Lưu refused until the user
changes the split by hand, because a split that merely adds up may still not be what was said.
"""

from dataclasses import dataclass, field

from app.services.splitting import equal_split

# The reasons a split is blocked, in the order they are checked; each is also a DraftWarning code.
UNSUPPORTED_REASONS = ("fraction_or_percent", "several_payers", "paid_amount")


@dataclass(frozen=True)
class Named:
    """One named amount: the members its name could mean ([] nobody, 2+ ambiguous), as written."""

    candidates: list[int]
    amount: int
    written: str


@dataclass(frozen=True)
class Target:
    """A person the rest goes to, or one of those it is split between."""

    candidates: list[int]
    written: str


@dataclass(frozen=True)
class Allocated:
    shares: dict[int, int]  # member id order; they add up to the total
    rest_to: int | None  # the one member who took the rest; None if none was left or it was split
    rest_amount: int
    rest_to_payer: bool  # the rest went to the payer, so the split only holds with that payer


@dataclass(frozen=True)
class Blocked:
    reason: str
    preview: dict[int, int] = field(default_factory=dict)  # the named amounts as read, display only
    named_sum: int | None = None
    total: int | None = None
    remainder: int | None = None
    name: str | None = None  # as written


def allocate(
    *,
    total: int | None,
    payer_id: int | None,
    named: list[Named],
    rest_kind: str,
    rest_targets: list[Target],
    unsupported: str,
    readable: bool,
    household: list[int],
) -> Allocated | Blocked:
    # "còn lại" with no one, or several, after it is not a reading we can place
    if not readable or (rest_kind == "person" and len(rest_targets) != 1):
        return Blocked("unreadable_shares")

    preview: dict[int, int] = {}
    for entry in named:
        if len(entry.candidates) == 1:
            preview.setdefault(entry.candidates[0], entry.amount)

    def block(reason: str, **figures) -> Blocked:
        return Blocked(reason, preview, **figures)

    if unsupported in UNSUPPORTED_REASONS:
        return block(unsupported)

    for item in [*named, *rest_targets]:
        if not item.candidates:
            return block("unknown_member", name=item.written)
        if len(item.candidates) > 1:
            return block("ambiguous_member", name=item.written)

    shares: dict[int, int] = {}
    for entry in named:
        member = entry.candidates[0]
        if member in shares:
            return block("duplicate_member", name=entry.written)
        shares[member] = entry.amount

    if total is None:
        return block("no_total")
    named_sum = sum(shares.values())
    if named_sum > total:
        return block("over_total", named_sum=named_sum, total=total)

    remainder = total - named_sum
    targets = list(dict.fromkeys(target.candidates[0] for target in rest_targets))
    if remainder == 0:
        return _done(shares, None, 0, False)

    if rest_kind == "person":
        return _done(_add(shares, {targets[0]: remainder}), targets[0], remainder, False)

    if rest_kind == "equal":
        group = targets or [member for member in household if member not in shares]
        if not group:
            return block("nobody_for_equal_rest", remainder=remainder)
        return _done(_add(shares, equal_split(remainder, group)), None, remainder, False)

    # Nothing said about the rest: the payer takes it
    if payer_id is None:
        return block("no_rest_taker", remainder=remainder)
    if unsupported == "payer_not_sharing":
        return block("payer_not_sharing")
    return _done(_add(shares, {payer_id: remainder}), payer_id, remainder, True)


def _add(shares: dict[int, int], extra: dict[int, int]) -> dict[int, int]:
    result = dict(shares)
    for member, amount in extra.items():
        result[member] = result.get(member, 0) + amount
    return result


def _done(
    shares: dict[int, int], rest_to: int | None, rest_amount: int, to_payer: bool
) -> Allocated:
    return Allocated(dict(sorted(shares.items())), rest_to, rest_amount, to_payer)
