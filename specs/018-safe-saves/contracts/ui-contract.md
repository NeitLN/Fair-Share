# UI contract: Safe saves

## 1. Covered actions and where they report

| # | Action | Mutation (file) | `source` | Error place (today, unless marked new) |
|---|---|---|---|---|
| A1 | Add / edit expense | `create`, `update` (`ExpensesPage.tsx`) | `expense-form` | Form summary above Lưu (`ExpenseForm`) |
| A2 | Hand-recorded repayment | `record` (`DashboardPage.tsx`) | `settlement-form` | The form's alert line (`SettlementForm`) |
| A3 | Tell: Tôi đã chuyển / Chuyển số khác / Báo thêm | `notice` send/add (`DashboardPage.tsx`) | `transfer-<from>-<to>` | Inside the amount step when open (`NoticeAmountStep`), otherwise the transfers panel alert |
| A4 | Huỷ thông báo | `notice` cancel | `transfer-<from>-<to>` | Transfers panel alert |
| A5 | Xác nhận đã nhận / Chưa nhận được / Nhận số khác | `paid` (`usePaidTransfers.ts`), `notice` decline | `transfer-<from>-<to>` | Nhận số khác: inside its step (new); the others: transfers panel alert |
| A6 | Hoàn tác a confirmation | `usePaidTransfers.ts` undo | `transfer-<from>-<to>` | Its retry toast (sticky when unknown) |
| A7 | Delete expense / repayment | `remove` (`ExpensesPage`, `DashboardPage`) | `expense-list` / `history` | List or history error line |

## 2. Lines

The error codes come from `request()`:

- `offline`: the browser said offline, so nothing was sent.
- `outcome_unknown`: the request was sent and no full answer came, or 90 s passed.

Other codes keep today's messages.

| # | `offline` (vi) | `outcome_unknown` (vi) |
|---|---|---|
| A1 | Chưa lưu được: bạn đang mất mạng. Khoản chi này chưa được lưu. | Chưa nhận được kết quả. Có thể khoản chi đã được lưu, xem danh sách trước khi lưu lại. |
| A2 | Chưa ghi được: bạn đang mất mạng. Khoản trả này chưa được ghi. | Chưa nhận được kết quả. Có thể khoản trả đã được ghi, xem lịch sử trước khi ghi lại. |
| A3 | Chưa báo được: bạn đang mất mạng. | Chưa nhận được kết quả. Có thể đã báo rồi, xem lại khối của bạn trước khi báo lại. |
| A4 | Chưa huỷ được: bạn đang mất mạng. | Chưa nhận được kết quả. Có thể đã huỷ rồi, xem lại khối của bạn trước khi bấm lại. |
| A5 | Chưa ghi được: bạn đang mất mạng. | Chưa nhận được kết quả. Có thể đã ghi rồi, xem lại thẻ trước khi bấm lại. |
| A6 | Chưa hoàn tác được: bạn đang mất mạng. | Chưa nhận được kết quả. Có thể đã hoàn tác rồi, xem lại thẻ trước khi bấm lại. |
| A7 | Chưa xoá được: bạn đang mất mạng. | Chưa nhận được kết quả. Có thể đã xoá rồi, xem lại danh sách trước khi xoá lại. |
| Quick add | Đang mất mạng, chưa đọc được câu này. | (its current failure line) |

| # | `offline` (en) | `outcome_unknown` (en) |
|---|---|---|
| A1 | Not saved: you're offline. This expense wasn't saved. | No answer yet. The expense may already be saved; check the list before saving again. |
| A2 | Not recorded: you're offline. This repayment wasn't recorded. | No answer yet. The repayment may already be recorded; check the history before recording again. |
| A3 | Not sent: you're offline. | No answer yet. It may already be sent; check your block before sending again. |
| A4 | Not taken back: you're offline. | No answer yet. It may already be taken back; check your block before trying again. |
| A5 | Not recorded: you're offline. | No answer yet. It may already be recorded; check the card before trying again. |
| A6 | Couldn't undo: you're offline. | No answer yet. It may already be undone; check the card before trying again. |
| A7 | Not deleted: you're offline. | No answer yet. It may already be deleted; check the list before deleting again. |
| Quick add | You're offline, so this sentence wasn't read. | (current line) |

An `outcome_unknown` line is shown alone, never inside "Chưa lưu được: …" / "Not saved: …" or after "Couldn't undo." (FR-016a).

## 3. Lock

| While `in_flight` | Behaviour |
|---|---|
| Text, amount, date inputs | `readOnly`, `aria-readonly="true"`, look locked (`.is-locked`) |
| Payer, category, split pickers, recurring tick, member ticks | `aria-disabled="true"`; changes ignored |
| `<form>` | `aria-busy="true"` |
| Save button | `aria-disabled`, label "Đang lưu…" / "Đang ghi…" / "Đang báo…" as today (#248) |
| Quick add (A1 only) | "Điền giúp" `aria-disabled`; an answer arriving now is not applied; text kept |
| Amount steps | Huỷ and Escape ignored; after a failure they work again and return focus to the opener |
| Focus | Never moved by locking. Tab works. Never pulled back |

## 4. Toasts

| Rule | Value |
|---|---|
| Duration | 7 s, counted only while visible, not in use, not sticky |
| In use | Keyboard focus or pointer inside the toast |
| Phone (< 600 px) | 1 visible; a one-slot wait queue (newest wins) |
| ≥ 600 px | Up to 3; the oldest not in use makes room |
| Placement (< 1024 px, a sticky save area visible) | Bottom: just above the save area (measured), else top of the visual viewport, else hidden with the timer paused |
| Text (< 1024 px) | At most 2 lines; full text in `aria-label` |
| Success toasts | Removed by `started(source)` if not in use; removed by any visible save error even if in use; not shown while one is visible |
| Sticky toast | Only A6 "result unknown": no timer, has "Đóng", counts as in use |
| Focus recovery | A removed or hidden toast that had focus gives it to the failing save's control, the error summary, or the form's submit control |

## 5. Sticky save area (< 1024 px)

`border-top: 1px solid var(--line)` and `box-shadow: 0 -4px 12px` in a soft ink colour, in both themes. DESIGN.md §5 records this and the toast rules.
