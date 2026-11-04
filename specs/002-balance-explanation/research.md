# Research: Why this number?

No open questions were left in the Technical Context; these are the design decisions and why.

## R1. Where the numbers come from

- **Decision**: The four line totals are the balance's own fields from the API (`paid`, `owed`, `sent`,
  `received`); their sum is the API's `net`. The items are built in the browser from the expenses
  (with their shares) and the settlements the page already loads.
- **Rationale**: The API computes `net = paid − owed + sent − received` (`app/services/balances.py`),
  so taking the totals from it guarantees the lines add up to the balance shown everywhere else
  (FR-004) with no second formula that could drift. The page already has every expense with its shares
  and every settlement, so the items need no request (constitution I, II).
- **Alternatives considered**: A new endpoint returning the explanation (more code and a new contract
  for data the page already has); computing the totals in the browser too (a second implementation of
  the maths to keep in step with the server).

## R2. When the items and the totals disagree

- **Decision**: Each line shows its items only when they add up exactly to the line's total. If they
  do not (one query refreshed before the other, during the 30 s refresh or right after a change), the
  line says "Đang cập nhật…" until both are in step, then shows the list.
- **Rationale**: FR-008 and FR-015 require that what is shown always adds up. The two come from two
  requests that refresh separately, so a short mismatch can happen; hiding the list for that moment is
  honest and needs no extra request.
- **Alternatives considered**: Showing the list anyway (would show numbers that do not add up);
  forcing both queries to refetch together (more coupling for a moment the user rarely sees).

## R3. Where it opens and how

- **Decision**: In place, as a fold: under the verdict amount for your own balance ("Vì sao ra số
  này?", only when your balance is not 0), and under each row of Số dư từng người (the row's name area
  becomes the fold's summary). Each line is itself a fold listing its items.
- **Rationale**: Matches the approved mockup (variant B) and the folds the app already uses
  (`<details>`, Escape closes and returns focus via `lib/fold.ts`), so keyboard and screen-reader
  behaviour come for free (FR-003, FR-014).
- **Alternatives considered**: A dialog (covers the numbers being explained); a separate page (loses the
  context the user came from).

## R4. Getting from an item to where it is changed

- **Decision**: An expense item links to Chi tiêu with the expense id in the navigation state; Chi tiêu
  clears its filter if needed, reveals that row with the mechanism it already has for a just-saved
  expense, and scrolls to it. A repayment item scrolls to its row in Lịch sử trả on the same page
  (rows get `id="settlement-<id>"`).
- **Rationale**: FR-010 asks for a way to the place of change without changing anything from the
  explanation. Navigation state keeps the URL clean and needs no new route.
- **Alternatives considered**: Opening the edit form directly from the explanation (puts a change one
  tap away from a read-only view, against FR-010's intent); a URL parameter (would also need parsing and
  stays in the address after the edit).

## R5. "Tôi đã chuyển" notices

- **Decision**: Not counted (they change no balance, ACCOUNTS.md S3). When the person has a notice
  waiting, either as sender or receiver, the explanation adds one line under the total saying so, with
  the amount and the other person.
- **Rationale**: FR-011; the most likely question after "Tôi đã chuyển" is "why do I still owe it?".

## R6. Wording

- **Decision**: "bạn" for the signed-in person, the short name (`lib/names.ts`) for anyone else;
  lines: "Bạn đã chi cho cả nhà", "Phần của bạn trong các khoản chi", "Bạn đã trả lại", "Bạn đã nhận
  lại", total "Còn cần trả" / "Còn được nhận" / SẠCH NỢ. English: "You spent for the group", "Your
  share of the expenses", "You paid back", "You were paid back", "You owe" / "You get back" / SETTLED.
- **Rationale**: Same vocabulary as the rest of the page (DESIGN.md §7, BRAND.md §6), neutral, no
  collector words.
