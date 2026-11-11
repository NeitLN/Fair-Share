# Biên bản đánh giá sản phẩm Fair-Share, lần 2

| | |
|---|---|
| Ngày | 12/11/2026 |
| Phiên bản | Bản live tại `83fa2eb` (API 1.2.2) |
| Người yêu cầu | Võ Việt Tiến (trưởng nhóm) |
| Phạm vi | Toàn bộ app: đăng ký, vào nhà, ghi khoản chi, AI Gõ nhanh, chia tiền, trả nợ, VietQR, báo cáo, thành viên, hồ sơ, giao diện điện thoại và máy tính, sáng và tối, tiếng Việt và tiếng Anh, truy cập, tình huống xấu |
| Lần trước | [Biên bản 08/11](2026-11-08-bien-ban-danh-gia.md) và [kế hoạch công việc](2026-11-08-ke-hoach-cong-viec.md) |

## 1. Cách đánh giá

Lần này đánh giá theo hai vòng.

**Vòng 1: sáu nhóm tester và người dùng chạy app thật.** Mỗi nhóm dùng Playwright điều khiển trình duyệt Edge trên bản live, đóng vai người dùng thật, chụp ảnh từng bước và tự đối chiếu nguyên nhân trong code khi có thể. Các nhóm tự đăng ký tài khoản "QA …" và tạo nhà riêng để thử, xong thì xoá nhà. Nhà trọ VLU (nhà 807) chỉ được xem, không ghi gì vào.

| Nhóm | Vai | Phạm vi |
|---|---|---|
| A | Sinh viên năm nhất nhận link qua Zalo, chủ nhà mời bạn, người được mời được duyệt hoặc bị từ chối, người mở app lúc máy chủ ngủ | Đăng ký, đăng nhập, nhà trống, tạo nhà, mã mời, xin vào, chờ duyệt, đăng xuất |
| B | Người đi chợ ghi vội bằng một tay, người kỹ tính, người lười chỉ gõ một câu | Form khoản chi, Tự chia, định kỳ, AI Gõ nhanh (6 câu), danh sách, bộ lọc, Tổng quan, báo cáo; tính tay lại từng đồng |
| C | Người nợ muốn trả cho xong, người được trả, người không tin con số, hai người bấm cùng lúc | Tôi đã chuyển, Chuyển số khác, Báo thêm, xác nhận, ghi tay, VietQR (giải mã ảnh QR), tranh chấp hai trình duyệt |
| D | Senior UI designer và người dùng khó tính | 9 trang ở 360, 390, 768, 1024, 1280, 1440 px, sáng, tối, tiếng Anh; 112 ảnh, so với DESIGN.md |
| E | Người dùng chỉ bàn phím, trình đọc màn hình, người cố tình phá | axe-core trên mọi trang, phóng to 200% và 400%, mất mạng, mạng chậm, mất phản hồi, hai tab, id nhà của người khác |
| F | Chủ nhà, người dọn ra khi còn nợ, người ở ba nhà, người kỹ về quyền riêng tư | Thành viên, rời nhà, bỏ quyền, vào lại, nhiều nhà, hồ sơ, ảnh, mật khẩu, tài khoản nhận tiền |

**Vòng 2: hội đồng ba người bàn và xếp ưu tiên.** Một senior UI/UX designer, một QA lead kiêm kỹ sư (kiểm lại nguyên nhân từng lỗi lớn trong code), và một người đại diện sinh viên kiêm product owner. Mỗi người đọc cả sáu báo cáo, mở ảnh và code để kiểm, gộp lỗi trùng, xếp ưu tiên. Sau đó mỗi người đọc ý kiến của hai người kia và phản biện thêm một lượt. Mục 4 ghi những gì hội đồng thống nhất và chỗ còn khác ý.

Các mục ghi "đã kiểm trong code" là đã có ít nhất một người đối chiếu với code tại `83fa2eb`. Ảnh chụp và script của các nhóm nằm ngoài repo, trong thư mục làm việc của buổi đánh giá.

