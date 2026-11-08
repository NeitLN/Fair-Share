# Tasks: Overview and lists that read right

**Input**: Design documents from `/specs/012-overview-and-lists/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md),
[contracts/api.md](contracts/api.md), [contracts/ui-contract.md](contracts/ui-contract.md),
[quickstart.md](quickstart.md)

**Built by**: Duy Anh. **Review**: Tiến or Minh.

**Tests**: included. The project ships tests with every change (constitution III, IV), and each story's
"Independent Test" in the spec becomes one.

**Organization**: by pull request, then by user story. PR-A = US1, US2, US3; PR-E = US6, US7; PR-L = US4, US5.
PR-A and PR-E can be built in parallel; PR-L last.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: US1 … US7 from spec.md

## Before you start (every PR)

- Read the spec's user stories for that PR and the matching part of [contracts/ui-contract.md](contracts/ui-contract.md).
- Run the app locally (`docker compose up --build`) and look at the screen you are about to change at 360 px.
- Commit as yourself; never commit `.claude/`, `.specify/` or `.agents/`.

---

## PR-A: Tổng quan (US1, US2, US3)

### Phase 1: Setup (PR-A)

- [ ] T001 Open a GitHub issue "Tổng quan reads right on phones (spec 012, PR-A)" with US1–US3 acceptance scenarios as the definition of done, and create branch `feat/012-overview` from `main`
- [ ] T002 [P] Add the PR-A strings in both languages, in new keys only: `verdict.debtorSend(amount, name)` "Tôi đã chuyển {amount} cho {name}" / "I've sent {amount} to {name}", `verdict.debtorSent(amount, name)` "Đã báo chuyển {amount}, chờ {name} xác nhận." / "Told {name} you sent {amount}; waiting for them to confirm.", `verdict.debtorDeclined(name)` "{name} báo chưa nhận được." / "{name} says it hasn't arrived.", `dashboard.inviteLead` "Fair-Share có ích khi bạn cùng phòng vào nhà." / "Fair-Share is useful once your housemates join.", `dashboard.waitingToJoin(n)` "Có {n} người đang chờ duyệt" / "{n} waiting for approval", in frontend/src/i18n/vi.tsx and frontend/src/i18n/en.tsx

### Phase 2: User Story 1, the main answer reads whole on a phone (P1) 🎯 MVP

**Goal**: below 380 px the avatars sit on their own row and the amount shows in full.

**Independent Test**: at 320, 360, 375, 390 px the sentence and the avatars do not intersect; a 13-digit amount is fully visible.

- [ ] T003 [US1] Add a check to frontend/e2e/a11y.spec.ts: on a household where the signed-in person is owed by 3+ people, at viewports 320, 360, 375 and 390 px, the bounding boxes of `.verdict-sentence` and `.verdict-people` do not intersect, and `.verdict-total` is inside `.verdict` (its right edge ≤ the block's right edge)
- [ ] T004 [US1] In frontend/src/index.css add `@media (max-width: 379px)` rules: `.verdict-people { position: static; display: flex; justify-content: flex-end; margin-bottom: 8px; }`, remove the right padding the sentence keeps for the avatars, `.verdict-total { font-size: 36px; }` and let the number wrap (`overflow-wrap: anywhere`) while the currency sign stays with the last digits; leave everything from 380 px unchanged
- [ ] T005 [US1] If T004 needs the avatars before the sentence in the DOM for the static row, keep `aria-hidden` on the stack and the heading order unchanged in frontend/src/components/VerdictBlock.tsx; check the block at 1440 px still looks as on 07/11 (design C)
- [ ] T006 [US1] Run T003 locally (`E2E_BASE_URL=http://localhost:3000 npx playwright test a11y`) and attach screenshots at 320, 360 and 1440 px, plus a 999.999.999.999đ balance at 320 px, to the PR

### Phase 3: User Story 2, the debtor sees the next step first (P1)

**Goal**: one primary "Tôi đã chuyển … cho …" per transfer the signed-in person must make, right under the block; no duplicate button in the list.

**Independent Test**: as a debtor the first button under the block tells the receiver; as a creditor or settled person there is none.

