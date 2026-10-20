"""AI Quick add (US-09, US-10): one sentence in, a pre-filled expense form out.

Spec: docs/ARCHITECTURE.md §6.

POST /api/households/{id}/ai/parse-expense {"text": "dinner 240k, Minh paid, split 3 ways"}

Nothing is saved here. The answer is a draft for the user to check; saving goes through the normal
expenses endpoint. Every failure is an error code the UI answers by keeping the manual form open:
404 household_not_found, 409 no_members, 422 validation_error / ai_unparseable /
too_many_participants, 429 ai_rate_limited, 503 ai_unavailable / database_*.

A fast 5xx from Gemini is retried once, counted in the global budget.
"""

import datetime as dt
import ipaddress
import logging
import random
import time
from typing import Annotated

from fastapi import APIRouter, Depends, Request

from app.errors import ApiError
from app.routers.households import household_not_found
from app.schemas import (
    MAX_AMOUNT,
    MAX_PARTICIPANTS,
    AiDraft,
    AiParseIn,
    DraftSplit,
    DraftWarning,
    ExpenseDraft,
    Id,
)
from app.services.gemini import GeminiBusy, GeminiClient, ai_rate_limited, ai_unavailable
from app.services.names import match_member
from app.services.rate_limit import AiBudget

router = APIRouter(prefix="/api", tags=["ai"])
logger = logging.getLogger("uvicorn.error")

# Requests whose visitor address cannot be read share one limit, rather than each getting its own.
UNRESOLVED = "unresolved"
# One retry, only when Gemini failed fast with a 5xx; a timeout has already made the user wait.
RETRY_IF_FAILED_WITHIN = 3.0

# Vietnam has no daylight saving time; the server clock is UTC, so before 07:00 it is still
# "yesterday" there and a sentence about "hôm nay" would get the wrong date.
VIETNAM = dt.timezone(dt.timedelta(hours=7))


def get_gemini(request: Request) -> GeminiClient:
    return request.app.state.gemini


def get_budget(request: Request) -> AiBudget:
    return request.app.state.ai_budget


def pick_client_ip(forwarded: str, peer: str | None, hops: int) -> str:
    """The visitor's address: `hops` entries from the end of X-Forwarded-For.

    Each trusted proxy appends the address it saw, so the last `hops` entries are theirs and the
    one they received from is the visitor. Anything further left was sent by the client and may be
    made up ("1.2.3.4, visitor, edge" on Render still gives the visitor).
    """
    if hops <= 0:
        candidate = peer or ""
    else:
        entries = [entry.strip() for entry in forwarded.split(",")] if forwarded.strip() else []
        if len(entries) < hops:
            return UNRESOLVED
        candidate = entries[-hops]
    try:
        address = ipaddress.ip_address(candidate)
    except ValueError:
        return UNRESOLVED
    if isinstance(address, ipaddress.IPv6Address):
        if address.ipv4_mapped:  # ::ffff:1.2.3.4 is 1.2.3.4
            return str(address.ipv4_mapped)
        # One home line or phone owns a whole /64 and may switch address inside it on every call.
        return str(ipaddress.ip_network(f"{address}/64", strict=False))
    return str(address)


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


def load_members(request: Request, household_id: int) -> dict[int, str]:
    """{member_id: name} of the household. Uses its own short-lived connection instead of ConnDep:
    the route then waits up to 10 s for Gemini, and the pool only has 5 connections."""
    pool = getattr(request.app.state, "pool", None)
    if pool is None:
        raise ApiError(503, "database_not_configured", "The database is not configured")
    with pool.connection() as conn:
        exists = conn.execute("SELECT 1 FROM households WHERE id = %s", (household_id,))
        if exists.fetchone() is None:
            raise household_not_found()
        rows = conn.execute(
            "SELECT id, name FROM members WHERE household_id = %s ORDER BY id", (household_id,)
        ).fetchall()
    return {member_id: name for member_id, name in rows}


@router.post("/households/{household_id}/ai/parse-expense", response_model=AiDraft)
def parse_expense(
    household_id: Id,
    body: AiParseIn,
    request: Request,
    gemini: Annotated[GeminiClient, Depends(get_gemini)],
    budget: Annotated[AiBudget, Depends(get_budget)],
):
    members = load_members(request, household_id)
    if not members:
        raise ApiError(409, "no_members", "Add the household's members before using quick add")
    # Checked before the budget, so a missing key never uses it up.
    if not gemini.configured:
        raise ai_unavailable()
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
        found = gemini.parse_expense(body.text, list(members.values()), today)
    return to_draft(found, members, today)


def pause() -> None:
    time.sleep(random.uniform(0.3, 0.8))  # a little jitter, so two visitors do not retry together


def to_draft(found, members: dict[int, str], today: dt.date) -> AiDraft:
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

    payer_id = match_member(found.payer, members) if found.payer else None
    if found.payer and payer_id is None:
        unknown(found.payer)
    elif not found.payer:
        warnings.append(DraftWarning(code="no_payer", message="Choose who paid"))

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

    if len(participant_ids) > MAX_PARTICIPANTS:  # the expense API would refuse the split
        raise ApiError(
            422,
            "too_many_participants",
            f"One expense can be shared by at most {MAX_PARTICIPANTS} people; choose them by hand",
        )

    # Above the expense API's limit the draft could never be saved, so the user types it instead.
    amount = found.amount if found.amount is not None and found.amount <= MAX_AMOUNT else None
    if amount is None:
        warnings.append(DraftWarning(code="no_amount", message="Type the amount"))

    return AiDraft(
        draft=ExpenseDraft(
            description=found.description,
            amount=amount,
            payer_id=payer_id,
            spent_at=dt.date.fromisoformat(found.spent_at) if found.spent_at else today,
            source="ai",
            split=DraftSplit(type="equal", member_ids=sorted(participant_ids)),
        ),
        warnings=warnings,
    )
