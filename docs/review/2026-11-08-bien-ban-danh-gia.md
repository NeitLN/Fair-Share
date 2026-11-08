# Biên bản đánh giá sản phẩm Fair-Share

| | |
|---|---|
| Ngày | 08/11/2026 |
| Phiên bản | `main` tại `e1ebaa1` (sau #231), bản local và bản live |
| Người yêu cầu | Võ Việt Tiến (trưởng nhóm) |
| Phạm vi | Toàn bộ app: đăng ký, vào nhà, ghi khoản chi, chia tiền, trả nợ, báo cáo, thành viên, hồ sơ, giao diện điện thoại và máy tính, tiếng Việt và tiếng Anh |
| Mục đích | Tìm chỗ chưa tốt, chỗ thiết kế chưa đẹp, nên sửa gì và nên thêm gì. Không xét hạn nộp bài |

## 1. Cách đánh giá

Có ba nguồn độc lập, sau đó từng phát hiện quan trọng được kiểm tra lại trên code hoặc trên ảnh chụp trước khi ghi vào đây.

1. **Đóng vai người dùng trên trình duyệt thật.** Dùng Playwright điều khiển trình duyệt Edge trên bản local, đi qua 6 vai (bảng ở mục 2), chụp khoảng 60 ảnh ở 360 px và 1440 px, cả chế độ sáng, tối và tiếng Anh. Thử thêm các trường hợp xấu: mô tả rất dài, số tiền 999.999.999.999đ, gõ bậy vào ô số tiền, trang không tồn tại, dùng bàn phím đi qua form.
2. **Đọc code dưới góc nhìn người dùng.** Đi lại từng luồng trong code (trang, component, câu chữ vi/en, CSS, API, ACCOUNTS.md, DESIGN.md) cho 5 vai, chỉ ra lỗi kèm dòng code.
3. **Kiểm tra kỹ thuật trên bản live.** Tốc độ API, dung lượng tải trang, header bảo mật, khả năng cài app về máy, và sự cố API sáng 08/11.

Các mục có ghi "đã kiểm chứng" là đã được đối chiếu trực tiếp với code hoặc ảnh. Các mục còn lại là phát hiện của một nguồn, hợp lý nhưng chưa tái hiện lại.

## 2. Các vai đã thử

| Vai | Hoàn cảnh | Màn hình |
|---|---|---|
| Người mới | Đăng ký, nhà trống, tạo nhà, gửi mã mời | Điện thoại 360 px |
| Người được mời | Mở link mời từ Zalo, đăng ký, chờ duyệt, được duyệt | Điện thoại |
| Tiến, chủ nhà | Tổng quan, ghi khoản chi (chia đều, tự chia, danh mục, định kỳ), lọc, sửa, xoá, báo cáo tháng, thành viên, hồ sơ | Điện thoại |
| Lan, người đang nợ | Xem vì sao nợ, bấm "Tôi đã chuyển", chủ nhà xác nhận hoặc báo chưa nhận | Điện thoại |
| Người dùng máy tính | Các trang chính ở chế độ tối | 1440 px |
| Người dùng tiếng Anh | Các trang chính | Điện thoại |

## 3. Tóm tắt

App đã làm tốt phần lõi: tiền tính bằng số nguyên, chia đúng tới từng đồng, "Vì sao ra số này?" giải thích rõ, luồng "Tôi đã chuyển" có người nhận xác nhận và có hoàn tác, AI chỉ điền form chứ không tự lưu, dùng bàn phím tốt, không nút nào dưới 44 px, chế độ tối có độ tương phản tốt.

Những điểm yếu lớn nhất còn lại, theo thứ tự ảnh hưởng tới người dùng thật:

1. **Ấn tượng đầu tiên khi API đang ngủ.** Bản miễn phí ngủ sau khoảng 15 phút, người mở app phải chờ khoảng 50 giây mà trang chỉ hiện "Đang tải…". Sáng 08/11 API còn treo hẳn hơn 7 tiếng, phải deploy lại mới chạy.
2. **Màn hình chính bị lỗi hiển thị ở đúng cỡ điện thoại mục tiêu.** Dòng "Bạn được nhận từ 4 người" bị dãy avatar che chữ ở 360 px.
3. **Lưu thất bại mà người dùng không biết.** Khi form có lỗi, thông báo nằm khuất dưới nút Lưu.
4. **Vòng đời thành viên còn thiếu.** Rời nhà khi còn tiền chưa xong, người vào giữa tháng, chuyển quyền chủ nhà đều chưa được xử lý trọn vẹn.
5. **Báo chuyển tiền chỉ nhận đúng con số gợi ý.** Chuyển thiếu, chuyển khác số, hay khoản nợ đổi sau khi báo đều làm thông tin bị lệch.
6. **Không có cách lấy lại mật khẩu.**

## 4. Lỗi cần sửa

| ID | Mức | Vấn đề | Chỗ | Hướng sửa |
|---|---|---|---|---|
| L1 | Cao | Ở 360 px, chữ trong khối "Bạn được nhận / Bạn cần trả" bị dãy avatar che (chữ kết thúc ở x=191, avatar bắt đầu ở x=176). Đã kiểm chứng trên ảnh | Tổng quan, `VerdictBlock`, CSS `.verdict` | Dưới 380 px đưa dãy avatar lên trên câu hoặc thu nhỏ; giảm cỡ số tiền xuống 36 px như DESIGN.md quy định |
| L2 | Cao | Lưu khoản chi có lỗi (tự chia chưa đủ, định kỳ với tự chia) thì thông báo nằm dưới nút Lưu dính, focus nhảy sang tab "Tự chia". Người dùng tưởng app không phản hồi. Đã kiểm chứng trên ảnh | `ExpenseForm` | Khi lưu lỗi, cuộn tới và focus vào dòng lỗi, đặt lỗi phía trên nút Lưu |
| L3 | Cao | Rời nhà không kiểm tra số dư. Người rời nếu đang được nợ thì không còn vào được để bấm "Đã nhận", và chủ nhà cũng không ghi hộ được. Đã kiểm chứng trong code | `households.py` (leave), `settlements.py` | Chặn rời khi còn số dư hoặc thông báo chờ, hoặc giữ quyền hạn chế để xử lý nốt tiền |
| L4 | Trung bình | Nhấn Enter trong ô Gõ nhanh vẫn gửi tiếp khi đang chờ AI, dù nút đã khoá. Gửi trùng nhiều lần, tốn lượt AI. Đã kiểm chứng trong code | `AiComposer.tsx`, hàm `read()` | Chặn ngay trong `read()` khi đang đọc |
| L5 | Trung bình | Ngưng khoản định kỳ thất bại thì không báo gì, nút chỉ bật lại. Đã kiểm chứng trong code | `ExpensesPage.tsx`, `stop` | Hiện lỗi cạnh khoản định kỳ đó |
| L6 | Trung bình | Từ báo cáo một tháng không có khoản chi, bấm "Xem các khoản chi tháng này" thì danh sách mất bộ lọc tháng, hiện cả tháng khác. Đã kiểm chứng trong code | `ExpensesPage.tsx` (lọc tháng chỉ giữ khi tháng có khoản chi) | Giữ bộ lọc và hiện trạng thái trống đúng nghĩa |
| L7 | Trung bình | Thông báo "Tôi đã chuyển" giữ số cũ khi khoản nợ thay đổi. Lan báo 2.286.500đ, sau đó nợ thành 2.346.500đ nhưng dòng của Lan vẫn ghi "Đã báo, chờ xác nhận" như thể đã đủ. Đã kiểm chứng trên ảnh | Tổng quan, notices | Hiện "Đã báo 2.286.500đ, còn thiếu 60.000đ" và mời cập nhật |
| L8 | Trung bình | Ghi tiền khi mạng chập chờn có thể bị trùng: server đã lưu nhưng phản hồi mất, người dùng bấm lại thì thêm một khoản nữa | `expenses.py`, `settlements.py` | Gửi kèm mã yêu cầu (idempotency key) và bỏ qua yêu cầu trùng |
| L9 | Trung bình | Khoản cũ đổi nhãn khi có người mới vào: chi tháng 10 thành "chia đều 5/6 người", người vào tháng 11 có dòng 0đ trong tháng 10 | Chi tiêu, báo cáo | Tính "x người" theo người tham gia của chính khoản đó, ẩn dòng 0đ của người chưa vào |
| L10 | Trung bình | Đang lưu mà sửa tiếp thì nội dung vừa sửa bị xoá khi lưu xong | `ExpenseForm` (reset sau khi lưu) | Khoá các ô khi đang gửi |
| L11 | Thấp | Sau khi chủ nhà báo "Chưa nhận được", nút "Huỷ thông báo" vẫn nằm trên dòng của Lan; sau khi xác nhận, "Hoàn tác" xuất hiện hai lần | Tổng quan | Ẩn nút không còn ý nghĩa, chỉ giữ một chỗ hoàn tác |
| L12 | Thấp | Mở `/report/2026-09` hay `/report/2027-05` thì tự nhảy sang tháng gần nhất có dữ liệu mà không nói gì | Báo cáo tháng | Hiện tháng được hỏi kèm "Tháng này chưa có dữ liệu" |

## 5. Trải nghiệm và câu chữ

**Người mới và người được mời**

- Ngôn ngữ mặc định là tiếng Anh (`language.ts`), trong khi người dùng là sinh viên Việt mở link trong Zalo. Nên lấy theo ngôn ngữ trình duyệt, mặc định tiếng Việt. Đã kiểm chứng trong code.
- Người được mời không thấy tên nhà hay tên chủ nhà ở trang mời và lúc chờ duyệt, chỉ thấy ngày.
- Sau khi đăng ký từ link mời, form "Chưa ai tạo nhà?" vẫn nằm cạnh form vào nhà, dễ bấm nhầm tạo nhà mới.
- Lúc chờ duyệt không tự cập nhật nhanh: 20 giây sau khi được duyệt vẫn ghi đang chờ, phải bấm "Kiểm tra lại".
- Bị từ chối thì yêu cầu biến mất, không có câu "chưa được duyệt".
- Nhà một người hiện Tổng quan toàn số 0. Việc nên làm tiếp là mời bạn cùng phòng, nhưng trang lại gợi ý "Ghi khoản đầu tiên".

**Chủ nhà dùng hằng ngày**

- "Lặp lại hằng tháng" chỉ dùng được với chia đều, nhưng ô vẫn bấm được khi đang tự chia, tới lúc lưu mới báo.
- Khoản định kỳ không sửa được (đổi tiền nhà, ngày, người tham gia phải ngưng rồi tạo lại). Tháng trước bị quên không hiện thành "quá hạn".
- "Đổi mã mới" làm mã cũ hết hiệu lực ngay, không hỏi lại, trong khi link cũ có thể đang nằm trong nhóm chat.
- Xoá khoản chi chỉ hỏi bằng hộp `confirm()` của trình duyệt rồi biến mất, không có thông báo và không hoàn tác. Lưu, sửa, xác nhận trả tiền thì đều có.
- Số tiền 999.999.999.999đ lưu được mà không cảnh báo. Nên hỏi lại khi số lớn bất thường, ví dụ trên 50 triệu.
- Tự chia bắt đầu mọi phần bằng 0, không điền sẵn phần chia đều, các ô không có dấu phân cách hàng nghìn hay dòng "= 100.000đ" như ô tổng.
- Xuất CSV luôn xuất tất cả khoản chi, bỏ qua bộ lọc và không có khoản trả nợ.
- Khi AI chưa bật, cả khung Gõ nhanh vẫn hiện, chỉ báo "chưa được bật" sau khi bấm, bằng màu hồng như lỗi.

**Người đang nợ**

- "Tôi đã chuyển" là việc chính của người nợ nhưng lại là nút viền nhỏ trong danh sách. Nên là nút chính ngay dưới khối số tiền.
- Chỉ báo được đúng số tiền gợi ý cho đúng người. Chuyển thiếu hoặc chuyển khác số thì không báo được, chỉ người nhận ghi tay được.
- Nên giải thích rằng gợi ý chuyển tiền đã gộp nợ cả nhà, nên người nhận có thể không phải người đã trả khoản gốc.

**Câu chữ**

- Ô trống báo theo quy tắc độ dài ("Tên nhà phải từ 1 đến 60 ký tự") thay vì "Nhập tên nhà". Trang đăng ký có gợi ý và lỗi nói cùng một ý hai lần.
- Tiếng Anh lẫn "group", "household", "house". "Take back" nên rõ hơn: "Withdraw the notice".
- "Nhắc ngày…" nghe như app sẽ nhắc, trong khi app không gửi thông báo nào. Nên là "Hiện trên Tổng quan từ ngày…".
- "Trang đã cập nhật" hơi hứa quá khi việc tải lại có thể còn đang chạy.
- Lời giải thích giới tính hơi dài.

**Bàn phím và trình đọc màn hình**

- Chưa có link "Bỏ qua tới nội dung"; đổi trang không chuyển focus; tiêu đề tab không đổi theo trang.
- Bấm Sửa một khoản chi thì cuộn tới form nhưng focus không theo.
- Số giây chờ AI nằm trong vùng `aria-live`, có thể bị đọc mỗi giây.
- Toast có nút hoàn tác tự mất sau 7 giây, không dừng khi đang focus.
- Tên đọc của radio người trả và dòng khoản chi có lẫn chữ cái avatar ("T Tiến (bạn)").

## 6. Thiết kế giao diện

| Mức | Chỗ | Vấn đề | Đề xuất |
|---|---|---|---|
| Cao | Tổng quan 360 px | Avatar che chữ trong khối chính (L1) | Avatar lên trên câu ở màn hẹp |
| Trung bình | Tổng quan nhà 8 người | Quá nhiều khối lặp lại: chuyển tiền, định kỳ, mới ghi, 8 dòng tháng, 8 dòng số dư, lịch sử | Đưa phần của mình lên đầu, gập phần cả nhà |
| Trung bình | Nhà của bạn | Thẻ nhà chỉ có tên và "Trưởng nhóm", không có số dư hay số yêu cầu chờ. Trên máy tính hai phần ba màn hình trống. Trên điện thoại chip dính sát tên | Thêm số dư và huy hiệu chờ, dùng lưới trên máy tính |
| Trung bình | Chi tiêu, điện thoại | Mô tả 120 ký tự làm một dòng cao khoảng 17 dòng | Cắt còn 2 dòng, bấm để xem đủ |
| Trung bình | Báo cáo trên máy tính | 6 cột tiền không xuống dòng, có thể tràn ở 1024 px với số lớn | Vùng cuộn ngang riêng cho bảng |
| Thấp | Thành viên | "Đổi tên nhà" là nút nặng nhất trang; nút đỏ "Bỏ quyền vào nhà" lặp lại ở mọi dòng; hai nút sao chép mã mời khác bề rộng | Hạ "Đổi tên nhà" xuống nút phụ, đưa "Bỏ quyền" vào menu của từng người |
| Thấp | Toàn app | Hộp `confirm()` của trình duyệt trông lạc lõng so với phong cách sticker | Hộp xác nhận riêng theo DESIGN.md |
| Thấp | Toàn app | Màu avatar của chính mình đổi giữa các nhà và trang hồ sơ (vàng, xanh bạc hà, hồng) | Màu riêng theo tài khoản ở trang hồ sơ, hoặc giữ một màu cho mình |
| Thấp | Hồ sơ | Không có link quay lại "‹ Nhà của bạn", ô mật khẩu không có nút "Hiện", trên máy tính chỉ một cột | Thêm link quay lại và nút hiện mật khẩu |
| Thấp | Chi tiêu trên máy tính | Cột "Nội dung" hẹp, ô người trả gánh cả cách chia và danh mục nên xuống 3 dòng | Chia lại độ rộng cột |
| Thấp | Thành viên | Trạng thái dài bị cắt, chỉ xem được bằng cách di chuột (không dùng được trên điện thoại) | Bấm vào để mở đủ |

## 7. Kỹ thuật và vận hành

| Mức | Vấn đề | Đề xuất |
|---|---|---|
| Cao | API miễn phí ngủ sau khoảng 15 phút, mở lại phải chờ khoảng 50 giây. Keep-alive chỉ chạy lúc 08:00 để giữ Supabase, không giữ API thức. Trang chỉ hiện "Đang tải…", không giải thích. Đã kiểm chứng | Sau 5 giây chờ, hiện "Máy chủ đang khởi động, chờ khoảng 1 phút"; có thể cho keep-alive gọi `/health` mỗi 10 phút trong giờ ban ngày nếu hạn mức miễn phí cho phép |
| Cao | Sáng 08/11 API treo từ khoảng 06:50 tới 14:30 dù Render và Supabase đều báo bình thường; deploy lại thì chạy ngay. Đã kiểm chứng | Khi keep-alive fail, tự chạy lại deploy hook hoặc mở issue báo cho nhóm; ghi cách xử lý vào README |
| Trung bình | Trang web thiếu header CSP, frame-ancestors, Referrer-Policy, trong khi token đăng nhập nằm trong localStorage. Đã kiểm chứng | Thêm header cho static site trên Render |
| Trung bình | Không cài được app về màn hình chính (chưa có web manifest, chỉ có apple-touch-icon). Đã kiểm chứng | Thêm manifest và icon để thành PWA |
| Thấp | Không có thời gian chờ tối đa cho request, không phân biệt mất mạng và lỗi máy chủ, nháp form mất khi tải lại trang | Thêm timeout, thông báo mất mạng, lưu nháp vào localStorage |
| Thấp | JS khoảng 145 KB gzip trong một file. Chấp nhận được; có thể tách trang báo cáo và hồ sơ ra file riêng | Tách code theo trang khi app lớn thêm |

Điểm tốt: API khi đã thức trả lời khoảng 150 ms, trang tải khoảng 1,3 giây, lưu khoảng 0,7 giây, có HSTS và nosniff.

## 8. Nên thêm

Xếp theo giá trị cho sinh viên ở chung.

| Hạng | Tính năng | Vì sao |
|---|---|---|
| 1 | Lấy lại mật khẩu | Quên mật khẩu là mất quyền vào dữ liệu tiền chung; chủ nhà quên thì cả nhà kẹt |
| 2 | Rời nhà có thanh toán cuối, chuyển quyền chủ nhà | Nhà trọ sinh viên đổi người thường xuyên |
| 3 | Báo chuyển khác số tiền, sửa khoản trả nợ có lịch sử | Chuyển thiếu, chuyển nhầm là chuyện hằng ngày |
| 4 | Mã VietQR theo người nhận | Bỏ bước chép số tài khoản; vẫn giữ bước người nhận xác nhận |
| 5 | Chia sẻ nhắc nợ và tổng kết tháng qua Zalo | App đã có chia sẻ link mời, mở rộng ra nhắc nợ rất rẻ |
| 6 | Sửa khoản định kỳ, danh sách tháng bị quên | Tiền nhà, điện nước đổi theo thời gian |
| 7 | Màn hình chờ máy chủ khởi động, lưu nháp, chống ghi trùng | Bảo vệ công sức người dùng khi mạng yếu |
| 8 | Cài app (PWA) và xem khi mất mạng | Mở lại nhanh hơn từ màn hình chính |
| 9 | Chọn tháng nhanh và xuất đủ (gồm khoản trả nợ, số dư) | Lịch sử nhiều tháng dễ tra hơn |
| 10 | Ảnh hoá đơn | Bằng chứng khi tranh cãi; cần mở rộng phạm vi như đã làm với ảnh đại diện |
| 11 | Chia theo món, ngân sách theo danh mục | Hữu ích nhưng ít cấp bách hơn việc thanh toán đúng |

## 9. Nên giữ

- Khối số tiền cùng "Vì sao ra số này?", có nói rõ thông báo đang chờ chưa được tính.
- Ô số tiền đọc được "12,5k", "1tr2", có dòng "= 360.000đ"; gõ bậy thì báo kèm ví dụ.
- Đoán danh mục từ mô tả (trà sữa thành Ăn uống, wifi thành Điện, nước, mạng).
- Dấu "ĐÃ TRẢ" có hoàn tác; luồng "Chưa nhận được".
- AI chỉ điền form, có hoàn tác, không bao giờ tự lưu; chặn khi câu không rõ.
- Tạo nhà xong đưa thẳng tới mã mời; sao chép vẫn chạy khi clipboard bị chặn.
- Bảng báo cáo trên máy tính có dòng "Cả nhà"; bộ lọc có "1/10 khoản", "Bỏ lọc".
- Bàn phím đi đúng thứ tự, vòng focus rõ; không nút nào dưới 44 px; không cuộn ngang; chế độ tối đủ tương phản.
- Trang 404 rõ ràng, có đường quay lại.

## 10. Lộ trình đề xuất

**Đợt 1: sửa nhanh, ảnh hưởng lớn (khoảng 1 đến 2 ngày)**

- L1 avatar che chữ, L2 lỗi lưu không thấy, L4 Enter gửi trùng AI, L5 lỗi ngưng định kỳ, L6 bộ lọc tháng.
- Màn hình chờ máy chủ khởi động (mục 7).
- Ngôn ngữ mặc định tiếng Việt.
- Khoá ô "Lặp lại hằng tháng" khi tự chia, có lý do.
- "Tôi đã chuyển" thành nút chính của người nợ.
- Cắt mô tả dài còn 2 dòng, cảnh báo số tiền lớn, điền sẵn phần tự chia.

**Đợt 2: tiền và người**

- L3 rời nhà khi còn số dư, chuyển quyền chủ nhà.
- L7 thông báo chuyển tiền bị cũ, báo chuyển khác số.
- L8 chống ghi trùng.
- Hoàn tác khi xoá khoản chi, hỏi lại khi đổi mã mời.
- Tên nhà ở trang mời và lúc chờ duyệt.
- Thẻ nhà có số dư và huy hiệu.

**Đợt 3: thêm tính năng**

- Lấy lại mật khẩu (cần một dịch vụ gửi email qua HTTPS vì Render miễn phí chặn SMTP).
- VietQR, chia sẻ Zalo, sửa khoản định kỳ, PWA, header bảo mật.

## Phụ lục

**Ảnh chụp:** thư mục `persona` trong thư mục tạm của phiên làm việc (khoảng 60 ảnh, tên theo vai, ví dụ `p3_01_overview_fold.png` là lỗi L1, `p3_19_custom_mismatch_save.png` là lỗi L2, `p4_01_lan_overview_fold.png` là lỗi L7).

**Dữ liệu thử trên bản local đã thay đổi trong lúc đánh giá:** thêm các tài khoản `moi5659@`, `moi9884@`, `join2675@xem-thu.local`; nhà mới "Phòng 302 KTX khu B"; Phúc vào nhà Q7; khoản "Tiền gas tháng 11"; khoản nợ của Lan đã được xác nhận; mã mời nhà Q7 đã đổi. Bản live không bị thay đổi.
