# Feature Specification: Desktop look: warm cream ground, verdict B, readable width

**Feature Branch**: `feat/desktop-redesign`

**Created**: 2026-11-05

**Status**: Draft

**Input**: User description: "Đợt giao diện desktop cho Fair-Share (mục 8 và 9 của top 10 trong buổi review thiết kế 05/11, cùng các quyết định đã chốt). Đã chốt: (1) đổi nền sang kem ấm, giữ mực đậm và màu khoai môn, cho cả theme sáng và tối, thay cho nền lilac xám hiện tại; đây là đổi nhận diện nên BRAND.md và DESIGN.md phải cập nhật theo; (2) khối kết luận màu tím trên Tổng quan theo phương án B trong mockup đã duyệt: phần tím chỉ còn câu kết luận, số tiền và "Vì sao ra số này?", các khoản chuyển (thẻ của từng người, nút Tôi đã chuyển / Xác nhận đã nhận / Chưa nhận được, sao chép tin nhắn nhắc) nằm trong một khung trắng ngay bên dưới; (3) giới hạn chiều rộng nội dung trên màn hình lớn (khoảng 1280–1440px) để tên và số tiền không cách nhau quá xa ở 1920px; (4) chữ phụ trên desktop to hơn (13px lên 14px). Kèm hai góp ý của Minh ở PR #193: trong bảng Chi tiêu, số tiền ở hàng phần chia phải thẳng cột với cột Số tiền; vòng focus của nút tên khoản chi không được đè lên dòng ngày/người trả bên dưới. Bắt buộc theo constitution: mọi cặp chữ đạt tương phản ≥4.5:1 ở cả hai theme (đo lại toàn bộ), nút ≥44px, không cuộn ngang ở 320/360px, không màu nào chỉ định nghĩa cho một theme, component chỉ dùng token. Không đổi hành vi, không đổi API. Điện thoại không phải trọng tâm nhưng không được vỡ."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A warmer, calmer app in both themes (Priority: P1)

A housemate opens Fair-Share on a laptop. Instead of the grey lilac page that the design review said read like an admin panel, every screen sits on a warm cream ground with near-white panels, the same dark ink and the same taro purple for the one loud place. In dark mode the ground is a warm charcoal instead of a cold blue-black. Everything else (layout, words, behaviour) is unchanged.

**Why this priority**: It was the owner's decision after the review and it touches every screen, so the other stories are checked against it. It is also the change with the most risk: every colour pair has to be measured again.

**Independent Test**: Open each screen (sign in, Nhà của bạn, Tổng quan, Chi tiêu, Thành viên) in light and dark, forced and following the system, and check the ground, panels and text against the new palette and the contrast table.

**Acceptance Scenarios**:

1. **Given** light mode, **When** any screen is opened, **Then** the page ground is the warm cream of the approved mockup, panels are near-white with their 1 px edge, text is the brand ink, and the taro block keeps its colour.
2. **Given** dark mode (from the system or forced), **When** any screen is opened, **Then** the ground is a warm charcoal, panels a lighter warm grey, text a warm off-white, and the taro block a darker taro, as in the mockup's dark artboards.
3. **Given** any text on any surface in either theme, **When** its contrast is measured, **Then** it is at least 4.5:1; controls' outlines are at least 3:1 against what they sit on.
4. **Given** the stickers, money colours (được nhận / cần trả), yellow focus ring and AI button, **When** shown on the new grounds, **Then** they keep their meaning and pass the same contrast rules.

---

### User Story 2 - Tổng quan answers first, then lists what to do (Priority: P2)