## 2. Tóm tắt

Phần lõi của app đứng vững:

- Tiền đúng tới từng đồng. Nhóm B tính tay lại 14 khoản chi (chia đều có dư, tự chia, sửa số tiền và người trả, xoá), nhóm C tính lại sau từng bước trả nợ, kể cả phần dư 1đ. Mọi con số trên màn hình đều khớp. Báo cáo của nhà 807 cũng khớp.
- AI Gõ nhanh đọc đúng cả 6 câu thử, mỗi câu khoảng 3,5 giây, kể cả "Minh 300k Tiến 150k còn lại An", "hôm qua", "3 ly mỗi ly 25k" và một tên không có trong nhà.
- Bảo mật tốt: hơn 30 lần gọi API vào nhà, khoản chi và thành viên của người khác đều trả 404, không lộ dữ liệu. Hai máy cùng xác nhận một thông báo chỉ ghi một khoản trả.
- axe-core không tìm thấy lỗi nào trên mọi trang, cả hai chế độ, điện thoại và máy tính. Không có cuộn ngang ở 112 ảnh chụp, kể cả số tiền 10 chữ số ở 360 px.
- Nhiều lỗi của lần 08/11 đã hết: dãy avatar che chữ ở 360 px (L1), ngôn ngữ mặc định, màn hình chờ máy chủ, lời mời ghi rõ tên nhà và chủ nhà, người chờ biết được duyệt sau khoảng 10 giây, thông báo bị từ chối.

Những điểm yếu lớn nhất còn lại, theo kết luận của hội đồng:

1. **Màn hình nói sai hoặc nói hai điều về tiền.** Khi nhập sai số ở "Chuyển số khác", câu báo lỗi là chữ trắng trên nền trắng. Một thông báo còn sót hiện "Bình cần trả bạn 30.000đ" kèm nút xác nhận ngay dưới dòng "Cả nhà sạch nợ". Thông báo "Đã lưu" có thể nằm đè lên một lần lưu vừa bị từ chối.
2. **Lưu không chắc chắn khi mạng yếu.** Mất mạng thì nút "Đang lưu…" quay mãi, không báo gì, có mạng lại thì tự lưu. Mất phản hồi rồi bấm Lưu lại theo lời app thì khoản chi bị ghi hai lần.
3. **Người dọn ra giữa kỳ.** Ai đang được nợ mà rời nhà hoặc bị bỏ quyền thì khoản đó không ai ghi trả được nữa. Người rời nhà khi còn nợ không được cảnh báo. Người cũ vào lại thì mặc định thành một người mới, số dư cũ treo trên một cái tên không còn ai.
4. **Nhà tạo nhầm không xoá được.** Bấm "Tạo nhà" hai lần ra hai nhà, mà app không có nút xoá nhà, chủ nhà cũng không rời nhà được.

## 3. Danh sách vấn đề đã gộp

Mã trong ngoặc là mã của các nhóm tester. Mức là mức hội đồng chốt sau vòng 2.

### 3.1 Tiền và thông báo trả tiền

