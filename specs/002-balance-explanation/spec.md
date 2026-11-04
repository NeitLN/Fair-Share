# Feature Specification: Why this number? (balance explanation)

**Feature Branch**: `feat/balance-explanation`

**Created**: 2026-11-05

**Status**: Draft

**Input**: User description: "Tính năng "Vì sao ra số này?" cho Fair-Share (top 10 của buổi review thiết kế desktop 05/11, mục 3). Vấn đề: người dùng thấy "Bạn cần trả Minh 440.000đ" nhưng không biết vì sao ra con số đó; nhìn danh sách khoản chi không tự tính nổi. Mong muốn: trên Tổng quan, mỗi người xem được số dư của mình (và của người khác trong nhà) được tạo thành thế nào: đã chi cho cả nhà (+), phần của mình trong các khoản chi (−), đã trả lại cho người khác (+), đã nhận từ người khác (−), cộng lại đúng bằng số dư. Mở từ link "Vì sao ra số này?" ở khối kết luận (verdict) và từ dòng của mỗi người trong "Số dư từng người". Xem thêm được các khoản chi và khoản trả nào tạo nên từng dòng. Chỉ để xem, không đổi dữ liệu. Phải theo constitution: tiền là số nguyên đồng, các dòng cộng lại đúng bằng số dư; quyền xem theo ACCOUNTS.md (thành viên xem được số dư cả nhà, người lạ/đang chờ 404); tiếng Việt và tiếng Anh; tương phản AA, nút ≥44px; desktop là trọng tâm nhưng điện thoại không được vỡ."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See how my own balance is made (Priority: P1)

Tiến opens Tổng quan and reads "Bạn cần trả Minh 440.000đ". He does not see where 440.000đ comes from. He opens "Vì sao ra số này?" next to the amount and sees four lines that add up to his balance: what he spent for the house (+450.000đ), his part of the house's expenses (−1.890.000đ), what he has paid back to others (+1.000.000đ), what others have paid back to him (0đ), and the result, −440.000đ, "cần trả".

**Why this priority**: The sentence that tells someone they owe money is the one most likely to be questioned. Without an explanation the user has to trust the app or redo the sums by hand from the expense list, which nobody can do for a month of shared costs. This was the strongest finding of the design review.

**Independent Test**: With any household that has expenses and a repayment, open the explanation from the verdict and check the four lines, their signs and that they add up exactly to the balance shown.

**Acceptance Scenarios**:

1. **Given** Tiến's balance is −440.000đ (spent 450.000đ, share 1.890.000đ, paid back 1.000.000đ, received 0đ), **When** he opens "Vì sao ra số này?" from the verdict block, **Then** he sees those four lines with their signs and a total of −440.000đ marked "cần trả", equal to the balance shown elsewhere on the page.
2. **Given** Minh is owed money, **When** he opens his explanation, **Then** the total is positive and marked "được nhận".
3. **Given** the explanation is open, **When** the user closes it (the same control, or Escape), **Then** it folds away and keyboard focus returns to the control that opened it.
4. **Given** a person whose balance is 0 because nothing involves them yet, **When** they look at the verdict, **Then** there is no "Vì sao ra số này?" link there (nothing to explain), but their row in Số dư từng người can still be opened and shows four lines of 0đ.

---

### User Story 2 - See what makes up each line (Priority: P2)

From the open explanation, Tiến wants to know which expenses make up "phần của bạn 1.890.000đ". He opens that line and sees each expense he has a share in: its description, date, who paid, the full amount and his share of it. The same works for the other lines: the expenses he paid for, the repayments he made, the repayments he received.

**Why this priority**: The four totals answer "how", but a disagreement is usually about one item ("I wasn't at that dinner"). Seeing the items lets the user find it and then fix it in Chi tiêu, without anyone opening a spreadsheet.

**Independent Test**: Open one line of the explanation and check that the listed items' amounts add up exactly to that line's total, and that each item is one the person really paid, shared in, sent or received.

**Acceptance Scenarios**:

1. **Given** Tiến shares in five expenses, **When** he opens "phần của bạn", **Then** he sees those five expenses, newest first, each with description, date, payer, full amount and his share, and the shares add up exactly to the line total.
2. **Given** Tiến paid for one expense, **When** he opens "bạn đã chi cho cả nhà", **Then** he sees that one expense with its full amount.
3. **Given** Tiến paid Minh back 1.000.000đ once, **When** he opens "bạn đã trả lại", **Then** he sees that repayment with its date, the person it went to and its note.
4. **Given** a line is 0đ, **When** the user looks at it, **Then** it says there is nothing there rather than opening an empty list.
5. **Given** an item in the list, **When** the user wants to correct it, **Then** they can get from it to the place where expenses (Chi tiêu) or repayments (Lịch sử trả) are changed; nothing can be changed from the explanation itself.

---

### User Story 3 - See a housemate's balance explained (Priority: P3)

Duy Anh is told by the app that he owes Minh 1.450.000đ. Tiến, also in the house, wants to check before sending a reminder. In Số dư từng người he opens Duy Anh's row and sees the same four lines, worded for a third person ("Duy Anh đã chi…", "phần của Duy Anh…").

**Why this priority**: Everyone in a house sees everyone's balance already; explaining any of them builds trust in the numbers and helps the person who reminds others. It matters less than explaining your own balance.

**Independent Test**: As one member, open another member's row and check that their four lines add up to the balance shown on that row and use their name, not "bạn".

