# Kế hoạch công việc sau buổi đánh giá 08/11

Dựa trên [biên bản đánh giá](2026-11-08-bien-ban-danh-gia.md). Mã L1 đến L12 là mã lỗi trong biên bản.

## 1. Cách đọc và cách làm

**Ký hiệu**

| Ký hiệu | Nghĩa |
|---|---|
| G1, G2, G3 | Đợt 1 (sửa nhanh), đợt 2 (tiền và người), đợt 3 (tính năng mới) |
| Cỡ | S: dưới 2 giờ, M: nửa ngày, L: 1 ngày, XL: 2 ngày trở lên |
| Spec | Có: chạy Spec Kit (spec, plan, tasks) trước khi code. Không: sửa thẳng, có test |
| Đề xuất | Người hợp với việc đó, theo phần mỗi bạn đã làm. Trưởng nhóm chốt lại |

**Quy trình mỗi gói**

1. Mở issue (dùng mục "Tiêu chí xong" làm định nghĩa hoàn thành).
2. Nhánh mới từ `main`, một PR cho một gói hoặc một nhóm gói nhỏ ghi ở mục 5.
3. Test trước hoặc cùng lúc với code: pytest cho backend, Vitest cho frontend, Playwright cho luồng chính.
4. `ruff check .`, `npm run lint`, `npm test`, `npm run build`, E2E local, rồi mới mở PR.
5. Một bạn review và approve, CI xanh mới merge. Sau deploy kiểm tra E2E live.
6. Cập nhật DESIGN.md, ACCOUNTS.md, ARCHITECTURE.md trong cùng PR khi gói đổi quy tắc hay giao diện.

## 2. Đợt 1: sửa nhanh, ảnh hưởng lớn

Mục tiêu: hết các lỗi người dùng thấy ngay ở lần dùng đầu. Tổng khoảng 2 ngày công.

### G1-01 Khối số tiền không bị avatar che (L1)

- **Vấn đề:** ở 360 px, dãy avatar đè lên câu "Bạn được nhận từ 4 người".
- **Việc:**
  - `frontend/src/components/VerdictBlock.tsx`, CSS `.verdict`, `.verdict-total` trong `frontend/src/index.css`.
  - Dưới 380 px: đưa dãy avatar lên hàng riêng phía trên câu (hoặc thu về 1 avatar + "+n"), số tiền 36 px như DESIGN.md §5.
  - Số tiền rất lớn (13 chữ số) không bị cắt: cho xuống dòng hoặc thu chữ.
- **Tiêu chí xong:** ở 320, 360, 375, 390 px chữ và avatar không chạm nhau; số 999.999.999.999đ hiện đủ; thêm một kiểm tra trong `e2e/a11y.spec.ts` đo hai hộp không giao nhau ở 360 px.
- **Cỡ:** S. **Spec:** Không. **Đề xuất:** Duy Anh. **Phụ thuộc:** không.

### G1-02 Lưu lỗi phải thấy được (L2)

- **Vấn đề:** lỗi của form nằm dưới nút Lưu dính, focus nhảy sang tab "Tự chia".
- **Việc:**
  - `frontend/src/components/ExpenseForm.tsx`: khi `validate()` hoặc server trả lỗi, hiện một dòng tóm tắt lỗi ngay trên `.form-actions`, cuộn tới ô lỗi đầu tiên và đặt focus vào đó.
  - Kiểm tra mọi lỗi của form: tự chia chưa đủ, định kỳ với tự chia, số tiền sai, chưa chọn người.
- **Tiêu chí xong:** Vitest cho từng loại lỗi kiểm tra focus nằm ở ô lỗi và dòng lỗi hiển thị; ảnh 360 px cho thấy lỗi không bị nút che.
- **Cỡ:** M. **Spec:** Không. **Đề xuất:** Tiến. **Phụ thuộc:** nên làm trước G1-08.

### G1-03 Gõ nhanh không gửi trùng khi nhấn Enter (L4)

