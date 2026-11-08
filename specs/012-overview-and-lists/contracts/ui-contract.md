# UI contract: Overview and lists that read right

## Tổng quan: coloured block (US1)

- From 380 px: as today (avatars top right).
- Below 380 px: avatars on their own row above the sentence, right-aligned; sentence uses the full width; amount
  36 px and may wrap; the currency sign stays attached to the number.
- Check: at 320, 360, 375, 390 px the bounding boxes of `.verdict-sentence` and `.verdict-people` do not intersect;
  a 13-digit amount is fully inside the block.

## Tổng quan: debtor's actions (US2)

Under the total and "Vì sao ra số này?", one line per transfer the signed-in person must make:

| Notice state | Shows |
|---|---|
| none | Primary button (purple, full width on phones): "Tôi đã chuyển {amount} cho {name}" / "I've sent {amount} to {name}" |
| sent | "Đã báo chuyển {amount}, chờ {name} xác nhận." + text button "Huỷ thông báo" / "Withdraw notice" |
| declined | "{name} báo chưa nhận được." + the primary button again |

The transfer list keeps the debtor's own rows with their status text but without a button. Creditors and settled
people see nothing new.

## Tổng quan: one-person house (US3)

- "+ Ghi khoản chi", then a card: title "Mời bạn cùng phòng", lead "Fair-Share có ích khi bạn cùng phòng vào nhà.",
  the invite code and its share/copy buttons (the same component as on Thành viên), and when requests wait:
  "Có {n} người đang chờ duyệt · Xem" linking to Thành viên.
- Hidden: "Tháng này", "Số dư từng người", "Lịch sử trả nợ".

## Nhà của bạn (US4)

Each card (a link, 44 px tall at least): house name (wraps), "Trưởng nhóm" chip with an 8 px gap, then a second
line: "Bạn được nhận {amount}" (credit colour) / "Bạn cần trả {amount}" (debt colour) / "Đã xong" (muted); a badge
on the right when `waiting > 0`: a pill with the number and an accessible label "{n} việc đang chờ bạn". From
1024 px: CSS grid `repeat(auto-fill, minmax(280px, 1fr))`. If figures are missing (older API or error), the second
line is not shown.

## Chi tiêu (US5)

- Description and meta line: at most 2 lines each, ellipsis; full description in `title`; "Xem đủ" text button
  under a clamped description (44 px target) toggles the full text for that row.
- Month filter with no expenses: the filter chip stays, the list area shows "Tháng {m}/{yyyy} chưa có khoản chi
  nào." / "No expenses in {Month yyyy}." and "Bỏ lọc" / "Clear filters".

## Language (US6)

No saved choice: `vi` unless the browser's first language starts with `en`. The VI/EN switch saves the choice as
today.

## Strings (US7)

| Key (vi / en) | New text |
|---|---|
| `households.nameEmpty` | Nhập tên nhà. / Enter a group name. |
| `auth.nameEmpty` | Nhập tên của bạn. / Enter your name. |
| `profile.nameEmpty` | Nhập tên của bạn. / Enter your name. |
| `recurring.hint(day)` | Hiện trên Tổng quan từ ngày {day} hằng tháng · không tự lưu khoản chi / Shows on Overview from day {day} each month · never saved for you |
| `recurring` stop question | … Các khoản đã ghi vẫn giữ nguyên, chỉ không hiện trên Tổng quan nữa. / … Expenses already recorded stay; it just stops showing on Overview. |
| `errors.notice_changed` | Thông báo này vừa thay đổi hoặc đã được trả lời. Số liệu đang tải lại, bạn xem lại khi số mới hiện ra nhé. / This notice just changed or was answered. The figures are refreshing; have another look once they show. |
| `errors.suggestion_changed` | Số tiền gợi ý vừa đổi. Số liệu đang tải lại, bạn xem lại rồi báo lại nhé. / The suggested amount just changed. The figures are refreshing; check them and tell them again. |
| `verdict.cancelNotice` (en) | Withdraw notice |
| `profile.*` (en) | "household" → "group" in `nameHint`, `renamedEverywhere`, `renamedNoHouse`, `statusHint` |
| `profile.genderNotice` | Không bắt buộc, để bạn cùng nhà biết giới tính của bạn. Bạn cùng nhà hiện tại và sau này đều thấy, giữ tới khi bạn đổi. Chọn Không nêu là xoá hẳn. / Optional, to let your group know your gender. Current and future members see it, until you change it. Not stated deletes it. |

Final wording is reviewed in the PR against DESIGN.md §7.