**Acceptance Scenarios**:

1. **Given** Tiến is in the house, **When** he opens Duy Anh's row in Số dư từng người, **Then** he sees Duy Anh's four lines and total, worded with Duy Anh's name.
2. **Given** Tiến opens his own row in Số dư từng người, **Then** he sees the same explanation as from the verdict, worded with "bạn".
3. **Given** two rows, **When** the user opens one and then another, **Then** both can be open at once and each keeps its own state.

---

### Edge Cases

- A balance made of many small items (a house with a few hundred expenses): the totals appear at once; the item lists are long but stay readable and do not make the page scroll sideways.
- A name from before accounts, or a person removed from the house, who still appears in old expenses: they appear in item lists under the name the app already uses for them (or "người đã rời nhà").
- An expense with a custom split where the person's share is 0đ: it is not listed under their share.
- A person who paid for an expense they have no share in: it is listed under what they spent, not under their share.
- A "Tôi đã chuyển" notice waiting for the receiver: it is not a repayment yet, so it is not counted; the explanation says so when the person has one waiting.
- The data changes while the explanation is open (a housemate adds an expense, the page refreshes itself every 30 s): the lines and the total update together and still add up.
- The balances cannot be loaded: the explanation is not offered, as the rest of the page already explains the failure; if only the item lists cannot be loaded, the four totals still show and the lists say they could not be loaded, with a way to try again.
- English is chosen: every label, sign and amount follows the English rules already used in the app.

## Requirements *(mandatory)*

### Functional Requirements

**Where it opens**

- **FR-001**: When the signed-in person's balance is not 0, the verdict block MUST offer "Vì sao ra số này?" next to the amount, opening the explanation of their own balance.
- **FR-002**: Every row of Số dư từng người MUST be openable to show that person's explanation, for the signed-in person and for every other member.
- **FR-003**: Opening or closing an explanation MUST NOT leave the page or change any data; it MUST close with the same control or with Escape, returning focus to that control.

**The four lines**

- **FR-004**: An explanation MUST show four lines and a total: spent for the house (+), share of the house's expenses (−), repayments made (+), repayments received (−); the total MUST equal the balance shown for that person elsewhere on the page, to the đồng.
- **FR-005**: Every amount MUST be shown in whole đồng with an explicit sign and, for the total, the words "cần trả" or "được nhận" (or SẠCH NỢ at 0), never colour alone.
- **FR-006**: Lines MUST be worded with "bạn" for the signed-in person and with the person's short name for anyone else.

**The items behind each line**

- **FR-007**: Each non-zero line MUST be openable to list the items that make it up, newest first: for spending and share, each expense's description, date, payer, full amount and the person's part; for repayments, each repayment's date, the other person, amount and note.
- **FR-008**: The listed items of a line MUST add up exactly to that line's total.
- **FR-009**: A zero line MUST say there is nothing there instead of offering an empty list.
- **FR-010**: Each listed item MUST lead to where it can be changed (Chi tiêu for an expense, Lịch sử trả for a repayment); the explanation itself MUST NOT offer any change.
- **FR-011**: A "Tôi đã chuyển" notice waiting for an answer MUST NOT be counted, and the explanation MUST say that one is waiting when the person has sent or is waiting for one.

**Access, language, accessibility**

- **FR-012**: Explanations MUST be available only to members of the household, exactly like the balances they explain; someone not in the household or still waiting for approval MUST NOT be able to see any of it (ACCOUNTS.md A5).
- **FR-013**: Every new word on screen MUST exist in Vietnamese and English (DESIGN.md §7.1).
- **FR-014**: The explanation MUST meet the accessibility checklist: text contrast at least 4.5:1 in light and dark, every control at least 44 × 44 px, usable by keyboard, readable at 360 px and 200% zoom with no sideways scroll (DESIGN.md §8).
- **FR-015**: When the page refreshes its data, an open explanation MUST update its lines, items and total together so they always add up.

### Key Entities

- **Balance explanation**: for one person in one household, the four totals (spent, share, repayments made, repayments received) and their sum, which is the person's balance.
- **Explanation line**: one of the four totals, with the list of items behind it.
- **Item**: an expense (description, date, payer, full amount, the person's part) or a repayment (date, other person, amount, note).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A member can go from the verdict sentence to the four lines that explain it in one action, and to the items behind any line in one more.
- **SC-002**: In 100% of households tested, including ones with custom splits, repayments and removed members, every explanation's lines add up exactly to the balance shown, and every line's items add up exactly to the line.
- **SC-003**: A tester who disputes one expense can find it from the explanation and reach the place to change it in under 30 seconds.
- **SC-004**: Every new control passes the existing automated contrast, 44 px and keyboard checks in both themes and both languages, with no sideways scroll at 320 and 360 px.

## Assumptions

- The explanation covers the balance from the start of the house, like Số dư từng người; the month view stays in the "Tháng …" block and is not explained here.
- It opens in place, under the verdict amount or under the row, as in the approved mockup (canvas, variant B), not in a separate page or dialog.
- The totals the page already receives for each person (spent, share, sent, received) are the source of the four lines; the items come from the expenses and repayments the household already lists, so no new kind of data is stored.
- Wording follows the existing voice (BRAND.md §6): neutral, no collector words.
- Out of scope: changing anything from the explanation, explaining the suggested transfers ("why Minh and not Lan"), a printable or shareable statement, and the monthly report (a separate feature).