- **Việc:** `frontend/src/components/AiComposer.tsx`, hàm `read()`: thoát ngay nếu đang ở trạng thái `reading`.
- **Tiêu chí xong:** Vitest nhấn Enter ba lần liên tiếp chỉ gọi API một lần.
- **Cỡ:** S. **Spec:** Không. **Đề xuất:** Minh.

### G1-04 Báo lỗi khi ngưng khoản định kỳ thất bại (L5)

- **Việc:** `frontend/src/pages/ExpensesPage.tsx` truyền `stop.error` xuống `frontend/src/components/RecurringList.tsx`; hiện lỗi ngay dưới khoản đó.
- **Tiêu chí xong:** Vitest giả lập 500 khi ngưng, thấy thông báo dưới đúng khoản.
- **Cỡ:** S. **Spec:** Không. **Đề xuất:** Minh.

### G1-05 Giữ bộ lọc tháng khi tháng trống (L6)

- **Việc:** `frontend/src/pages/ExpensesPage.tsx`: tháng được truyền từ báo cáo vẫn giữ dù không có khoản chi, hiện "Tháng 9/2026 chưa có khoản chi nào" và nút "Bỏ lọc".
- **Tiêu chí xong:** Vitest mở Chi tiêu với tháng không có khoản chi, danh sách trống và có bộ lọc tháng.
- **Cỡ:** S. **Spec:** Không. **Đề xuất:** Duy Anh.

### G1-06 Màn hình chờ máy chủ khởi động

- **Vấn đề:** API miễn phí ngủ sau khoảng 15 phút; lần mở đầu chờ khoảng 50 giây mà chỉ thấy "Đang tải…".
- **Việc:**
  - `frontend/src/api/client.ts`: đếm request đang chạy quá 5 giây, phát một trạng thái chung.
  - Một dải thông báo nhỏ dưới header: "Máy chủ đang khởi động, thường mất khoảng 1 phút. Bạn không cần tải lại trang." Tự ẩn khi request đầu tiên trả về.
  - Chuỗi vi/en trong `frontend/src/i18n`.
  - Áp dụng cả ở trang đăng nhập (nút đăng nhập đang quay).
- **Tiêu chí xong:** Vitest giả lập request chậm 6 giây thì thấy dải thông báo, trả về thì mất; không hiện với request nhanh.
- **Cỡ:** M. **Spec:** Không (ghi vào DESIGN.md §6.5). **Đề xuất:** Tiến.

### G1-07 Tiếng Việt là ngôn ngữ mặc định

- **Việc:**
  - `frontend/src/i18n/language.ts`: khi chưa chọn, dùng tiếng Anh nếu trình duyệt là tiếng Anh, còn lại là tiếng Việt.
  - Sửa test liên quan, nhất là `frontend/e2e/english.spec.ts` (đang kiểm tra "lần đầu là tiếng Anh") và các test Vitest dựa vào mặc định.
  - Cập nhật DESIGN.md §7.1.
- **Tiêu chí xong:** trình duyệt `vi-VN` hoặc không rõ ngôn ngữ mở ra tiếng Việt; `en-US` mở ra tiếng Anh; lựa chọn đã lưu vẫn được tôn trọng.
- **Cỡ:** S. **Spec:** Không. **Đề xuất:** Duy Anh.

### G1-08 Khoá "Lặp lại hằng tháng" khi tự chia

- **Việc:** `ExpenseForm.tsx`: ô định kỳ bị khoá khi đang ở "Tự chia", kèm dòng "Khoản định kỳ chỉ chia đều được". Đổi sang tự chia khi ô đang bật thì tắt ô và báo.
- **Tiêu chí xong:** Vitest không thể lưu tự chia kèm định kỳ; không còn lỗi lúc bấm Lưu cho trường hợp này.
- **Cỡ:** S. **Spec:** Không. **Đề xuất:** Tiến. **Phụ thuộc:** G1-02.

### G1-09 "Tôi đã chuyển" thành nút chính của người nợ

- **Việc:** trên Tổng quan, khi mình đang nợ, đặt nút "Tôi đã chuyển {số tiền} cho {tên}" ngay dưới khối số tiền, kiểu nút chính. Danh sách bên dưới giữ nguyên cho các cặp khác.
- **Tiêu chí xong:** Vitest người nợ thấy nút chính; chủ nợ không thấy; luồng báo chuyển không đổi.
- **Cỡ:** M. **Spec:** Không (cập nhật DESIGN.md §6.2). **Đề xuất:** Tiến.

