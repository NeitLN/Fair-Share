# Feature Specification: "Mới ghi", what housemates recorded since you last looked

**Feature Branch**: `feat/recently-added`

**Created**: 2026-11-06

**Status**: Draft (revised after a two-round critique, 06/11)

**Input**: User description: "Tính năng "Mới ghi" cho Fair-Share (tính năng thứ ba trong bốn tính năng chọn ngày 05/11, sau Báo cáo tháng #197 và Danh mục #199). Theo buổi review: hoạt động gần đây tốt hơn một hộp thông báo đã đọc/chưa đọc; bản đầu chỉ hiện các bản ghi mới (khoản chi và khoản trả bạn cùng nhà vừa ghi), không hứa nhật ký đầy đủ (thông báo "Tôi đã chuyển" bị xoá khi nhận, khoản chi có thể bị sửa hoặc xoá). Trên Tổng quan có một dải "Mới ghi" liệt kê những gì người khác trong nhà ghi kể từ lần cuối bạn xem trên thiết bị này, mỗi mục bấm vào mở đúng khoản đó; có nút "Đã xem" để ẩn. "Lần cuối xem" chỉ lưu trên thiết bị (đồng bộ nhiều thiết bị cần thêm dữ liệu, để sau). Không đổi API, không đổi dữ liệu. Chỉ thành viên trong nhà thấy; tiếng Việt và tiếng Anh; tương phản AA ở cả hai theme; nút ≥44px; không cuộn ngang ở 320/360px; trên máy tính là trọng tâm nhưng điện thoại không được vỡ."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See what housemates recorded since last time (Priority: P1)

Tiến opens Tổng quan in the evening. Since the morning, Minh recorded "Lẩu thứ sáu", which Tiến shares in, and Duy Anh confirmed receiving Tiến's repayment. At the top of the right column (under the transfers on a phone) a quiet strip "Mới ghi" lists both, newest first: "Minh ghi Lẩu thứ sáu · 240.000đ" and "Duy Anh ghi đã nhận 440.000đ từ bạn", each with when. Tiến's own entries are not in it: Tiến knows what was typed.

**Why this priority**: It answers "có gì mới không?" when opening the app, without a notification inbox. It is the feature.

**Independent Test**: As one member, record an expense and, as a receiver, a repayment; as another member in another browser, open Tổng quan and check the strip lists exactly those two, with who recorded them, what, how much and when.

**Acceptance Scenarios**:

1. **Given** housemates recorded expenses or repayments after this member's marks in this browser, **When** Tổng quan opens, **Then** "Mới ghi" lists each, newest first by the time it was recorded, with who recorded it, what it was (an expense's description; "đã nhận <amount> từ <payer>" for a repayment, "bạn" for the member), the amount and when.
2. **Given** a housemate recorded an expense the member paid or shares in, **When** the strip is built, **Then** it is listed: what counts is who recorded it, not who paid or shares.
3. **Given** the member recorded an expense on behalf of someone else, or recorded a repayment they received, **When** the strip is built, **Then** it is not listed.
4. **Given** the member paid a housemate and the housemate recorded receiving it, **When** the strip is built, **Then** it is listed ("… ghi đã nhận 440.000đ từ bạn").
5. **Given** nothing new, or only the member's own records, **When** Tổng quan opens, **Then** no strip is shown (no empty box, no "0 mới").
6. **Given** a record from before accounts (no recorder at all), **When** the strip is built, **Then** it is left out; **Given** a recorder whose account has since left the house, **Then** it is listed with the removed-member name used elsewhere.
7. **Given** the first visit to this house in this browser, **When** housemates recorded something in the last 7 days, **Then** those are listed; older records are not.
8. **Given** more new records than fit, **When** the strip shows, **Then** it starts with 3 on a computer and 5 on a phone, and "Xem thêm N" reveals the rest in place.

---

### User Story 2 - Open a record, then mark everything as seen (Priority: P2)

