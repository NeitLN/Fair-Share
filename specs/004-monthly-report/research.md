# Research: Monthly report

No open questions were left in the Technical Context; these are the design decisions and why.

## R1. Where the numbers come from

- **Decision**: Build the report in the browser from the expenses (each with its stored shares) and the
  settlements the app already loads. A month line is the sum of the items dated before the month (start)
  plus the items dated in it (paid, share, paid back, got back). Notices are not read at all.
- **Rationale**: The API returns every expense with its shares and every confirmed settlement, with no
  paging, and Tổng quan already caches them. The server's own rule is
  `net = paid − owed + sent − received` (`app/services/balances.py`) over the same rows, so cutting the
  rows by date gives the same answer per month. No new route keeps the API contract and the access rules
  as they are (constitution II), and the pattern is the one `lib/explain.ts` and `monthTotals` use.
- **Alternatives considered**: A `GET /households/{id}/report?month=` endpoint computing it in SQL (a
  new contract, backend tests and docs for data the page already holds; worth it only if the history
  grows past what a page can load, which a house of a few people will not); storing month-end balances
  (that is "closing" a month, which the spec leaves out).

## R2. Keeping it in step with Tổng quan

- **Decision**: The report also reads the balances query. If any housemate's end of the last month in
  the range differs from the API's `net`, the report shows "Đang cập nhật…" with no figures, refetches,
  and shows the figures once they agree.
- **Rationale**: Expenses, settlements and balances are three requests that refresh separately (the
  30 s refresh, a change on another tab). The end of the last month is the sum of every item, so
  comparing it with the API's net proves the whole chain matches the server (FR-004, SC-002). It is the
  same guard as R2 of `002-balance-explanation`.
- **Alternatives considered**: Trusting the client sums (a short mismatch would show numbers that differ
  from Tổng quan); hiding only the last month (earlier months come from the same data, so they could be
  off in the same way).

## R3. The address

- **Decision**: `/households/{id}/report/{YYYY-MM}`. Without a month it replaces itself with the current
  month; a month outside the range or not a real month replaces itself with the nearest month in range
  (a month before the first goes to the first, anything else to the last).
- **Rationale**: FR-009 asks for an address a housemate can reopen; a path segment is plain to read and
  share. Replacing (not pushing) keeps Back working.
- **Alternatives considered**: `?month=` (works too, but a missing or bad value is easier to miss in
  review); no month in the address (fails FR-009).

## R4. Which months exist

- **Decision**: From the earliest `spent_at` / `settled_at` month to the later of the current month and
  the latest one. The current month is "today" on the device (`lib/date.ts`), as the Tháng block uses.
  When something is dated after the current month, the current month's report says in one line that
  later items are not in it yet.
- **Rationale**: FR-008 and the edge case on later dates; the last month in range then always equals
  Tổng quan, which R2 relies on.
- **Alternatives considered**: Ending at the current month (the last month could never match Tổng quan
  when something is dated later, so R2 would wait forever).

## R5. Layout

- **Decision**: On a computer (`useWide()`, 1024 px and up) a table: one row per housemate, columns
  Đầu tháng, Đã chi, Phần, Đã trả lại, Nhận lại, Cuối tháng, and a total row (start 0, paid = month
  total, share = month total, paid back = got back, end 0). Below 1024 px one card per housemate, the
  same six figures as a two-column list. Start and end use `Money kind="balance"` (được nhận / cần trả
  colours and words); the four movements are plain amounts.
- **Rationale**: Desktop is the target and the six figures read best side by side; a table of six money
  columns cannot fit 320 px, so phones stack (FR-015). The total row shows the sums the spec requires
  without asking anyone to add them up.
- **Alternatives considered**: One responsive grid for both (harder to keep the money columns aligned
  and to read with a screen reader than a real table).

## R6. Getting in and out

- **Decision**: On Tổng quan the "Tháng …" block gets a "Báo cáo tháng" link under its heading (not a
  fourth tab). The report page shows the household frame with Tổng quan as the active place, a link
  "Xem các khoản chi tháng này" that opens Chi tiêu with navigation state `{ month }`, and previous /
  next links that are not rendered at the ends of the range.
- **Rationale**: FR-011; the tabs stay the three the app has. Chi tiêu's filter lives in page state, so
  navigation state is the smallest hand-off (the same way `revealExpense` works).
- **Alternatives considered**: A tab (a fourth tab crowds the phone header for a page used once a month);
  putting the filter in Chi tiêu's address (a larger change to a page this feature does not own).

## R7. Tests

- **Decision**: Unit tests of `monthReport` for every invariant in data-model.md, with equal and custom
  splits, a repayment in the month, an empty month, a later-dated item and a member who left; page tests
  for the address rules, the in-step wait, the two layouts and the language; an E2E walk on a local stack
  (`E2E_BASE_URL`) comparing the current month's ends with Tổng quan and stepping back; the report page
  added to the a11y walk.
- **Rationale**: Constitution I asks for every sum to be tested; the a11y walk is how VI is checked.