### G1-10 Nhập liệu gọn hơn

- **Việc:**
  - Danh sách Chi tiêu: mô tả dài chỉ hiện 2 dòng (`line-clamp`), mở đủ khi bấm vào khoản.
  - Số tiền trên 50.000.000đ: hỏi lại "Số tiền lớn bất thường, bạn chắc chứ?" trước khi lưu.
  - Tự chia: điền sẵn phần chia đều khi mở; các ô phần có phân cách hàng nghìn và dòng "= 100.000đ" như ô tổng.
- **Tiêu chí xong:** Vitest cho cả ba; ảnh 360 px với mô tả 120 ký tự chỉ cao 2 dòng.
- **Cỡ:** M. **Spec:** Không. **Đề xuất:** Duy Anh.

### G1-11 Ẩn khung Gõ nhanh khi AI chưa bật

- **Việc:**
  - Backend: `/api/version` (`app/routers/system.py`) thêm `"ai": true/false` theo việc có `GEMINI_API_KEY`.
  - Frontend: chưa bật thì gập khung, chỉ hiện một dòng nhỏ "Gõ nhanh bằng AI chưa được bật trên máy chủ này".
- **Tiêu chí xong:** pytest cho trường `ai`; Vitest khung bị gập khi `ai` là false.
- **Cỡ:** S. **Spec:** Không. **Đề xuất:** Minh.

### G1-12 Rà câu chữ

- **Việc:**
  - Ô trống báo "Nhập tên nhà", "Nhập số tiền" thay vì quy tắc độ dài; bỏ câu lặp giữa gợi ý và lỗi ở trang đăng ký.
  - Tiếng Anh dùng thống nhất "house"; "Take back" thành "Withdraw the notice".
  - "Nhắc ngày…" thành "Hiện trên Tổng quan từ ngày…"; "Trang đã cập nhật" thành "Số dư đã đổi, đang tải lại…".
  - Rút gọn lời giải thích giới tính.
- **Tiêu chí xong:** sửa trong `frontend/src/i18n/vi.tsx` và `en.tsx`, test chuỗi liên quan cập nhật, DESIGN.md §7 khớp.
- **Cỡ:** S. **Spec:** Không. **Đề xuất:** Duy Anh.

## 3. Đợt 2: tiền và người

Mục tiêu: không còn tình huống tiền bị kẹt hay hiểu sai. Tổng khoảng 8 đến 10 ngày công.

### G2-01 Rời nhà khi còn số dư (L3)

- **Việc:**
  - `app/routers/households.py` (leave): tính số dư của người rời; khác 0 hoặc còn thông báo chuyển tiền đang chờ thì trả `409 balance_open` kèm số tiền.
  - Trang Thành viên: nút "Rời nhà" giải thích còn bao nhiêu chưa xong và dẫn tới phần trả nợ.
  - Áp dụng tương tự khi chủ nhà "Bỏ quyền vào nhà" một người còn số dư: cảnh báo rõ, cho phép tiếp tục nhưng ghi lại.
  - ACCOUNTS.md thêm quy tắc mới.
- **Tiêu chí xong:** pytest: rời khi số dư 0 thì được, khác 0 thì 409; Vitest hiển thị thông báo; E2E rời nhà sau khi đã trả xong.
- **Cỡ:** L. **Spec:** Có (gộp với G2-02). **Đề xuất:** Minh.

### G2-02 Chuyển quyền chủ nhà

- **Việc:** `POST /api/households/{id}/owner {user_id}` (chỉ chủ nhà, người nhận phải là thành viên); giao diện trên Thành viên; sau khi chuyển, chủ cũ rời nhà được.
- **Tiêu chí xong:** pytest quyền và trường hợp người nhận không hợp lệ; E2E chuyển rồi chủ cũ rời.
- **Cỡ:** L. **Spec:** Có. **Đề xuất:** Minh. **Phụ thuộc:** G2-01.

