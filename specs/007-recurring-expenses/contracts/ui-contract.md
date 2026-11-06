# UI contract: recurring expenses in the SPA

## `lib/recurring.ts`

```ts
type MonthState = 'recorded' | 'due' | 'later'
function dueDay(day: number, month: string): number            // "YYYY-MM"
function monthState(item: RecurringItem, expenses: Expense[], today: string): MonthState
function dueItems(items: RecurringItem[], expenses: Expense[], today: string): RecurringItem[]
function keptPeople(item: RecurringItem, members: Member[]): { payerId: number | null; memberIds: number[]; left: number[] }
```

## `api/recurring.ts`

`listRecurring(householdId)`, `stopRecurring(id, householdId)`; query key under the household so
`invalidateQueries(keys.household(id))` refreshes it.

## Form

- Adding (not editing, not from an item): a checkbox "Lặp lại hằng tháng" before Lưu, with the hint
  "Nhắc ngày <d> mỗi tháng · không tự ghi tiền" (d = day of the chosen date); once ticked, a second
  checkbox "Số tiền thay đổi mỗi tháng". Ticked with a custom split: the field error "Khoản định kỳ chỉ
  chia đều" under the tick, no save.
- From an item (`fromItem`): filled description, category, amount (empty and focused if varying), payer
  (if still in the house), equal split between the kept people, date today; a line "Đang ghi kỳ M/YYYY"
  following the date; a note when people were left out. No tick.
- On `409 recurring_month_taken`: the message "Kỳ M/YYYY của <description> đã có người ghi" with a link
  "Xem khoản đã ghi" (reveals `details.expense_id`); the form keeps its values.

## `components/DueCard.tsx` (Tổng quan, after the verdict and transfers)

```
Tới hạn
Tiền nhà · 4.500.000đ · Minh trả · ngày 1            [Ghi luôn]
Tiền điện · nhập số tiền tháng này · Tiến trả · ngày 5 [Ghi luôn]
Xem tất cả (4)
```

"Ghi luôn" is a link to `/households/:id/expenses` with state `{ recordItem: id }` (44 px). Not rendered
with nothing due or while items or expenses are loading or failed.

## `components/RecurringList.tsx` (Chi tiêu, folded `<details>` "Khoản định kỳ (n)")

Each active item: description, amount or "số tiền thay đổi", payer, "ngày d", this month's state (đã
ghi / tới hạn / chưa tới ngày), and "Ngừng lặp" (creator or owner; asks first). Empty: the hint
"Tích Lặp lại hằng tháng khi ghi khoản chi".

## Strings (vi / en)

`recurring.{tick, varying, hint(day), equalOnly, period(month), leftOut(names), title, due, record,
seeAll(n), dueLine…, varyingAmount, day(d), list(n), state.{recorded,due,later}, stop, stopConfirm(desc),
stopped, empty, taken(month, desc), seeTaken, stoppedError, tooMany}`.