On Tổng quan the taro block now holds only the answer: "Bạn cần trả Minh", the big amount and "Vì sao ra số này?". The transfers (each person's card, Tôi đã chuyển, Xác nhận đã nhận, Chưa nhận được, Hoàn tác, Sao chép tin nhắn nhắc nợ) sit in a white panel right under it, as in the approved mockup B.

**Why this priority**: The review found the taro block heavy because white cards were nested inside it; B keeps the one loud place small and puts the actions on a calm surface. It changes one screen.

**Independent Test**: Open Tổng quan with open transfers, as a payer and as a receiver, and check the taro block holds only the sentence, amount and link, and every transfer control is in the panel below and works as before.

**Acceptance Scenarios**:

1. **Given** open transfers, **When** Tổng quan opens, **Then** the taro block shows the sentence, the amount and "Vì sao ra số này?" only, and a white panel directly below lists every transfer card and the reminder button.
2. **Given** the panel, **When** the user presses any transfer control (Tôi đã chuyển, Xác nhận đã nhận, Chưa nhận được, Huỷ báo, Hoàn tác, Sao chép tin nhắn nhắc nợ), **Then** it does exactly what it does today, with the same messages and toasts.
3. **Given** a settled house or a house with nothing yet, **When** Tổng quan opens, **Then** the taro block shows its sentence as today and no empty panel is shown.
4. **Given** a phone width, **When** Tổng quan opens, **Then** the block and the panel stack in the same order with nothing cut off.

---

### User Story 3 - Readable at any desktop width (Priority: P3)

On a 1920 px monitor the content no longer stretches edge to edge: it stays within a comfortable width, centred, so a name and its amount sit close together. Secondary text (dates, "đã chi", hints) is a little larger on a computer.

**Why this priority**: The review measured names and amounts a thousand pixels apart at 1920 px and secondary text at 13 px as hard to read on a laptop. It is a layout-only change.

**Independent Test**: Open Tổng quan and Chi tiêu at 1280, 1440 and 1920 px and check the content width and the size of secondary text.

**Acceptance Scenarios**:

1. **Given** a window 1920 px wide, **When** any screen is opened, **Then** the content (header included) is no wider than the agreed maximum and is centred, with the ground on both sides.
2. **Given** a window of 1024 to the maximum, **When** any screen is opened, **Then** the layout is as today, only the secondary text changes.
3. **Given** a computer width (1024 px and up), **When** secondary text is shown, **Then** it is 14 px; on a phone it stays as today.

---

### User Story 4 - Two details in the Chi tiêu table (Priority: P4)

In the Chi tiêu table, the amounts in an opened row of shares line up with the Số tiền column above them, and the keyboard focus ring of an expense's description no longer covers the date and payer line under it.

**Why this priority**: Two small issues found while reviewing #193; worth fixing while the table's styles are being touched.

**Independent Test**: Open an expense's shares in the table at 1440 and ~1100 px and compare the right edges of the amounts; tab to a description and look at its focus ring.

**Acceptance Scenarios**:

1. **Given** an opened row of shares, **When** it is shown, **Then** each share amount's right edge lines up with the right edge of the Số tiền column.
2. **Given** keyboard focus on an expense's description, **When** the focus ring is drawn, **Then** it does not overlap the date and payer line under the description.

---

### Edge Cases

- A user who forced light or dark keeps that choice; the new palette applies to whichever theme is shown.
- Long names, 12-digit amounts and 200% zoom still fit without sideways scroll at 320, 360 and 640 px.
- A transfer card that is being recorded, undone or has a "Tôi đã chuyển" waiting keeps all its states inside the white panel.
- The account menu, toasts, skeletons, error notes and empty states sit on the new ground and still meet contrast.
- Brand images already made with the lilac ground (link preview image, slide and report covers) are not part of the app screens.
- A browser without system dark mode and no forced choice shows the light theme.

## Requirements *(mandatory)*

### Functional Requirements

**Palette**

- **FR-001**: The page ground in light mode MUST be the warm cream of the approved mockup, with near-white panels and the existing ink and taro, replacing the grey lilac.
- **FR-002**: Dark mode MUST use the warm dark counterparts of the mockup (charcoal ground, warm grey panels, warm off-white text, darker taro block).
- **FR-003**: Every colour MUST be defined for both themes; screens MUST use the shared colour names only, never a colour written in place.
- **FR-004**: Every text pair in both themes MUST measure at least 4.5:1, and control outlines at least 3:1 against their surface; the contrast table in DESIGN.md MUST be recomputed for the new values.
- **FR-005**: BRAND.md MUST describe the cream ground in place of Mist, and DESIGN.md MUST describe the new tokens, the verdict layout and the width rule.

**Tổng quan**

- **FR-006**: The taro block MUST contain only the verdict sentence, the total and "Vì sao ra số này?" (when shown today).
- **FR-007**: The transfer cards and the reminder button MUST be shown in a white panel directly under the taro block, in the same order and with the same controls, states and messages as today.
- **FR-008**: When there is no transfer to show, no empty panel MUST appear.

**Width and type**

- **FR-009**: On wide screens the content MUST stay within a maximum width between 1280 and 1440 px, centred.
- **FR-010**: Secondary text MUST be 14 px from 1024 px up; phone sizes stay as they are.

**Chi tiêu table**

- **FR-011**: Share amounts in an opened row MUST line up on the right with the Số tiền column.
- **FR-012**: The focus ring of an expense's description MUST NOT overlap the line under it.

**For every part**

- **FR-013**: No behaviour, wording (apart from what this spec names), request or permission MUST change.
- **FR-014**: Every control MUST stay at least 44 × 44 px; no screen may scroll sideways at 320, 360 or 640 px or at 200% zoom.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of text pairs measured on the five screens, in both themes, are at least 4.5:1; the automated contrast checks and the 44 px checks pass in both themes.
- **SC-002**: At 1920 px, the distance between a member's name and their amount in Số dư từng người is no more than at 1440 px.
- **SC-003**: On Tổng quan, the taro block is at most half its current height with two open transfers, and every transfer control is still one press away.
- **SC-004**: Every existing test of behaviour passes unchanged (only tests that assert colours, layout or the moved panel may change), and the live walk-through still passes.
- **SC-005**: In the Chi tiêu table, the right edges of share amounts and the Số tiền column differ by no more than 2 px.

## Assumptions

- The palette is the one on the approved mockup canvas (light and dark artboards of variant B); final shades may move slightly where a measured pair falls under 4.5:1.
- The maximum content width is about 1320 px, inside the requested 1280–1440 range.
- Brand image files (link preview image, slide and report covers, stickers) are not redrawn in this change; BRAND.md notes that they still show the old ground until they are redone.
- The wordmark, the app icon, the yellow coin, the stickers and the money colours do not change.
- Mobile layout is not redesigned; it only has to keep working with the new colours and the moved panel.
