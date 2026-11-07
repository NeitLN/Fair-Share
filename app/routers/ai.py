"""AI Quick add (US-09, US-10): one sentence in, a pre-filled expense form out.

Spec: docs/ARCHITECTURE.md §6.

POST /api/households/{id}/ai/parse-expense {"text": "dinner 240k, Minh paid, split 3 ways"}

Nothing is saved here. The answer is a draft for the user to check; saving goes through the normal
expenses endpoint. Every failure is an error code the UI answers by keeping the manual form open:
404 household_not_found, 409 no_members, 422 validation_error / ai_unparseable /
too_many_participants, 429 ai_rate_limited, 503 ai_not_configured / ai_unavailable / database_*.

A fast 5xx from Gemini is retried once, counted in the global budget.
"""

import datetime as dt
import logging
import random
import time
from typing import Annotated

from fastapi import APIRouter, Depends, Header, Request

from app.access import find_access
from app.auth import bearer_token, not_authenticated, user_for_token
from app.client_ip import UNRESOLVED, pick_client_ip  # noqa: F401 (UNRESOLVED: tests read it here)
from app.db import connection
from app.errors import ApiError
from app.schemas import (
    MAX_AMOUNT,
    MAX_PARTICIPANTS,
    AiDraft,
    AiParseIn,
    BlockedDraftSplit,
    CustomDraftSplit,
    DraftShare,
    DraftWarning,
    EqualDraftSplit,
    ExpenseDraft,
    Id,
)
from app.services.allocation import Blocked, Named, Target, allocate
from app.services.gemini import GeminiBusy, GeminiClient, ai_not_configured, ai_rate_limited
from app.services.names import match_candidates, match_member
from app.services.rate_limit import AiBudget

router = APIRouter(prefix="/api", tags=["ai"])
logger = logging.getLogger("uvicorn.error")

# One retry, only when Gemini failed fast with a 5xx; a timeout has already made the user wait.
RETRY_IF_FAILED_WITHIN = 3.0

# How the model writes the person typing ("mình", "me"): resolved here to their own member id
SPEAKER = "ME"

# Vietnam has no daylight saving time; the server clock is UTC, so before 07:00 it is still
# "yesterday" there and a sentence about "hôm nay" would get the wrong date.
VIETNAM = dt.timezone(dt.timedelta(hours=7))


def get_gemini(request: Request) -> GeminiClient:
    return request.app.state.gemini


def get_budget(request: Request) -> AiBudget:
    return request.app.state.ai_budget


def client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    peer = request.client.host if request.client else None
    hops = request.app.state.settings.forwarded_hops
    log_forwarding(forwarded, request.headers.get("cf-connecting-ip"), hops)
    return pick_client_ip(forwarded, peer, hops)


def log_forwarding(forwarded: str, cf_connecting_ip: str | None, hops: int) -> None:
    """The shape of the proxy headers, never an address: enough to check FORWARDED_HOPS from the
    Render logs (Cloudflare's CF-Connecting-IP should sit `hops` entries from the end)."""
    entries = [entry.strip() for entry in forwarded.split(",")] if forwarded.strip() else []
    if cf_connecting_ip is None:
        cf = "absent"
    elif cf_connecting_ip.strip() in entries:
        cf = f"entry {entries.index(cf_connecting_ip.strip()) - len(entries)}"
    else:
        cf = "not in x-forwarded-for"
    logger.info(
        "quick add: x-forwarded-for has %d entries, forwarded_hops=%d, cf-connecting-ip: %s",
        len(entries),
        hops,
        cf,
    )


