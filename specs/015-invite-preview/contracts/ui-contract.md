# UI contract: Nhà của bạn, the join form, Thành viên

| Place | What shows |
|---|---|
| Join form, complete valid code | "Lời mời vào {house} của {owner}" under the field (polite, once per code) |
| Join form, already in it | "Bạn đã ở trong nhà này." [Mở nhà] |
| Join form, wrong code | today's message, only after "Gửi yêu cầu vào nhà" (no hint while typing) |
| Waiting card | "Bạn đang xin vào {house} của {owner}" · "gửi ngày {date}" · [Huỷ yêu cầu vào {house}] |
| Approved | toast "Bạn đã vào {house}." [Mở] ; the house appears in the list |
| Refused | "{owner} không duyệt yêu cầu vào {house} của bạn." [Đã hiểu] |
| House deleted | "{house} không còn nữa, yêu cầu của bạn đã dừng." [Đã hiểu] |
| Start page, invite in progress, no house | join part with the preview or the waiting card; no create form; link "Tạo nhà khác" |
| Start page otherwise | as today |
| Thành viên, invite card | hint "Ai có mã này sẽ thấy tên nhà và tên trưởng nhóm." |

Checks: every 10 s while a request waits and the page is in front; never two at once; none in the background; one
when the page comes back. Screen readers hear each outcome once.