| Vấn đề | Mã | Mức | Ghi chú |
|---|---|---|---|
| Câu báo lỗi trong "Chuyển số khác" và "Báo thêm" là chữ trắng trên nền trắng; dòng "… chưa thêm tài khoản nhận tiền" in đậm trắng như một nút | C01, C12, D06 | Lớn | Đã kiểm trong code: `index.css:1916` đè màu của `.field-problem` |
| Thông báo còn sót hiện như một khoản cần trả, có nút xác nhận, ngay dưới "Cả nhà sạch nợ"; bấm vào sẽ tạo ra khoản nợ mới | C02, C10 | Lớn | Đã kiểm: `VerdictBlock.tsx:264-274`, `302` |
| Xoá một khoản trả ghi tay đã lấy từ thông báo thì phần tiền đó không trở lại thông báo; hộp thoại gọi nhầm là "thông báo khác" | C03 | Lớn | Đã kiểm: `settlements.py:336-350` `ON CONFLICT DO NOTHING` |
| Dòng của chính người nợ ghi "cần trả 33.333đ" trong khi khối trên ghi "còn thiếu 20.000đ" | C07 | Nhỏ | `VerdictBlock.tsx:864-879` |
| Bấm hai lần "Tôi đã chuyển" hiện lỗi 409 dù đã lưu đúng một lần; thua tranh chấp thì lỗi cũ nằm mãi, không nói chuyện gì xảy ra | C08, C09 | Nhỏ | Nút thông báo thiếu chặn bấm trùng (`DashboardPage.tsx:131-144`) |
| Khối trả tiền lặp lại: dòng của chính mình lặp khối trên, hai link "Vì sao ra số này?", ba cách hoàn tác sau khi xác nhận | D06, C12, B13 | Nhỏ | Hội đồng xếp vào cùng gói với C02 vì cùng file và cùng vấn đề "một màn hình nói một câu" |
| Không báo được nhiều hơn số nợ (chuyển 135k cho khoản 133.333đ) | C05 | Nhỏ | Còn khác ý, xem mục 4.2 |
| Ghi tay khoản trả lớn hơn số nợ thì lưu luôn, nợ đảo chiều không cảnh báo; form dùng tên đầy đủ và cho chọn chính người nhận làm người trả | C06 | Nhỏ | `SettlementForm.tsx` |
| Mã QR hiện trên đúng chiếc điện thoại phải quét, không lưu được ảnh (QR là SVG, nhấn giữ không lưu được), không có "Chuyển xong? Tôi đã chuyển" | C04 | Vừa | Nội dung mã QR đúng chuẩn, đúng số tiền; chụp màn hình vẫn dùng được |
| Hết nợ thì không còn "Vì sao ra số này?" | C11 | Nhỏ | Chưa kiểm trong code |
| Phần dư 1đ luôn tính cho người có id nhỏ nhất, không ghi ở đâu | B09 | Nhỏ | Đúng như thiết kế; chỉ cần một dòng giải thích trong "Vì sao" |

### 3.2 Lưu dữ liệu

| Vấn đề | Mã | Mức | Ghi chú |
|---|---|---|---|
| Mất mạng: "Đang lưu…" mãi không báo gì, có mạng lại thì tự lưu kể cả khi đã sang trang khác; đóng tab thì mất | B01, E02 | Lớn | Đã kiểm: `api/queryClient.ts` không đặt `networkMode`, nên TanStack Query tạm dừng mutation khi mất mạng |
| Server đã lưu nhưng mất phản hồi, app bảo "Hãy thử lại", bấm lại thì ra hai khoản chi | E01 | Lớn | L8 của lần 08/11, vẫn còn. Đã kiểm: không có khoá chống ghi trùng nào trong `app/` hay `frontend/src` |
| Thông báo "Đã lưu: …" che nút Lưu và che dòng lỗi trên điện thoại, có lúc nằm đè lên một lần lưu vừa bị từ chối | B02, E06 | Lớn | `index.css:2774`, `lib/toast.ts:17-19`; thông báo có nút cũng tự tắt sau 7 giây dù đang được focus |
| Sửa ô trong lúc đang lưu chậm thì bị xoá mất | E03 | Nhỏ | L10 của lần 08/11 |
| Bấm hai lần "Tạo nhà" ra hai nhà | A01 | Lớn | Đã kiểm: `HouseholdCreateForm.tsx:20-38` không chặn bấm trùng |
| Đăng xuất ở tab khác hoặc hết phiên thì lần lưu sau mất bản nháp, không giải thích | E10, F16 | Nhỏ | `lib/session.ts` không nghe sự kiện `storage` |
| Ngày ở năm 2062 được nhận không hỏi lại; tháng sai trong link báo cáo nhảy tới tháng cuối | B03, E11 | Nhỏ | |

