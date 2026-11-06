# Tasks: Recurring expenses

**Input**: Design documents from `/specs/007-recurring-expenses/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api.md, contracts/ui-contract.md, quickstart.md

**Tests**: Included (constitution I and III; spec SC-003, SC-005); test tasks come before the code they test.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 make recur, US2 record when due, US3 consistency on edits, US4 see and stop

---

## Phase 1: Setup

- [X] T001 Open a GitHub issue "Fixed bills (rent, internet) have to be typed again every month" linking `specs/007-recurring-expenses/spec.md`; note its number

---

## Phase 2: Foundational (Blocking Prerequisites)

- [X] T002 Write `tests/test_recurring.py` (real PostgreSQL, `pytestmark = [pytest.mark.db, pytest.mark.usefixtures("cleanup")]`, the house fixture style of `tests/test_expenses.py`) for every rule in data-model.md: (1) `POST` with `recurring` → 201, `recurring_item_id` set, `GET /households/{id}/recurring` lists the item with description, category, payer, member ids, amount, `day == spent_at.day`; varying → `amount: null`; custom split → 422 `recurring_needs_equal_split` and nothing saved (no expense, no item); both fields → 422; 21st active item → 409 `too_many_recurring`, a stopped one does not count; (2) `POST` with `recurring_item_id` → 201 linked; same item and month again → 409 `recurring_month_taken` with `details.expense_id`, one expense; another month → 201; item of another house → 404 `recurring_not_found`; stopped → 409 `recurring_stopped`; (3) `PUT` moving the date into a recorded month → 409 and the stored expense unchanged; into a free month → 200, link kept; `PUT` with a different `recurring_item_id` or none keeps the link; (4) delete frees the month; (5) stop: owner and creator → 204 (twice → 204), another member → 403 `forbidden`, stranger → 404, the stopped item leaves the list and its expenses keep `recurring_item_id`; (6) deleting the house succeeds with items and linked expenses; (7) balances identical with and without the link for the same expenses; (8) the index itself: two connections insert two expenses for one item in one month, the second raises `UniqueViolation`
- [X] T003 Create `db/migrations/006_recurring_expenses.sql` per data-model.md (table, FKs, checks, `expenses.recurring_item_id` FK `ON DELETE SET NULL`, the partial unique expression index exactly as research R1, RLS enabled), header comment in the style of 004/005
- [X] T004 Add to `app/schemas.py`: `RecurringIn(varying_amount: bool = False)`, `ExpenseIn.recurring: RecurringIn | None = None`, `ExpenseIn.recurring_item_id: Id | None = None` with a model validator refusing both; `Expense.recurring_item_id: int | None = None`; `RecurringItem` response model
- [X] T005 In `app/routers/expenses.py`: select `e.recurring_item_id`; on `POST` handle `recurring` (equal split check, `SELECT … FROM households WHERE id = %s FOR UPDATE`, count active, insert the item, link) and `recurring_item_id` (`FOR SHARE`, same house, active); map `errors.UniqueViolation` on `expenses_recurring_month_uidx` (check `e.diag.constraint_name`) to `ApiError(409, "recurring_month_taken", …, details={"expense_id": …})` looked up after the failed statement on a savepoint, for `POST` and `PUT`; `PUT` never writes `recurring_item_id`
- [X] T006 Create `app/routers/recurring.py` (`GET /households/{id}/recurring`, `POST /recurring/{id}/stop` with `FOR UPDATE` and `require_owner_or_author`), resolve `/recurring/{id}` in `app/access.py` like `/expenses/{id}`, include it in `app/main.py`; (no change to house deletion: items cascade with the house and have no FK to members); make T002 pass; `ruff check .`
- [X] T007 [P] Add `RecurringItem`, `Expense.recurring_item_id`, `ExpenseInput.recurring?` and `recurring_item_id?` to `frontend/src/api/types.ts`; create `frontend/src/api/recurring.ts` (`listRecurring`, `stopRecurring`, query key `['household', id, 'recurring']`)
- [X] T008 [P] Write `frontend/src/lib/recurring.test.ts` (dueDay: 31 in Nov → 30, 29–31 in Feb 2027 → 28, 2028 → 29; monthState recorded/due/later by today and by an expense linked this month or last month only; dueItems order by day then id, stopped items never; keptPeople drops members without an account and a payer who left) and implement `frontend/src/lib/recurring.ts`
- [X] T009 [P] Add the `recurring` strings to `frontend/src/i18n/vi.tsx` and `en.tsx` per contracts/ui-contract.md

**Checkpoint**: `pytest -q`, `ruff check .`, `npm test`.

---

## Phase 3: User Story 1 - Make an expense recur (Priority: P1) 🎯

- [X] T010 [US1] Extend `frontend/src/components/ExpenseForm.test.tsx`: the tick only when adding (not editing, not from an item); the hint names the day of the chosen date; "Số tiền thay đổi" only after ticking; the submitted input has `recurring: { varying_amount }`; custom split + tick → "Khoản định kỳ chỉ chia đều", no submit
- [X] T011 [US1] Implement the tick, the varying box and the equal-only check in `frontend/src/components/ExpenseForm.tsx`; reset after a save

## Phase 4: User Story 2 - Record when due (Priority: P1)

- [X] T012 [P] [US2] Write `frontend/src/components/DueCard.test.tsx`: due lines with description, amount or "nhập số tiền tháng này", payer, day; "Ghi luôn" links with state `{ recordItem: id }`; 3 then "Xem tất cả (n)"; nothing when none
- [X] T013 [US2] Extend `ExpenseForm.test.tsx` for `fromItem`: filled fields, varying amount empty and focused, "Đang ghi kỳ" following the date, people who left dropped with a note, payer left empty if gone, the input has `recurring_item_id`
- [X] T014 [US2] Create `frontend/src/components/DueCard.tsx`; implement `fromItem` in `ExpenseForm.tsx` (initial state, note, period line)
- [X] T015 [US2] Wire the card into `frontend/src/pages/DashboardPage.tsx` right after `VerdictBlock` (items and expenses loaded only); in `frontend/src/pages/ExpensesPage.tsx` read `location.state.recordItem`, open the form from that item, and on `409 recurring_month_taken` show the message with "Xem khoản đã ghi" (reveal), keeping the form; extend `DashboardPage.test.tsx` (card placement, hidden while loading) and `ExpensesPage.test.tsx` (filled form, 409 message)

## Phase 5: User Story 3 - Consistency on edits (Priority: P1)

- [X] T016 [US3] Extend `ExpensesPage.test.tsx`: editing a linked expense's date into a recorded month shows the 409 message and keeps the form; the edit body does not send `recurring_item_id`

## Phase 6: User Story 4 - See and stop (Priority: P2)

- [X] T017 [P] [US4] Write `frontend/src/components/RecurringList.test.tsx` (folded "Khoản định kỳ (n)", states, "Ngừng lặp" only for creator or owner, asks first, empty hint) and create `frontend/src/components/RecurringList.tsx`
- [X] T018 [US4] Add it to `ExpensesPage.tsx` with the stop mutation (invalidate the house's queries)

## Phase 7: Polish

- [X] T019 Style `.due-card`, `.recurring-list`, the tick and the notes in `frontend/src/index.css` (tokens only, 44 px)
- [X] T020 [P] Write `frontend/e2e/recurring.spec.ts` (local stack): an item through the API with today's day after deleting its first expense; Tổng quan shows it under the transfers; Ghi luôn → Lưu → card gone after reload; a second save from the same item this month (API) → 409. Extend `frontend/e2e/a11y.spec.ts`: card and list at 360/320 (no sideways scroll, ≥ 44 px), at 1440 × 900 the 006 first-screen check still holds with a due card
- [X] T021 [P] Docs: `docs/ARCHITECTURE.md` §4 (table, column, index) and §5 (body fields, routes, errors); `docs/PROJECT_SPEC.md` §3.3 note "Since 06/11"; `docs/DESIGN.md` §6.2 (card) and §6.3 (tick, list); README line
- [X] T022 Run `ruff check .`, `pytest -q` on a fresh database, `npm run lint && npm test && npm run build`, E2E on a fresh local stack; quickstart rows 1–11; screenshots at 1440 and 360; tick the tasks here

## Dependencies

Setup → Foundational (backend T002–T006 in order; T007–T009 alongside) → US1 → US2 → US3 → US4 → Polish.

## Notes

- If a task needs an AI contract or balance change, stop and update plan.md.