def load_members(
    request: Request, household_id: int, authorization: str | None
) -> tuple[dict[int, str], int]:
    """{member_id: name} of the people with an account in the household, the only ones a new
    expense can be split between, and the caller's own member id ("mình" in a sentence, never
    taken from the model or the client). Uses its own short-lived connection instead of ConnDep:
    the route then waits up to AI_TIMEOUT (20 s) for Gemini, and the pool only has 5 connections.
    So it checks the session and the membership itself (app/access.py does it for the other
    routers). The connection goes through the same database back-off as every other route (#155)."""
    with connection(request) as conn:
        user = user_for_token(conn, bearer_token(authorization))
        if user is None:
            raise not_authenticated()
        access = find_access(conn, "household_id", household_id, user["id"])
        rows = conn.execute(
            "SELECT m.id, m.name FROM members m JOIN household_users hu"
            " ON hu.household_id = m.household_id AND hu.member_id = m.id"
            " WHERE m.household_id = %s ORDER BY m.id",
            (household_id,),
        ).fetchall()
    return {member_id: name for member_id, name in rows}, access.member_id


@router.post("/households/{household_id}/ai/parse-expense", response_model=AiDraft)
def parse_expense(
    household_id: Id,
    body: AiParseIn,
    request: Request,
    gemini: Annotated[GeminiClient, Depends(get_gemini)],
    budget: Annotated[AiBudget, Depends(get_budget)],
    authorization: Annotated[str | None, Header()] = None,
):
    # Before the budget: a request from outside the household never spends anyone's quota
    members, me = load_members(request, household_id, authorization)
    if not members:
        raise ApiError(409, "no_members", "Add the household's members before using quick add")
    # Checked before the budget, so a missing key never uses it up.
    if not gemini.configured:
        raise ai_not_configured()
    if not budget.try_spend(client_ip(request)):
        raise ai_rate_limited()

    today = dt.datetime.now(VIETNAM).date()
    started = time.monotonic()
    try:
        found = gemini.parse_expense(body.text, list(members.values()), today)
    except GeminiBusy:
        # Gemini's 5xx is often momentary. Only once, only if it failed fast, and only if the
        # global budget still has room: the retry is another call against the project's quota.
        if time.monotonic() - started > RETRY_IF_FAILED_WITHIN or not budget.try_spend_retry():
            raise
        pause()
        # Only the time left of the first call's timeout (at least 1 s), so the user never waits
        # much longer than AI_TIMEOUT in total.
        left = max(1.0, gemini.timeout - (time.monotonic() - started))
        found = gemini.parse_expense(body.text, list(members.values()), today, timeout=left)
    return to_draft(found, members, today, me)


def pause() -> None:
    time.sleep(random.uniform(0.3, 0.8))  # a little jitter, so two visitors do not retry together


def to_draft(found, members: dict[int, str], today: dt.date, me: int | None = None) -> AiDraft:
    """Turn Gemini's names into member ids, and say what the user should check."""
    warnings: list[DraftWarning] = []
    reported: set[str] = set()

    def unknown(name: str) -> None:
        if name.casefold() in reported:  # "Lan paid for Lan and me": one warning is enough
            return
        reported.add(name.casefold())
        warnings.append(
            DraftWarning(
                code="unknown_member",
                name=name,
                message=f'"{name}" is not a member of this household',
            )
        )

    # ME is how the model writes the person typing; as a payer it is not a payment fact we trust
    payer = found.payer if found.payer and found.payer.upper() != SPEAKER else None
    payer_id = match_member(payer, members) if payer else None
    if payer and payer_id is None:
        unknown(payer)
    elif not payer:
        warnings.append(DraftWarning(code="no_payer", message="Choose who paid"))

    # Above the expense API's limit the draft could never be saved, so the user types it instead.
    amount = found.amount if found.amount is not None and found.amount <= MAX_AMOUNT else None

    if found.named_amounts or found.rest.kind != "none" or found.unsupported != "none" or (
        not found.shares_readable
    ):
        split = named_split(found, members, me, amount, payer_id, warnings, unknown)
    else:
        split = EqualDraftSplit(member_ids=equal_members(found, members, warnings, unknown))

    if amount is None:
        warnings.append(DraftWarning(code="no_amount", message="Type the amount"))

    return AiDraft(
        draft=ExpenseDraft(
            description=found.description,
            amount=amount,
            payer_id=payer_id,
            spent_at=dt.date.fromisoformat(found.spent_at) if found.spent_at else today,
            source="ai",
            split=split,
        ),
        warnings=warnings,
    )