### 3.3 Thành viên và nhà

| Vấn đề | Mã | Mức | Ghi chú |
|---|---|---|---|
| Người đang được nợ mà rời nhà hoặc bị "Bỏ quyền vào nhà" thì khoản đó không ai ghi trả được (chỉ người nhận mới ghi được) | F01 | Lớn, cao | L3 của lần 08/11, vẫn còn. Đã kiểm: `settlements.py:84`, `households.py:398-419`. Hội đồng hạ từ "chặn" xuống vì số dư vẫn đúng và còn cứu được bằng cách mời lại vào tên cũ |
| Rời nhà khi còn nợ hoặc còn thông báo đang chờ: không cảnh báo, sau đó không còn dấu vết khoản nợ | F02 | Lớn | Như trên |
| Người cũ vào lại: mặc định "Tên mới", tạo người trùng ở 0đ, số dư cũ treo | F03 | Lớn | Đã kiểm: `JoinRequests.tsx` mặc định `NEW`; rời nhà xoá liên kết nên server không nhớ tên cũ |
| Không có nút xoá nhà, không chuyển quyền chủ nhà, chủ nhà không rời được; xoá nhà qua API thì thành viên đã duyệt mất nhà mà không được báo | A02, C13, F04 | Lớn | Đã kiểm: frontend không gọi `DELETE /api/households/{id}`; `households.py:271-276` chỉ báo cho người đang chờ |
| Người đã rời bị ghi "Chưa có tài khoản" và có nút "Xoá" luôn thất bại; "Mới ghi" gọi họ là "Thành viên cũ" với avatar "?" | F07, F08 | Nhỏ | |
| "Đổi mã mới" đổi ngay không hỏi, link cũ trong nhóm Zalo chết luôn | A05 | Nhỏ | Còn từ 08/11 |
| Xin vào xong vẫn ở link `/join/…`; bị từ chối thì thấy ngay mã điền sẵn và nút xin lại | A04 | Nhỏ | |
| Đăng xuất vẫn ở link nhà cũ, người đăng nhập sau thấy "Không tìm thấy nhà này" | A08 | Nhỏ | `AccountMenu.tsx:57-66` |
| Ngày gửi yêu cầu và hạn mã mời tính theo giờ UTC: 1 giờ sáng 12/11 ghi "gửi ngày 11/11/2026" | A03 | Nhỏ | `HouseholdsPage.tsx:246`, `InviteCard.tsx:74` |
| Lỗi cũ của server nằm cạnh lỗi mới của ô mã mời | A06 | Nhỏ | |

### 3.4 Tài khoản và hồ sơ

| Vấn đề | Mã | Mức | Ghi chú |
|---|---|---|---|
| Đổi mật khẩu không có nút "Hiện", không có ô nhập lại; app không có lấy lại mật khẩu nên gõ nhầm là mất tài khoản. Edge còn hiện thêm biểu tượng con mắt riêng | F06, D16, E12 | Lớn | Còn từ 08/11 |
| Trang hồ sơ trên máy thứ hai hiện tên, trạng thái, giới tính cũ | F05 | Nhỏ | Hội đồng hạ mức: mỗi phần lưu riêng, chỉ ghi đè khi cố tình bấm lưu trên máy cũ. `getMe` chưa được gọi |
| Rời trang khi đang "Chưa lưu" thì mất không hỏi; "Gỡ ảnh" gỡ ngay không hỏi | F09, F12 | Nhỏ | |
| Khoá đăng nhập sau 5 lần sai chỉ nói "Đợi một lúc", không nói bao lâu; giới hạn 20 lần sai theo IP dùng chung cả Wi-Fi trường | E09 | Nhỏ | API đã có `retry_after` |
| Ô mật khẩu để trống khi đăng nhập báo "cần từ 8 đến 128 ký tự"; email đã có tài khoản không có nút chuyển sang đăng nhập | A09, A12 | Nhỏ | A09 còn từ 08/11 |
| Không xoá được tài khoản; người xin vào không được báo là chủ nhà thấy email của mình | F17 | Nhỏ | |