- [ ] T007 [US2] Write Vitest cases in frontend/src/pages/DashboardPage.test.tsx: (a) debtor with no notice sees one primary button "Tôi đã chuyển 2.286.500đ cho Tiến" directly after the total, pressing it sends the same request as today's button (`PUT /api/households/{id}/notices`); (b) debtor whose notice is `sent` sees "Đã báo chuyển …, chờ Tiến xác nhận." and "Huỷ thông báo", no button; (c) notice `declined` shows "Tiến báo chưa nhận được." and the button again; (d) debtor owing two people sees two buttons in suggestion order; (e) creditor and settled person see none; (f) the transfer list under the block shows no "Tôi đã chuyển" button for the debtor's own rows
- [ ] T008 [US2] In frontend/src/components/VerdictBlock.tsx compute `mine` = suggested transfers whose `from_member_id === me`, and render a `DebtorAction` for each under the total and the "Vì sao ra số này?" fold: no notice → primary button (class of the app's primary buttons, full width below 720 px) calling the existing tell handler; `sent` → `verdict.debtorSent` + the existing take-back button; `declined` → `verdict.debtorDeclined` + the primary button
- [ ] T009 [US2] In the same file, stop rendering the separate `ownTold` lines (now covered by `DebtorAction`) and pass a flag to `TransferCard` so the debtor's own rows keep their text and status but render no action button; other pairs unchanged
- [ ] T010 [P] [US2] Add `.debtor-action` styles in frontend/src/index.css: 8 px gap from the fold, buttons at least 44 px tall, text readable on the purple block (white, 4.5:1)

### Phase 4: User Story 3, a new house points to the invite (P2)

**Goal**: a house with only its owner shows the invite card instead of empty money sections.

**Independent Test**: a fresh house shows the card and hides "Tháng này", balances and history; with a second member Tổng quan is unchanged.

- [ ] T011 [US3] Write Vitest cases in frontend/src/pages/DashboardPage.test.tsx: members = [owner] → `InviteCard` with the code and "Fair-Share có ích khi bạn cùng phòng vào nhà.", no "Tháng này", no per-person balances, no repayment history, "+ Ghi khoản chi" still there; with one join request waiting → "Có 1 người đang chờ duyệt" linking to `members`; members = 2 → page as today
- [ ] T012 [US3] In frontend/src/pages/DashboardPage.tsx add `const alone = members.data?.length === 1`; when `alone`, render `<InviteCard householdId={householdId} isOwner={…} />` (frontend/src/components/InviteCard.tsx, reused as is) with `dashboard.inviteLead` under "+ Ghi khoản chi", skip the month totals, balance rows and repayment history, and show `dashboard.waitingToJoin(n)` with a link to `members` when requests wait; while `members` is loading render as today
- [ ] T013 [US3] Update docs/DESIGN.md §6.2 (Tổng quan): the coloured block below 380 px, the debtor's actions, and the one-person house

**Checkpoint PR-A**: `npm run lint && npm test && npm run build`, local E2E green, screenshots in the PR. Open PR-A.

---

## PR-E: Language and copy (US6, US7)

### Phase 5: Setup (PR-E)

- [ ] T014 Open an issue "Vietnamese by default and clearer messages (spec 012, PR-E)" and create branch `feat/012-language-copy` from `main`

### Phase 6: User Story 6, Vietnamese by default (P3)

**Goal**: no saved choice → Vietnamese unless the browser's first language is English; a saved choice wins.

**Independent Test**: fresh browser `vi-VN` or no language → Vietnamese; `en-US` → English; saved choice wins.

- [ ] T015 [US6] Create frontend/src/i18n/language.test.ts with Vitest cases: no saved value + `navigator.languages = ['vi-VN']` → `vi`; `['en-US', 'vi']` → `en`; empty list and no `navigator.language` → `vi`; `localStorage` throwing → `vi`; saved `en` with a Vietnamese browser → `en`; saved `vi` with an English browser → `vi`
- [ ] T016 [US6] Change `readLanguage()` in frontend/src/i18n/language.ts: saved value first; else `'en'` if `(navigator.languages?.[0] ?? navigator.language ?? '')` starts with `en` (case-insensitive), else `'vi'`; any exception → `'vi'`
- [ ] T017 [US6] Run the whole Vitest suite and fix tests that assumed English by default by setting the language explicitly (`localStorage.setItem('fair-share:language', 'en')` in their setup), never by changing what they check
- [ ] T018 [US6] Update frontend/e2e/english.spec.ts: `test.use({ locale: 'en-US' })` for the existing "first visit is English" test, and add a test with `locale: 'vi-VN'` asserting a first visit is in Vietnamese

### Phase 7: User Story 7, words say exactly what happens (P3)

**Goal**: the messages in FR-016 to FR-021 read as in the UI contract table.

**Independent Test**: each listed message in both languages, plus an empty house name and an empty sign-up name.

- [ ] T019 [P] [US7] Add empty-field messages and use them before the length rule: `households.nameEmpty` in frontend/src/components/HouseholdCreateForm.tsx, `auth.nameEmpty` in frontend/src/pages/AuthPage.tsx, `profile.nameEmpty` in frontend/src/pages/AccountPage.tsx (only the name check; nothing else in that file); strings in frontend/src/i18n/vi.tsx and en.tsx as in contracts/ui-contract.md
- [ ] T020 [US7] In frontend/src/pages/AuthPage.tsx render a field's hint only while that field has no problem, and point `aria-describedby` at the problem when there is one (as AccountPage does)
- [ ] T021 [P] [US7] Update the recurring hint and the stop question in frontend/src/i18n/vi.tsx and en.tsx (FR-018): no "nhắc" / "remind"; "Hiện trên Tổng quan từ ngày {day} hằng tháng · không tự lưu khoản chi"
- [ ] T022 [P] [US7] Update `errors.notice_changed` and `errors.suggestion_changed` in both languages (FR-019) to the texts in contracts/ui-contract.md
- [ ] T023 [P] [US7] English only in frontend/src/i18n/en.tsx: `verdict.cancelNotice` → "Withdraw notice"; in `profile.nameHint`, `profile.renamedEverywhere`, `profile.renamedNoHouse`, `profile.statusHint` replace "household" with "group" (glossary at the top of en.tsx); search en.tsx for any other user-facing "household" and change it
- [ ] T024 [US7] Shorten `profile.genderNotice` in both languages to the texts in contracts/ui-contract.md, and change the notice version from `2026-11-v1` to `2026-11-v2` in app/schemas.py (`GENDER_NOTICE`) and frontend/src/api/households.ts (`GENDER_NOTICE`); update every test that hard-codes `2026-11-v1` (frontend/src/pages/AccountPage.test.tsx) and add a pytest case in tests/test_gender.py that `2026-11-v1` is now refused with 422
- [ ] T025 [US7] Write or update Vitest cases for T019–T023: empty house name shows "Nhập tên nhà."; empty sign-up name shows "Nhập tên của bạn." and its hint is gone while the error shows; the recurring hint text; the two conflict messages; the English "Withdraw notice" and "group" sentences
- [ ] T026 [US7] Update docs/DESIGN.md §7 and §7.1 (copy and language default) and the glossary note at the top of frontend/src/i18n/en.tsx if it mentions the default language

**Checkpoint PR-E**: `ruff check .`, pytest (T024), lint, Vitest, build, local E2E (english.spec in both locales). Open PR-E.

---

## PR-L: Lists and houses (US4, US5)

### Phase 8: Setup (PR-L)

- [ ] T027 Open an issue "House cards with balances, short lists, honest month filter (spec 012, PR-L)" and create branch `feat/012-lists-houses` from `main`

### Phase 9: User Story 4, the list of houses says what is going on (P2)

**Goal**: each house card shows the caller's balance and a waiting badge, from one request; grid on laptops.

**Independent Test**: someone in two houses sees the right balance and badge on each card; 1440 px shows a grid.

- [ ] T028 [US4] Write pytest cases in tests/test_households.py for `GET /api/households`: `my_net` equals the caller's `net` in `GET /api/households/{id}/balances` for a house with expenses and a repayment (positive, negative and 0); `waiting` counts pending join requests only for the owner, plus notices with `to_member_id` = the caller's member and `status = 'sent'` (a `declined` notice does not count); a member who is not the owner gets 0 for join requests; `pending` entries have neither field
- [ ] T029 [US4] Extend the query in `list_my_households` in app/routers/households.py with `my_net` (for `hu.member_id`: paid − owed + sent − received, the same sub-selects as app/routers/balances.py) and `waiting` (`CASE WHEN hu.role = 'owner'` count of `household_users` rows with `role = 'pending'` in that house `END` + count of `payment_notices` with `to_member_id = hu.member_id AND status = 'sent'`), computed only for owner/member rows; add `my_net: int = 0` and `waiting: int = 0` to `MyHousehold` in app/schemas.py
- [ ] T030 [P] [US4] Add `my_net?: number` and `waiting?: number` to `MyHousehold` in frontend/src/api/types.ts
- [ ] T031 [US4] Write Vitest cases in frontend/src/components/HouseholdList.test.tsx: credit card shows "Bạn được nhận 5.633.500đ", debt card "Bạn cần trả …", zero "Đã xong"; `waiting: 2` shows a badge with accessible name "2 việc đang chờ bạn"; missing fields show only the name and still link to the house
- [ ] T032 [US4] Update frontend/src/components/HouseholdList.tsx: name (wraps) + "Trưởng nhóm" chip with an 8 px gap, a second line with the balance using the app's `Money` component and colours, and a right-aligned badge when `waiting > 0`; new strings `households.youGet(amount)`, `households.youOwe(amount)`, `households.settled`, `households.waiting(n)` in vi.tsx and en.tsx
- [ ] T033 [P] [US4] In frontend/src/index.css: `.household-list` becomes `display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px` from 1024 px, one column below; card at least 44 px tall; badge as a pill (`--debt` background, white text, 4.5:1)

### Phase 10: User Story 5, short lists and honest filters (P2)

**Goal**: descriptions and meta lines clamp to two lines with "Xem đủ"; an empty month filter stays on.

**Independent Test**: a 120-character description is two lines at 360 px; a month without expenses keeps its filter and says so.

- [ ] T034 [US5] Write Vitest cases in frontend/src/components/ExpenseList.test.tsx: a long description has the full text in `title` and in the DOM; when clamped (mock `scrollHeight > clientHeight`), "Xem đủ" shows and removes the clamp for that row only; a short description shows no "Xem đủ"
- [ ] T035 [US5] Add the clamp to `.expense-description` and the meta line in frontend/src/index.css (`display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere`) and the same for the description cell of the laptop table
- [ ] T036 [US5] In frontend/src/components/ExpenseList.tsx and frontend/src/components/ExpenseTable.tsx: put the full description in `title`, measure after layout whether it is clamped, and show a "Xem đủ" / "Show all" text button (44 px target) that toggles a `.expanded` class on that row; string `expenses.showAll` in vi.tsx and en.tsx
- [ ] T037 [US5] Write Vitest cases in frontend/src/pages/ExpensesPage.test.tsx: arriving with month 2026-09 (state from the report) when no expense is in September keeps the month filter, shows "Tháng 9/2026 chưa có khoản chi nào." and "Bỏ lọc" clears it; deleting the last expense of the filtered month keeps the filter and shows the same text
- [ ] T038 [US5] In frontend/src/pages/ExpensesPage.tsx keep `chosen.month` whenever it is a valid `YYYY-MM` (drop the `months.includes` condition for the month only; keep the member rule), and in frontend/src/components/ExpenseFilters.tsx include the chosen month in the month options even without expenses and show the empty-month text `expenses.emptyMonth(month)` with "Bỏ lọc"
- [ ] T039 [US5] Update docs/DESIGN.md §6.1 (house cards) and §6.3 (clamp, empty month)

**Checkpoint PR-L**: `ruff check .`, pytest, lint, Vitest, build, local E2E. Open PR-L.

---

## Phase 11: Polish (each PR, for its part)

- [ ] T040 Accessibility pass for the changed screens: 360 px and 200% zoom with no sideways scroll, every new control ≥ 44 px, visible focus ring, new text 4.5:1 in light and dark (frontend/e2e/a11y.spec.ts stays green)
- [ ] T041 Run [quickstart.md](quickstart.md) for the PR's stories by hand and paste what you checked into the PR description, with screenshots at 360 and 1440 px
- [ ] T042 After each merge: wait for the deploy, check the live E2E run is green, and tick the PR's tasks in this file in a follow-up commit or in the next PR

---

## Dependencies & Execution Order

- PR-A (T001–T013) and PR-E (T014–T026) are independent and can be built at the same time; whichever merges second rebases (both add keys to `vi.tsx` / `en.tsx`, in different groups).
- PR-L (T027–T039) after PR-E, because PR-E changes the default language that PR-L's tests run in.
- Within a story: the test task first (it fails), then the code, then the docs.
- T024 changes a constant shared by frontend and backend: change both in the same commit.
- Do not edit `ExpenseForm.tsx`, `AiComposer.tsx`, `RecurringList.tsx`, `api/client.ts` (spec 011, Tiến).

## Parallel Opportunities

- PR-A: T002 and T010 alongside the US1 work; T007 and T011 are in the same test file, write them one after the other.
- PR-E: T019, T021, T022, T023 touch different keys and can be done in any order.
- PR-L: T030 and T033 alongside T029; US4 and US5 touch different files.

### Parallel Example: PR-E

```text
Task: "Empty-field messages in HouseholdCreateForm, AuthPage, AccountPage"     (T019)
Task: "Recurring hint and stop question wording"                                (T021)
Task: "Conflict messages notice_changed / suggestion_changed"                   (T022)
Task: "English: Withdraw notice, household → group"                             (T023)
```

## Implementation Strategy

### MVP first (PR-A, User Stories 1 and 2)

1. T001–T006: the coloured block reads whole on phones (the most visible fix).
2. T007–T010: the debtor's primary button.
3. T011–T013: the one-person house.
4. Open PR-A, review, merge, check live.

### Then

PR-E (language and copy) in parallel or right after; PR-L last. Each PR leaves the app working on its own.
