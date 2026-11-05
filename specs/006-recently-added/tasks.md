# Tasks: "Mới ghi"

**Input**: Design documents from `/specs/006-recently-added/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ui-contract.md, quickstart.md

**Tests**: Included (research R8); test tasks come before the code they test.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)

## Path Conventions

SPA only: `frontend/src/`, `frontend/e2e/`; docs in `docs/`. No backend change.

---

## Phase 1: Setup

- [X] T001 Open a GitHub issue "Tổng quan does not say what housemates recorded since you last looked" linking `specs/006-recently-added/spec.md`; note its number for the PR

---

## Phase 2: Foundational (Blocking Prerequisites)

- [X] T002 [P] Write `frontend/src/lib/recent.test.ts`: `savedKey` pads the fraction to 6 digits, adds `.000000` when there is none, and keys sort correctly across "…:16Z" and "…:16.000001Z"; `recentItems` follows every rule in data-model.md (own records out; `created_by` null out; a recorder no member has now → `recorderMemberId: null`; an expense the member paid but someone else recorded is in; a repayment the member paid, recorded by the receiver, is in; merged and ordered newest first across lists with stable ties; without marks only the last 7 days by `now`; with marks, strictly later than its own list's mark, a null mark taking that whole list); `marksAfter` takes the greatest key per list including own records and never moves back; `readMarks`/`writeMarks` round-trip per user and house, a broken JSON or a throwing `localStorage` reads as `null` and writes silently
- [X] T003 Implement `frontend/src/lib/recent.ts` per contracts/ui-contract.md and research R2–R4; make T002 pass
- [X] T004 [P] Add the `recent` block to `frontend/src/i18n/vi.tsx` and `frontend/src/i18n/en.tsx` (`title` "Mới ghi" / "Recently added", `expense(name, description)` "<name> ghi <description>", `repayment(name, amount, from)` "<name> ghi đã nhận <amount> từ <from>", `more(n)` "Xem thêm <n>", `seen` "Đã xem tất cả", `seenLabel(n)` "Đã xem tất cả <n> mục mới", `at(day, time)`)

**Checkpoint**: `npm test` passes the new unit tests.

---

## Phase 3: User Story 1 - See what housemates recorded since last time (Priority: P1) 🎯 MVP

**Goal**: Tổng quan lists records other accounts saved since this member's marks, newest first.

**Independent Test**: Quickstart rows 1–5.

### Tests for User Story 1

- [X] T005 [P] [US1] Write `frontend/src/components/RecentStrip.test.tsx`: renders nothing for no items; the title, one link per item with "<Name> ghi …", the amount and the time; "bạn" for the member as payer; the removed-member name; 3 then "Xem thêm 2" (`aria-expanded`) revealing the other 2; the section is `aria-live="polite"`
- [X] T006 [P] [US1] Extend `frontend/src/pages/DashboardPage.test.tsx`: with a housemate's expense and repayment saved after the stored marks, the strip is the first section of the right column and lists both; own records and `created_by: null` records do not show; no strip while expenses are pending or have failed

### Implementation for User Story 1

- [X] T007 [US1] Create `frontend/src/components/RecentStrip.tsx` per the contract (section, h2, list of links with Avatar and text, time via `dayLabel` and HH:MM, "Xem thêm N" button)
- [X] T008 [US1] Wire it into `frontend/src/pages/DashboardPage.tsx`: read the marks with `readMarks(session.user.id, householdId)` into state, build items with `recentItems` only when members, expenses and settlements have all loaded, render `RecentStrip` as the first child of `.split-rest` with `initialCount` 3 on `useWide()` and 5 otherwise
- [X] T009 [US1] Style `.recent-strip` in `frontend/src/index.css`: `--surface`, `--card-edge`, rows ≥ 44 px, text wraps at 320 px, tokens only

**Checkpoint**: T005, T006 pass; quickstart rows 1–5.

---

## Phase 4: User Story 2 - Open a record, then mark everything as seen (Priority: P2)

**Goal**: Each item opens its record; "Đã xem tất cả" hides the strip and moves the two marks from the data on screen.

**Independent Test**: Quickstart rows 6–9.

### Tests for User Story 2

- [X] T010 [P] [US2] Extend `frontend/src/components/RecentStrip.test.tsx`: an expense item links to `/households/:id/expenses` with state `{ revealExpense: id }`; a repayment item links to `#settlement-<id>`; "Đã xem tất cả" has the accessible name with N and calls `onSeen`
- [X] T011 [P] [US2] Extend `frontend/src/pages/DashboardPage.test.tsx`: "Đã xem tất cả" hides the strip, stores both marks, and a remount (a reload) shows no strip; a newer expense after that shows only itself; an expense older than the newest repayment that arrives after "Đã xem tất cả" still shows (two marks); a throwing `localStorage` keeps the page working and the strip hidden for this visit