### 3.5 Giao diện và câu chữ

| Vấn đề | Mã | Mức |
|---|---|---|
| Cột mô tả trong Chi tiêu quá hẹp ở mọi cỡ: khoảng 110 px ở 360, khoảng 140 px trong bảng 1440; "Mới ghi" và "Khoản chi gần đây" không cắt mô tả dài | D01, D12, D15 | Vừa |
| Khi lọc theo người trả hoặc danh mục không có tổng các khoản đang lọc, thẻ tháng vẫn ghi tổng cả tháng; bộ lọc mất khi tải lại trang | B05, B06 | Nhỏ |
| Xoá khoản chi và ngừng khoản định kỳ dùng hộp hỏi của trình duyệt, xoá xong không có Hoàn tác; chữ "Xoá" đỏ lặp ở mọi dòng | B08, D08, E15 | Nhỏ, còn từ 08/11 |
| Số tiền trên trang Thành viên (máy tính) và thanh trong báo cáo không thẳng mép | D02, D03, D19 | Nhỏ |
| Chế độ tối có ba khối sáng ở màn hình đầu; skeleton gần như không thấy | D05, D20 | Nhỏ |
| Ngắt dòng xấu: "chia đều 3 / người", "•••• / 0915", chữ "nữa." đứng một mình; nhãn 11,7 đến 12 px nhỏ hơn quy định 13 px | D10, D13 | Nhỏ |
| Ba nút mời có ba độ rộng; "Đổi tên nhà" là khối nặng nhất trang Thành viên | D11, A14, F15 | Nhỏ, còn từ 08/11 |
| Màu avatar của chính mình khác nhau giữa header và từng nhà | D21, F14, A17 | Nhỏ, còn từ 08/11 |
| Tên gọi lấy chữ cuối: "QA E 1" thành "Chào 1"; "Hai (QA)" thành "(QA)" với avatar "(" | A16, F11, E15 | Nhỏ |
| Bản tiếng Anh gọi nhà là "group" | A10 | Nhỏ |
| Trang đăng nhập trên điện thoại sơ sài, không có câu giới thiệu như bản máy tính | A11 | Nhỏ |
| Trang 404 trơn, link 161 x 19 px; tab của các trang trong nhà không đổi tiêu đề | D09 | Nhỏ |
| Đoán danh mục sai: "nước lau sàn" vào Ăn uống, "bánh mì", "tiền cọc" vào Khác | B04 | Nhỏ |
| Ô số tiền không nhận "50.000đ" (đúng kiểu app in ra), "50 nghìn" | B10, E14 | Nhỏ |
| Truy cập: không có link bỏ qua tới nội dung, focus rơi về body sau khi đổi trang và sau "Duyệt"; avatar và số trên tab bị đọc hai lần; một số dòng gợi ý tĩnh nằm trong vùng live | E04, E05, E07, E08 | Nhỏ |
| Các điểm nhỏ khác: chữ in hoa trên thẻ hồ sơ, cột 768 px quá rộng, "Vượt quá: 0đ" khi chưa có tổng, ô ngày hiện "11/12/2026" trên Edge tiếng Anh, khoản định kỳ giữ chữ "tháng 11" | D04, D07, D24, E13, B07 | Rất nhỏ |

## 4. Kết luận của hội đồng

### 4.1 Những điểm đã thống nhất

