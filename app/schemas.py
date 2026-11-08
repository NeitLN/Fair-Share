"""Request and response bodies (Pydantic). Field names match frontend/src/api/types.ts exactly.

Limits mirror the CHECK constraints in db/migrations/001_init.sql, so a bad value is a 422 with the
field named, never a database error (docs/ARCHITECTURE.md §5, "Input limits"):

* Text is trimmed ("  Minh " is stored as "Minh"), put in one Unicode form (NFC) and may not contain
  control characters.
* Numbers in a body must be JSON numbers: `true`, `"1000"` and `1000.5` are refused, not converted.
* Dates must fall between 2000 and 2099.
"""

import unicodedata
from datetime import date, datetime
from typing import Annotated, Any, Literal

from fastapi import Path
from pydantic import (
    BaseModel,
    BeforeValidator,
    Field,
    StrictInt,
    StringConstraints,
    model_validator,
)

BIGINT_MAX = 2**63 - 1

# A bigint primary key in a URL. Larger numbers cannot exist, so they are a 422, not a 500.
Id = Annotated[int, Path(ge=1, le=BIGINT_MAX)]

# A member id inside a body: a real JSON number (`true` would otherwise become member 1).
MemberId = Annotated[StrictInt, Field(ge=1, le=BIGINT_MAX)]
# The id of any other row sent in a body (a recurring item), with the same rules as MemberId
RowId = Annotated[StrictInt, Field(ge=1, le=BIGINT_MAX)]

# The day an expense was spent or a settlement paid. Anything outside this range is a typo
# (year 0001 or 9999) that would sort the lists and the balances history in odd places.
Day = Annotated[date, Field(ge=date(2000, 1, 1), le=date(2099, 12, 31))]


# Characters that take no space on screen. Left in, they make a name that looks empty, or a second
# "Minh" that cannot be told from the first (#133). The zero-width joiner is handled apart: it
# also builds emoji such as a family from three people, so it stays between two emoji.
INVISIBLE = {
    "\u200b", "\u200c", "\u2060", "\ufeff", "\u00ad",
    # The Hangul fillers: Unicode calls them letters, so strip() keeps them, but they draw nothing
    "\u115f", "\u1160", "\u3164", "\uffa0",
}
ZERO_WIDTH_JOINER = "\u200d"


def _emoji_part(ch: str) -> bool:
    """An emoji, a skin-tone modifier or the emoji variation selector."""
    return unicodedata.category(ch) in ("So", "Sk") or ch == "\ufe0f"


def drop_invisible(text: str) -> str:
    kept = []
    for i, ch in enumerate(text):
        if ch in INVISIBLE:
            continue
        if ch == ZERO_WIDTH_JOINER and not (
            0 < i < len(text) - 1 and _emoji_part(text[i - 1]) and _emoji_part(text[i + 1])
        ):
            continue
        kept.append(ch)
    return "".join(kept)


def clean_text(value: Any) -> Any:
    """Runs before the length limits on every text field.

    * NFC: Vietnamese letters can arrive as one character ("ế") or as a letter plus combining
      marks (some keyboards, copy-paste). Both look identical; storing one form keeps "Tiến" and
      "Tiến" from becoming two members and lets the length limits count what the user sees.
    * Invisible characters (zero-width space, soft hyphen, Hangul filler, ...) are removed, so a
      name made only of them is empty (422) and "Minh" with one inside is "Minh" again (409 for a
      second one).
    * Control characters (NUL, bell, line breaks inside a name, ...) and broken UTF-8 (a lone
      surrogate) are refused: PostgreSQL cannot store NUL or invalid UTF-8, which used to be a 500.
    """
    if not isinstance(value, str):
        return value  # not text: the str type check reports it
    value = drop_invisible(value).strip()
    if any(unicodedata.category(ch) in ("Cc", "Cs") for ch in value):
        raise ValueError("must not contain control characters")
    return unicodedata.normalize("NFC", value)


def join_lines(value: Any) -> Any:
    """Line breaks and tabs become single spaces, for free text that is read, not stored as a name:
    a message pasted from Zalo, "lẩu 240k\\nMinh trả chia đều", is one sentence to the AI."""
    return " ".join(value.split()) if isinstance(value, str) else value