### G2-03 Báo chuyển khác số và thông báo bị cũ (L7)

- **Việc:**
  - Cho người nợ báo số tiền thực tế (nhỏ hơn hoặc bằng số đang nợ người đó), kèm ghi chú tuỳ chọn. Quy tắc S3 trong ACCOUNTS.md đổi theo.
  - Khi khoản nợ đổi sau khi báo: dòng hiện "Đã báo 2.286.500đ, còn thiếu 60.000đ" và nút "Báo thêm".
  - Giải thích ngắn rằng gợi ý chuyển tiền đã gộp nợ cả nhà.
- **Tiêu chí xong:** pytest các số hợp lệ và không hợp lệ, người nhận xác nhận đúng số đã báo; Vitest phần còn thiếu; E2E báo thiếu rồi báo thêm.
- **Cỡ:** XL. **Spec:** Có. **Đề xuất:** Tiến.

### G2-04 Chống ghi trùng khi mạng chập chờn (L8)

- **Việc:**
  - Migration bảng `request_keys (user_id, key, response, created_at)`, xoá sau 24 giờ.
  - `POST` khoản chi và khoản trả nợ nhận header `Idempotency-Key`; gặp lại khoá cũ thì trả lại kết quả cũ.
  - `frontend/src/api/client.ts` tạo khoá cho mỗi lần bấm Lưu, giữ nguyên khi thử lại.
- **Tiêu chí xong:** pytest gửi hai lần cùng khoá chỉ tạo một bản ghi; khoá khác tạo hai.
- **Cỡ:** L. **Spec:** Có. **Đề xuất:** Minh.

### G2-05 Hoàn tác và hỏi lại cho thao tác rủi ro

- **Việc:**
  - Xoá khoản chi: toast "Đã xoá … · Hoàn tác" trong 7 giây (tạo lại khoản với dữ liệu cũ), thay cho chỉ hỏi `confirm()`.
  - "Đổi mã mới": hỏi lại "Mã cũ trong nhóm chat sẽ không dùng được nữa".
- **Tiêu chí xong:** Vitest hoàn tác tạo lại đúng khoản; đổi mã cần xác nhận.
- **Cỡ:** M. **Spec:** Không. **Đề xuất:** Duy Anh. **Phụ thuộc:** G2-10 (hộp xác nhận chung) nếu làm sau.

### G2-06 Người được mời biết mình vào đâu

- **Việc:**
  - `GET /api/invites/{code}`: trả tên nhà và tên chủ nhà, chung giới hạn đoán mã J2, mã sai trả như hiện nay.
  - Trang mời và thẻ "Đang chờ duyệt" hiện "Bạn đang xin vào Nhà trọ Q7 của Tiến".
  - Đang chờ thì hỏi lại mỗi 10 giây khi trang đang mở.
  - Bị từ chối: giữ một dòng kết quả để báo "Yêu cầu chưa được duyệt" (ACCOUNTS.md D4 đổi theo).
  - Sau khi đăng ký từ link mời, ẩn form tạo nhà.
- **Tiêu chí xong:** pytest preview và giới hạn đoán mã; E2E người được mời thấy tên nhà và tự vào khi được duyệt.
- **Cỡ:** L. **Spec:** Có. **Đề xuất:** Tiến.

### G2-07 Trang Nhà của bạn có thông tin

- **Việc:** `GET /api/households` thêm số dư của mình và số việc chờ (yêu cầu vào nhà, thông báo chuyển tiền) cho mỗi nhà; `HouseholdList.tsx` hiện số dư và huy hiệu; máy tính xếp lưới 2 đến 3 cột; sửa chip "Trưởng nhóm" dính sát tên.
- **Tiêu chí xong:** pytest dữ liệu mới; Vitest thẻ nhà; ảnh 360 px và 1440 px.
- **Cỡ:** M. **Spec:** Không. **Đề xuất:** Duy Anh.

### G2-08 Nhà mới và nhà một người