### Implementation for User Story 2

- [X] T012 [US2] Links in `frontend/src/components/RecentStrip.tsx` (expense: `Link` with `revealExpense`; repayment: `#settlement-<id>`) and the "Đã xem tất cả" button
- [X] T013 [US2] In `frontend/src/pages/DashboardPage.tsx`, on seen: `marksAfter` over the lists the strip was built from, set state, `writeMarks`

**Checkpoint**: T010, T011 pass; quickstart rows 6–9.

---

## Phase 5: User Story 3 - Read it in either language, on any screen (Priority: P3)

**Goal**: English, phones, both themes, the report link still in view at 1440 × 900.

**Independent Test**: Quickstart rows 10–11 and the a11y walk.

- [X] T014 [P] [US3] Extend `frontend/src/i18n/english.test.tsx` (or the strip test with `setLanguage('en')`): "Recently added", "Minh added Lẩu", "Minh recorded receiving 440,000 ₫ from you", "Mark all as seen"
- [X] T015 [P] [US3] Extend `frontend/e2e/a11y.spec.ts`: Tổng quan with a strip at 360 and 320 px: no sideways scroll, links and buttons ≥ 44 px; at 1440 × 900 the strip title and the "Báo cáo tháng" link are both in the first screen
- [X] T016 [US3] Fix what T014 and T015 find in `frontend/src/components/RecentStrip.tsx` and `frontend/src/index.css`

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T017 [P] Write `frontend/e2e/recent.spec.ts` for a local stack: Tiến owns a house, Minh joins; Minh records an expense and receives a repayment from Tiến through the API; Tiến opens Tổng quan and sees both, newest first; opens the expense (Chi tiêu reveals it); marks all as seen; reloads: no strip; Minh records another expense; Tiến reloads: only that one. Always delete the house
- [X] T018 [P] Describe the strip in `docs/DESIGN.md` §6.2 (place, what is listed and not, marks per browser, defaults) and add a README feature line
- [X] T019 Run `cd frontend && npm run lint && npm test && npm run build` and the E2E against a fresh local Compose stack (`down -v`), never the live site; `ruff check .` only if a `.py` changed
- [X] T020 Walk quickstart.md rows 1–11 on the local stack, take screenshots at 1440 and 360 px, and tick the tasks here

---

## Dependencies & Execution Order

- Setup → Foundational (T002–T004) → US1 → US2 → US3 → Polish.
- US2 and US3 build on the component and wiring from US1.
- Parallel: T002 and T004; T005 and T006; T010 and T011; T014 and T015; T017 and T018.

## Implementation Strategy

- **MVP**: T001–T009, the strip listing new records (without "Đã xem tất cả" it already informs).
- One PR, committed in story order. Minh reviews.

## Notes

- No API, schema or polling change; if one seems needed, stop and update plan.md.
- No commit until the owner approves; `.claude/` and `.specify/` are never committed.
