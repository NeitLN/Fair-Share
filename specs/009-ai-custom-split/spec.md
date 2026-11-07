# Feature Specification: AI quick add reads named amounts

**Feature Branch**: `feat/ai-custom-split`

**Created**: 2026-11-07

**Status**: Draft (revised after a two-round critique, 07/11)

**Input**: User description: "Phần C từ góp ý của chủ dự án ngày 07/11: "Gõ nhanh bằng AI" chia số tiền riêng cho từng người. Hiện AI chỉ hiểu chia đều (danh sách người tham gia). Người dùng muốn gõ kiểu "lẩu 500k, Minh 200k, Lan 100k, còn lại mình" hoặc "điện 900k, Minh 400k, còn lại chia đều" và AI điền form ở chế độ chia riêng với số tiền từng người. Đã chốt: phần dư (tổng trừ các phần đã nêu) tính cho người trả. Khi các phần đã nêu cộng lại vượt tổng thì không điền chia riêng sai mà cảnh báo rõ. AI chỉ điền form, người dùng vẫn bấm Lưu (constitution VII: AI không tự lưu, có Hoàn tác điền, tiền số nguyên đồng, mọi phần cộng đúng bằng tổng). Tiếng Việt và tiếng Anh. Trả lời tôi bằng tiếng Việt. Làm trên nhánh mới cắt từ main, không commit cho tới khi tôi duyệt."

**Decided by the owner (07/11)**: when the sentence names amounts for some people and does not say who takes the rest, the rest goes to the person who paid.

**Settled in the critique (07/11)**:

- The model only *reads* the sentence: the total, the amounts given to named people in the order written, and what the sentence says about the rest. The split itself is worked out by the app with fixed arithmetic. Named amounts are never scaled, dropped or nudged to make them fit, and their sum is compared with the total before anything else.
- "Mình" / "me" is the signed-in member. It is not the payer: "còn lại mình" says who takes the rest, not who paid.
- A missing payer stays missing, as today. The app never guesses who paid.
- A bare "name + amount" is what that person owes. An amount tied to paying, putting in or paying back ("Minh trả 200k", "Lan đưa 100k") is never a share; a sentence with more than one payer is not supported.
- When an instruction to split by amounts was recognised but cannot be turned into a safe split, saving is blocked until the user changes the split by hand. A split that merely adds up is not enough, since dropping an amount can make it add up.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Named amounts, the rest to the payer (Priority: P1)

Tiến types "lẩu 500k Tiến trả, Minh 200k, Lan 100k". The form fills with *Lẩu*, 500.000đ, Tiến as payer, and opens its *Tự chia* editor with Minh 200.000đ, Lan 100.000đ, Tiến 200.000đ, and a line "Còn lại 200.000đ tính cho Tiến (người trả)". Tiến checks it and presses Lưu. "lẩu 500k, Minh 200k, Lan 100k, còn lại mình" fills the same shares (Tiến takes the rest because he said so) but leaves the payer for Tiến to pick, because the sentence does not say who paid.

**Why this priority**: This is the owner's request. Today the same sentence is filled as an equal split, which is wrong money the user has to notice and fix.

**Independent Test**: With a stand-in for the model returning fixed readings, check the shares for every row of the table below, in Vietnamese and English; then fill the form and check *Tự chia* shows them, open, with the "Còn lại" line.

**Allocation rule**: each person's share = the amount named for them (0 if none) + the rest if they take it. Who takes the rest: the person the sentence names ("còn lại Lan", "rest me"); otherwise the payer.

| Sentence (house: Tiến, Minh, Lan, Duy Anh) | Payer | Shares |
|---|---|---|
| "lẩu 500k Tiến trả, Minh 200k, Lan 100k" | Tiến | Minh 200k, Lan 100k, Tiến 200k |
| "lẩu 500k Tiến trả, Minh 200k" | Tiến | Minh 200k, Tiến 300k (Tiến takes the rest even though he was not named) |
| "500k Tiến trả, Tiến 100k, Minh 200k, còn lại Lan" | Tiến | Tiến 100k, Minh 200k, Lan 200k |
| "500k Tiến trả, Lan 100k, Minh 200k, còn lại Lan" | Tiến | Lan 300k, Minh 200k |
| "500k Tiến trả, Minh 500k" | Tiến | Minh 500k only; the payer is not added |
| "lẩu 500k, Minh 200k, Lan 100k, còn lại mình" (typed by Tiến) | none | Minh 200k, Lan 100k, Tiến 200k; payer left to pick |

**Acceptance Scenarios**:

