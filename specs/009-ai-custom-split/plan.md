# Implementation Plan: AI quick add reads named amounts

**Branch**: `feat/ai-custom-split` | **Date**: 2026-11-07 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/009-ai-custom-split/spec.md`

## Summary

Gemini's structured answer gains three fields: `named_amounts` (name as written or `ME`, amount, in
order), `rest` (`none` · `person` · `equal`, with names) and `unsupported` (why a sentence's way of sharing
cannot be read). A new pure module `app/services/allocation.py` turns those readings, matched to member
ids, into either final shares or a blocked result with a reason, its figures and the amounts as read
(preview). `to_draft` uses it whenever the reading has named amounts, a rest instruction or an
unsupported marker; otherwise the draft is built exactly as today. The draft's `split` becomes one of
three kinds: `equal` (today), `custom` (shares that add up, who takes the rest), `blocked` (reason and
preview). The SPA's `ExpenseForm.fill()` learns to apply a custom split, to open the *Cách chia* fold,
and to hold a split block that keeps Lưu refused until the split itself is edited; B5 (form total or
payer differ from the draft) is checked inside `fill()`, against the values the form ends up with. No
database change.

## Technical Context

**Language/Version**: Python 3.12 (FastAPI, Pydantic v2); TypeScript 5, React 19

**Primary Dependencies**: none new

**Storage**: none (no migration; custom splits are already stored by the expense API)

**Testing**: pytest: `tests/test_allocation.py` (pure: every row of the spec's table, every blocked
case of US2, US3 with leftover đồng, strict types), `tests/test_gemini.py` (new schema fields read,
malformed readings dropped, prompt carries the new rules), `tests/test_ai.py` (real database, fake
Gemini: end-to-end drafts for a few rows, `ME` resolved to the caller's member, today's examples give
byte-identical drafts). Vitest: `ExpenseForm.test.tsx` (custom fill, preview + block, block survives
total/payer edits and lifts on a split edit, B5, undo), `draftSummary.test.ts`, `aiWarnings.test.ts`,
`AiComposer.test.tsx`, `ExpensesPage.test.tsx` (wiring). No new E2E (the local stack has no Gemini key);
the live check is the corpus in `quickstart.md` (SC-004).

**Target Platform**: Render (API, static SPA); desktop first, phones must not break

**Project Type**: web application (API + SPA)

**Performance Goals**: none beyond today; still one Gemini call per press (FR-014)

**Constraints**: constitution I (whole đồng, shares add up, equal-split rule for "chia đều"); VII (model
output is untrusted, nothing saved, same limits); FR-010 (no change for sentences without named amounts);
the 08/11 report deadline (small diff, no new endpoint)

**Scale/Scope**: 1 new pure module, changes to `gemini.py`, `ai.py`, `schemas.py`; `ExpenseForm.tsx`,
`ExpensesPage.tsx`, `AiComposer.tsx`, `draftSummary.ts`, `aiWarnings.ts`, `types.ts`; ~14 strings per
language; ARCHITECTURE §6, DESIGN §6.3

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | How this feature meets it | Status |
|---|---|---|
| I. Money in whole đồng | Shares are ints worked out by `allocation.py`; named amounts are never changed; the rest is `total − named sum`; "chia đều" reuses `equal_split()`; a custom draft is only produced when its shares add up exactly | Pass |
| II. Access by the server | Same route, same `find_access`; the caller's member id comes from that check, not from the client or the model | Pass |
| III. Migrations, real PostgreSQL | No schema change; `test_ai.py` keeps running on PostgreSQL | Pass |
| IV. Reviewed PR, four checks | One issue, one PR; ARCHITECTURE §6 updated in it | Pass |
| V. No secret | Nothing secret; the key stays in a header | Pass |
| VI. Vietnamese housemates | Every note in both languages, tokens only, existing fold and 44 px controls | Pass |
| VII. Quick add | Still a pre-filled form; the model's new fields are schema-checked and matched to real members; failures keep the manual form; same per-IP limit, budget, timeout, single retry | Pass |

*Re-check after Phase 1*: the draft contract grows (a `split.type` union and optional warning figures)
but stays a draft; old `equal` drafts are unchanged. Still Pass.

## Project Structure

### Documentation (this feature)

```text
specs/009-ai-custom-split/
├── spec.md · plan.md · research.md · data-model.md · quickstart.md
├── contracts/api.md · contracts/ui-contract.md
├── checklists/requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
app/services/gemini.py            # DRAFT_SCHEMA + PROMPT rules; ExpenseDraft reading gains named_amounts, rest, unsupported
app/services/allocation.py        # NEW, pure: allocate(...) -> Allocated | Blocked
app/routers/ai.py                 # load_members also returns the caller's member id; to_draft uses allocate()
app/schemas.py                    # DraftSplit union (equal | custom | blocked), DraftShare, DraftWarning figures
tests/test_allocation.py          # NEW
tests/test_gemini.py, tests/test_ai.py
frontend/src/api/types.ts                         # ExpenseDraft.split union, DraftWarning figures
frontend/src/components/ExpenseForm.tsx (+ test)  # fill(): shares, block, B5, open fold; validate(): block
frontend/src/pages/ExpensesPage.tsx (+ test)      # onDraft passes the split kind through
frontend/src/components/AiComposer.tsx (+ test)   # summary of what was applied for the new kinds
frontend/src/lib/draftSummary.ts (+ test)         # "tự chia 3 người"
frontend/src/lib/aiWarnings.ts (+ test)           # new codes, figures in money format
frontend/src/i18n/vi.tsx, en.tsx
docs/ARCHITECTURE.md §6, docs/DESIGN.md §6.3
```

**Structure Decision**: existing API + SPA layout; one new pure service module, no new route.

## Complexity Tracking

No violations to justify.
