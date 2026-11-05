# Feature Specification: Expense categories and a chart per month

**Feature Branch**: `feat/expense-categories`

**Created**: 2026-11-05

**Status**: Draft

**Input**: User description: "Tính năng "Danh mục và biểu đồ" cho Fair-Share (tính năng thứ hai trong bốn tính năng chọn ngày 05/11, sau Báo cáo tháng #197). Mỗi khoản chi có một danh mục (ví dụ ăn uống, đi chợ, điện nước, tiền nhà, đi lại, sinh hoạt, khác); khoản chi cũ không có danh mục thì tính là "Khác"; người dùng chọn danh mục khi ghi hoặc sửa khoản chi, mặc định hợp lý để không thêm bước. Xem được cả nhà chi theo danh mục trong một tháng bằng biểu đồ dễ đọc (trên máy tính là trọng tâm), đặt trong Báo cáo tháng; lọc Chi tiêu theo danh mục; danh mục có trong file CSV. Tiền là số nguyên đồng, tổng các danh mục bằng đúng tổng tháng. Quyền như khoản chi hiện tại (ai được sửa khoản chi thì được đổi danh mục); người lạ/đang chờ 404. Tiếng Việt và tiếng Anh; tương phản AA ở cả hai theme, biểu đồ không chỉ dựa vào màu; nút ≥44px; không cuộn ngang ở 320/360px."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Each expense has a category, with no extra step (Priority: P1)

Tiến types "Tiền điện tháng 11" and 450k and presses Lưu, as before. The form has already picked *Điện nước* from the words typed, and one press would change it with one press if it were wrong. Minh types "Lẩu thứ sáu": the form picks *Ăn uống*. Duy Anh types "Mua bóng đèn": nothing matches, so it is *Khác* and Duy Anh switches it to *Sinh hoạt*. Every expense in Chi tiêu now shows its category next to the payer.

**Why this priority**: The chart and the filter are only as good as the categories behind them, and the review insisted that adding an expense must not get slower. This story alone already makes the list easier to scan.

**Independent Test**: Add expenses with descriptions that match and do not match a category, change one by hand, edit an old one, and check what is saved and shown in the list.

**Acceptance Scenarios**:

1. **Given** the add form, **When** the description contains a word tied to a category (e.g. "điện", "nước", "lẩu", "chợ", "tiền nhà", "xăng"), **Then** that category is preselected; **When** nothing matches, **Then** *Khác* is preselected.
2. **Given** a preselected category, **When** the user picks another one and saves, **Then** the expense is saved with the picked one, and typing more of the description no longer changes it.
3. **Given** an expense saved before this feature, **When** it is shown, edited or counted, **Then** its category is *Khác*.
4. **Given** someone who may change an expense, **When** they edit it, **Then** they can change its category; someone who may not change it cannot change its category either.
5. **Given** an expense filled in by AI quick add, **When** the draft fills the form, **Then** the category is preselected from the drafted description the same way, and the user can change it before saving.
6. **Given** the list of expenses (phone list and computer table), **When** it is shown, **Then** each expense shows its category in words.

---

### User Story 2 - See where the month's money went (Priority: P2)

At the end of November Minh opens Báo cáo tháng. Under the housemates' figures, a chart "Chi theo danh mục" lists each category the house spent on that month, biggest first: a bar, its name, its amount and its share of the month ("Tiền nhà 4.500.000đ · 58%"). The amounts add up to exactly "Cả nhà chi". Pressing a category opens Chi tiêu with that month and that category filtered.

**Why this priority**: It answers the question the review raised ("tháng này tiền đi đâu?") and sits in the report just shipped. It depends on Story 1's data.

**Independent Test**: Open the report for a month with expenses in several categories and check order, amounts, shares and the total; follow one category to Chi tiêu.

**Acceptance Scenarios**:

1. **Given** a month with expenses, **When** its report opens, **Then** "Chi theo danh mục" shows one line per category with at least one expense that month, biggest amount first, each with name, amount and percentage written out.
2. **Given** the chart, **When** its amounts are added, **Then** they equal the month's "Cả nhà chi" to the đồng, and the percentages shown add up to 100% (rounding never shows 99% or 101%).
3. **Given** a month with no expense, **When** its report opens, **Then** no chart is shown (the report already says nothing happened).
4. **Given** a category line, **When** it is pressed, **Then** Chi tiêu opens filtered to that month and that category.
5. **Given** light or dark mode, a screen reader, or a grey-scale screen, **When** the chart is read, **Then** every value is available as text; colour only decorates.

---

### User Story 3 - Filter and export by category (Priority: P3)

Duy Anh wants every "Đi chợ" expense since September. In Chi tiêu they pick the category in the filters, next to month and person; the list and its totals follow. The CSV export has a category column, so the spreadsheet can be sorted by it.

**Why this priority**: Useful but secondary; the filters and the export already exist and only gain one field.

**Independent Test**: Filter Chi tiêu by category alone and together with month and person; export a CSV and open it in a spreadsheet.

**Acceptance Scenarios**:

