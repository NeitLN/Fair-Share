# UI contract: Pay by VietQR

Vietnamese shown; English keys mirror them. Amounts as `120.000đ`.

## Hồ sơ của bạn: "Tài khoản nhận tiền" (US1)

| State | What shows |
|---|---|
| None saved | "Chưa có tài khoản nhận tiền." · [Thêm tài khoản] |
| Form | Ngân hàng (select from the bundled list) · Số tài khoản (numeric keyboard) · Tên chủ tài khoản, with "Sẽ hiện: NGUYEN VAN MINH" updating as typed · the privacy line (US1 scenario 2) · [Lưu] [Huỷ] |
| Saved | "Vietcombank · 0123456789 · NGUYEN VAN MINH" · [Sửa] [Xoá] · line: "Đã xoá thì không ai tải được nữa; người đã xem trước đó có thể vẫn còn lưu." |
| Bank no longer listed | "Ngân hàng này không còn trong danh sách VietQR. Bạn cùng nhà sẽ không thấy tài khoản này." · [Sửa] [Xoá] |
| Delete | asks first: "Xoá tài khoản nhận tiền? Bạn cùng nhà sẽ không mở được mã QR của bạn nữa." |

Errors under each field (FR-002, FR-003, `unknown_bank`).

## Thành viên (FR-011)

Under a person with a hint: "Có tài khoản nhận tiền · Vietcombank •••• 6789". Nothing for others.

## Tổng quan: the debtor's action (US2, inside the verdict block)

- Recipient has a hint and FR-015 allows it: [Mở mã QR] next to "Tôi đã chuyển … cho …" (stacks under it below 480 px).
- Recipient without a hint: line "Minh chưa thêm tài khoản nhận tiền".
- A waiting notice covering the debt: no button (spec 014's line is enough).

## The panel (dialog)

| State | What shows |
|---|---|
| Loading | "Đang tải mã…" |
| `ready` | code (amount) · "Vietcombank · 0123456789 · NGUYEN VAN MINH (tên Minh tự nhập)" · Số tiền 120.000đ · Nội dung "FS NhaTroQ7 Lan" · [Sao chép] for each · "So tên người nhận trong app ngân hàng trước khi xác nhận." · [Mã không kèm số tiền] · [Đóng] |
| `partly_told` | as `ready`, with "120.000đ cần trả, đã báo 100.000đ, còn 20.000đ chưa báo" |
| No-amount mode | code without amount · "Không kèm số tiền: bạn nhập số tiền trong app ngân hàng. Bỏ số tiền không làm thay đổi hạn mức của ngân hàng." · reference amount labelled "Số tiền tham khảo" · [Mã kèm số tiền] |
| `declined` | "Minh báo chưa nhận được 100.000đ. Xem lại app ngân hàng trước khi chuyển nữa." · [Vẫn chuyển 120.000đ] · [Đóng] |
| `too_large` | no code; details as text with [Sao chép]; "Số tiền từ 500.000.000đ vượt mức chuyển nhanh VietQR, nên không có mã." |
| `no_account` / 409 / 404 | the code and details are removed; "Không còn mã cho lần trả này." · [Đóng] |
| Changed on refresh | the code and details are removed; "Số tiền hoặc tài khoản vừa đổi." · [Tải lại] |
| Error | "Chưa tải được mã." · [Thử lại] |

- The code: SVG on a light background with a quiet zone, at least 200 px wide, `role="img"` with the label "Mã VietQR chuyển 120.000đ cho Minh".
- [Sao chép] shows "Đã chép"; when the clipboard is refused, the value is selected for copying by hand.
- Escape and [Đóng] close; focus goes to [Mở mã QR], else the debtor's current action, else the verdict heading (FR-023).