- **Thứ tự đầu tiên:** sửa CSS chữ trắng (C01) trước, vì chỉ một quy tắc CSS và làm được trong ngày. Tiếp theo là gói nhỏ về lưu: `networkMode`, khoá ô khi đang lưu, và thông báo "Đã lưu" không được nằm đè lên một lần lưu bị từ chối. Cả ba người cùng coi thông báo "Đã lưu" sai là lỗi nói sai về tiền, không chỉ là lỗi bố cục.
- **Rời nhà khi còn tiền (F01, F02), quy tắc tách đôi:**
  - Thành viên tự rời nhà khi số dư khác 0 hoặc còn thông báo đang chờ thì bị chặn, câu báo ghi rõ số tiền, ví dụ "Bạn còn cần trả Một 40.000đ".
  - Chủ nhà vẫn bỏ quyền được, nhưng phải qua bước xác nhận ghi rõ số tiền. Không chặn hẳn, vì cách lấy lại tài khoản duy nhất khi quên mật khẩu là tạo tài khoản mới, xin vào lại rồi nhận lại tên cũ, mà muốn vậy thì tài khoản cũ phải được bỏ quyền trước (`approve_request` chỉ cho nhận tên chưa gắn tài khoản).
  - Tên người đã đi vẫn nằm trong số dư, ghi là "Đã rời nhà", và chủ nhà ghi được khoản trả cho họ (xem 4.2).
  - Người bị bỏ quyền được báo một dòng, giống cách báo khi bị từ chối.
- **Chống ghi trùng (E01):** khoá theo từng bản nháp trên các lệnh tạo khoản chi và khoản trả, kèm chỉ mục duy nhất, gửi trùng thì trả lại dòng đã có. Thông báo cũng đã có version nên không cần. Nhà chỉ cần chặn bấm trùng ở nút (A01). Trong lúc chờ, đổi câu "Hãy thử lại" thành "Có thể đã lưu, xem danh sách trước khi lưu lại".
- **Xoá nhà:** chỉ khi cả nhà đã hết nợ và không còn thông báo đang chờ, phải gõ tên nhà để xác nhận, thành viên được báo là nhà đã bị xoá.
- **Không làm trong đợt này:** chuyển quyền chủ nhà, xoá tài khoản, giao diện riêng cho máy tính bảng.
- **Không mở lại các gói đợt 3 đã bỏ hôm 12/11,** kể cả lấy lại mật khẩu qua email (G3-01). Lý do: cách "tài khoản mới, nhận lại tên cũ" ở trên, cộng với nút "Hiện" và ô nhập lại khi đổi mật khẩu, đủ cho học phần này. Gửi email trên Render miễn phí lại thêm một chỗ có thể hỏng.
- **Giao diện:** những phần chỉ thấy trên máy tính hoặc chế độ tối (D02, D03, D05) xếp sau phần tiền. Riêng việc dọn khối trả tiền (D06 và C12) đi cùng gói thông báo, vì cùng file và cùng vấn đề. Dòng chi tiêu trên điện thoại (D01, D12) là việc giao diện đầu tiên sau phần tiền.

### 4.2 Những điểm hội đồng còn khác ý

Ngày 12/11 trưởng nhóm đã chốt theo đề xuất của người tổng hợp ở cả ba điểm dưới đây: giữ giới hạn báo chuyển và thêm nút điền sẵn số đúng, chỉ chủ nhà ghi khoản trả cho người đã rời nhà, lỗi QR để sau 10 việc đầu.

1. **Có cho báo nhiều hơn số nợ không (C05)?**
   - Designer và người đại diện sinh viên: không. Giữ giới hạn, biến câu báo lỗi thành một nút "Bạn chuyển dư 1.667đ? Chỉ cần báo 133.333đ" bấm là điền sẵn đúng số. Lý do: cho báo dư sẽ đẩy người dùng vào chuyện nợ đảo chiều, vốn đã gây khó hiểu ở C06.
   - QA lead: có. Người nợ thật sự đã chuyển 135.000đ, chặn lại thì 1.667đ đã đổi tay không được ghi ở đâu. Cho báo dư kèm cảnh báo "Nhiều hơn 1.667đ; An sẽ nợ lại bạn 1.667đ" và chặn trên khoảng gấp 2 số gợi ý. Việc này đổi quy tắc S3 trong ACCOUNTS.md và spec 014.
   - Đề xuất của người tổng hợp: làm phương án nút điền sẵn trước vì nhỏ và không đổi spec. Nếu sau buổi dùng thử nhóm thấy người dùng vẫn cần báo dư thì mới đổi spec.