- **Việc:** Tổng quan của nhà một người thay khối số 0 bằng thẻ "Mời bạn cùng phòng" (mã mời và nút chia sẻ), ẩn các khối chưa có dữ liệu.
- **Tiêu chí xong:** Vitest nhà một người thấy thẻ mời, nhà nhiều người không thấy.
- **Cỡ:** S. **Spec:** Không. **Đề xuất:** Duy Anh.

### G2-09 Các lỗi nhỏ còn lại (L9 đến L12)

- **L9:** nhãn "chia đều x người" tính theo người tham gia của chính khoản đó; báo cáo không hiện dòng 0đ cho người chưa vào nhà trong tháng đó.
- **L10:** khoá các ô của form khi đang lưu.
- **L11:** ẩn "Huỷ thông báo" khi chủ nhà đã báo chưa nhận; chỉ giữ một chỗ "Hoàn tác".
- **L12:** báo cáo của tháng không có dữ liệu hiện chính tháng đó với dòng "chưa có dữ liệu" thay vì tự nhảy.
- **Tiêu chí xong:** mỗi lỗi một test Vitest.
- **Cỡ:** M. **Spec:** Không. **Đề xuất:** Duy Anh và Minh chia đôi.

### G2-10 Thiết kế

- **Hộp xác nhận chung** thay `confirm()` của trình duyệt (xoá khoản chi, xoá khoản trả, bỏ quyền vào nhà, đổi mã mời), theo phong cách sticker, có focus và Escape.
- **Tổng quan nhà đông người:** phần của mình lên đầu; "Tháng này", "Số dư từng người", "Lịch sử" gập lại được, nhớ trạng thái.
- **Thành viên:** "Đổi tên nhà" thành nút phụ; "Bỏ quyền vào nhà" vào menu của từng người; hai nút sao chép mã cùng bề rộng.
- **Màu avatar của mình:** một màu cố định cho mình ở mọi nhà và trang hồ sơ.
- **Hồ sơ:** link "‹ Nhà của bạn", nút "Hiện" cho ô mật khẩu, hai cột trên máy tính.
- **Bảng Chi tiêu trên máy tính:** cột "Nội dung" rộng hơn, cách chia và danh mục xuống dòng phụ.
- **Trạng thái dài:** bấm vào để xem đủ (không chỉ dựa vào `title`).
- **Tiêu chí xong:** ảnh trước và sau ở 360 px và 1440 px trong PR; DESIGN.md cập nhật; a11y spec vẫn xanh.
- **Cỡ:** XL (tách 3 PR). **Spec:** Không, nhưng phác thảo trước trong PR đầu. **Đề xuất:** Tiến và Duy Anh.

### G2-11 Bàn phím và trình đọc màn hình

- **Việc:** link "Bỏ qua tới nội dung"; đổi trang thì focus vào h1 và đổi tiêu đề tab; bấm Sửa khoản chi thì focus vào form; số giây chờ AI ra khỏi `aria-live`; toast có hoàn tác không tự mất khi đang focus; bỏ chữ cái avatar khỏi tên đọc của radio và dòng khoản chi.
- **Tiêu chí xong:** Vitest cho focus và tên đọc; a11y spec thêm kiểm tra link bỏ qua.
- **Cỡ:** M. **Spec:** Không. **Đề xuất:** Duy Anh.

### G2-12 Khoản định kỳ dễ dùng lâu dài

- **Việc:** sửa khoản định kỳ (số tiền, ngày, người tham gia) thay vì ngưng rồi tạo lại; danh sách tháng trước bị quên ghi hiện "quá hạn" trên Tổng quan.
- **Tiêu chí xong:** pytest sửa và quyền; Vitest tháng quá hạn; E2E sửa tiền nhà.
- **Cỡ:** L. **Spec:** Có. **Đề xuất:** Minh.

## 4. Đợt 3: tính năng mới

Mỗi gói ở đây chạy Spec Kit riêng. Ước lượng là cho bản đầu tiên dùng được.