def text(max_length: int, min_length: int = 1, multiline: bool = False):
    """A text field of `min_length`-`max_length` characters, cleaned by clean_text().

    multiline=True accepts line breaks and tabs by joining the lines first (see join_lines); every
    other control character is still refused.
    """
    clean = (lambda value: clean_text(join_lines(value))) if multiline else clean_text
    return Annotated[
        str,
        BeforeValidator(clean),
        StringConstraints(strip_whitespace=True, min_length=min_length, max_length=max_length),
    ]


HouseholdName = text(60)
MemberName = text(40)


class HouseholdIn(BaseModel):
    name: HouseholdName


class Household(BaseModel):
    id: int
    name: str
    created_at: datetime


class MyHousehold(Household):
    """A household as the signed-in user sees it: their role, their name in the split, and what is
    going on there for them (US4)."""

    role: Literal["owner", "member"]
    member_id: int
    my_net: int = 0
    waiting: int = 0


class PendingRequest(BaseModel):
    """A request to join that the owner has not answered yet. It names the house and its owner, and
    nothing else about the house (specs/015, docs/ACCOUNTS.md D4)."""

    household_id: int
    requested_at: datetime
    household_name: str
    owner_name: str


class MyHouseholds(BaseModel):
    households: list[MyHousehold]
    pending: list[PendingRequest]


class MemberIn(BaseModel):
    name: MemberName


class Member(BaseModel):
    id: int
    household_id: int
    name: str
    created_at: datetime
    # Whose account this name belongs to; None for a name from before accounts nobody has taken yet
    role: Literal["owner", "member"] | None = None
    user_id: int | None = None
    # That account's status and photo version, only while it is an owner or member here
    # (specs/010-profile-page); the photo itself comes from GET /api/households/{id}/photos
    status: str | None = None
    photo_version: str | None = None
    gender: Literal["male", "female", "other"] | None = None


# --- Accounts (docs/ACCOUNTS.md) ----------------------------------------------------------------

# Display names become the user's name in a household's split, so they follow the member name rules.
DisplayName = MemberName
# A password is taken as typed: no trimming, no cleaning; only its length is checked.
Password = Annotated[str, StringConstraints(min_length=8, max_length=128)]


def clean_email(value: Any) -> Any:
    """Trimmed and lower-cased; one "@" with something on both sides and a dot in the domain.
    Not a full RFC 5322 check: no email is sent, it is only the name of the account."""
    if not isinstance(value, str):
        return value
    value = value.strip().lower()
    local, at, domain = value.rpartition("@")
    if (
        not at
        or not local
        or "." not in domain.strip(".")
        or any(ch.isspace() or unicodedata.category(ch) in ("Cc", "Cs") for ch in value)
    ):
        raise ValueError("must be an email address")
    return value


Email = Annotated[
    str, BeforeValidator(clean_email), StringConstraints(min_length=3, max_length=254)
]


class RegisterIn(BaseModel):
    email: Email
    password: Password
    display_name: DisplayName


class LoginIn(BaseModel):
    email: Email
    # Any length is checked against the hash; a too long one is simply wrong, not a 422
    password: Annotated[str, StringConstraints(max_length=1024)]


class User(BaseModel):
    id: int
    email: str
    display_name: str
    status: str | None = None  # specs/010-profile-page, US3
    gender: Literal["male", "female", "other"] | None = None  # US5; None = "Không nêu"


# --- The signed-in person's own account (specs/010-profile-page) ---------------------------------


class MeIn(BaseModel):
    display_name: DisplayName


class KeptName(BaseModel):
    """A household where the new name was someone else's, so the old one stayed there."""

    household_id: int
    household_name: str
    name: str


class RenameResult(BaseModel):
    user: User
    kept: list[KeptName]


# Text direction controls could turn the rest of a row around; a status has no use for them
BIDI_CONTROLS = dict.fromkeys(map(ord, "\u202a\u202b\u202c\u202d\u202e\u2066\u2067\u2068\u2069"))
MAX_STATUS = 60


def clean_status(value: Any) -> Any:
    """A status is cleaned like a name, without direction controls; empty or spaces only = none.
    The limit counts code points after cleaning, as PostgreSQL's char_length does."""
    if not isinstance(value, str):
        return value
    value = clean_text(value.translate(BIDI_CONTROLS))
    if not value:
        return None
    if len(value) > MAX_STATUS:
        raise ValueError(f"must be at most {MAX_STATUS} characters")
    return value


class StatusIn(BaseModel):
    status: Annotated[str | None, BeforeValidator(clean_status)] = None


class PhotoVersion(BaseModel):
    version: str


