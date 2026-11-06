# Feature Specification: Recurring expenses, suggested when due

**Feature Branch**: `feat/recurring-expenses`

**Created**: 2026-11-06

**Status**: Draft (revised after a two-round critique, 06/11)

**Input**: User description: "Tính năng "Khoản chi định kỳ" cho Fair-Share (tính năng thứ tư, cuối cùng, trong bốn tính năng chọn ngày 05/11; chủ dự án đồng ý mở rộng PROJECT_SPEC §3.3 ngày 06/11). Theo buổi review: không cần cron hay thông báo; khi có người mở app thì gợi ý "Tới hạn tiền nhà, ghi luôn?" → form điền sẵn → người dùng bấm lưu (app không tự ghi tiền). Tiền điện vẫn nhập số thật (khoản định kỳ có thể không có số tiền cố định). Backend phải chống tạo trùng theo mẫu và kỳ (hai người cùng bấm, bấm hai lần). Tạo khoản định kỳ từ form ghi khoản chi, xem/xoá trong Chi tiêu, gợi ý tới hạn trên Tổng quan với "Ghi luôn" và "Bỏ qua tháng này". Quyền như khoản chi (thành viên tạo được; người tạo hoặc chủ nhà sửa/xoá); người lạ/đang chờ 404. Tiền là số nguyên đồng. Tiếng Việt và tiếng Anh; tương phản AA ở cả hai theme; nút ≥44px; không cuộn ngang ở 320/360px; trên máy tính là trọng tâm. Chạy được trên gói miễn phí hiện tại."

**Scope of this version** (from the critique, given the 08/11 report deadline): no "Bỏ qua tháng này" and no undo; a recurring item is split equally (a custom split is not kept in an item); an item is stopped, never deleted or edited.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Make an expense recur, from the form (Priority: P1)

On 1 November Minh records "Tiền nhà" 4.500.000đ split equally between the three. Near the bottom of the form, before Lưu, Minh ticks "Lặp lại hằng tháng"; a line under it says "Nhắc ngày 1 mỗi tháng · không tự ghi tiền". The expense is saved as usual and the house now has a recurring "Tiền nhà". Tiến records "Tiền điện", ticks the box and then "Số tiền thay đổi mỗi tháng": the item remembers everything but the amount.

**Why this priority**: Without a recurring item there is nothing to suggest. One tick on an expense already being typed is how the review wanted it made.

**Independent Test**: Add an expense with the tick, with and without a fixed amount; check one expense is saved, linked to a new item with the same description, category, payer, people, day and amount (or none).

**Acceptance Scenarios**:

1. **Given** the add form with an equal split, **When** the user ticks "Lặp lại hằng tháng" and saves, **Then** the expense is saved and an active recurring item is created with its description, category, payer, the people sharing it, its amount and the day of the month of its date; the expense is that item's record for its month.
2. **Given** "Số tiền thay đổi mỗi tháng" is also ticked, **When** saved, **Then** the item has no fixed amount.
3. **Given** a custom split, **When** the user ticks "Lặp lại hằng tháng", **Then** the form says a recurring item can only be split equally and does not save until the split is equal or the tick is removed.
4. **Given** the tick is not set, **When** the user saves, **Then** nothing recurs, exactly as today.
5. **Given** editing an existing expense, or the form opened from a due item, **When** it shows, **Then** there is no "Lặp lại hằng tháng" tick.
6. **Given** the house already has 20 active items, **When** a 21st is ticked and saved, **Then** nothing is saved and the form says why.

---

### User Story 2 - When it is due, record it in two presses (Priority: P1)

