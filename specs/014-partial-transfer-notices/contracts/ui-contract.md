# UI contract: Tổng quan and Chi tiêu

Vietnamese shown; English keys mirror them. `{told}`, `{rest}`, `{current}` are amounts as `1.000.000đ`.

## Payer (Tổng quan, the debtor's action under the verdict block)

| State | What shows |
|---|---|
| Suggested, nothing told | [Tôi đã chuyển {current} cho {to}] · link "Chuyển số khác" · line "Số này đã gộp nợ của cả nhà, nên bạn chỉ chuyển cho người được gợi ý." with "Vì sao ra số này?" |
| Suggestion > 10^12 | the limit line; the button opens "Chuyển số khác" |
| Told, waiting, told = current | "Đã báo chuyển {told}, chờ {to} xác nhận." · [Huỷ thông báo] |
| Told < current | "Đã báo {told}, còn thiếu {rest}" · [Báo thêm] (hidden at 10^12) · [Huỷ thông báo] |
| Told > current | "Đã báo {told}, nhiều hơn số cần trả lúc này {current}" · [Huỷ thông báo] |
| Pair not suggested | "Đã báo {told} · Hiện không còn gợi ý chuyển cho {to}" · [Huỷ thông báo] |
| Declined | "{to} báo chưa nhận được {told}." · [Báo lại] · [Huỷ thông báo] |
| Recording in progress | the line stays; buttons disabled with "Đang ghi…"; never "sạch nợ" |

Note, when present, under the line in quotes.

## Receiver (the transfer card)

| State | What shows |
|---|---|
| Told = current | "{payer} báo đã chuyển {told}" · note · [Xác nhận đã nhận {told}] · [Nhận số khác] · [Chưa nhận được] |
| Told ≠ current / not suggested | the same, plus "· lúc này {payer} cần trả bạn {current}" or "· hiện không còn gợi ý" |
| Declined | "Bạn đã báo chưa nhận được {told}." (actions as today) |

## Steps (`NoticeAmountStep`)

- "Chuyển số khác": amount (default the suggestion), note (optional, 120), [Gửi] [Huỷ].
- "Báo thêm": amount (default {rest}); the line "{told} + {x} = {total}" updates as typed; note; [Gửi] [Huỷ].
- "Nhận số khác": amount (default {told}, max {told}); [Ghi số này] [Huỷ].
- Amount read like the expense form ("1tr", "500k"), "= …đ" under it; errors under the field; Enter sends, Escape
  closes and returns focus to the opener; on 409 the step stays open with the typed values and the new numbers.

## Chi tiêu, "Ghi khoản trả khác" (receiver)

- When the chosen payer has a notice to me: radio "Đây là tiền {payer} đã báo ({told})" (default) / "Khoản khác".
- Deleting a repayment recorded from a notice asks first: "{payer} sẽ lại có thông báo {amount} chờ bạn xác nhận."
  or, when a notice exists: "{payer} đang có thông báo khác; số này không trở lại thông báo, {payer} có thể cần báo
  lại."

## Reminder message

- Waiting notice: "(đã báo chuyển {told}, chờ {to} xác nhận)"; not suggested: "(đã báo chuyển {told})".
