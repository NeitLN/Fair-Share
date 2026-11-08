# UI contract: First impressions that hold up

## Save area of the expense form (US1, US4)

`.form-actions` (sticky on phones) holds, top to bottom:

1. **Summary** (`.form-summary`, `role="status"`, polite): shown after a failed submit; the first problem in the order
   description, amount, payer, date, split, or the general server message. Hidden when the form is valid and no
   server message stands.
2. **Either** the usual buttons ("Lưu khoản chi" / "Lưu thay đổi", "Huỷ"), **or**, while confirming a large amount,
   `.form-confirm`: "Số tiền {amount} lớn bất thường. Lưu thật nhé?" / "{amount} is unusually large. Save it anyway?"
   with "Sửa lại" / "Change it" (focused) and "Lưu thật" / "Save anyway".

Focus targets after a failed submit:

| First problem | Focus |
|---|---|
| description, amount, payer, date | the field (`data-field` as today) |
| split, a share unreadable | that share input |
| split, shares do not add up, or no share | the first custom share input |
| split, Chia đều with nobody | the first person checkbox |
| server error tied to a field | that field |
| network or unexpected error | none; the summary is announced |

## Share inputs (US4)

Each share input in Tự chia shows "= {formatted}" beside or under it (same look as the total's `.amount-preview`)
when its text reads as a positive amount; an unreadable share shows the total's message, tied to that input.

## Repeat (US3)

While a new expense is in Tự chia: "Lặp lại hằng tháng" disabled and unticked, varying-amount hidden or disabled,
line under it "Khoản định kỳ chỉ chia đều được." / "Recurring items are split equally."

## Slow notice (US2)

`.slow-notice` just above `<main>` in every layout, full width, muted surface, 44 px min height, not sticky, no
close button. Text: "Phản hồi đang lâu hơn bình thường. Máy chủ có thể đang khởi động, thường mất khoảng 1 phút.
Bạn không cần tải lại trang." / "This is taking longer than usual. The server may be starting up, which usually
takes about a minute. No need to reload."

## Quick add (US5)

| Availability | Shows |
|---|---|
| unknown, on | today's composer |
| off | one muted line "Gõ nhanh bằng AI chưa được bật trên máy chủ này." / "AI quick add is not set up on this server."; if a sentence was typed: "Câu bạn đã gõ:" + the sentence (selectable, wrapping) + "Nhập các thông tin trong câu vào biểu mẫu bên dưới." / "Type what it says into the form below." |

## Recurring list (US6)

Under an item whose stop failed (`.recurring-error`, `role="alert"`): "Chưa xác nhận được là đã ngừng lặp. {reason}"
/ "Couldn't confirm it stopped. {reason}". Each item's "Ngừng lặp" button is disabled only while its own stop waits.

## Strings

All new keys go in `form.*`, `ai.*`, `recurring.*` and a new `app.slow*`; final wording is reviewed in the PR
against DESIGN.md §7.