On 1 December Tiến opens Tổng quan. Under the transfers (the money actions), a card "Tới hạn" says "Tiền nhà · 4.500.000đ · Minh trả · ngày 1" with "Ghi luôn". Tiến presses it: Chi tiêu opens with the form filled (description, category, amount, payer, the people, today's date) and a line "Đang ghi kỳ 12/2026", and Tiến presses Lưu. For "Tiền điện" the form opens with the amount empty and focused, so the real bill is typed.

**Why this priority**: This is what the feature is for: fixed bills get recorded without retyping, and the app never records money by itself.

**Independent Test**: With an item due today, press "Ghi luôn", save, check one expense is linked to it for this month and the card is gone after a reload; try to save the same item for the same month again (double press after a failure, a second tab, another member) and check it is refused.

**Acceptance Scenarios**:

1. **Given** an active item whose day has come this month (the month's last day if shorter) and no expense linked to it for this month, **When** any member opens Tổng quan, **Then** it is listed under "Tới hạn" with its description, amount (or "nhập số tiền tháng này"), payer and day.
2. **Given** a due item, **When** "Ghi luôn" is pressed, **Then** Chi tiêu opens with the add form filled from the item and today's date, and "Đang ghi kỳ <month>"; nothing is saved until Lưu.
3. **Given** the filled form, **When** the user changes the date to another month, **Then** "Đang ghi kỳ" follows the date, and the saved expense is the item's record for the month of the date chosen.
4. **Given** the filled form, **When** the user changes amount, payer or split (custom included) and saves, **Then** the expense is saved as typed and still linked to the item.
5. **Given** an expense linked to an item already exists for a month, **When** anyone saves another one for the same item and month, **Then** it is refused with "Kỳ <month> của <description> đã có người ghi", what the user typed stays in the form, and they can open the existing expense.
6. **Given** a member who had the item in the split, or as payer, is no longer in the house, **When** the form is filled, **Then** they are left out and the form says so ("Minh không còn trong nhà, đã bỏ khỏi cách chia"; the payer is left for the user to pick); with nobody left to share, saving is blocked until people are chosen.
7. **Given** the day has not come, or the item was stopped, or the month is already recorded, **When** Tổng quan opens, **Then** it is not listed; with nothing due there is no card.
8. **Given** more than 3 due items, **When** the card shows, **Then** 3 are listed and "Xem tất cả (n)" shows the rest in place.

---

### User Story 3 - Keep records consistent when they change (Priority: P1)

Minh moves December's "Tiền nhà" from 1 December to 30 November by mistake, while November is already recorded: the change is refused and nothing moves. Moving it to a month with no record works, and December becomes due again. Deleting December's record makes December due again.

**Why this priority**: "One record per item and month" has to hold through edits and deletions, not just new saves, or the house can pay rent twice.

**Independent Test**: Edit a linked expense's date into a month that has a record (refused) and into one that does not (accepted, the old month due again); delete a linked expense (its month due again).

**Acceptance Scenarios**:

1. **Given** a linked expense, **When** its date is changed into a month that already has an expense linked to the same item, **Then** the change is refused, nothing is saved, and the form keeps what was typed.
2. **Given** a linked expense, **When** its date is changed into a month with no record for the item, **Then** it is saved and becomes that month's record; the month it left is due again if it is the current month and the day has come.
3. **Given** a linked expense, **When** it is deleted, **Then** its month has no record and the item is due again in that month (if active and the day has come).
4. **Given** an edit from a page that does not know recurring items, **When** it is saved, **Then** the link to the item is kept.
5. **Given** who may edit a linked expense, **When** the rule is checked, **Then** it is the account that recorded that expense (or the owner), as for any expense; creating the item gives no right over expenses others record from it.

---

### User Story 4 - See and stop recurring items (Priority: P2)

In Chi tiêu, a folded section "Khoản định kỳ (2)" lists the active items: description, amount or "số tiền thay đổi", payer, day, and this month's state (đã ghi, tới hạn, chưa tới ngày). The house cancels its internet plan: the item's creator, or the owner, presses "Ngừng lặp". It leaves the list and is never suggested again; the expenses recorded from it stay as they were.

**Why this priority**: People must see what recurs and stop what no longer applies, including items not due yet. Smaller than recording.

**Independent Test**: Open the section, check each item and its state; stop one as its creator, as the owner, and try as another member.

**Acceptance Scenarios**:

1. **Given** active items, **When** Chi tiêu opens, **Then** "Khoản định kỳ (n)" (n = active items) lists each with its details and this month's state.
2. **Given** its creator or the owner, **When** "Ngừng lặp" is pressed and confirmed, **Then** the item stops: it leaves the list and is never due again; its recorded expenses and their links stay.
3. **Given** another member, **When** they look at an item they did not create, **Then** there is no "Ngừng lặp", and the server refuses it if asked anyway.
4. **Given** a form filled from an item that was stopped meanwhile, **When** it is saved, **Then** it is refused with a message saying the item was stopped; editing expenses already recorded from it still works.
5. **Given** no active item, **When** Chi tiêu opens, **Then** the section says how to make one ("Tích Lặp lại hằng tháng khi ghi khoản chi").

---

### Edge Cases

- Day 29–31 in a shorter month: due on the month's last day.
- An item made from an expense dated last month: that month is its record; the current month is due on its day.
- Two members save the same item for the same month at the same moment: one expense is kept, the other gets US2-5.
- The server saved but the answer was lost and the user presses Lưu again: a second item (and a second expense) can be created; accepted as a known limit (Assumptions). The "one per month" rule holds per item, not across two items with the same name.
- Two members create the 20th item at the same moment: only one is accepted.
- Stopping an item while someone is saving from it: either the save lands before the stop (and stays) or it is refused; never a record from a stopped item after the stop.
- Two devices near the end of a month, or with a wrong clock, can see different due lists (the device date decides "today", as everywhere in the app); the server still never keeps two records for one item and month.
- Deleting the house removes its items with it.
- A stranger or someone waiting for approval: same not-found as everywhere.
- Long descriptions and 12-digit amounts fit without sideways scroll at 320 px and at 200% zoom.

## Requirements *(mandatory)*

### Functional Requirements

**Creating**

- **FR-001**: When adding an expense, the form MUST offer "Lặp lại hằng tháng" (off) near the bottom, before Lưu, with a line naming the day ("Nhắc ngày 5 mỗi tháng · không tự ghi tiền"); "Số tiền thay đổi mỗi tháng" (off) MUST appear only once it is ticked. Not offered when editing or recording from an item.
- **FR-002**: Saving with the tick MUST create the item and the expense together (both or neither), with the expense as the item's record for the month of its date. The item keeps description, category, payer, the people sharing equally, the amount (none if varying) and the day of the month of the date.
- **FR-003**: A recurring item MUST be split equally; ticking it on a custom split MUST be refused with a clear message.
- **FR-004**: A house MUST have at most 20 active items, checked so that two simultaneous creations cannot exceed it.

**Due and recording**

- **FR-005**: An item is due in the current month when it is active, its day (or the month's last day) has come by the device's date, and no expense is linked to it for that month.
- **FR-006**: Tổng quan MUST list due items in a card "Tới hạn" under the transfers (left column on a computer; after the transfers on a phone), 3 at first with "Xem tất cả (n)"; no card when none is due.
- **FR-007**: "Ghi luôn" MUST open the add form filled from the item (description, category, amount if fixed, payer and people still in the house, today's date), marked as recorded from the item, not as AI, with "Đang ghi kỳ <month>" following the date; it MUST NOT save anything.
- **FR-008**: People no longer in the house MUST be left out of the filled form with a message; with no payer left the user picks one; with nobody left to share, saving is blocked.

**One record per item and month**

- **FR-009**: The server MUST keep at most one expense per item per month of the expense's date, for new expenses and for edits alike; a save or edit that would make a second one MUST be refused (conflict), roll back entirely, and name the month and item. The form keeps what was typed and offers the existing expense.
- **FR-010**: An edit that does not mention the item MUST keep the expense's link; an edit cannot move an expense to another house's item.
- **FR-011**: Deleting a linked expense, or moving it to another month, MUST leave its old month without a record.

**Seeing and stopping**

- **FR-012**: Chi tiêu MUST show a folded "Khoản định kỳ (n)" with each active item's details and this month's state.
- **FR-013**: An item MUST be stoppable by its creator or the house's owner only; a stopped item is never due again, is refused as the source of a new expense, and keeps its recorded expenses and their links.

**For every part**

- **FR-014**: Only approved members MUST see or act on a house's items; anyone else gets the house's not-found; a member without the right gets a refusal, as for expenses. Editing a linked expense follows the expense rule (who recorded it, or the owner).
- **FR-015**: Money stays whole đồng; items change no balance until an expense is saved from them.
- **FR-016**: Nothing is recorded, sent or scheduled by the app on its own: no background job, notification or email.
- **FR-017**: All words in Vietnamese and English; 4.5:1 text contrast in both themes; controls at least 44 × 44 px; no sideways scroll at 320, 360 or 640 px or at 200% zoom.
- **FR-018**: PROJECT_SPEC §3.3 MUST record the scope extension of 06/11, in the style of the earlier ones.
- **FR-019**: Existing data MUST be untouched: every expense from before has no item; balances and reports are unchanged.

### Key Entities

- **Recurring item**: belongs to a house; description, category, payer, the people sharing equally, amount or none, day of the month (1–31), active or stopped, who created it, when.
- **Link**: an expense may point to one item of its house; the pair (item, month of the expense's date) is unique. "This month's record" is the linked expense, not a separate row.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Making an expense recur costs one tick in the form it is already typed in (two for a varying amount).
- **SC-002**: Recording a due fixed-amount item takes two presses from Tổng quan ("Ghi luôn", Lưu); a varying one adds only the amount.
- **SC-003**: For one item, in 100% of attempts to have two expenses in one month (simultaneous saves, second tab, edit of the date), at most one exists afterwards.
- **SC-004**: No expense is ever created without a person pressing Lưu.
- **SC-005**: Balances, suggested transfers and monthly reports are identical before and after the migration for the same expenses.
- **SC-006**: At 1440 × 900 with a due card, the "Mới ghi" title and the "Báo cáo tháng" link stay in the first screen (spec 006); the accessibility walk passes on Tổng quan and Chi tiêu with the new parts, in both themes.

## Assumptions

- Monthly only; no weekly or yearly items.
- No skip and no undo in this version: a month that does not apply is simply not recorded (the card stays until the month ends). Skipping is the first thing to add later.
- No editing or deleting of an item: it is stopped, and a new one is made by ticking on a new expense.
- Only the current month is suggested; a past month is recorded by hand if needed (and still counts once).
- Known limit: if the server saved but the answer was lost, pressing Lưu again can create a second item and a second expense; a key per save would prevent it and is left for later.
- "Today" is the device's date, as everywhere in the app; two devices can briefly disagree around midnight at the end of a month.
- Any approved member may record a due item, like any member may add an expense; stopping follows the expense rule (creator or owner).
- Quick add (AI) does not create items; its draft does not offer the tick (a filled AI form can still be ticked before saving).
- Runs on the current free tier: the due list is worked out when someone opens the app.
