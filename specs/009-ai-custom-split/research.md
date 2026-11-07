# Research: AI quick add reads named amounts

No item in the Technical Context was left open; the decisions below come from the critique of 07/11
and from reading the current code.

## R1. Where the split is worked out

- **Decision**: Gemini only reports what the sentence says (named amounts, the rest instruction, an
  unsupported marker). A pure function `allocate()` in `app/services/allocation.py` computes the shares on
  the server.
- **Rationale**: a check that shares add up cannot tell that Minh's 200k became 250k while someone else
  lost 50k (critique B1). Fixed arithmetic is testable row by row, and the model can be wrong only about
  reading, which the corpus check measures separately (SC-004).
- **Alternatives**: the model returns final shares and the server checks the sum (rejected: balanced
  but wrong splits pass); the SPA computes the split (rejected: the server must not hand out a custom split
  it has not checked, constitution VII).

## R2. Shape of the new reading

- **Decision**: three fields in `DRAFT_SCHEMA`, all required so the answer is always complete:
  - `named_amounts`: array of `{name: STRING, amount: INTEGER}`, in the order written; only amounts a
    person owes (a bare "name + amount"); the speaker is written `ME`.
  - `rest`: `{kind: STRING enum ["none", "person", "equal"], names: ARRAY of STRING}`; `person` with one
    name (or `ME`), `equal` with the names after "chia đều" or none.
  - `unsupported`: STRING enum `["none", "fraction_or_percent", "several_payers", "paid_amount",
    "payer_not_sharing"]`.
- **Rationale**: Gemini's structured output supports nested objects, arrays and string enums; required
  fields stop "missing means none" guesses. The server still validates every value (R5), because a schema
  is a request to the model, not a guarantee.
- **Alternatives**: free text per person ("Minh: 200k") parsed on the server (rejected: two parsers);
  one `shares` map keyed by name (rejected: loses order and duplicates, which must be detected after
  name matching).

## R3. "Mình" / "me"

- **Decision**: the prompt asks for `ME` for the speaker in `named_amounts` and `rest.names` only. The
  route already resolves the caller's membership (`find_access`), so `load_members` also returns the
  caller's `member_id`, and `ME` maps to it. The payer is read as today; a payer `ME` is treated as no
  payer (the existing `no_payer` note), so FR-006 and FR-010 hold.
- **Rationale**: the model has never known who is typing; the server does. Keeping the payer path as
  it is avoids changing today's drafts.
- **Alternatives**: send the caller's name in the prompt (rejected: the model would then also turn
  "mình trả" into a payer, a new rule the owner did not ask for).

## R4. Which sentences take the new path

- **Decision**: the new path runs when `named_amounts` is not empty, or `rest.kind` is not `none`, or
  `unsupported` is not `none`. Otherwise `to_draft` runs today's code unchanged. "chia đều" on its own
  is today's `everyone`; the prompt says `rest` is only about "còn lại" / "the rest".
- **Rationale**: FR-010 (identical drafts) is then true by construction, and checked by a test that
  replays today's examples.

## R5. Validating the reading

- **Decision**: in `_read_draft`, each named amount must be an `int` (not `bool`) between 0 and
  `MAX_AMOUNT`, with a non-empty name; `rest.kind` and `unsupported` must be one of their values. Any
  bad entry makes the whole reading of shares unusable: the draft is `blocked` with reason
  `unreadable_shares`, never repaired by dropping the bad entry.
- **Rationale**: dropping one entry is exactly the "balanced but wrong" case (critique round 2).

## R6. Name matching for shares

- **Decision**: a new `match_candidates(name, members) -> list[int]` in `app/services/names.py` (the same
  rules as `match_member`, returning every candidate). Zero candidates → `unknown_member`; more than one →
  `ambiguous_member`; duplicates are checked on matched ids (`duplicate_member`). `match_member` stays as
  it is for the payer and participants.
- **Rationale**: the spec separates "not in the house" from "means several people"; today's function
  returns `None` for both.

## R7. The draft's split

- **Decision**: `split` becomes a union discriminated by `type`:
  `equal {member_ids}` (today) · `custom {shares, rest_to, rest_amount, rest_to_payer}` ·
  `blocked {reason, preview}`. `DraftWarning` gains optional figures (`named_sum`, `total`,
  `remainder`) next to `name`. A blocked draft carries one warning with the same code as its reason.
- **Rationale**: the SPA can tell a usable custom split from a preview without guessing (critique
  round 2: "distinguish preview amounts from a validated custom split in the draft contract").

## R8. Blocking Lưu in the form

- **Decision**: `ExpenseForm` gets a `splitBlock: string | null` state. `fill()` sets it for a blocked
  draft and for B5; `validate()` puts it on the split field before any other split check; only
  `edited('split')` (mode, a person, an amount) and `undoFill()` clear it. Editing the total or the payer
  does not. A blocked draft also switches the split to *Tự chia* with the preview amounts, so the existing
  "Chưa chia / Vượt quá" line shows what is missing or extra.
- **Rationale**: reuses the form's own error display and focus-on-first-error; no acknowledgement button
  (critique P1).

## R9. B5 inside `fill()`

- **Decision**: `fill()` already knows which fields are touched. For a `custom` draft it computes the
  amount and payer the form will hold after the fill; if the amount differs from the draft's, or
  `rest_to_payer` is true and the payer differs, or the split is touched, it does not apply the shares
  and sets the block with code `form_differs`.
- **Rationale**: only the form knows its final values (critique B5: "validate against the resulting
  form, not only the response").

## R10. Opening the fold and saying who takes the rest

- **Decision**: a custom or blocked fill sets `splitOpen` to true. A custom fill shows a note in the
  split field, "Còn lại 200.000đ tính cho Tiến (người trả)", through the existing `splitNote`, which
  already clears when the split is edited.
- **Rationale**: the split is folded by default; the user must see the allocation before Lưu (critique
  nit).

## R11. Live check

- **Decision**: a 20-sentence corpus (10 VI, 10 EN) with expected payer, total, shares or reason, in
  `quickstart.md`, run by hand against the live model after deploy (or locally with a key). Automated
  tests use the fake Gemini only.
- **Rationale**: SC-004; the free quota must not be spent by CI.
