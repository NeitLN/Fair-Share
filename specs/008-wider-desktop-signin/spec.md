# Feature Specification: Wider desktop frame and a composed sign-in page

**Feature Branch**: `feat/wider-desktop-signin`

**Created**: 2026-11-06

**Status**: Draft

**Input**: User description: "Tính năng \"Giao diện máy tính rộng hơn và trang đăng nhập mới\" cho Fair-Share. Chủ dự án đã xem bản xem thử (chèn CSS tạm vào app chạy ở máy) và chốt ngày 06/11: (1) khung trang trên máy tính rộng tối đa 1520 px thay vì 1320 px, lề hai bên giữ như cũ; (2) Tổng quan phương án A: từ 1280 px các dòng trong các panel bên phải gói trong 640 px và nằm giữa panel, \"Báo cáo tháng\" lên cùng hàng với tiêu đề tháng, các nút \"Xác nhận đã nhận\" lặp lại đổi thành nút viền; (3) Chi tiêu: form bên trái 380–420 px, ba bộ lọc trên một hàng, dòng chia dưới tên người trả được xuống dòng, cột Người trả khoảng 250 px; (4) Đăng nhập trên máy tính: một khối khoảng 980 px căn giữa theo cả chiều dọc, bên trái logo chữ lớn, tagline, câu giới thiệu và cụm 4 avatar sticker trang trí, bên phải form 440 px như cũ với nút ngôn ngữ và giao diện ngay dưới; bỏ logo nhỏ ở header khi chưa đăng nhập. Không nền taro, không thẻ số tiền mẫu, không câu hứa tốc độ, không con dấu SẠCH NỢ làm trang trí. Dưới 1024 px giữ nguyên. Không làm 3 cột. Tương phản AA hai theme, nút ≥44 px, không cuộn ngang 320/360 px, thứ tự bàn phím đúng thứ tự nhìn, không sticky, chỉ dùng token, hai ngôn ngữ. DESIGN.md §6.6 cập nhật theo."

## Context

On 06/11 the owner used the app with three months of realistic data and said two things: on a large
screen the two sides are empty, far too wide, and the sign-in page still looks unfinished. The width
cap of 1320 px came from the 05/11 design review, which had measured a name and its amount about
1000 px apart at 1920 px. The fix therefore widens the frame but keeps each row's values close
together. The proposal was argued in two rounds with a second reviewer and shown to the owner as
before/after captures of the running app; the owner chose variant A for Tổng quan and approved the
sign-in, Tổng quan and Chi tiêu captures at 1366 and 1536 px.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The app fills a large screen without stretching the rows (Priority: P1)

A housemate opens Fair-Share on a 1920 px monitor. The page no longer floats in a narrow strip with
about 300 px of bare cream on each side: the content reaches about 200 px from each edge. On Tổng
quan the right-hand panels span their column, but inside them each line (a person, what they spent,
their share or balance; a recently added item; a recent expense) stays within a readable width in the
middle of the panel, so the eye never travels across the whole panel to match a name with its amount.

**Why this priority**: It is the owner's first complaint and it touches every signed-in page.

**Independent Test**: With the same household, open Tổng quan, Chi tiêu, Thành viên and the monthly
report at 1366, 1536, 1920 and 2560 px and measure the side margins and, on Tổng quan, the distance
from a name to its amount.

**Acceptance Scenarios**:

1. **Given** a signed-in page at 1920 px wide, **When** it opens, **Then** the content (header included)
   is 1520 px wide and centred, about 200 px from each edge.
2. **Given** 1536 px, **When** a signed-in page opens, **Then** the side margins are 40 px (they were
   108 px); **given** 1366 px, **Then** nothing changes (38 px).
3. **Given** Tổng quan at 1280 px or wider, **When** the right column is wider than 640 px, **Then** the
   lines of Mới ghi, this month, Số dư and Khoản chi gần đây are at most 640 px wide and centred in
   their panel, while the panel's edge still spans the column.
4. **Given** any of those lines, **When** its name and its amount are measured, **Then** they are at most
   640 px apart at every width.

---

### User Story 2 - A sign-in page that looks like the product (Priority: P1)

Someone opens Fair-Share on a laptop and is not signed in. Instead of a small card under a lone logo
in the top corner, with the language and theme switches floating below and most of the screen empty,
they see one composed block in the middle of the screen: on the left the large Fair·Share wordmark,
"Rõ ai trả ai." / "See who owes who.", the short introduction, and a small cluster of the app's sticker
avatars; on the right the same sign-in / create-account form, with the language and theme switches
directly under it.

**Why this priority**: It is the owner's second complaint and the first screen every new user and the
course examiners see.