def too_many_participants() -> ApiError:  # the expense API would refuse the split
    return ApiError(
        422,
        "too_many_participants",
        f"One expense can be shared by at most {MAX_PARTICIPANTS} people; choose them by hand",
    )


def equal_members(found, members: dict[int, str], warnings, unknown) -> list[int]:
    """Today's split: the people named, or everyone (with a warning when nobody was named)."""
    participant_ids: list[int] = []
    if not found.everyone:
        for name in found.participants:
            member_id = match_member(name, members)
            if member_id is None:
                unknown(name)
            elif member_id not in participant_ids:
                participant_ids.append(member_id)
    if not participant_ids:
        participant_ids = list(members)
        if not found.everyone:
            warnings.append(
                DraftWarning(
                    code="participants_assumed",
                    message="Split between everyone; check who shares it",
                )
            )

    if len(participant_ids) > MAX_PARTICIPANTS:
        raise too_many_participants()
    return sorted(participant_ids)


# What the server says for each reason a split is blocked; the page shows its own wording.
BLOCKED_MESSAGES = {
    "over_total": "The named amounts add up to more than the total; fix the split",
    "unknown_member": "is not a member of this household",
    "ambiguous_member": "could be more than one member; split it by hand",
    "duplicate_member": "is given two amounts; split it by hand",
    "no_rest_taker": "Nobody takes what is left of the total; choose who paid or split it by hand",
    "no_total": "Type the total, then set the split",
    "nobody_for_equal_rest": "Everyone already has an amount; split the rest by hand",
    "fraction_or_percent": "Fractions and percentages cannot be read yet; split it by hand",
    "several_payers": "More than one person paid; an expense has one payer",
    "paid_amount": "An amount is what someone paid, not what they owe; split it by hand",
    "payer_not_sharing": "The payer is not sharing, so nobody takes the rest; split it by hand",
    "unreadable_shares": "Could not read the shares; split it by hand",
}


def named_split(found, members: dict[int, str], me, amount, payer_id, warnings, unknown):
    """specs/009-ai-custom-split: place the named amounts (app/services/allocation.py), or say why
    they cannot be placed. The model's names are matched here; ME is the person typing."""

    def candidates(name: str) -> list[int]:
        if name.upper() == SPEAKER:
            return [me] if me in members else []
        return match_candidates(name, members)

    result = allocate(
        total=amount,
        payer_id=payer_id,
        named=[Named(candidates(e.name), e.amount, e.name) for e in found.named_amounts],
        rest_kind=found.rest.kind,
        rest_targets=[Target(candidates(name), name) for name in found.rest.names],
        unsupported=found.unsupported,
        readable=found.shares_readable,
        household=list(members),
    )
    if isinstance(result, Blocked):
        if result.reason == "unknown_member" and result.name:
            unknown(result.name)  # the same warning as an unknown payer, once per name
        else:
            message = BLOCKED_MESSAGES[result.reason]
            if result.name:
                message = f'"{result.name}" {message}'
            warnings.append(
                DraftWarning(
                    code=result.reason,
                    message=message,
                    name=result.name,
                    named_sum=result.named_sum,
                    total=result.total,
                    remainder=result.remainder,
                )
            )
        return BlockedDraftSplit(
            reason=result.reason,
            preview=[DraftShare(member_id=m, amount=a) for m, a in sorted(result.preview.items())],
        )
    if len(result.shares) > MAX_PARTICIPANTS:
        raise too_many_participants()
    return CustomDraftSplit(
        shares=[DraftShare(member_id=m, amount=a) for m, a in result.shares.items()],
        rest_to=result.rest_to,
        rest_amount=result.rest_amount,
        rest_to_payer=result.rest_to_payer,
    )
