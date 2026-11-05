# Feature Specification: Monthly report

**Feature Branch**: `feat/monthly-report`

**Created**: 2026-11-05

**Status**: Draft

**Input**: User description: "Tính năng "Báo cáo tháng" cho Fair-Share (tính năng lớn đầu tiên trong bốn tính năng đã chọn ngày 05/11). Đã chốt từ buổi review: báo cáo theo công thức đầu kỳ + biến động trong tháng = cuối kỳ, tính từ cùng dữ liệu khoản chi, phần chia và khoản trả như số dư hiện tại; không reset sổ, không tạo khoản trả giả, không khoá tháng (khoá tháng là nghiệp vụ mới, để sau). Người dùng (trên máy tính là trọng tâm) chọn một tháng và thấy: cả nhà chi bao nhiêu, mỗi người đầu tháng đang ở đâu (cần trả / được nhận), trong tháng đã chi bao nhiêu, phần của mình bao nhiêu, đã trả lại / nhận lại bao nhiêu, và cuối tháng ở đâu; tổng cuối kỳ của tháng hiện tại phải đúng bằng số dư đang hiện trên Tổng quan. Mở từ khối "Tháng …" trên Tổng quan và chuyển qua lại giữa các tháng. Chỉ để xem, không đổi dữ liệu. Theo constitution: tiền là số nguyên đồng, mọi số cộng lại đúng; chỉ thành viên trong nhà xem được (người lạ/đang chờ 404); tiếng Việt và tiếng Anh; tương phản AA, nút ≥44px, không cuộn ngang ở 320/360px."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See how this month moved everyone (Priority: P1)

At the end of November, Minh opens Tổng quan on a laptop and follows "Báo cáo tháng" from the "Tháng 11" block. A page for Tháng 11 shows what the house spent in the month and, for each housemate, one line that reads left to right: where they stood on 1 November (cần trả / được nhận), what they paid for the house, their share, what they paid back, what they got back, and where they stand at the end of the month. Minh's own line is marked. The end-of-month figures are exactly the balances Minh just saw on Tổng quan.

**Why this priority**: This is the whole point of the feature: the house can close a month in the group chat with numbers everyone can check, without resetting the books or recording fake repayments. Without it the rest is navigation.

**Independent Test**: With the demo house, open the report for the current month and check each line against the expenses and repayments of the month, and the end-of-month column against the balances on Tổng quan.

**Acceptance Scenarios**:

1. **Given** a house with expenses and repayments this month and earlier, **When** a member opens this month's report, **Then** it shows the month's total spending and one line per housemate with: start of month, paid, share, paid back, got back, end of month.
2. **Given** any line, **When** its figures are added up, **Then** start of month + paid − share + paid back − got back = end of month, to the đồng.
3. **Given** the current month and nothing dated after it, **When** the report is compared with Tổng quan, **Then** every housemate's end-of-month figure equals their balance on Tổng quan.
4. **Given** the report, **When** the start-of-month figures of all housemates are added, **Then** they sum to 0; the same holds for the end-of-month figures.
5. **Given** the signed-in member, **When** the report opens, **Then** their own line is marked as theirs ("Bạn"), as on Tổng quan.
6. **Given** the month's total spending, **When** it is compared with the "cả nhà chi" figure in the Tháng block on Tổng quan, **Then** they are the same.

---

### User Story 2 - Go back to earlier months (Priority: P2)

Duy Anh wants to know why October ended with them owing money. From the report they step back to Tháng 10, then Tháng 9, with a previous / next control. Each month starts exactly where the month before ended, so they can follow their balance month by month.

**Why this priority**: The review asked for a report per month, not just the current one; it is also how a housemate checks an old disagreement. It depends on Story 1's page.

**Independent Test**: Step from the current month back to the first month with activity and forward again; check that each month's start equals the previous month's end for every housemate.

**Acceptance Scenarios**:

1. **Given** the report for a month, **When** the member goes to the previous month, **Then** the report for that month is shown, and its end-of-month figures equal the start-of-month figures of the month they came from.
2. **Given** the first month in which the house has an expense or a repayment, **When** it is shown, **Then** every start-of-month figure is 0 and there is no way to go further back.
3. **Given** the last month that can be shown, **When** it is shown, **Then** there is no way to go further forward.
4. **Given** a month in the range with no expense and no repayment, **When** it is shown, **Then** it says nothing happened that month, and each housemate's start and end are the same.
5. **Given** a report page, **When** its address is copied and opened again by a member of the same house, **Then** the same month's report opens.

---

### User Story 3 - Read it in either language, on any screen (Priority: P3)

Duy Anh reads the app in English; the month names, column names and amounts follow that language. On a phone the lines stack so nothing is cut off.

**Why this priority**: Required by the constitution for every screen; the layout work is small once Story 1 exists.

**Independent Test**: Open the report in Vietnamese and English, at 1440, 360 and 320 px, in light and dark.

**Acceptance Scenarios**:

1. **Given** English, **When** the report opens, **Then** the title, month name, column names and notes are in English and amounts use the app's money format.
2. **Given** a phone 320 or 360 px wide, **When** the report opens, **Then** each housemate's figures are readable without sideways scroll and every control is at least 44 × 44 px.
3. **Given** light or dark mode, **When** the report opens, **Then** all text meets 4.5:1 and money colours keep their meaning (được nhận / cần trả).

---

### Edge Cases