**Independent Test**: Sign out and open the app at 1024, 1366 and 1920 px in both languages and both
themes; then at 390 px. Create an account, sign in, and open an invite link signed out.

**Acceptance Scenarios**:

1. **Given** a screen 1024 px or wider and nobody signed in, **When** the app opens, **Then** one block
   about 980 px wide is centred horizontally and vertically: brand on the left, the form on the right,
   the language and theme switches directly under the form, and no small wordmark in the top corner.
2. **Given** that page, **When** read by a screen reader, **Then** the decorative avatars are not
   announced, the page still has one main heading (the form's), and the wordmark keeps its accessible
   name.
3. **Given** that page in Vietnamese and in English, **When** shown, **Then** the tagline is the brand's
   ("Rõ ai trả ai." / "See who owes who.") and the introduction is the text the form showed before.
4. **Given** an invite link opened signed out, **When** the page shows, **Then** the invitation title and
   note appear as before, on the form side.
5. **Given** the create-account tab, a server error or a field error, **When** the form grows, **Then**
   the page scrolls normally and nothing is cut off on a short laptop screen (768 px high).
6. **Given** a screen narrower than 1024 px, **When** signed out, **Then** the page is exactly as today.
7. **Given** the keyboard, **When** tabbing from the top, **Then** focus goes through the form, then the
   language switch, then the theme switch, in the order they are seen.

---

### User Story 3 - Fewer purple buttons, and the month's report beside its title (Priority: P2)

On Tổng quan a person owed by three housemates used to see four purple buttons stacked under the
purple verdict block. Now only "+ Ghi khoản chi" and the verdict block are loud; each card's
"Xác nhận đã nhận …đ" is an outlined button with the same words, amount and size. "Báo cáo tháng"
sits on the same line as the month's title, so the balances come up higher on the screen.

**Why this priority**: The second reviewer ranked the purple ladder as the biggest visual problem after
the width; it is a small change.

**Independent Test**: Open Tổng quan as a receiver with several open transfers and a pending
"Tôi đã chuyển", in both themes.

**Acceptance Scenarios**:

1. **Given** transfer cards with "Xác nhận đã nhận …đ", **When** shown, **Then** each is an outlined
   button (light surface, ink text, the control border), at least 44 px high, with focus, pressed and
   disabled states as visible as before; the action is unchanged.
2. **Given** 1280 px or wider, **When** the month section shows, **Then** "Báo cáo tháng" is on the
   title's line, right-aligned, and wraps under the title if they do not fit.

---

### User Story 4 - The expense table reads on one line (Priority: P2)

On Chi tiêu at 1280 px or wider the add form keeps a working width (380–420 px) instead of growing,
the table gets the rest, the three filters (Tháng, Người, Danh mục) sit on one row, and the line under
the payer's name ("chia đều, 4 người · Đi chợ") may wrap, so descriptions like "Xăng đi chợ đầu mối"
are no longer broken over two lines.

**Why this priority**: Found while reviewing the wide layout; readability of the main list.

**Independent Test**: Open Chi tiêu at 1280, 1536 and 1920 px with long descriptions, long names and
an amount of 12.500.000đ; expand a row's shares.

**Acceptance Scenarios**:

1. **Given** 1280 px or wider, **When** Chi tiêu opens, **Then** the form column is between 380 and
   420 px and the three filters share one row (Xoá bộ lọc, when shown, keeps its own row).
2. **Given** a typical description (up to about 25 characters) at 1536 px or wider, **When** listed,
   **Then** it is on one line; the payer's split line wraps at most once.
3. **Given** amounts up to 12.500.000đ, **When** listed, **Then** the amount never wraps and stays
   right-aligned, and an expanded row's shares still line up with the amount column.

### Edge Cases

- Between 1024 and 1279 px: the frame is unchanged except for the wider cap (which does not apply
  there); the 640 px line rule and the Chi tiêu changes start at 1280 px.
- Very wide screens (2560 px): the content stops at 1520 px; the margins grow, as agreed.
- 200% zoom on a 1366 px laptop behaves like a 683 px screen: the phone layout, unchanged.
- Dark mode, forced or from the system: every changed element uses the same tokens in both themes.
- A household with one member or none with an account: Tổng quan's lines still centre; no empty panel
  changes shape.
- Long Vietnamese names and the largest amounts in the 640 px lines: the name wraps, the amount never.
- The sign-in page with the browser window shorter than the block: the page scrolls; nothing is fixed.
- Signed in, the header (wordmark and account) is unchanged.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: From 1024 px, signed-in pages MUST cap the content, header included, at 1520 px, centred,
  keeping today's side padding (32 px, growing to 40 px).
- **FR-002**: From 1280 px, on Tổng quan, the lines inside the right-hand panels (Mới ghi, this month's
  people, Số dư, Khoản chi gần đây, and their headers and "Xem thêm") MUST be at most 640 px wide and
  centred in the panel; the panel's edge MUST still span its column. Expanded balance explanations
  MUST follow the same width.
- **FR-003**: From 1280 px, on Tổng quan, "Báo cáo tháng" MUST share the month title's line,
  right-aligned, wrapping below the title when there is not room.
- **FR-004**: The repeated action on each transfer card ("Xác nhận đã nhận …đ" for the receiver, and the
  payer's "Tôi đã chuyển" on the same cards, as in the approved captures) MUST be an outlined button
  (light surface, ink text, control border) at every width, with unchanged words, amount, action, 44 px height
  and visible focus, pressed and disabled states. "+ Ghi khoản chi" and the verdict block keep their look.
- **FR-005**: From 1280 px, on Chi tiêu, the form column MUST stay between 380 and 420 px; the three
  filters MUST share one row; the payer's split line MUST be allowed to wrap; the payer column MUST be
  wide enough (about 250 px) that the split line wraps at most once.
- **FR-006**: From 1024 px and signed out, the sign-in page MUST show one block (about 980 px) centred
  horizontally and vertically: on the left the wordmark (about 300 px wide), the tagline from the
  brand in the current language, the existing introduction, and four overlapping sticker avatars; on
  the right the existing form (440 px) with the language and theme switches directly under it.
- **FR-007**: Signed out, from 1024 px, the header MUST NOT show the small wordmark; signed in, the
  header MUST be unchanged.
- **FR-008**: The decorative avatars MUST be hidden from assistive technology; the page MUST keep one
  main heading (the form's) and the wordmark its accessible name.
- **FR-009**: The sign-in page MUST NOT add a taro background, a sample amount, a speed claim or the
  SẠCH NỢ stamp; the form's submit button stays its strongest colour.
- **FR-010**: The invitation title and note, the create-account fields, field errors and server errors
  MUST behave and read as today; the page MUST scroll when its content is taller than the screen.
- **FR-011**: Below 1024 px every screen MUST look and behave exactly as today.
- **FR-012**: Every new or changed text MUST exist in Vietnamese and English; every colour MUST come from
  the existing tokens and pass 4.5:1 (text) and 3:1 (control borders) in light and dark.
- **FR-013**: Keyboard order MUST match the visual order on every changed screen; nothing becomes sticky;
  every control stays at least 44 × 44 px; no horizontal scroll at 320 and 360 px.
- **FR-014**: DESIGN.md §6.6 MUST describe the new frame, the 640 px lines, the outlined repeated
  action, the Chi tiêu widths and the sign-in composition, replacing the 1320 px rule and the
  "440 px form in the middle" line, with the reason (owner review of 06/11).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: At 1920 px the empty margin on each side of a signed-in page drops from about 300 px to
  about 200 px; at 1536 px from 108 px to 40 px; at 1366 px it is unchanged.
- **SC-002**: On Tổng quan, at every width from 1280 to 2560 px, a person's name and their amount are at
  most 640 px apart.
- **SC-003**: On Tổng quan for a receiver with three open transfers, the number of filled purple controls
  in the first screen drops from five (add, verdict, three buttons) to two (add, verdict).
- **SC-004**: At 1366 × 768 and 1920 × 1080 the sign-in block is centred vertically within 24 px, with
  nothing cut off, in both languages and both themes; at 390 px the page is identical to today.
- **SC-005**: On Chi tiêu at 1536 px, the ten most recent expenses of the demo household show each
  description on one line.
- **SC-006**: The existing automated checks (unit tests, end-to-end walk, accessibility walk) pass, and the
  accessibility walk covers the signed-out page at a computer width.
- **SC-007**: The owner confirms the result matches the approved before/after captures.

## Assumptions

- The owner's captures of 06/11 (variant A for Tổng quan; sign-in at 1366; Tổng quan and Chi tiêu at
  1536) are the visual reference; this spec does not change colours, fonts, copy meaning or behaviour.
- The tagline and the introduction already exist in both languages; no new copy is needed beyond what
  the layout needs, and none promises speed.
- The four avatars on the sign-in page are decoration in the app's existing tints, with single letters,
  not real people.
- The three-column Tổng quan, moving the switches into the header, and the brand images still in the
  old lilac are out of scope.
- The Thành viên and monthly report pages only receive the wider frame; their inner layout is unchanged.
- Server, API and data are untouched; this is a front-end and documentation change only.
