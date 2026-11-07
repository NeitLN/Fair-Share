# UI contract: Profile page

## Route and entry

- `/account` (signed in only; a signed-out visitor goes to sign-in, then back). Linked from `AccountMenu`
  as "Hồ sơ của bạn" / "Your profile".
- One column, max width as the other single-column pages; at 360 px no sideways scroll, inputs 16 px,
  controls ≥ 44 px (DESIGN §8).
- Sections in this order, each its own `<form>` with its own Lưu (FR-004), added PR by PR: Tên (PR1),
  Mật khẩu (PR1), Trạng thái (PR2), Ảnh đại diện (PR3), Giới tính (PR4). Email shown read-only at the top.

## Name (PR1)

- Field with the display name; Lưu disabled while unchanged.
- Result line under the form: "Đã đổi tên ở mọi nhà." or, when `kept` is not empty, "Đã đổi tên. Ở {nhà}
  đã có người tên {tên mới}, nên ở đó bạn vẫn là {tên cũ}." one line per kept household.
- Invalidates `auth/me` and every cached `members` query.

## Password (PR1)

- Current password, new password (8–128, with the length hint), both `type=password`, autocomplete
  `current-password` / `new-password`; fields cleared after any answer.
- `wrong_password` → under the current-password field: "Mật khẩu hiện tại chưa đúng."; 429 → the same
  message as sign-in ("Bạn thử quá nhiều lần. Đợi một lúc rồi thử lại.", the page does not read the
  seconds today) at the top of the section; success → "Đã đổi mật khẩu. Các nơi khác đã đăng xuất."

## Status (PR2)

- One-line input, counter "{n}/60" counting code points; Xoá trạng thái button when set.
- Shown on Thành viên under the person's name, plain text, one line with ellipsis, full text in `title`.

## Photo (PR3)

- Preview avatar (large) + "Chọn ảnh" (file input, `accept="image/jpeg,image/png,image/webp,image/heic"`)
  + "Gỡ ảnh" when set.
- On pick: `createImageBitmap(file, {imageOrientation: 'from-image'})`, centre square drawn on a 256 × 256
  canvas, `toBlob('image/jpeg', 0.85)`; the preview shows that blob; Lưu / Huỷ appear. A file the browser
  cannot open → "Chưa đọc được ảnh này. Chọn ảnh JPEG, PNG hoặc WebP nhé." Over 10 MB picked → refused in
  the browser with the same kind of message.
- Server errors map: 415 → the same message; 429 → wait seconds; 507 → "Kho ảnh đã đầy, tạm thời chưa thêm
  ảnh mới được."; 503 → "Đang bận, thử lại sau ít giây."
- Household avatars: `HouseholdLayout` reads `photo_version` from members; when any is set it loads
  `['photos', id, versionsKey]` once and passes `photo` into `memberLooks`. `Avatar` renders
  `<img alt="" src={photo}>` inside the circle (same size, ring, shadow; `decorative` and `aria-label`
  unchanged); on error or while loading, the initial.

Avatar places covered through `memberLooks` (SC-002 list): household header stack, VerdictBlock,
BalanceRows, MemberList, ExpenseForm payer and share pickers, ExpenseList, ExpenseTable, ShareList,
RecentExpenses, RecentStrip, MonthTotals, ReportPage. `AuthPage` samples are not people and stay as they
are.

## Gender (PR4)

- Radio group: Không nêu (default), Nam, Nữ, Khác, with the notice above it: "Không bắt buộc. Dùng để
  cho bạn cùng nhà biết giới tính của bạn; bạn cùng nhà hiện tại và sau này đều thấy. Giữ tới khi bạn đổi
  hoặc bỏ. Chọn Không nêu là xoá hẳn." Lưu sends the notice version.
- On Thành viên, a stated gender is a small muted label after the name; Không nêu shows nothing.

## Strings

Every string above has an English twin in `i18n/en.tsx` (FR-034); final wording is reviewed in each PR
against DESIGN §7.
