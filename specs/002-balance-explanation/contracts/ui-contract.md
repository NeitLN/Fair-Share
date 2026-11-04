# UI contract: Why this number?

The feature exposes no API. Its contract is between the pure function, the component that renders it,
and the pages that open it.

## `lib/explain.ts`

```ts
type LineKind = 'spent' | 'share' | 'paidBack' | 'gotBack'

interface ExpenseItem { kind: 'expense'; expenseId: number; description: string; spentAt: string; payerId: number; amount: number; part: number }
interface RepaymentItem { kind: 'repayment'; settlementId: number; settledAt: string; otherMemberId: number; amount: number; note: string | null }

interface ExplanationLine { kind: LineKind; total: number; items: (ExpenseItem | RepaymentItem)[]; inStep: boolean }
interface WaitingNotice { otherMemberId: number; amount: number; iSent: boolean }
interface BalanceExplanation { memberId: number; lines: ExplanationLine[]; net: number; waiting: WaitingNotice[] }

function explain(balance: MemberBalance, expenses: Expense[], settlements: Settlement[], notices: Notice[]): BalanceExplanation
```

Pure, no React, no I/O. Invariants: [data-model.md](../data-model.md#invariants-each-one-is-a-unit-test).

## `components/BalanceExplanation.tsx`

Props only, like the other components:

| Prop | |
|---|---|
| `explanation` | from `explain()` |
| `looks` | member looks, for names and avatars in items |
| `me` | the signed-in person's member id, for "bạn" wording |
| `householdId` | for the link to Chi tiêu |

Renders a list of four folds (one per line: label, signed amount; opening shows its items or "Đang cập
nhật…" or "Không có khoản nào"), then the total with "Còn cần trả" / "Còn được nhận" / SẠCH NỢ, then
one line per waiting notice. An expense item is a link to Chi tiêu with navigation state
`{ revealExpense: expenseId }`; a repayment item is a link to `#settlement-<id>`.

## Entry points

| Where | What | When |
|---|---|---|
| `VerdictBlock` | fold "Vì sao ra số này?" under the amount, with your explanation | your balance ≠ 0 |
| `BalanceRows` | each row's name area is a fold summary; the explanation opens under the row | always |
| `ExpensesPage` | starts with `revealExpense` from the navigation state as the revealed row (the page has just opened, so no filter can hide it), scrolls it into view, then clears the state | on arrival |
| `SettlementList` | `id="settlement-<id>"` on each row | always |

## Copy (both `vi.tsx` and `en.tsx`, under `explain`)

| Key | Vietnamese | English |
|---|---|---|
| `open` | Vì sao ra số này? | Why this number? |
| `spent(you, name)` | Bạn đã chi cho cả nhà / Duy Anh đã chi cho cả nhà | You spent for the group / Duy Anh spent for the group |
| `share(you, name)` | Phần của bạn trong các khoản chi / Phần của Duy Anh … | Your share of the expenses / Duy Anh's share … |
| `paidBack(you, name)` | Bạn đã trả lại / Duy Anh đã trả lại | You paid back / Duy Anh paid back |
| `gotBack(you, name)` | Bạn đã nhận lại / Duy Anh đã nhận lại | You were paid back / Duy Anh was paid back |
| `title(you, name)` | Số dư của bạn / Số dư của Duy Anh (the group's accessible name) | Your balance / Duy Anh's balance |
| `total` | Số dư, followed by the existing *cần trả* / *được nhận* or SẠCH NỢ | Balance, then *owes* / *gets back* or SETTLED |
| `nothing` | Không có khoản nào (under a zero line) | Nothing here |
| `updating` | Đang cập nhật… | Updating… |
| `paidBy(name)`, `of(amount)`, `to(name)`, `from(name)` | Minh trả · trên tổng 240.000đ · cho Minh · từ Minh | Minh paid · of 240,000 ₫ · to Minh · from Minh |
| `expenseHint` / `repaymentHint` | Bấm một khoản để mở nó trong Chi tiêu. / … xem nó trong Lịch sử trả. | Pick one to open it in Expenses. / … see it in the repayments. |
| `waiting(from, to, amount)` | {from} đã báo chuyển {amount} cho {to}, chờ xác nhận: chưa tính vào số dư. | {from} reported sending {amount} to {to}, waiting to be confirmed: not counted yet. |

Built on 05/11: the total reuses the balance rows' words instead of new `owes`/`gets` keys, and one
`waiting` sentence covers both directions (from = "Bạn" or a name, to = "bạn" or a name).