| Mã | Tính năng | Việc chính | Lưu ý | Cỡ | Đề xuất |
|---|---|---|---|---|---|
| G3-01 | Lấy lại mật khẩu | Bảng mã đặt lại (băm, hết hạn 30 phút, dùng một lần); gửi email qua một dịch vụ HTTPS miễn phí; trang đặt lại mật khẩu; giới hạn số lần | Render miễn phí chặn SMTP; cần khoá API trong Render (không vào repo); mở rộng phạm vi trong PROJECT_SPEC §3.3 | XL | Minh |
| G3-02 | VietQR | Hồ sơ thêm ngân hàng, số tài khoản, tên chủ tài khoản (chỉ bạn cùng nhà thấy); nút "Mở mã QR" trên dòng chuyển tiền, tạo chuỗi VietQR ngay trên trình duyệt kèm số tiền và nội dung | Không gửi số tài khoản ra dịch vụ ngoài; vẫn giữ bước người nhận xác nhận | L | Tiến |
| G3-03 | Chia sẻ qua Zalo | Nút chia sẻ (Web Share API, có sao chép dự phòng) cho tin nhắc nợ và tổng kết tháng | Dùng lại cách chia sẻ link mời đã có | M | Duy Anh |
| G3-04 | Cài app (PWA) | `manifest.webmanifest`, icon 192 và 512, service worker lưu bản đọc gần nhất khi mất mạng | Chưa cho ghi khi mất mạng ở bản đầu | L | Duy Anh |
| G3-05 | Header bảo mật | CSP, `frame-ancestors 'none'`, `Referrer-Policy` cho static site (cấu hình header của Render) | Thử kỹ để CSP không chặn API và ảnh `data:` | S | Minh |
| G3-06 | Giữ API sống và tự khắc phục | Keep-alive gọi `/health` mỗi 10 phút từ 7 giờ tới 23 giờ; fail 2 lần liền thì gọi lại deploy hook và mở issue | Kiểm tra hạn mức giờ chạy miễn phí của Render trước | S | Tiến |
| G3-07 | Lịch sử và xuất dữ liệu | Chọn tháng nhanh ở Chi tiêu và báo cáo; CSV theo bộ lọc, thêm khoản trả nợ và bảng số dư | | M | Duy Anh |
| G3-08 | Ảnh hoá đơn | Đính kèm một ảnh vào khoản chi, dùng lại cách kiểm tra và lưu ảnh của ảnh đại diện | Mở rộng phạm vi ảnh trong PROJECT_SPEC §3.3; tính lại dung lượng 500 MB | XL | Tiến |
| G3-09 | Chia theo món, ngân sách | Nhập từng món và người ăn; ngân sách tháng theo danh mục | Ít cấp bách nhất | XL | để sau |

## 5. Gom thành PR

| PR | Gói | Ghi chú |
|---|---|---|
| PR-A | G1-01, G1-05 | Giao diện Tổng quan và bộ lọc |
| PR-B | G1-02, G1-08, G1-10 | Form ghi khoản chi |
| PR-C | G1-03, G1-04, G1-11 | AI và định kỳ, có một thay đổi nhỏ ở backend |
| PR-D | G1-06 | Màn hình chờ máy chủ |
| PR-E | G1-07, G1-12 | Ngôn ngữ và câu chữ, sửa test tiếng Anh |
| PR-F | G1-09 | Nút chính của người nợ |
| PR-G | G2-01, G2-02 | Spec "vòng đời thành viên" |
| PR-H | G2-03 | Spec "báo chuyển khác số" |
| PR-I | G2-04 | Spec "chống ghi trùng" |
| PR-J | G2-05, G2-10 (hộp xác nhận) | Hoàn tác và hộp xác nhận chung |
| PR-K | G2-06 | Spec "lời mời rõ ràng" |
| PR-L | G2-07, G2-08 | Nhà của bạn và nhà mới |
| PR-M | G2-09 | Lỗi nhỏ |
| PR-N, O | G2-10 còn lại | Thiết kế, tách theo trang |
| PR-P | G2-11 | Truy cập |
| PR-Q | G2-12 | Spec "khoản định kỳ" |
| Đợt 3 | Mỗi gói một PR | Theo thứ tự ưu tiên ở mục 4 |

## 6. Thứ tự và phân công

**Đợt 1 chia thành hai spec theo vùng code, để hai người build song song không sửa chung file**