1. **Given** the Chi tiêu filters, **When** a category is picked, **Then** only expenses of that category show, combined with any month and person filter; *Tất cả* removes it.
2. **Given** a category with no expense in the current list, **When** the filter is opened, **Then** it is still listed (so the list of categories never jumps), and picking it shows the usual empty result.
3. **Given** an export, **When** the CSV is opened, **Then** each row has the category name in the page's language, in its own column.

---

### Edge Cases

- A description that matches two categories ("tiền nhà và điện"): the first match in a fixed order wins; the user can change it.
- The user picks a category, then clears and retypes the description: their pick stays; only a category nobody picked follows the description.
- Editing an old expense: it opens with *Khác* preselected, and the description is not used to guess (the stored category is respected); the user changes it by hand if they want.
- An older version of the app (a stale tab) saves an expense without a category: it is saved as *Khác*, never refused.
- A request with an unknown category: refused with a clear message naming the field; nothing saved.
- Very small categories in the chart (e.g. 1.000đ in a 4.000.000đ month): still listed, with a visible minimum bar and "<1%".
- 12-digit amounts and long category names in English fit without sideways scroll at 320 px and at 200% zoom.
- A stranger or someone waiting for approval: same not-found as everywhere; categories reveal nothing new.

## Requirements *(mandatory)*

### Functional Requirements

**Categories**

- **FR-001**: The app MUST offer a fixed list of seven categories, in this order: Ăn uống, Đi chợ, Điện nước, Tiền nhà, Đi lại, Sinh hoạt, Khác (English: Food & drinks, Groceries, Utilities, Rent, Transport, Household, Other).
- **FR-002**: Every expense MUST have exactly one category; expenses recorded before this feature MUST count as *Khác*.
- **FR-003**: When adding an expense, the category MUST be preselected from words in the description (a fixed, documented list of words per category, checked in the order of FR-001), else *Khác*; once the user picks a category themselves, the description MUST NOT change it again.
- **FR-004**: Choosing another category MUST take at most one press to open the choice and one to pick, and MUST NOT be required to save.
- **FR-005**: An expense's category MUST be changeable exactly by those who may change the expense today; the same rights and the same not-found apply.
- **FR-006**: A save without a category MUST be stored as *Khác*; an unknown category MUST be refused with a message naming the field.
- **FR-007**: AI quick add MUST NOT be asked for a category; the form preselects it from the drafted description as in FR-003.
- **FR-008**: The expense list (phone and computer) MUST show each expense's category in words.

**Chart**

- **FR-009**: The monthly report MUST show "Chi theo danh mục" for a month with at least one expense: one line per category used that month, largest amount first (ties in the order of FR-001), each with a bar, the name, the amount in đồng and the share of the month as a whole percent.
- **FR-010**: The category amounts MUST sum exactly to the month's total; the percentages shown MUST sum to exactly 100 (largest-remainder rounding), and a share under 1% that is not zero MUST read "<1%".
- **FR-011**: Each category line MUST open Chi tiêu filtered to that month and that category.
- **FR-012**: The chart MUST be readable without colour: names, amounts and percentages as text, and the bars hidden from screen readers.

**Filter and export**

- **FR-013**: Chi tiêu MUST offer a category filter with all seven categories and *Tất cả*, combinable with the month and person filters, with the month totals following the filtered month as today.
- **FR-014**: The CSV export MUST include a category column, in the page's language.

**For every part**

- **FR-015**: All words MUST exist in Vietnamese and English; every text pair MUST meet 4.5:1 and every bar and control outline 3:1 in light and dark; every control MUST be at least 44 × 44 px; no sideways scroll at 320, 360 or 640 px or at 200% zoom.
- **FR-016**: Money stays whole đồng; no balance, share, repayment or monthly report figure changes because of a category.

### Key Entities

- **Category**: one of seven fixed values with a Vietnamese and an English name and a list of words that suggest it. Not editable by users.
- **Expense** (existing): gains one category; everything else unchanged.
- **Category total** (derived): for one month, a category, its amount and its share of the month's total.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Adding an expense whose description matches a category takes the same presses as today (description, amount, Lưu): zero extra steps.
- **SC-002**: In the demo house, at least 4 of the 5 seeded expenses get the right category without any change by hand.
- **SC-003**: In 100% of checked months, the category amounts sum to the month's total to the đồng and the percentages to exactly 100.
- **SC-004**: From a month's report, a housemate reaches that month's expenses of one category in one press.
- **SC-005**: Every balance, suggested transfer and monthly report figure is identical before and after the feature for the same expenses.
- **SC-006**: The automated accessibility walk passes on Chi tiêu and the report in both themes.

## Assumptions

- The seven categories cover a shared house; per-house custom categories, renaming, icons per category and budgets are out of this feature.
- Words are matched without accents and case ("dien" matches "Điện"), so typing without diacritics still works.
- Old expenses are not re-guessed from their descriptions: the request was that they count as *Khác*; the owner can recategorise them by editing.
- The chart covers the house's spending only; spending by category per person and over several months are later features.
- The AI quick add contract and its quota stay as they are (constitution VII).
- Desktop is the main target for the chart; on a phone it stacks under the report cards.
