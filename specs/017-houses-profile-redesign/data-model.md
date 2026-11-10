# Data model: House list and profile redesign

No new data, no migration, no API change. The pages show what the API already returns; this file lists that data and the page state each part keeps.

## Read from the API (unchanged)

| Source | Fields used | Where |
|---|---|---|
| `GET /api/households` → `MyHousehold` | `id`, `name`, `role`, `my_net`, `waiting` | house rows (`/`) |
| `GET /api/me/requests` | pending requests, outcomes | *Đang chờ duyệt*, outcome lines (unchanged) |
| Session `User` | `id`, `email`, `display_name`, `status`, `gender` | identity card, parts, header avatar |
| `GET /api/me/photo` → `MyPhoto` | `data` | identity card avatar; header avatar (PR 3) |
| `GET /api/me/receiving-account` | `account` (bank BIN, number, holder, supported) | receiving part; card hint `bank •••• last4` |

## Derived on the page

| Value | Rule |
|---|---|
| House tint | `(household.id % 8) + 1` → `--tint-N` (same in both themes) |
| Money words | `my_net < 0` → *Bạn cần trả* + amount `-my_net` in the debt colour; `> 0` → *Bạn được nhận* + amount in the credit colour; `0` → *Đã xong* in `--muted` |
| Personal tint | `(user.id % 8) + 1`, as on Thành viên (`PhotoForm` today) |
| Card status | saved `status`, or *Chưa có trạng thái* |
| Card receiving hint | saved account that is supported → `"<bank name> •••• <last 4 digits>"`; otherwise no line |

## Page state per profile part

| Part | Kept on the page | `dirty` (shows *Chưa lưu*) | Focus targets (research R6) |
|---|---|---|---|
| Photo (card) | `picked` blob + preview URL, `problem`, `saved` | a photo picked and not saved | *Lưu ảnh*, *Chọn ảnh* / *Đổi ảnh* |
| Name | typed `name`, `problem`, `result` | `name.trim() ≠ saved display_name` | none (does not swap) |
| Status | typed `status`, `problem`, `saved` | `status.trim() ≠ saved status` | status field after *Xoá trạng thái* |
| Receiving account | `editing`, bank, number, holder, `said` | editing and any field ≠ the saved value (or any field filled when adding) | bank select, *Sửa*, *Thêm tài khoản* |
| Password | current, new | either field not empty | none |
| Gender | `choice` | `choice ≠ saved gender` | none |

A save in flight: the part's button shows *Đang lưu…* with `aria-disabled="true"` and ignores presses (research R5). After a successful save, `dirty` becomes false because the saved value now equals the typed one.