1. **Given** a sentence with a total, amounts for some members and a known person to take the rest, **When** quick add reads it on an untouched form, **Then** the form is set to *Tự chia* with the shares of the table above, the editor is open, and a line names who takes the rest and how much.
2. **Given** the named amounts add up to exactly the total, **When** read, **Then** only the named members are in the split, at their amounts, and nobody takes a rest.
3. **Given** a sentence with no named amounts ("lẩu 500k, Minh trả, chia 3"), **When** read, **Then** the draft and the form are exactly as today (equal split, the same notes).
4. **Given** the user had already changed the total, the payer or the split by hand before pressing quick add, and the draft's total or payer differs from what is in the form, **When** read, **Then** the custom split is not applied, the form says why, and saving is blocked until the user sets the split by hand.
5. **Given** a custom split was filled, **When** the user presses *Hoàn tác* before changing anything, **Then** the fields that fill changed go back, the split (mode, people and amounts together) included; fields the user changed after the fill keep the user's values.
6. **Given** a custom split was filled, **When** the user changes the total or a share, **Then** the form treats it like a split typed by hand (it must add up before Lưu).

---

### User Story 2 - Amounts that cannot be placed safely (Priority: P1)

Lan types "lẩu 500k Lan trả, Minh 300k, Duy Anh 300k". The named amounts are 600.000đ, more than 500.000đ. Description, total, payer and date are filled; the *Tự chia* editor shows Minh 300.000đ and Duy Anh 300.000đ as read, marked as not usable yet; a note says "Các phần đã nêu cộng lại 600.000đ, hơn tổng 500.000đ. Sửa lại cách chia rồi mới lưu được." Lưu stays blocked until Lan changes the split by hand. Changing only the total or the payer does not unblock it.

**Why this priority**: Money is sacred (constitution I). A split that does not match what was said must never be saveable as if it were right.

**Independent Test**: For every case below, check the draft carries no usable split, carries the right note with its figures, and that the form refuses Lưu until the split itself is edited, even when the remaining amounts happen to add up to the total.

**Acceptance Scenarios**:

1. **Given** named amounts over the total, **When** read, **Then** no usable split is filled, the amounts appear as read and marked, the note gives the named sum and the total, and Lưu is blocked until the split is changed by hand.
2. **Given** any of these: a named person not in the house, or a name that matches more than one member; two named amounts that belong to the same member once names are matched ("Tiến 100k, Tien 50k"; a payer or the person taking the rest may of course also have a named amount); a rest above 0 with nobody who can take it under what the sentence asked (no payer and no one named for it); amounts given as fractions or percentages; a sentence with more than one payer; an amount tied to paying rather than owing; "còn lại chia đều" with no names, a rest above 0 and every member already given an amount (a name after "chia đều" that is unknown or ambiguous also blocks), **When** read, **Then** no usable split is filled, the note says which of these happened, and Lưu is blocked as in scenario 1.
3. **Given** "500k Tiến trả, Minh 500k, Hùng 100k" (Hùng not in the house), **When** read, **Then** saving is still blocked: Minh 500k alone adds up, but it is not what the sentence said.
4. **Given** a blocked split, **When** the user changes the split by hand (mode, people or any amount) and it adds up, **Then** the block is lifted and Lưu works as for any expense.
5. **Given** a sentence with no total ("Minh 200k, Lan 100k"), **When** read, **Then** the total is not guessed from the shares; the existing "Nhập số tiền" note shows and the split is blocked as in scenario 1.

---

### User Story 3 - "Còn lại chia đều" (Priority: P2)

Minh types "điện 900k Minh trả, Lan 400k, còn lại chia đều" in a house of four. Lan gets 400.000đ; the other 500.000đ is split equally between Tiến, Minh and Duy Anh, who have no named amount: two of them get 166.667đ and one 166.666đ, by the same rule as an equal split (leftover đồng to the lowest member ids among them).

**Why this priority**: The owner's second example. Less common than "the rest to me", and the money rule is already covered by the first two stories.

**Independent Test**: With a stand-in model, check the shares and leftover đồng for the cases below, and that they add up to the total.

**Acceptance Scenarios**:

1. **Given** "còn lại chia đều" / "split the rest" with no names after it, **When** read, **Then** the rest is split equally between every member with an account who has no named amount (a named 0đ counts as named); the payer is in that group only if the payer has no named amount.
2. **Given** "còn lại chia đều cho Tiến và Duy Anh", **When** read, **Then** the rest is split equally between those two; if one of them also has a named amount, their portion is added to it.
3. **Given** the rest is 0, **When** read, **Then** the named amounts are the split and nobody is added.
4. **Given** the rest is more than 0, no names after "chia đều", and every member already has a named amount, **When** read, **Then** the split is blocked as in User Story 2 (the rest does not go to the payer, since the sentence asked for something else).
5. **Given** a name after "chia đều" is not in the house or is ambiguous, **When** read, **Then** the split is blocked; the group is never silently made smaller.

---

### Edge Cases

