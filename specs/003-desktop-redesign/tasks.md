---

description: "Tasks for the desktop look: warm cream ground, verdict B, readable width"
---

# Tasks: Desktop look: warm cream ground, verdict B, readable width

**Input**: Design documents from `/specs/003-desktop-redesign/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ui-contract.md, quickstart.md

**Tests**: Included where there is structure to assert (verdict B, the share row, the a11y walk).
Colours are checked by the contrast script and by eye on screenshots; tests are written first where
they can fail.

**Organization**: One phase per user story, in priority order.

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup

- [X] T001 Confirm `feat/desktop-redesign` is cut from an up-to-date `main` and `cd frontend && npm test` is green; take "before" screenshots of the five screens at 1440 and 360 px, light and dark, for comparison

---

## Phase 2: Foundational

**Purpose**: The token for small text that US3 uses, and the contrast script every story checks against.

- [X] T002 Save the contrast script from research R1 next to the spec as `specs/003-desktop-redesign/contrast.py` with `palette.json` holding the new values of data-model.md, and run it: every pair at or above its threshold
- [X] T003 Add `--text-small: 13px` to `:root` in `frontend/src/styles/tokens.css` and replace every `font-size: 13px` in `frontend/src/index.css` with `font-size: var(--text-small)` (22 rules; the 12 px rules stay); no visible change yet

**Checkpoint**: tests still green, nothing looks different.

---

## Phase 3: User Story 1 - A warmer, calmer app in both themes (Priority: P1) 🎯 MVP

**Goal**: Cream and warm charcoal grounds, every pair measured.

**Independent Test**: The five screens in light and dark match data-model.md, and the contrast script passes.

- [X] T004 [US1] Set the light values of data-model.md in `:root` of `frontend/src/styles/tokens.css` (`--bg #f6f1e7`, `--surface #fffdf8`, `--surface-2 #f1e9db`, `--muted #5e5868`, `--line #ece4d5`, `--control-line #8a7f6e`, `--card-edge #c8b99f`) and rewrite the comments that describe the lilac ground
- [X] T005 [US1] Set the dark values in both dark blocks of `frontend/src/styles/tokens.css`, identically (`--bg #16130f`, `--surface #221e19`, `--surface-2 #2d2822`, `--ink #f6f1e7`, `--muted #bdb3a3`, `--line #37312a`, `--control-line #8f8576`, `--card-edge #544b40`, `--edge #f6f1e7`, `--toast-bg #f6f1e7`); invariant 4: every light token has its dark value in both selectors
- [X] T006 [US1] Search `frontend/src` for any colour written in place (`#` values outside `tokens.css`, `rgb(`) and move any found into a token, so FR-003 holds
- [X] T007 [US1] Update `docs/BRAND.md` §3 (Mist → Cream, with the new hex and role; note that the link preview image and the slide and report covers still show the old ground until redrawn) and `docs/DESIGN.md` §3 (token table and the "Measured contrast" paragraph recomputed from T002's output), §2 rule 1 ("sits on the lilac background" → cream)

**Checkpoint**: the app is cream in light and warm charcoal in dark; tests green.

---

## Phase 4: User Story 2 - Tổng quan answers first, then lists what to do (Priority: P2)

**Goal**: Verdict B: a small taro block, transfers in a white panel under it.

**Independent Test**: With two open transfers the taro section holds only sentence, amount and link; every control is in the panel and works.

- [X] T008 [US2] Write failing tests in `frontend/src/pages/DashboardPage.test.tsx`: the region named by the verdict sentence contains the amount and "Vì sao ra số này?" but not the list "Các lần trả gợi ý" nor "Sao chép tin nhắn nhắc nợ"; the list and the reminder button are in a separate region right after it; a settled house renders no transfer panel
- [X] T009 [US2] Split the main return of `frontend/src/components/VerdictBlock.tsx` into `section.verdict` (sentence, total, explanation fold, own pending notices, refresh-error note) and a sibling `section.transfers-panel` (transfer list, action-error note, reminder button and its copy fallback), rendered only when there are cards or a reminder; same props, handlers and order (contracts/ui-contract.md), until T008 passes and every other Dashboard test still passes
- [X] T010 [US2] Style `.transfers-panel` in `frontend/src/index.css` as a white panel with the 1 px `--card-edge` (DESIGN.md §2 rule 2), transfer cards as rows with `--line` dividers instead of white cards on taro; keep the verdict's padding and radius; the explanation card inside the taro block keeps its white card
- [X] T011 [US2] Update `docs/DESIGN.md` §6.2 (the Tổng quan sketch and the verdict bullets) to the B layout

**Checkpoint**: Tổng quan follows mockup B in both themes.

---

## Phase 5: User Story 3 - Readable at any desktop width (Priority: P3)

**Goal**: Content ≤ 1320 px, small text 14 px on a computer.

**Independent Test**: At 1920 px header and content are ≤ 1320 px and centred; at 1440 small text is 14 px, at 360 it is 13 px.

- [X] T012 [US3] In the `@media (min-width: 1024px)` block of `frontend/src/index.css`, give `.app-header` and `main` `max-width: calc(1320px + 2 * clamp(32px, 2.8vw, 40px))` and `margin-inline: auto`, and set `--text-small: 14px` on `:root` there
- [X] T013 [US3] Note the width cap and the 14 px small text in `docs/DESIGN.md` §4 (type table) and §6.6 (computer layout)

**Checkpoint**: 1920 px looks like 1440 px with wider margins.

---

## Phase 6: User Story 4 - Two details in the Chi tiêu table (Priority: P4)

**Goal**: Share amounts line up with Số tiền; the description's focus ring clears the line under it.

**Independent Test**: Open shares at 1440 and ~1100 px and compare right edges; tab to a description.

- [X] T014 [US4] Write a failing test in `frontend/src/pages/ExpensesPage.test.tsx`: an opened share row has an empty first cell, a cell spanning 3 columns holding the list, and an empty last cell
- [X] T015 [US4] Change the share row in `frontend/src/components/ExpenseTable.tsx` to `<td/>` + `<td colSpan={3}>` + `<td/>` (contracts/ui-contract.md), and in `frontend/src/index.css` let `.share-row .share-list` fill its cell (no `max-width`) and drop the `margin: -8px 0` of `.expense-table .expense-open`, until T014 passes

**Checkpoint**: both details fixed.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T016 [P] Extend `frontend/e2e/a11y.spec.ts` with the Tổng quan panel (both "Xác nhận đã nhận" buttons inside the transfers panel, ≥ 44 px) so the walk covers verdict B
- [X] T017 Run every check: `cd frontend && npm run lint && npm test && npm run build`, the contrast script, then the E2E specs on a local stack (never the live site)
- [X] T018 Walk quickstart.md steps 1–8 on a fresh `docker compose up --build` with screenshots at 1920, 1440, ~1100, 360 and 320 px, light and dark, Vietnamese and English; compare with T001's "before" screenshots

---

## Dependencies & Execution Order

- Setup → Foundational → US1 → US2, US3, US4 → Polish
- US2, US3 and US4 touch different parts and can be done in any order after US1; US2 is checked against US1's colours, so it comes after it
- T004 and T005 are the same file: one after the other

### Parallel Opportunities

- T007 (docs) alongside T006
- T011, T013 (docs) alongside the CSS tasks of their story
- T014 alongside T008 (different test files)

---

## Implementation Strategy

1. Phases 1–3: the palette alone is a shippable PR if review time is short
2. Then US2 (verdict B), US3 (width, type), US4 (table) in one PR with the palette, as approved
3. Stop before committing; show before/after screenshots

## Notes

- No behaviour, copy (apart from what the spec names), request or permission changes
- Every colour in both themes, tokens only