class MyPhoto(BaseModel):
    """The caller's own photo for the profile page; both None without one."""

    version: str | None
    data: str | None  # data:image/jpeg;base64,...


class MemberPhoto(BaseModel):
    member_id: int
    version: str
    data: str  # data:image/jpeg;base64,...


class HouseholdPhotos(BaseModel):
    photos: list[MemberPhoto]


# The notice shown next to the gender choice; the page sends the version it showed, so a stale page
# cannot record agreement to words it did not show (specs/010-profile-page, FR-029)
GENDER_NOTICE = "2026-11-v2"


def current_notice(value: Any) -> Any:
    if value != GENDER_NOTICE:
        raise ValueError("is not the current notice; reload the page")
    return value


class GenderIn(BaseModel):
    gender: Literal["male", "female", "other"] | None = None
    notice: Annotated[str, BeforeValidator(current_notice)]


class PasswordIn(BaseModel):
    # Any length is checked against the hash, as at login; only the new one has the 8 to 128 rule
    current_password: Annotated[str, StringConstraints(max_length=1024)]
    new_password: Password


class SessionOut(BaseModel):
    """The token goes in `Authorization: Bearer <token>` on every later request."""

    token: str
    user: User


class JoinIn(BaseModel):
    # "k7qm 2xrt", "K7QM-2XRT": spaces and dashes are dropped and letters upper-cased in the route
    code: Annotated[str, StringConstraints(max_length=40)]


class InvitePreview(BaseModel):
    """What a valid invite code shows a signed-in person before they ask (specs/015): the house's
    name and its owner's display name, nothing else; `member` when they are in it already."""

    house_name: str
    owner_name: str
    member: bool
    household_id: int | None = None


class JoinOutcome(BaseModel):
    """How a request to join ended without the person in the house: refused, or the house deleted.
    Only that person sees it; the names are the ones from when it happened."""

    id: int
    household_id: int
    household_name: str
    owner_name: str
    kind: Literal["refused", "house_deleted"]
    happened_at: datetime


class MyRequests(BaseModel):
    """GET /api/me/requests: the caller's waiting requests, the houses they are in, and their
    outcomes; no amounts (the 10-second check of the house page, specs/015)."""

    pending: list[PendingRequest]
    joined: list[int]
    outcomes: list[JoinOutcome]


class JoinResult(BaseModel):
    # "pending": asked, waiting for the owner. "member": already in it (then household_id is set).
    status: Literal["pending", "member"]
    household_id: int | None = None


class InviteCode(BaseModel):
    # None when there is no current code and only the owner can make one
    code: str | None
    expires_at: datetime | None


class JoinRequest(BaseModel):
    """Someone asking to join, as the owner sees them."""

    user_id: int
    display_name: str
    email: str
    requested_at: datetime


class ApproveIn(BaseModel):
    """Link the person to a name nobody has taken yet, or (member_id omitted) give them a new one:
    their display name, or `name` when that is already taken in the household."""

    member_id: MemberId | None = None
    name: MemberName | None = None


class ClaimInfo(BaseModel):
    """An old household (from before accounts) whose invite link the user opened: its name and the
    names nobody has taken, to pick theirs before becoming its owner."""

    id: int
    name: str
    members: list[Member]


class ClaimIn(BaseModel):
    member_id: MemberId | None = None


# --- Expenses (US-03, US-04, US-05) -----------------------------------------------------------

# Whole đồng. 1 000 billion is far beyond any household expense and keeps every sum within bigint.
MAX_AMOUNT = 1_000_000_000_000
# One expense is shared by at most this many people (a household is 2-6 in practice).
MAX_PARTICIPANTS = 50

Amount = Annotated[StrictInt, Field(gt=0, le=MAX_AMOUNT)]
Description = text(120)


class EqualSplit(BaseModel):
    """Everyone listed pays the same; leftover đồng go to the lowest member ids."""

    type: Literal["equal"]
    member_ids: list[MemberId] = Field(min_length=1, max_length=MAX_PARTICIPANTS)


class Share(BaseModel):
    member_id: MemberId
    amount: Annotated[StrictInt, Field(ge=0, le=MAX_AMOUNT)]


class CustomSplit(BaseModel):
    """Each share given explicitly; they must add up to the expense amount."""

    type: Literal["custom"]
    shares: list[Share] = Field(min_length=1, max_length=MAX_PARTICIPANTS)