| Spec | Người build | Gói | File chính |
|---|---|---|---|
| `011-first-impressions` | Tiến | G1-02, G1-08, G1-10 phần form (cảnh báo số lớn, điền sẵn tự chia), G1-03, G1-04, G1-11, G1-06 | `ExpenseForm.tsx`, `AiComposer.tsx`, `RecurringList.tsx`, `api/client.ts`, `app/routers/system.py` |
| `012-overview-and-lists` | Duy Anh | G1-01, G1-09, G1-05, G1-10 phần danh sách (cắt mô tả 2 dòng), G1-07, G1-12, G2-07, G2-08 | `VerdictBlock.tsx`, `DashboardPage.tsx`, `ExpensesPage.tsx` (bộ lọc), `ExpenseList.tsx`, `HouseholdList.tsx`, `i18n/language.ts`, `i18n/vi.tsx`, `i18n/en.tsx` |

- Spec `012` do Tiến viết sẵn spec, plan và tasks để Duy Anh chỉ việc build theo tasks; Duy Anh mở PR, Tiến review.
- Chỗ chạm chung duy nhất là file chuỗi `i18n/vi.tsx`, `i18n/en.tsx`: mỗi bên chỉ thêm khoá mới trong khối của mình (`profile`, `form`, `ai` cho Tiến; `verdict`, `expenses`, `households`, `errors` cho Duy Anh), merge PR nào trước thì PR sau rebase.
- Duy Anh gộp `012` thành 3 PR: PR-A (G1-01, G1-09, G2-08: Tổng quan), PR-E (G1-07, G1-12: ngôn ngữ và câu chữ), PR-L (G1-05, G1-10 danh sách, G2-07: danh sách và Nhà của bạn).
- Minh: review cả hai spec; bắt đầu spec `013` (G2-01, G2-02 vòng đời thành viên).

Cuối tuần 1: một buổi kiểm tra lại toàn app trên điện thoại thật (Duy Anh viết biên bản QA như `docs/qa/2026-11-07-duy-anh.md`).

**Tuần 2 và 3 (đợt 2)**

- Minh: G2-01, G2-02, G2-04, G2-12.
- Tiến: G2-03, G2-06, phần thiết kế Tổng quan của G2-10.
- Duy Anh: G2-05, G2-09, G2-11, phần còn lại của G2-10 (G2-07 và G2-08 đã chuyển lên spec `012`).

**Sau đó (đợt 3)** theo thứ tự: G3-06 và G3-05 (nhỏ, giảm rủi ro), G3-01, G3-02, G3-03, G3-04, G3-07, rồi G3-08, G3-09 nếu còn thời gian.

## 7. Phụ thuộc chính

```text
G1-02 ──> G1-08
G2-01 ──> G2-02
G2-10 (hộp xác nhận) ──> G2-05 (nếu muốn dùng hộp chung thay confirm())
G1-11 (cờ ai trong /api/version) độc lập
G3-01 cần khoá API email trong Render trước khi bắt đầu
G3-08 cần chốt mở rộng phạm vi ảnh trước khi viết spec
```

## 8. Rủi ro cần để ý

| Rủi ro | Ảnh hưởng | Cách giảm |
|---|---|---|
| Đổi ngôn ngữ mặc định làm hỏng nhiều test đang giả định tiếng Anh | CI đỏ hàng loạt | Làm G1-07 trong PR riêng, sửa test cùng lúc |
| Đổi quy tắc S3 (báo chuyển khác số) chạm vào số dư | Sai tiền | Spec kỹ, test bảng các trường hợp, review hai người |
| Keep-alive gọi dày hơn có thể hết giờ chạy miễn phí | API ngừng cuối tháng | Tính số giờ trước, chỉ gọi ban ngày |
| Gửi email cho lấy lại mật khẩu | Cần dịch vụ ngoài và khoá bí mật | Chọn dịch vụ miễn phí không cần thẻ, khoá nằm trong Render |
| Thêm ảnh hoá đơn | Database miễn phí 500 MB | Giới hạn kích thước như ảnh đại diện, trần tổng riêng |