2. **Ai được ghi khoản trả cho người đã rời nhà?**
   - QA lead: chỉ chủ nhà, vì để người nợ tự ghi mình đã trả cho người không còn trong nhà là một lỗ hổng niềm tin.
   - Designer và người đại diện sinh viên: người nợ hoặc chủ nhà, lịch sử ghi rõ ai ghi.
   - Đề xuất của người tổng hợp: chủ nhà ghi, lịch sử ghi tên người ghi.
3. **Mức của lỗi QR (C04):** designer và QA lead xếp vừa, người đại diện sinh viên xếp nhỏ. Không ai đưa vào 10 việc đầu. Cách sửa nhỏ: vẽ mã ra ảnh PNG để lưu hoặc chia sẻ, thêm dòng "Chụp màn hình rồi mở bằng app ngân hàng" và nút "Chuyển xong? Tôi đã chuyển".

## 5. Phương án sửa

Thứ tự dưới đây là thứ tự hội đồng thống nhất. Cỡ: S là dưới 2 giờ, M là nửa ngày, L là 1 đến 2 ngày.

| Thứ tự | Gói | Vấn đề | Cỡ | File chính |
|---|---|---|---|---|
| 1 | Sửa nhanh CSS khối người nợ | C01, dòng trắng của C12 | S | `index.css` |
| 2 | Lưu không treo, không báo sai | B01/E02 `networkMode` và trạng thái mất mạng, E03 khoá ô khi đang lưu, B02 bỏ thông báo "Đã lưu" khi lưu lần mới hoặc khi có lỗi, một thông báo một lúc dưới 600 px, E06 dừng đếm giờ khi đang focus, D23 viền trên thanh Lưu | S đến M | `api/queryClient.ts`, `ExpenseForm.tsx`, `lib/toast.ts`, `Toast.tsx`, `index.css` |
| 3 | Thông báo trả tiền nói một câu | C02, C10 câu riêng cho thông báo còn sót, nút xác nhận phụ kèm cảnh báo; C03 trả lại tiền vào thông báo và sửa câu; C07; C08 chặn bấm trùng; C09 xoá lỗi cũ và nói ai đã làm gì; D06/C12 bỏ dòng lặp, một link "Vì sao", một cách hoàn tác; C05 giữ giới hạn, câu báo lỗi kèm nút điền sẵn số đúng | M | `VerdictBlock.tsx`, `NoticeAmountStep.tsx`, `SettlementList.tsx`, `DashboardPage.tsx`, `app/routers/settlements.py` |
| 4 | Rời nhà khi còn tiền (cần spec ngắn, chính là G2-01 của spec 013 chưa viết) | F01, F02 theo quy tắc ở 4.1; F07 "Đã rời nhà", ẩn nút Xoá khi tên có tiền; F08; báo cho người bị bỏ quyền | M đến L | `app/routers/households.py`, `settlements.py`, `MembersPage.tsx`, `MemberList.tsx` |
| 5 | Chống ghi trùng | E01 khoá theo bản nháp trên khoản chi và khoản trả, câu "Có thể đã lưu…"; A01 chặn bấm trùng "Tạo nhà" | M | migration mới, `app/routers/expenses.py`, `settlements.py`, `api/client.ts`, `HouseholdCreateForm.tsx` |
| 6 | Người cũ vào lại | F03 nhớ tên cũ khi rời hoặc bị bỏ quyền, chọn sẵn "Trước đây là Hai, còn cần trả 40.000đ" | M | `households.py`, `JoinRequests.tsx` |
| 7 | Xoá nhà | A02/C13/F04 nút "Xoá nhà" cho chủ nhà, gõ tên để xác nhận, chỉ khi đã hết nợ, báo cho thành viên | M | `MembersPage.tsx`, `api/households.ts`, `households.py` |
| 8 | Xác nhận và Hoàn tác chung | B08/D08/E15 xoá khoản chi và ngừng định kỳ, A05 "Đổi mã mới", F12 "Gỡ ảnh": một kiểu xác nhận ngay tại chỗ rồi thông báo có Hoàn tác | M | `ExpenseList.tsx`, `ExpenseTable.tsx`, `RecurringList.tsx`, `InviteCard.tsx`, `AccountPage.tsx` |
| 9 | An toàn tài khoản | F06 và E12 nút "Hiện" và ô nhập lại khi đổi mật khẩu, bỏ con mắt của Edge; E09 ghi số phút phải chờ; F05 đọc hồ sơ từ `getMe`; F09; E10/F16 câu "Phiên đăng nhập đã kết thúc" và giữ bản nháp | M | `AccountPage.tsx`, `AuthPage.tsx`, `lib/session.ts`, `api/client.ts` |
| 10 | Dòng chi tiêu trên điện thoại | D01 lưới hai hàng trên điện thoại, cột hẹp lại trên máy tính; D12 cắt mô tả dài; B05 tổng các khoản đang lọc | M | `index.css`, `ExpenseList.tsx`, `ExpenseTable.tsx`, `ExpensesPage.tsx` |