# What an expense was for (specs/005-expense-categories); the page shows the name in its language.
# Fixed, like the CHECK in db/migrations/005_expense_categories.sql.
Category = Literal["food", "groceries", "utilities", "rent", "transport", "household", "other"]


class RecurringIn(BaseModel):
    """Make a new expense recur every month (specs/007-recurring-expenses)."""

    # Electricity: the amount is typed each month, so the item keeps none
    varying_amount: bool = False


class ExpenseIn(BaseModel):
    """Body of POST /api/households/{id}/expenses and PUT /api/expenses/{id}."""

    description: Description
    amount: Amount
    payer_id: MemberId
    spent_at: Day
    # "ai" when the form was pre-filled by Quick add and then saved by the user.
    source: Literal["manual", "ai"] = "manual"
    # Left out by a page that does not know categories: "other" for a new expense, and an edit
    # keeps the stored one (app/routers/expenses.py); never refused
    category: Category = "other"
    split: Annotated[EqualSplit | CustomSplit, Field(discriminator="type")]
    # POST only (specs/007-recurring-expenses): make this new expense recur, or record it as the
    # month's expense of an item. A PUT ignores both and keeps the expense's link.
    recurring: RecurringIn | None = None
    recurring_item_id: RowId | None = None

    @model_validator(mode="after")
    def one_recurring_field(self) -> "ExpenseIn":
        if self.recurring is not None and self.recurring_item_id is not None:
            raise ValueError("Send either recurring or recurring_item_id, not both")
        return self


class Expense(BaseModel):
    id: int
    household_id: int
    description: str
    amount: int
    payer_id: int
    spent_at: date
    source: Literal["manual", "ai"]
    category: Category
    created_at: datetime
    # How to show the split in the edit form: "equal" when the shares are exactly the equal split.
    split_type: Literal["equal", "custom"]
    # One per participant, in member id order; they always add up to `amount`.
    shares: list[Share]
    # The account that recorded it (who may change it); None for one from before accounts
    created_by: int | None = None
    # The recurring item it is the month's expense of (specs/007-recurring-expenses)
    recurring_item_id: int | None = None


class RecurringItem(BaseModel):
    """A recurring item: how to fill the form again when its day comes. Split equally."""

    id: int
    household_id: int
    description: str
    category: Category
    payer_id: int
    member_ids: list[int]
    # None: the amount changes every month
    amount: int | None
    day: int
    created_by: int | None
    created_at: datetime


# --- Settlements (US-08) ------------------------------------------------------------------------


# The version of a transfer notice a screen showed (specs/014): every change of a notice gives it a
# new one, from one sequence, so an action from an old screen is refused instead of acting on a
# notice that changed since.
NoticeVersion = Annotated[StrictInt, Field(ge=1, le=BIGINT_MAX)]
# A note told with a notice: one line, at most 120 characters; blank is no note.
NoticeNote = text(120, min_length=0, multiline=True)


class NoticeRef(BaseModel):
    """The notice a repayment typed in by hand pays: the version the receiver's screen showed."""

    version: NoticeVersion


class SettlementIn(BaseModel):
    """Body of POST /api/households/{id}/settlements: "from paid to `amount` đồng".

    With `notice`, it is the money the payer told about ("Đây là tiền … đã báo"): it is taken out
    of that notice. Without it, it is another repayment and no notice changes (specs/014,
    FR-008)."""

    from_member_id: MemberId
    to_member_id: MemberId
    amount: Amount
    settled_at: Day
    # Optional; blank is stored as no note.
    note: text(200, min_length=0) | None = None
    notice: NoticeRef | None = None


class Settlement(BaseModel):
    id: int
    household_id: int
    from_member_id: int
    to_member_id: int
    amount: int
    settled_at: date
    note: str | None
    created_at: datetime
    created_by: int | None = None
    # How much of a transfer notice this repayment recorded, if any (specs/014)
    notice_amount: int | None = None


class NoticeIn(BaseModel):
    """Body of PUT /api/households/{id}/notices: "I have sent `to` this amount" (docs/ACCOUNTS.md,
    S3). The sender is the signed-in member. `version` is the notice the screen showed for this
    pair, or null when it showed none; telling replaces a notice answered "Chưa nhận được"."""

    to_member_id: MemberId
    amount: Amount
    note: NoticeNote | None = None
    # Required, but may be null: the screen says whether it showed a notice for this pair
    version: Annotated[StrictInt | None, Field(ge=1, le=BIGINT_MAX)]