- **A named 0đ** ("Lan 0đ"): shown as 0 in the editor; saving drops people at 0đ, as a split typed by hand already does.
- **A name that matches more than one member**: blocks the split (User Story 2); the model is never trusted to pick one.
- **More people than one expense allows**: refused as today (choose them by hand).
- **Readings that are not whole đồng, negative, above the limit for one expense, or not numbers**: the reading is treated as unusable; the split is blocked, never repaired.
- **Shorthand amounts** ("2tr", "1tr5", "400 nghìn"): read the same way as the total is read today.
- **English sentences**: "rest me", "the rest is mine", "split the rest", "Minh paid" work like their Vietnamese counterparts.
- **A rest for a payer who said they do not share** ("Tiến trả hộ, không ăn"): the sentence excludes the payer, so the rest cannot go to them; the split is blocked with a note rather than overriding what was said.
- **A recurring tick or a form opened from a due item**: quick add behaves as today there; this feature changes only what a quick add fill puts in the split.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Quick add MUST read from one sentence, besides what it reads today: the amounts given to named people, in the order written, and what the sentence says about the rest (nothing; a named person; "chia đều" with or without names).
- **FR-002**: The model MUST only report what the sentence says. The split MUST be worked out by the app with fixed arithmetic, from those readings, and never by the model.
- **FR-003**: The app MUST compare the sum of the named amounts with the total before placing any rest, and MUST NOT scale, drop or change a named amount.
- **FR-004**: Each share MUST be the amount named for that member plus their part of the rest. The rest goes to the member the sentence names; with no instruction, to the payer (owner's decision); with "chia đều", as in User Story 3. Leftover đồng follow the equal-split rule (lowest member ids).
- **FR-005**: "Mình" / "me" MUST mean the signed-in member, worked out by the app, not by the model.
- **FR-006**: A missing payer MUST stay missing (as today). A named person taking the rest allows the split without a payer; the user still picks the payer before saving.
- **FR-007**: Names MUST be matched to members before duplicates are checked; a name matching no member or several members MUST block the split.
- **FR-008**: When an instruction to split by amounts was recognised and the split cannot be placed safely (the cases of User Story 2), the draft MUST NOT carry a usable split; it MAY carry the amounts as read, marked as a preview; it MUST carry a note naming the problem with its figures (named sum, total, rest, name) in both languages; and the form MUST block Lưu until the user changes the split by hand. Changing only the total or the payer MUST NOT lift the block.
- **FR-009**: A custom split MUST only be applied to the form when the total and payer that end up in the form are the draft's and the split had not been changed by hand; otherwise FR-008 applies.
- **FR-010**: Sentences with no named amounts and no instruction about the rest MUST give exactly the same draft as today. Fractions, percentages and other ways of sharing not covered here MUST NOT fall back to an equal split; they follow FR-008.
- **FR-011**: A filled custom split MUST open the *Tự chia* editor and show who takes the rest and how much; the line under quick add MUST describe it (e.g. "tự chia 3 người").
- **FR-012**: *Hoàn tác* MUST restore the fields the latest fill changed and the user has not changed since; the split (mode, people and amounts) counts as one field.
- **FR-013**: Nothing is saved by quick add; the expense goes through the same checks as any expense typed by hand (constitution VII).
- **FR-014**: One press MUST still be one call to the model, plus at most the existing single retry after a fast failure, under the existing per-IP limit, global budget and timeout.
- **FR-015**: Every new note MUST exist in Vietnamese and English, show amounts in the app's money format, and meet the contrast and size rules of the rest of the form.

### Key Entities

- **Reading of the sentence**: what the model reports: description, total, payer, date, people (as today), plus named amounts (name, amount, in order) and the instruction about the rest.
- **Expense draft**: what quick add gives the form. Its split is one of: equal (as today); custom with shares that add up to the total; or blocked, with the amounts as read for preview and the reason.
- **Draft note**: a note for the user to check, with a code and the figures it is about. New codes cover: named amounts over the total, two named amounts for the same member, a name matching several members, no one to take the rest, an unsupported way of sharing, more than one payer, nobody left for "chia đều", a total or payer in the form that differs from the draft.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For every row of the allocation table and every case of User Stories 2 and 3, automated tests with fixed readings give exactly the expected shares (or a blocked split with the expected note code). Every usable custom split adds up exactly to the total in whole đồng.
- **SC-002**: For every blocked case, an automated form test shows Lưu refused until the split is edited, including the case where the amounts left over happen to add up to the total.
- **SC-003**: Every example sentence in today's quick add tests gives the same draft as before.
- **SC-004**: A fixed list of 10 Vietnamese and 10 English sentences, each with its expected payer, total, shares or note code, is checked by hand against the live model before release: at least 16 of the supported ones fill the expected split, and none fills a usable split that differs from the expected one, with or without a note.
- **SC-005**: On an untouched form, a user who types "lẩu 500k Tiến trả, Minh 200k, Lan 100k" goes from sentence to saved expense with two presses (quick add, then Lưu) and no typing in the split.
- **SC-006**: Quick add uses no more model calls per press than today.

## Assumptions

- The members a share can go to are the same as today: people with an account in the house.
- Fractions and percentages are left out of this version; they block the split with a note and can be added later without changing the money rule.
- The existing *Tự chia* editor, its live "Chưa chia / Vượt quá" line, its checks and its Lưu path are reused; this feature adds the fill, the preview marking and the block.
- The model's free tier and the existing limits are enough; one sentence stays at most 300 characters.
- No change to stored data: expenses with a custom split already exist.
