# Ảnh cho báo cáo §6: Gõ nhanh bằng AI

Chụp trên bản đang chạy (https://fair-share-web.onrender.com) ở khổ 360 px, ngày 22/10/2026. Nhà
"Nhà trọ Q7 (ảnh báo cáo)" chỉ tạo để chụp, có ba người Tiến, Minh, Duy Anh, máy đang là Tiến; nhà đã
được xoá ngay sau khi chụp.

**Thật hay giả lập.** Ảnh 2, 3, 4 là câu trả lời thật của Gemini qua API thật. Ảnh 5 và 6 giả lập câu
trả lời lỗi của API ngay trong trình duyệt, vì không thể chủ động làm Gemini quá tải hay gỡ key trên
bản đang chạy; phần giao diện hiển thị là code thật, chỉ câu trả lời là giả.

| Ảnh | Trạng thái (DESIGN.md §6.3) | Nguồn | Chú thích |
| --- | --- | --- | --- |
| `ai-1-idle.png` | Chờ nhập | Thật | Ô câu, nút "Điền giúp", gợi ý "AI điền form bên dưới, bạn duyệt rồi mới lưu." |
| `ai-2-reading.png` | Đang đọc | Thật, giữ chậm ~6 giây | Thanh tiến trình, số giây đã chờ, "Nhập tay" để bỏ qua. Yêu cầu được giữ lại ~6 giây trước khi gửi để kịp chụp bộ đếm. |
| `ai-3-filled.png` | Đã điền | Gemini thật | "lẩu 240k Minh trả chia đều cả nhà" → Lẩu · 240.000đ · Minh trả · chia đều 3 người. Chưa lưu gì: người dùng duyệt form rồi bấm "Lưu khoản chi", hoặc "Hoàn tác điền". |
| `ai-4-warnings.png` | Đã điền, có cảnh báo | Gemini thật | "tiền nước 120k Hùng trả": "Hùng" không có trong nhà nên người trả để trống, kèm lời nhắc kiểm tra người trả và người cùng chia. |
| `ai-5-busy-429.png` | Lỗi: quá tải (429) | Giả lập | Câu đã gõ vẫn còn, có "Thử lại", form thủ công dùng được ngay. |
| `ai-6-not-configured-dark.png` | Lỗi: chưa bật AI | Giả lập, chế độ tối | Máy chủ chưa có key: "Điền giúp" bị khoá, không có "Thử lại", người dùng điền form. |