- A house with no expense and no repayment at all: the "Báo cáo tháng" entry is not offered; opening a report address anyway shows the current month with nothing happened and every figure 0.
- An expense or repayment dated in a later month than today: the months that can be shown run up to that later month, so the last month's end-of-month figures still equal Tổng quan; the current month's end then differs from Tổng quan by exactly those later items, and the report says so in one line.
- An expense dated in an earlier month is added, edited or deleted after that month: every report from that month on changes accordingly; nothing is frozen.
- A housemate who joined later or has no activity in a month: they still get a line with zeros where nothing happened, so the totals add up.
- A member shown by a former name or whose account left the house (the "removed member" look used elsewhere): their line is kept with that look, because their figures are part of the totals.
- An address for a month outside the range, or not a real month (e.g. 2026-13): the report opens on the nearest month that can be shown.
- 12-digit amounts and long names fit without sideways scroll at 320 px and at 200% zoom.
- A stranger or someone still waiting for approval opens a report address: they get the same "not found" as for any other page of that house.
- The data fails to load: a clear error with a retry, never a half-filled table or wrong totals.
- "Tôi đã chuyển" notices that the receiver has not confirmed do not count, as everywhere else (ACCOUNTS S3).

## Requirements *(mandatory)*

### Functional Requirements

**Figures**

- **FR-001**: For a chosen month, the report MUST show the house's total spending in that month: the sum of the amounts of expenses dated in that month.
- **FR-002**: For each housemate, the report MUST show six figures: start of month, paid in the month, share in the month, paid back in the month, got back in the month, end of month.
- **FR-003**: Start of month MUST be the housemate's balance counting only expenses and repayments dated before the first day of the month; end of month MUST count those dated up to and including its last day. Both use the same rule as the balance on Tổng quan (paid − share + paid back − got back).
- **FR-004**: Every figure MUST be a whole number of đồng, and for every line start + paid − share + paid back − got back MUST equal end exactly; start-of-month figures MUST sum to 0, as MUST end-of-month figures; the paid figures MUST sum to the month's total spending.
- **FR-005**: An item MUST belong to the month of the date it was spent or repaid, not the day it was typed in.
- **FR-006**: Only confirmed repayments MUST count; a "Tôi đã chuyển" notice MUST NOT change any figure.
- **FR-007**: Each figure MUST show its direction the way the app already does (được nhận / cần trả for balances, plain amounts for paid, share and repayments), and the signed-in member's line MUST be marked as theirs.

**Months**

- **FR-008**: The months that can be shown MUST run from the first month with an expense or a repayment to the later of the current month and the last month with one.
- **FR-009**: The member MUST be able to move to the previous and the next month within that range, and the month MUST be part of the page's address so it can be reopened or shared with a housemate.
- **FR-010**: A month with no activity MUST say so and show each housemate's unchanged balance.
- **FR-011**: The report MUST be opened from the "Tháng …" block on Tổng quan, landing on the current month.

**Access and safety**

- **FR-012**: Only approved members of the house MUST be able to see its report; anyone else MUST get the same "not found" as for any other page of that house.
- **FR-013**: The report MUST be read-only: opening it MUST NOT create, change or delete any expense, share, repayment or notice, and there MUST be no "close the month", reset or lock action.

**Language and layout**

- **FR-014**: All words MUST exist in Vietnamese and English and follow the app's language; month names follow it too ("Tháng 11/2026" / "November 2026").
- **FR-015**: Every text pair MUST meet 4.5:1 in light and dark; every control MUST be at least 44 × 44 px; no sideways scroll at 320, 360 or 640 px or at 200% zoom.
- **FR-016**: While loading, the report MUST hold its place; if loading fails it MUST say so with a retry and MUST NOT show partial totals.

### Key Entities

- **Month**: a calendar month (year and month) in the house's history; has a first and last day.
- **Month line**: one housemate in one month, with start of month, paid, share, paid back, got back, end of month. Derived, never stored.
- **Month report**: the house, the month, the month's total spending, and one month line per housemate. Derived from the existing expenses, shares and confirmed repayments; nothing new is recorded.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In 100% of checked months of the demo house and of test houses, each line balances exactly (start + changes = end), starts and ends each sum to 0, and paid sums to the month's total spending.
- **SC-002**: For the current month (nothing dated later), every end-of-month figure equals the balance on Tổng quan, with no difference of even 1 đồng.
- **SC-003**: Going back one month at a time from the current month to the first, each month's start equals the previous month's end for every housemate, in 100% of steps.
- **SC-004**: A housemate can get from Tổng quan to the current month's report in one press, and to any earlier month in one press per month.
- **SC-005**: No request made while viewing a report changes the house's data (verified by comparing the data before and after a full walk through every month).
- **SC-006**: The automated accessibility walk passes on the report in both themes: contrast, 44 px, no sideways scroll at 320/360 px.

## Assumptions

- Builds on the stretch goal "monthly total per member" (PROJECT_SPEC §3.4) and the existing "Tháng …" block; it adds no new kind of record, so it stays inside the current scope (§3.3 is untouched).
- Every member of the house sees every housemate's line, as Tổng quan already shows everyone's balance.
- A month follows the calendar dates stored on each expense and repayment (no time of day), so there is no time-zone question.
- Desktop is the main target; the phone layout only has to stack and stay readable.
- Out of this feature: locking or closing a month, a monthly reminder message or export, charts, categories, and per-item explanation of a month's figures (the existing "Vì sao ra số này?" on Tổng quan stays as it is). Each can be a later feature.
- The month's list of expenses is already on Chi tiêu with its month filter; the report may link to it but does not repeat it.
