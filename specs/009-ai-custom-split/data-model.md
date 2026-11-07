# Data model: AI quick add reads named amounts

Nothing is stored. These are the in-memory shapes between Gemini, the server and the form.

## Reading (what Gemini reports, `app/services/gemini.py`)

Today's fields stay: `description`, `amount`, `payer`, `participants`, `everyone`, `spent_at`. New:

| Field | Type | Rule |
|---|---|---|
| `named_amounts` | list of `NamedAmount` | in the order written; empty when none; any invalid entry makes the whole list unusable (`shares_readable = False`) |
| `rest` | `Rest` | `kind` ∈ `none`, `person`, `equal`; `names` (strings, may hold `ME`) |
| `unsupported` | string | ∈ `none`, `fraction_or_percent`, `several_payers`, `paid_amount`, `payer_not_sharing` |
| `shares_readable` | bool | False when Gemini returned shares that fail validation (R5) |

`NamedAmount`: `name` (1–60 characters after trim, or `ME`), `amount` (`int`, not `bool`, `0 ≤ amount ≤ MAX_AMOUNT`).

## Allocation (`app/services/allocation.py`, pure)

Input: `total` (int or None), `payer_id` (int or None), `named` (list of `(candidates: list[int], amount, written)`),
`rest` (`kind`, `candidates` per name), `unsupported`, `household` (member ids with an account).

Output: `Allocated(shares: dict[int, int], rest_to: int | None, rest_amount: int, rest_to_payer: bool)` or
`Blocked(reason, preview: dict[int, int], named_sum, total, remainder, name)`.

Order of checks (first that applies wins):

1. `unsupported != none` → `Blocked(unsupported reason)`; `payer_not_sharing` only when the rest would go to the payer and is above 0.
2. readings not usable → `unreadable_shares`.
3. a name with no candidate → `unknown_member`; several → `ambiguous_member` (named amounts and rest names alike).
4. two named amounts on one member id → `duplicate_member`.
5. no total → `no_total`.
6. named sum > total → `over_total` (figures: named sum, total).
7. remainder = total − named sum. If 0 → `Allocated(named)`.
8. rest `person` → that member; rest `none` → the payer, and with no payer → `no_rest_taker` (figure: remainder).
9. rest `equal` with names → those members; with no names → every household member without a named amount (a named 0 counts as named); empty group → `nobody_for_equal_rest`. Portions by `equal_split(remainder, group)` added to named amounts.
10. more than `MAX_PARTICIPANTS` people with a share → the route's existing `too_many_participants` error.

`preview` holds the named amounts of members that matched (for display only, never applied as a usable split).

Invariant (tested): for every `Allocated`, `sum(shares) == total` and every named amount appears unchanged inside its member's share.

## Draft (`app/schemas.py`, sent to the SPA)

`ExpenseDraft.split` is one of:

| `type` | Fields |
|---|---|
| `equal` | `member_ids: list[int]` (today) |
| `custom` | `shares: list[{member_id, amount}]` in member id order; `rest_to: int \| None`; `rest_amount: int`; `rest_to_payer: bool` |
| `blocked` | `reason: str`; `preview: list[{member_id, amount}]` |

`DraftWarning` gains optional `named_sum`, `total`, `remainder` (ints) beside `name`. A blocked draft carries a warning whose `code` equals `reason`.

Reason codes: `over_total`, `unknown_member`, `ambiguous_member`, `duplicate_member`, `no_rest_taker`, `no_total`, `nobody_for_equal_rest`, `fraction_or_percent`, `several_payers`, `paid_amount`, `payer_not_sharing`, `unreadable_shares`. The form adds `form_differs` itself (B5).

## Form state (`ExpenseForm.tsx`)

| State | New behaviour |
|---|---|
| `splitType`, `customText` | set from `custom.shares`, or from `blocked.preview` |
| `splitBlock` (new) | message for the split field; set by a blocked fill or B5; cleared only by `edited('split')` or `undoFill()` |
| `splitNote` | for custom: who takes the rest and how much |
| `splitOpen` | true after a custom or blocked fill |
| `lastFill.before` | also keeps `splitBlock`, so undo restores it |