Nếu còn thời gian, theo thứ tự:

- **Ngày đầu dùng app:** A03 ngày theo giờ Việt Nam, A04, A06, A08, A09, A10, A12, A13.
- **QR:** C04 lưu ảnh mã QR và nút "Chuyển xong? Tôi đã chuyển".
- **Giao diện:** D02, D03, D05, D10, D11, D13, D20, D21, D09.
- **Truy cập:** E04, E05, E07, E08.
- **Câu chữ và nhập liệu:** B03, B04, B06, B07, B09 (một dòng trong "Vì sao"), B10/E14, C06, C11, E11.

## 6. Những gì nên giữ nguyên

- Cách tính tiền theo số nguyên và chia dư tới từng đồng.
- "Vì sao ra số này?" liệt kê đúng các khoản đứng sau mỗi dòng.
- Luồng báo một phần: "Chuyển số khác" điền sẵn đủ số, "Báo thêm" có dòng cộng "40.000đ + 33.333đ = 73.333đ", "Nhận số khác" để phần còn lại tiếp tục chờ, "Chưa nhận được" quay về người nợ.
- Tự chia điền sẵn phần chia đều, hiện "Chưa chia", "Vượt quá", "Đã chia khớp số tiền" ngay khi gõ.
- Hỏi lại khi số tiền lớn bất thường; bấm Lưu ba lần chỉ gửi một lần.
- AI Gõ nhanh chỉ điền form, có Hoàn tác, nói thật khi không nhận ra tên.
- Lời mời: mã chữ thường hoặc có gạch đều dùng được, xem trước tên nhà và chủ nhà, người chờ biết được duyệt sau khoảng 10 giây.
- Quyền riêng tư: bạn cùng nhà chỉ thấy "Vietcombank •••• 6789", số tài khoản đầy đủ chỉ hiện cho người đang nợ mình.
- Câu chữ tiếng Việt tự nhiên, focus rõ, mọi nút đủ 44 px (trừ link trang 404), chế độ tối đọc tốt.

## 7. Dữ liệu thử còn lại trên bản live

- Tất cả các nhà "QA …" do các nhóm tạo đã được xoá (1240, 1243 đến 1252).
- Các tài khoản "QA …" (khoảng 16 tài khoản, email dạng `qa.<nhóm>.<số>.<số>@example.com`) vẫn còn vì app chưa có cách xoá tài khoản. Không tài khoản nào còn trong nhà nào.
- Nhà trọ VLU (807) và ba tài khoản của nhóm không bị thay đổi.
- AI Gõ nhanh dùng 6 lượt (nhóm B).
