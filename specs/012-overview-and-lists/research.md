# Research: Overview and lists that read right

Decisions behind [plan.md](plan.md), checked against `main` at `e1ebaa1`.

## R1. The avatars in the coloured block (FR-001, FR-002)

- **Fact**: `VerdictBlock.tsx` renders `.avatar-stack.verdict-people` before the sentence; CSS pins it with
  `position: absolute; top: 16px; right: 16px` (`index.css`, `.verdict-people`), and the sentence only reserves room
  for it with padding. At 360 px, 3 large avatars + "+n" are about 140 px wide, so a long sentence runs under them.
  `.verdict-total` is 44 px at every width; DESIGN.md §5 asks for 36 px below 380 px.
- **Decision**: below 380 px (`@media (max-width: 379px)`), `.verdict-people` becomes a normal row
  (`position: static`, `justify-content: flex-end`, `margin-bottom: 8px`) above the sentence, and the sentence drops
  its right padding; `.verdict-total` goes to 36 px and may wrap (`overflow-wrap: anywhere` on the number, the
  currency sign stays with the last digits). From 380 px nothing changes.
- **Alternatives**: shrinking the avatars (still overlaps with 4 people and long names); hiding them on phones (loses
  the "who" at a glance that design C added on 07/11).

## R2. The debtor's primary button (FR-003 to FR-006)

- **Fact**: the transfer list lives inside `VerdictBlock` (the panel under the block). Each row is a `TransferCard`;
  the sender's own row renders the "Tôi đã chuyển" button (`btn-secondary`) through the `onlyReceiver` branch, and
  `ownTold` already lists the sender's sent notices under the block (`.verdict-pending`).
- **Decision**: compute `mine = suggested.filter(t => t.from_member_id === me)` once. Under the sentence and total,
  render one `DebtorAction` per entry of `mine`: no notice → primary button "Tôi đã chuyển {amount} cho {name}"
  (same handler as today, `onTell`); notice `sent` → the existing pending line plus "Rút thông báo"; notice
  `declined` → "Tiến báo chưa nhận được" plus the primary button again. The list rows for `mine` keep their text and
  status but no longer render the button (`showAction={false}`). `ownTold` lines are replaced by `DebtorAction`, so
  nothing shows twice.
- **Alternatives**: a floating action button (hides content on small phones); keeping the list button and adding a
  second one (two buttons for one action).

## R3. A house with one person (FR-007, FR-008)

- **Fact**: `DashboardPage` already loads `members`; the invite code and its sharing live in `MembersPage`
  (`InviteCard`, `GET /api/households/{id}/invite`).
- **Decision**: `const alone = members.data?.length === 1`. When `alone`, render `<InviteCard>` (reused as is) under
  "+ Ghi khoản chi" with a one-line lead "Fair-Share có ích khi bạn cùng phòng vào nhà", and skip the month totals,
  the balance rows and the repayment history. If requests are waiting (the layout already polls them), add "Có {n}
  người đang chờ duyệt" linking to Thành viên. While `members` loads, render as today (no flash of the card for
  bigger houses).
- **Alternatives**: a separate onboarding page (one more route; the card is enough).

## R4. Figures on Nhà của bạn (FR-009 to FR-011)

- **Fact**: `GET /api/households` (`list_my_households` in `app/routers/households.py`) returns rows from
  `household_users hu JOIN households h`. Balances are computed per member in `app/routers/balances.py` with
  sub-selects over `expenses`, `expense_shares` and `settlements`. Pending join requests are `household_users` rows
  with `role = 'pending'`; notices are `payment_notices` with `status = 'sent'`.
- **Decision**: extend the same query with, for the caller's own member (`hu.member_id`):
  `my_net = paid − owed + sent − received` (same sub-selects as balances, restricted to that member id) and
  `waiting = (CASE WHEN hu.role = 'owner' THEN count of pending rows ELSE 0 END) + count of payment_notices WHERE
  to_member_id = hu.member_id AND status = 'sent'`. Pending rows (the caller still waiting) keep no figures. One
  query, no request per house (SC-004). `MyHousehold` gains `my_net: int` and `waiting: int`.
- **Alternatives**: computing on the client from each house's balances (one request per house, FR-011 forbids);
  a new endpoint (the list already exists and is cached under `['households']`).

## R5. Long descriptions (FR-013)

- **Fact**: `ExpenseList.tsx` renders `.expense-description` inside each row; `ExpenseTable.tsx` renders the
  description cell on laptops. Rows already open details/edit on tap.
