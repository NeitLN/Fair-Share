# Tasks: AI quick add reads named amounts

**Input**: Design documents from `/specs/009-ai-custom-split/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api.md, contracts/ui-contract.md, quickstart.md

**Tests**: requested by the spec (SC-001 to SC-003): every allocation row, every blocked case, the form block and today's drafts unchanged. Tests are written before the code they cover.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: US1 named amounts and the rest to the payer · US2 amounts that cannot be placed · US3 "còn lại chia đều"

## Path Conventions

API in `app/`, tests in `tests/`, SPA in `frontend/src/`, docs in `docs/`.

---

## Phase 1: Setup

- [X] T001 Confirm the branch `feat/ai-custom-split` is cut from current `main` and that `pytest -q tests/test_ai.py tests/test_gemini.py` and `cd frontend && npm test` pass before any change (baseline)

---

## Phase 2: Foundational (blocking prerequisites)

**Purpose**: the reading, the draft contract and the caller's member id, shared by all three stories.

- [X] T002 [P] Write failing tests in `tests/test_gemini.py`: `DRAFT_SCHEMA` has required `named_amounts` (array of `{name: STRING, amount: INTEGER}`), `rest` (`{kind: STRING enum ["none","person","equal"], names: ARRAY of STRING}`) and `unsupported` (STRING enum `["none","fraction_or_percent","several_payers","paid_amount","payer_not_sharing"]`); `_read_draft` returns them; a named amount that is a `bool`, a string, a float, negative, above `MAX_AMOUNT`, or has an empty name makes `shares_readable` False and is never dropped silently; an unknown `rest.kind` or `unsupported` value also makes `shares_readable` False; an old-style answer without the new keys reads as empty / `none` / readable (FR-010)
- [X] T003 Extend the reading in `app/services/gemini.py`: add the three fields to `DRAFT_SCHEMA` (required), add `named_amounts: list[NamedAmount]`, `rest: Rest`, `unsupported: str`, `shares_readable: bool` to the `ExpenseDraft` dataclass, validate them in `_read_draft` per research R5 ("NamedAmount: name 1–60 characters after trim, or ME; amount int, not bool, 0 ≤ amount ≤ MAX_AMOUNT"), and add the prompt rules: bare "name + amount" is what that person owes; amounts tied to paying, putting in or paying back are not named amounts (`paid_amount`, or `several_payers` when more than one person paid); the speaker ("mình", "tôi", "me", "I") is written `ME` in `named_amounts` and `rest.names` only; `rest` is only about "còn lại" / "the rest" ("chia đều" alone stays `everyone`); fractions and percentages give `fraction_or_percent`; a payer who says they do not share gives `payer_not_sharing`
- [X] T004 [P] Add `match_candidates(name, members) -> list[int]` to `app/services/names.py` (same exact-then-by-word rules as `match_member`, returning every candidate) with tests in `tests/test_ai_helpers.py`
- [X] T005 [P] Change the draft contract in `app/schemas.py` per contracts/api.md: `DraftShare {member_id, amount}`; `DraftSplit` as a union discriminated by `type`: `EqualDraftSplit {type: "equal", member_ids}`, `CustomDraftSplit {type: "custom", shares, rest_to: int | None, rest_amount: int, rest_to_payer: bool}`, `BlockedDraftSplit {type: "blocked", reason: str, preview: list[DraftShare]}`; `DraftWarning` gains optional `named_sum`, `total`, `remainder` (int | None)
- [X] T006 [P] Mirror the contract in `frontend/src/api/types.ts`: `ExpenseDraft.split` union of the three kinds, `DraftShare`, and the optional figures on `DraftWarning`; fix the type errors this causes in `frontend/src/lib/draftSummary.ts`, `frontend/src/components/AiComposer.tsx` and `frontend/src/pages/ExpensesPage.tsx` without changing behaviour for `equal`
- [X] T007 Make `load_members` in `app/routers/ai.py` also return the caller's member id from `find_access` (research R3), and pass it to `to_draft`; `tests/test_ai.py` keeps passing

**Checkpoint**: the new reading is parsed and validated, the contract compiles on both sides, and every existing test is green.

---

## Phase 3: User Story 1 - Named amounts, the rest to the payer (Priority: P1) 🎯 MVP

**Goal**: "lẩu 500k Tiến trả, Minh 200k, Lan 100k" fills *Tự chia* with Minh 200k, Lan 100k, Tiến 200k, the fold open and "Còn lại 200.000đ tính cho Tiến (người trả)".

**Independent Test**: every row of the spec's allocation table with a fake Gemini, then the form shows the shares; today's equal-split examples give the same drafts.

### Tests for User Story 1

- [X] T008 [P] [US1] Write `tests/test_allocation.py` with the six rows of the spec's allocation table (house Tiến 1, Minh 2, Lan 3, Duy Anh 4), exact-total case (only named members, `rest_to` None, `rest_amount` 0), the payer named with an amount plus the rest, `ME` resolved to the caller, and the invariant "sum(shares) == total and every named amount appears unchanged inside its member's share" over all of them
- [X] T009 [P] [US1] Add to `tests/test_ai.py` (real database, `FakeGemini`): row 1 gives a `custom` draft exactly as in contracts/api.md; row 6 ("còn lại mình") gives `payer_id` null, the `no_payer` warning and the caller as `rest_to`; a reading with no named amounts, `rest.kind` "none" and `unsupported` "none" gives a draft byte-identical to today's for every sentence already in the file (FR-010)
- [X] T010 [P] [US1] Add to `frontend/src/components/ExpenseForm.test.tsx`: `fill()` with a `custom` split on an untouched form sets *Tự chia* with the shares, opens the fold, shows the rest note and lets Lưu send the custom shares; with the total or payer touched to a different value (B5) or the split touched, the shares are not applied and Lưu is refused with the `form_differs` message; `undoFill()` right after restores mode, people and amounts; a later edit to a share keeps the user's value on undo
- [X] T011 [P] [US1] Add to `frontend/src/lib/draftSummary.test.ts` ("tự chia 3 người" for a custom split) and `frontend/src/components/AiComposer.test.tsx` (the summary describes the custom split only when it was applied)

### Implementation for User Story 1

- [X] T012 [US1] Create `app/services/allocation.py` (pure, no FastAPI): `allocate(total, payer_id, named, rest, unsupported, household, me) -> Allocated | Blocked` following data-model.md "Order of checks", steps 7–8 for this story (remainder 0 → named only; rest `person` → that member; rest `none` → payer); `final[member] = named[member] (0 if none) + its part of the rest`; never scale, drop or change a named amount
- [X] T013 [US1] Use it in `to_draft` in `app/routers/ai.py`: take the new path only when `named_amounts` is not empty, `rest.kind` != "none" or `unsupported` != "none" (research R4); match names with `match_candidates`, `ME` → caller; a payer read as `ME` is treated as no payer; build `CustomDraftSplit` with shares in member id order, `rest_to`, `rest_amount`, `rest_to_payer`; keep `too_many_participants` for more than `MAX_PARTICIPANTS` shares; otherwise run today's code unchanged
- [X] T014 [US1] Extend `ExpenseForm.fill()` in `frontend/src/components/ExpenseForm.tsx` per contracts/ui-contract.md: `FormFill.split`; for `custom`, compute the amount and payer the form will hold after the fill and apply the shares only when they equal the draft's (payer only when `rest_to_payer`) and the split is untouched (research R9); set `splitType` "custom", `customText` from the shares, `splitOpen` true and `splitNote` from `form.restTo` / `form.restToPayer`; otherwise set the `form_differs` block (see T020)
- [X] T015 [US1] Pass the split through in `frontend/src/pages/ExpensesPage.tsx` (`onDraft` → `fill({..., split: draft.split})`, `member_ids` only for `equal`), and describe a custom split in `frontend/src/lib/draftSummary.ts` and `frontend/src/components/AiComposer.tsx`
- [X] T016 [P] [US1] Add `ai.splitCustom`, `form.restTo`, `form.restToPayer` and `ai.formDiffers` to `frontend/src/i18n/vi.tsx` and `frontend/src/i18n/en.tsx` with the wording in contracts/ui-contract.md (money via `formatVND`)

**Checkpoint**: US1 works end to end with a fake Gemini; FR-010 regression green.

---

## Phase 4: User Story 2 - Amounts that cannot be placed safely (Priority: P1)

**Goal**: an instruction that cannot be placed safely shows the amounts as read, says why, and blocks Lưu until the split is edited by hand.

**Independent Test**: every blocked case gives a `blocked` draft with its reason and figures; the form refuses Lưu even when the preview happens to add up, and only a split edit lifts it.

### Tests for User Story 2

- [X] T017 [P] [US2] Add to `tests/test_allocation.py` one test per reason code: `over_total` (named 600k > 500k, figures named_sum and total), `unknown_member` ("500k Tiến trả, Minh 500k, Hùng 100k" stays blocked though Minh 500k adds up), `ambiguous_member`, `duplicate_member` ("Tiến 100k, Tien 50k"; a payer or rest taker who also has a named amount is not a duplicate), `no_rest_taker` (no payer, rest above 0, figure remainder), `no_total`, `fraction_or_percent`, `several_payers`, `paid_amount`, `payer_not_sharing` (only when the rest goes to the payer and is above 0), `unreadable_shares`; each `preview` holds only the named amounts of matched members
- [X] T018 [P] [US2] Add to `tests/test_ai.py`: an over-total reading returns `type: "blocked"`, `reason: "over_total"`, the preview, and exactly one warning with that code and the figures (contracts/api.md)
- [X] T019 [P] [US2] Add to `frontend/src/components/ExpenseForm.test.tsx`: a `blocked` fill switches to *Tự chia* with the preview, opens the fold, shows the reason message, and Lưu is refused; editing the total so the preview adds up, or changing the payer, keeps it refused; changing a share, a person or the split mode lifts the block and Lưu saves; `undoFill()` restores the split and removes the block; and add to `frontend/src/lib/aiWarnings.test.ts` one case per new code with its figures in money format

### Implementation for User Story 2

- [X] T020 [US2] Add the blocked checks to `allocate()` in `app/services/allocation.py` in the order of data-model.md steps 1–6 and 8 (`no_rest_taker`), with `preview` and figures, and return `BlockedDraftSplit` plus one `DraftWarning` (code = reason, figures) from `to_draft` in `app/routers/ai.py`; the description, amount, payer and date of the draft are filled as today
- [X] T021 [US2] Add the `splitBlock` state to `frontend/src/components/ExpenseForm.tsx` (research R8): set by a `blocked` fill (message from `warningMessage` of the matching warning, passed in `FormFill`) and by the `form_differs` case of T014; `validate()` reports it on the split field before the other split checks; only `edited('split')` and `undoFill()` clear it; saved in `lastFill.before`
- [X] T022 [US2] Map the new codes in `frontend/src/lib/aiWarnings.ts` and add their strings to `frontend/src/i18n/vi.tsx` and `frontend/src/i18n/en.tsx` (`ai.overTotal`, `ai.ambiguousMember`, `ai.duplicateMember`, `ai.noRestTaker`, `ai.noTotal`, `ai.fractionOrPercent`, `ai.severalPayers`, `ai.paidAmount`, `ai.payerNotSharing`, `ai.unreadableShares`) as in contracts/ui-contract.md; in `frontend/src/components/AiComposer.tsx` show the block reason once (not both under the composer and under the split if that repeats the same text)

**Checkpoint**: no blocked case can be saved without a split edit; US1 still green.

---

## Phase 5: User Story 3 - "Còn lại chia đều" (Priority: P2)

**Goal**: "điện 900k Minh trả, Lan 400k, còn lại chia đều" gives Lan 400k and 500k split equally between the three without a named amount.

**Independent Test**: shares and leftover đồng for the US3 cases with a fake Gemini; they add up to the total.

### Tests for User Story 3

- [X] T023 [P] [US3] Add to `tests/test_allocation.py`: implicit group (members with an account and no named amount; a named 0 counts as named; the payer only if not named) with 500k over three ids giving 166 667 / 166 667 / 166 666 to the two lowest ids first; explicit "cho Tiến và Duy Anh" (portion added to a named amount if any; valid even if both already have named amounts); remainder 0 keeps the named allocation; implicit group empty with remainder above 0 → `nobody_for_equal_rest` (figure remainder); an unknown or ambiguous name after "chia đều" blocks and never shrinks the group

### Implementation for User Story 3

- [X] T024 [US3] Add step 9 of data-model.md to `allocate()` in `app/services/allocation.py`, reusing `equal_split()` from `app/services/splitting.py`; add `ai.nobodyForEqualRest` to `frontend/src/lib/aiWarnings.ts`, `frontend/src/i18n/vi.tsx` and `frontend/src/i18n/en.tsx`

**Checkpoint**: all three stories green.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T025 [P] Update `docs/ARCHITECTURE.md` §6 (the reading's new fields, the allocation rule, the `split` union and the new warning codes) and `docs/DESIGN.md` §6.3 (a quick add custom fill opens *Cách chia* with the rest line; a blocked split keeps Lưu refused until the split is edited)
- [X] T026 Run `ruff check .` from the repo root, `pytest -q`, and `cd frontend && npm run lint && npm test && npm run build`; run the local E2E suite against the local stack (`E2E_BASE_URL`/`E2E_API_URL` = http://172.21.33.10:3000) to confirm nothing else moved
- [X] T027 Check the strings in the browser at 360 px and 1440 px in both themes (a long block message under *Cách chia* wraps, no horizontal scroll, contrast as the rest of the form) with a stubbed draft
- [X] T028 Check the diff for statements about how the work was produced (the product's own quick add feature aside) and that only the files of this feature are staged
- [ ] T029 After the owner approves: open an issue for the feature, commit as Võ Việt Tiến, push as NeitLN, open the PR with Minh and Duy Anh as reviewers; after merge and deploy, run the live corpus in `quickstart.md` (SC-004) and report the score

---

## Dependencies & Execution Order

### Phase Dependencies

- Phase 1 → Phase 2 → Phase 3 (US1) → Phase 4 (US2) → Phase 5 (US3) → Phase 6.
- US2 builds on the allocation module and the form fill of US1 (T012, T014); US3 builds on the allocation module only.

### User Story Dependencies

- **US1**: after Phase 2.
- **US2**: after T012 and T014 (adds checks to the same function and the block to the same form).
- **US3**: after T012; independent of US2 on the server, shares the warning list with it.

### Within Each User Story

- Tests first and failing, then the server, then the form, then the strings.

### Parallel Opportunities

- Phase 2: T002, T004, T005, T006 touch different files.
- US1: T008–T011 in parallel; T016 alongside T012–T015.
- US2: T017–T019 in parallel.

## Parallel Example: User Story 1

```text
T008 tests/test_allocation.py      T009 tests/test_ai.py
T010 ExpenseForm.test.tsx          T011 draftSummary.test.ts + AiComposer.test.tsx
```

## Implementation Strategy

### MVP First (User Story 1 Only)

US1 alone fixes the owner's main sentence. It is not shipped alone: US2 is also P1, because without it an unplaceable instruction would leave a saveable split, which the spec forbids.

### Incremental Delivery

One PR with US1 + US2 + US3 (small diff, deadline 08/11); if time runs short, US3 can be cut and its sentences treated as `unreadable_shares` (blocked), never as a payer allocation.

### Parallel Team Strategy

Single implementer; Minh and Duy Anh review the PR.

## Notes

- Only the files of this feature are committed.
- No commit before the owner approves (T029).