class NoticeAdd(BaseModel):
    """Body of POST /api/households/{id}/notices/{to}/add, "Báo thêm": `amount` more sent, on top of
    the waiting notice of `version`. `note` replaces the told note only when it is given (blank
    clears it)."""

    amount: Amount
    note: NoticeNote | None = None
    version: NoticeVersion


class NoticeAnswer(BaseModel):
    """Body of the receiver's "Chưa nhận được": the version of the notice they were shown. A notice
    changed since then is not the one they answered."""

    version: NoticeVersion


class NoticeAccept(NoticeAnswer):
    """Body of the receiver's "Đã nhận" on a notice: `received` arrived on `settled_at`; all of the
    notice when left out, or a smaller amount ("Nhận số khác"), which leaves the rest waiting."""

    received: Amount | None = None
    settled_at: Day


class Notice(BaseModel):
    from_member_id: int
    to_member_id: int
    # Told and not yet recorded
    amount: int
    status: Literal["sent", "declined"]
    note: str | None = None
    version: int
    created_at: datetime


# --- Balances (US-06, US-07) --------------------------------------------------------------------


class MemberBalance(BaseModel):
    member_id: int
    name: str
    paid: int  # total of the expenses this member paid for
    owed: int  # total of this member's shares
    sent: int  # settlements this member paid to others
    received: int  # settlements others paid to this member
    # paid - owed + sent - received. Positive: the household owes them; negative: they owe.
    net: int


class Transfer(BaseModel):
    from_member_id: int
    to_member_id: int
    amount: int


class Balances(BaseModel):
    # Every member, in member id order; the nets add up to exactly 0.
    balances: list[MemberBalance]
    # Paying these settles everyone (at most one fewer than the members with a balance).
    suggested: list[Transfer]


# --- AI Quick add (US-09, US-10) ----------------------------------------------------------------

# Same limit as app/services/gemini.py: longer text is refused before Gemini is called.
# Free text, often pasted from a chat app over several lines: the lines are joined, not refused.
AiText = text(300, multiline=True)


class AiParseIn(BaseModel):
    """Body of POST /api/households/{id}/ai/parse-expense."""

    text: AiText


class EqualDraftSplit(BaseModel):
    type: Literal["equal"] = "equal"
    member_ids: list[int]


class DraftShare(BaseModel):
    member_id: int
    amount: int


class CustomDraftSplit(BaseModel):
    """Named amounts placed by app/services/allocation.py; the shares add up to the amount."""

    type: Literal["custom"] = "custom"
    shares: list[DraftShare]  # member id order
    rest_to: int | None  # who took what was left after the named amounts; None when nothing was
    rest_amount: int
    rest_to_payer: bool  # the rest went to the payer, so the split only holds with that payer


class BlockedDraftSplit(BaseModel):
    """Named amounts that cannot be placed safely: shown as read, never a usable split."""

    type: Literal["blocked"] = "blocked"
    reason: str  # the code of the warning that says why
    preview: list[DraftShare]


DraftSplit = Annotated[
    EqualDraftSplit | CustomDraftSplit | BlockedDraftSplit, Field(discriminator="type")
]


class ExpenseDraft(BaseModel):
    """A pre-filled expense form. Nothing is saved: after checking it, the user sends it (fixed if
    needed) to POST /api/households/{id}/expenses, which validates it like any other expense."""

    description: str
    amount: int | None  # None when the sentence had no usable amount: the user types it
    payer_id: int | None  # None when the payer was missing or is not a member
    spent_at: date
    source: Literal["ai"]
    split: DraftSplit


class DraftWarning(BaseModel):
    # unknown_member · no_payer · no_amount · participants_assumed, and the reasons a split is
    # blocked (specs/009-ai-custom-split): over_total · ambiguous_member · duplicate_member ·
    # no_rest_taker · no_total · nobody_for_equal_rest · fraction_or_percent · several_payers ·
    # paid_amount · payer_not_sharing · unreadable_shares
    code: str
    message: str
    name: str | None = None  # the name as written, for unknown_member and the other name codes
    named_sum: int | None = None  # over_total
    total: int | None = None  # over_total
    remainder: int | None = None  # no_rest_taker · nobody_for_equal_rest


class AiDraft(BaseModel):
    draft: ExpenseDraft
    # What the user should look at before saving; empty when Gemini understood everything.
    warnings: list[DraftWarning]