Tiến presses "Minh ghi Lẩu thứ sáu": Chi tiêu opens with that expense revealed, as "Vì sao ra số này?" already does. Back on Tổng quan, Tiến presses "Đã xem tất cả": the strip disappears and stays gone until a housemate records something new.

**Why this priority**: Without a way to open a record and to clear the strip, it is a list that never goes away. Depends on Story 1.

**Independent Test**: With a strip of two records, open each, then press "Đã xem tất cả", reload, and check the strip is gone; record something new as another member and check only that one appears.

**Acceptance Scenarios**:

1. **Given** an expense in the strip that still exists, **When** it is pressed, **Then** Chi tiêu opens with that expense revealed.
2. **Given** a repayment in the strip that still exists, **When** it is pressed, **Then** the page moves to that repayment in Lịch sử trả.
3. **Given** the strip, including items still folded behind "Xem thêm", **When** "Đã xem tất cả" is pressed, **Then** the strip disappears at once and stays hidden after a reload in this browser.
4. **Given** the member pressed "Đã xem tất cả", **When** a housemate records something newer, **Then** the strip comes back with only the newer records.
5. **Given** expenses had not been fetched again while repayments had (they refresh on different schedules), **When** "Đã xem tất cả" is pressed, **Then** an expense recorded earlier than the newest repayment but not yet loaded still appears once it is loaded.

---

### User Story 3 - Read it in either language, on any screen (Priority: P3)

Duy Anh reads the app in English; the strip says "Recently added", "Minh added …", "Mark all as seen". On a phone it comes after the verdict and the transfers, so the money actions stay first.

**Why this priority**: Required for every screen; small once Story 1 exists.

**Independent Test**: Open Tổng quan with new records in Vietnamese and English, at 1440, 360 and 320 px, light and dark.

**Acceptance Scenarios**:

1. **Given** English, **When** the strip shows, **Then** every word and the times are in English.
2. **Given** 320 or 360 px, **When** the strip shows, **Then** nothing scrolls sideways, every control is at least 44 × 44 px, and the strip comes after the verdict and its transfers panel.
3. **Given** a computer at 1440 × 900 with the strip folded, **When** Tổng quan opens, **Then** the strip's title and first item, and the "Tháng …" heading with its "Báo cáo tháng" link, are all visible without scrolling.

---

### Edge Cases

- An expense edited after it was recorded is not shown again; deletions and "Tôi đã chuyển" notices never appear. The strip is "recently added", not an activity log.
- A record pressed after it was deleted: Chi tiêu opens with nothing revealed, or the page does not move, with no extra message; the record leaves the strip when its list is fetched again (every 30 s for repayments, on the next load of expenses).
- One of the two lists fails or has not loaded, or the members have not loaded: no strip is built from partial data, and no mark moves. Tổng quan already reports a failed request.
- Two records saved at exactly the same instant, one arriving after the mark: it is not shown. Accepted as a limit of the first version (see Assumptions).
- Signing out and in as someone else, or opening another house: each member has their own marks for each house; nothing carries over.
- The browser blocks or wipes its storage: the page still works; "Đã xem tất cả" hides the strip for this visit only.
- Long descriptions and 12-digit amounts wrap without sideways scroll at 320 px and at 200% zoom.
- A stranger or someone waiting for approval: same not-found as for any page of the house.

## Requirements *(mandatory)*

### Functional Requirements

**What is listed**