- **Decision**: CSS `display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
  overflow-wrap: anywhere` on `.expense-description` and on the meta line (`.expense-meta`); the full text goes in
  `title` and stays in the DOM (screen readers read it whole). A row that is clamped gets a "Xem đủ" toggle
  (button, 44 px) that removes the clamp for that row; detecting clamping uses `scrollHeight > clientHeight` after
  layout.
- **Alternatives**: truncating the string in JS (screen readers lose the end; breaks search in page).

## R6. Month filter with no expenses (FR-014)

- **Fact**: `ExpensesPage.tsx` keeps `chosen.month` only if `months.includes(chosen.month)` (comment: "A month whose
  last expense was deleted … no longer filters anything").
- **Decision**: keep `chosen.month` whenever it is a valid `YYYY-MM` within the app's date range; `filterExpenses`
  then returns `[]` and `ExpenseFilters` shows "Tháng {m}/{yyyy} chưa có khoản chi nào" with "Bỏ lọc". The month
  dropdown includes the chosen month even when it has no expenses, so the control shows what is filtered. The member
  filter keeps today's rule (a member who left no longer filters).
- **Alternatives**: redirecting to the nearest month (what the report does today; L12 calls it confusing).

## R7. Default language (FR-015)

- **Fact**: `frontend/src/i18n/language.ts` `readLanguage()` returns the saved value or `'en'`. `e2e/english.spec.ts`
  asserts "a first visit is in English"; several Vitest files set the language explicitly.
- **Decision**: `readLanguage()` returns the saved value; otherwise `'en'` when
  `navigator.languages?.[0] ?? navigator.language` starts with `en`, else `'vi'`; any exception → `'vi'`. Update
  `english.spec.ts` to set an English browser locale (`test.use({ locale: 'en-US' })`) and assert the first visit is
  English there, and add a case with `locale: 'vi-VN'` opening in Vietnamese. Run the whole Vitest suite: tests that
  relied on English by default set it explicitly.
- **Alternatives**: always Vietnamese (an English-speaking classmate or lecturer would have to switch).

## R8. Copy pass (FR-016 to FR-021)

- **Facts and decisions** (keys in `frontend/src/i18n/vi.tsx` and `en.tsx`):
  - Empty fields: house name (`households.nameProblem`), sign-up name (`auth.nameProblem`), profile name
    (`profile.nameProblem`) get an "empty" message next to the existing length rule; the form checks emptiness first.
  - Sign-up hint vs error: `AuthPage.tsx` renders `aria-describedby` with the hint; when the field has a problem, the
    hint element is not rendered (as `AccountPage` already does).
  - Recurring: `recurring.hint` and the stop confirmation lose "nhắc" (FR-018).
  - Conflicts: `errors.notice_changed`, `errors.suggestion_changed`: "Số liệu vừa đổi, đang tải lại. Bạn xem lại khi
    số mới hiện ra nhé." (and English).
  - English: replace the "household" sentences in `profile.*` with "group"; `verdict.cancelNotice` "Take back" →
    "Withdraw notice"; the Vietnamese "Huỷ thông báo" stays.
  - Gender notice: shorter text in both languages keeping the five points; bump the notice version from
    `2026-11-v1` to `2026-11-v2` in `app/schemas.py` (`GENDER_NOTICE`) and `frontend/src/api/households.ts`; the
    tests that hard-code `2026-11-v1` (`frontend/src/pages/AccountPage.test.tsx`) change with it. Existing stored
    rows keep `v1` as their record; they stay valid (FR-029 of spec 010 records which notice was shown).

## R9. Boundaries with spec 011

Files this spec changes: `VerdictBlock.tsx`, `DashboardPage.tsx`, `HouseholdList.tsx`, `HouseholdsPage.tsx`,
`ExpensesPage.tsx` (filter only), `ExpenseFilters.tsx`, `ExpenseList.tsx`, `ExpenseTable.tsx`, `AuthPage.tsx`,
`i18n/language.ts`, `i18n/vi.tsx`, `i18n/en.tsx`, `index.css`, `app/routers/households.py`, `app/schemas.py`.
Spec 011 changes `ExpenseForm.tsx`, `AiComposer.tsx`, `RecurringList.tsx`, `api/client.ts`, `app/routers/system.py`
and `ExpensesPage.tsx` only where it passes the stop error to `RecurringList`: if both touch `ExpensesPage.tsx`, the
second PR rebases (different lines).
