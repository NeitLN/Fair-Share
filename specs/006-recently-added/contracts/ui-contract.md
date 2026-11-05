# UI contract: "Mới ghi"

No API. The contract is between the pure module, the component and Tổng quan.

## `lib/recent.ts`

```ts
type SeenMarks = { expenses: string | null; settlements: string | null }
interface RecentItem { kind: 'expense' | 'repayment'; id: number; savedKey: string; savedAt: string;
  recorderMemberId: number | null; amount: number; description?: string; fromMemberId?: number }

function savedKey(createdAt: string): string
function recentItems(expenses: Expense[], settlements: Settlement[], members: Member[], myUserId: number,
  marks: SeenMarks | null, now: Date): RecentItem[]
function marksAfter(expenses: Expense[], settlements: Settlement[], previous: SeenMarks | null): SeenMarks
function readMarks(userId: number, householdId: number): SeenMarks | null   // null: none stored or unreadable
function writeMarks(userId: number, householdId: number, marks: SeenMarks): void   // never throws
```

## `components/RecentStrip.tsx`

| Prop | |
|---|---|
| `items` | from `recentItems()`; the component renders nothing when empty |
| `looks` | member looks, for names |
| `me` | the member id of the signed-in account, for "bạn" |
| `householdId` | for links |
| `initialCount` | 3 on a computer, 5 on a phone |
| `onSeen` | called by "Đã xem tất cả" |

```
Mới ghi                                           Đã xem tất cả
(M) Minh ghi Lẩu thứ sáu · 240.000đ        Hôm nay, 06/11 · 14:05
(D) Duy Anh ghi đã nhận 440.000đ từ bạn    Hôm nay, 06/11 · 09:12
Xem thêm 2
```

`<section className="recent-strip" aria-labelledby="recent-strip-title" aria-live="polite">`, `<h2>`,
`<ul>` of `Link`s (≥ 44 px rows), "Xem thêm N" `<button aria-expanded>`, "Đã xem tất cả" `<button>` with
`aria-label` "Đã xem tất cả N mục mới".

## Tổng quan

- Builds the items only when members, expenses and settlements are all loaded successfully and a
  session exists; keeps the lists it built them from for `marksAfter()`.
- Holds the marks in state, initialised from `readMarks()`; "Đã xem tất cả" computes `marksAfter()`,
  stores it in state and `writeMarks()`.
- Renders `RecentStrip` as the first child of `.split-rest`.

## Strings (vi / en)

`recent.title`, `recent.expense(name, description)`, `recent.repayment(name, amount, from)`,
`recent.you` (reuses `common.you`), `recent.more(n)`, `recent.seen`, `recent.seenLabel(n)`,
`recent.at(day, time)`.