- **FR-001**: Tổng quan MUST show a "Mới ghi" strip listing expenses and repayments recorded by other members of the house after this member's marks for this house in this browser.
- **FR-002**: "Recorded by" MUST mean the account that saved the record, matched against the signed-in account; payer and participants do not matter. Records saved by the member, records with no recording account (from before accounts) and "Tôi đã chuyển" notices MUST NOT be listed.
- **FR-003**: "New" MUST be judged by the time a record was saved, not its spent or repaid date; expenses and repayments are merged and ordered newest saved first.
- **FR-004**: Each item MUST say who recorded it (the house's short name, or the removed-member name when their account has left), what it is (an expense's description, or "đã nhận <amount> từ <payer>", with "bạn" for the member), its amount and when it was saved, in the page's language.
- **FR-005**: By default 3 items MUST show on a computer and 5 on a phone; "Xem thêm N" MUST reveal the rest in place.
- **FR-006**: With no marks yet for this house in this browser, the strip MUST list records saved in the last 7 days by the device clock.
- **FR-007**: With nothing to list, or while any of members, expenses or repayments is failing or not yet loaded, no strip MUST be shown.

**Acting on it**

- **FR-008**: Pressing an expense item MUST open Chi tiêu with that expense revealed when it still exists; pressing a repayment item MUST move to it in Lịch sử trả when it still exists. A deleted record opens nothing in particular and shows no message.
- **FR-009**: "Đã xem tất cả" MUST cover every listed item, folded ones included, hide the strip at once, and move two marks, one for expenses and one for repayments: each becomes the latest saved time in that list as it was when the strip was built. A mark never moves back.
- **FR-010**: An item is new when its saved time is strictly later than its own list's mark, compared at the full precision the server gives.
- **FR-011**: The marks MUST be kept in this browser only, per member and per house, and survive a reload when storage is available; if storage is unavailable the page MUST keep working.

**For every part**

- **FR-012**: No API, schema or server-side data changes, and no new periodic requests; the strip only reads what Tổng quan already loads, on its existing refresh schedule.
- **FR-013**: All words MUST exist in Vietnamese and English; text pairs MUST meet 4.5:1 in light and dark; the strip uses a neutral surface (not the taro block); every control MUST be at least 44 × 44 px; no sideways scroll at 320, 360 or 640 px or at 200% zoom.
- **FR-014**: The strip MUST be announced politely to screen readers when it appears, without moving the focus; the "Đã xem tất cả" control's accessible name MUST include how many items it marks.

### Key Entities

- **Recent item** (derived): a record (expense or repayment) saved by another member's account, with who, what, how much, when it was saved, and where it opens.
- **Seen marks** (in the browser): for one member in one house, the latest saved time marked as seen among expenses, and the same among repayments.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For records that still exist and have been loaded, a member sees every expense and repayment a housemate saved after their marks, and none of their own, in 100% of checked cases (except two records saved at the same instant, see Assumptions).
- **SC-002**: From the strip, a member reaches any listed record that still exists in one press.
- **SC-003**: After "Đã xem tất cả", the strip stays hidden across reloads in the same browser until a newer record is loaded, in 100% of checked cases.
- **SC-004**: At 1440 × 900 with the strip folded, its title and first item and the "Tháng …" heading with "Báo cáo tháng" are visible without scrolling.
- **SC-005**: The automated accessibility walk passes on Tổng quan with the strip shown, in both themes.

## Assumptions

- The marks live only in this browser: seeing the strip on a laptop does not clear it on a phone, nor in another browser on the same laptop. Syncing them needs stored data and is a later feature.
- Edits, deletions and notices are not in the strip: the data has no edit time, a deleted record simply disappears, and notices have their own place.
- Two marks instead of one keep an expense that had not been fetched yet from being swallowed by a newer repayment. A record that arrives late with a saved time equal to or earlier than its list's mark is not shown; with times kept to the microsecond this is very unlikely, and keeping a set of seen ids is left for later.
- The first-visit window uses the device clock; everything after "Đã xem tất cả" uses the server's saved times.
- 7 days, 3 items on a computer and 5 on a phone are defaults that keep the strip short and keep "Báo cáo tháng" in view; they can change without changing the rest.
- Repayments refresh every 30 s on Tổng quan; expenses refresh when they are loaded again (opening the page, a change on another tab). The strip follows that; no new polling is added.
