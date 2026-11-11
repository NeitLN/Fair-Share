# Feature Specification: House list and profile redesign

**Feature Branch**: `spec/017-houses-profile-redesign`

**Created**: 11/11/2026

**Status**: Draft

**Input**: User description: redesign the house list (`/`) and the profile (`/account`) along the direction a three-person design review settled on (product/UX, UI/visual, accessibility and responsive; two rounds), with the layout guidance of the Astryx design system used as a reference only (no package added). The owner approved a clickable mock-up on 11/11/2026 (houses as rows, light and dark, 1440 and 390 px); screenshots of the built pages at the same widths go in [screenshots/](screenshots/) with each pull request.

## Why

On a computer both pages leave most of the screen empty and put things far from where people look:

- On `/` one house card sits in a grid built for three, about 800 px away from the two buttons that add a house, and the balance (the reason a returning user comes) is a small coloured line under a bigger name. Two help paragraphs written for new accounts are shown to everyone.
- On `/account` six cards are stacked in one 560 px column pinned to the left, each with its own filled Save, so up to three loud buttons show at once and five of them are all called "Lưu". There is no way back to the houses except the wordmark.
- Pressing *Nhập mã mời*, *Chọn ảnh*, *Xoá trạng thái* or the receiving account's *Thêm / Sửa / Huỷ* makes the pressed control disappear and the keyboard focus falls to the top of the page.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See where I stand in each house (Priority: P1)

Duy Anh is in three houses. He opens Fair-Share and wants to know, at a glance, in which house he owes money, where he gets money back and where something waits for him, then open that house.

**Why this priority**: it is what nearly every visit to `/` is for; returning users far outnumber new ones (DESIGN §6.1).

**Independent Test**: sign in with an account in three houses (one owing, one owed, one settled, one with a waiting item) and check the list on a phone and at 1440 px, in light and dark.

**Acceptance Scenarios**:

1. **Given** Duy Anh is in three houses, **When** he opens `/`, **Then** the houses show as rows in one block, each with a small house sticker in that house's colour, the house name, the *Trưởng nhóm* chip when he owns it, the waiting badge when something waits for him, and on the right the words (*Bạn cần trả* / *Bạn được nhận*) in the quiet text colour with the amount in bold in the money colour, or *Đã xong* when he owes nothing and is owed nothing.
2. **Given** the three rows at 1024 px or wider, **When** he looks down the right side, **Then** the three amounts end on the same right edge, whatever the length of each house name.
3. **Given** a phone at 320 to 390 px, **When** a house name is long, **Then** the name wraps and the words and amount move to their own line under it, with nothing cut off and no sideways scroll.
4. **Given** he presses anywhere on a row, **Then** that house's Tổng quan opens, as today.
5. **Given** he already has a house, **Then** the two help paragraphs (how it works, how to invite) are not shown on `/`; a new account's start screen keeps its text as today.
6. **Given** several houses, **Then** no line adds the amounts of different houses together.

---

### User Story 2 - Join or create a house without losing my place (Priority: P1)

Minh got an invite code on Zalo. He opens Fair-Share, which shows his own house, and wants to enter the code; another day he wants to create a second house.

**Why this priority**: joining by code is how every housemate after the first one gets in; today the opened form hides its own button and the focus is lost.

**Independent Test**: on `/` with at least one house, open and close each way in with the mouse and with the keyboard only, at 390, 1024 and 1440 px; then open an invite link.

**Acceptance Scenarios**:

1. **Given** a screen 1280 px or wider, **When** Minh opens `/`, **Then** a block titled *Thêm nhà* stands to the right of the house list with two folds, *Nhập mã mời* and *+ Tạo nhà mới*; below 1280 px the same block comes after the list (and after *Đang chờ duyệt*), full width.
2. **Given** he presses *Nhập mã mời*, **Then** the fold opens in place, its title stays visible and says it is open, and the keyboard focus moves into the code field; pressing the title again or Escape closes it and the focus returns to the title.
3. **Given** the create fold is open, **Then** it shows the line "Tạo xong, mời bạn cùng nhà bằng mã ở trang Thành viên" next to the name field (the invite hint moves here from the page).
4. **Given** Minh opens an invite link (`/join/<code>`) while he already has houses, **Then** the code fold is open with the code filled in, the page scrolls to it and the focus is in it, on a phone too.
5. **Given** an invite is being checked or waits for the owner (spec 015), **Then** creating a house still waits behind *Tạo nhà khác* as today.
6. **Given** a join request waits for approval, **Then** it shows under the house list in a section titled *Đang chờ duyệt*, with *Kiểm tra lại* and *Huỷ yêu cầu*, as today.

---

### User Story 3 - My profile in one look (Priority: P1)

Tiến opens *Hồ sơ của bạn* from the account menu to check what his housemates see and whether his receiving account is right.

**Why this priority**: the profile now carries the VietQR receiving account (spec 016), which decides whether people can pay him; it has to be easy to find and read.

**Independent Test**: open `/account` from the account menu with an account that has a photo or tint, a status and a saved receiving account, at 390, 1024 and 1440 px, light and dark; then go back to the houses.

**Acceptance Scenarios**:

1. **Given** any width, **When** Tiến opens `/account`, **Then** a link *‹ Nhà của bạn* sits above the page title and takes him back to `/`.
2. **Given** 1024 px or wider, **Then** the page has two areas: on the left (about 320 px) a card titled *Bạn cùng nhà thấy bạn thế này* with his avatar (photo or tint), his display name, his status (or *Chưa có trạng thái*), the receiving-account hint as housemates see it ("Có tài khoản nhận tiền · MB Bank •••• 6070") when one is saved, his email read-only with "Email là tên tài khoản, không đổi được", *Đổi ảnh* (secondary) and *Gỡ ảnh* (quiet link style); on the right one block whose parts are split by thin lines, in today's order: *Tên hiển thị*, *Trạng thái*, *Tài khoản nhận tiền*, *Mật khẩu*, *Giới tính*.
3. **Given** below 1024 px, **Then** the card comes first and the parts follow in the same order, one under the other; the order on screen is the keyboard order at every width.
4. **Given** the card, **Then** it shows the saved values only: what he types and has not saved never appears there.
5. **Given** a saved receiving account, **Then** the part shows the bank or wallet, the account number and the holder's name as three labelled values (side by side when there is room), with *Sửa* and *Xoá*, and the privacy line stays as today.
6. **Given** the password part, **Then** the current and new password fields stand side by side when there is room, with *Đổi mật khẩu* under them.
7. **Given** the gender part, **Then** the notice comes before the choices, the four choices are real radio buttons shown as pills, and the chosen one shows a visible mark (not only a border).
8. **Given** the page, **Then** there is no in-page menu, nothing is sticky, and *Đăng xuất* stays only in the account menu.

---

### User Story 4 - Save one part and know what is saved (Priority: P2)

Tiến changes his status and his name. He wants to be sure which button saves what, and to see when something is typed but not yet saved.

**Why this priority**: today five buttons are all named "Lưu", and three filled ones show at once; a screen reader or voice control cannot tell them apart.

**Independent Test**: on `/account`, change each part with the keyboard only and with a screen reader, save some and not others, cause a save error, and check names, messages and focus.

**Acceptance Scenarios**:

1. **Given** the profile, **Then** each part keeps its own form and its own save button, and each button has its own visible name: *Lưu ảnh*, *Lưu tên*, *Lưu trạng thái*, *Lưu tài khoản*, *Đổi mật khẩu*, *Lưu giới tính*.
2. **Given** 1024 px or wider and a part with one field (name, status), **Then** its save button stands beside the field; below that, or when there is no room, the button goes under the field.
3. **Given** he types in a part and has not saved it, **Then** the text *Chưa lưu* shows next to that part's button, and goes away once it is saved; the button is never disabled (saving the same name again stays possible).
4. **Given** *Chọn ảnh* / *Đổi ảnh*, **Then** only after a photo is picked does *Lưu ảnh* show as the filled main button of that card.
5. **Given** a save fails in one part, **Then** the error shows under that part's field, is announced, and does not remove the character counter ("0/60") or anything typed in another part.
6. **Given** he presses a control that replaces itself (*Chọn ảnh*, *Huỷ* after picking, *Xoá trạng thái*, the receiving account's *Thêm tài khoản*, *Sửa*, *Huỷ*, *Lưu tài khoản*, *Xoá*), **Then** the focus moves to the next sensible place in the same part (the first field it reveals, or back to the control that opened it, or that part's heading), never to the top of the page.
7. **Given** he typed a status and presses *‹ Nhà của bạn*, **Then** the page leaves without asking (the *Chưa lưu* text already warned him).

---

### User Story 5 - The account button shows me (Priority: P3)

The round button at the top right of every page shows Tiến's own photo, or his own tint and initial, the same as on his profile. (A house's member list picks colours per house, so there his colour may differ.)

**Why this priority**: today it is always a purple initial, a different look for the same person; small, but it touches every page, so it ships alone.

**Independent Test**: with a photo, without a photo, after changing the photo; check the button on `/`, inside a house and on `/account`.

**Acceptance Scenarios**:

1. **Given** Tiến has a photo, **Then** the account button shows it; without one, it shows his initial on his own tint.
2. **Given** he saves or removes a photo on `/account`, **Then** the button changes without reloading the page.
3. **Given** the account menu is open on `/account`, **Then** the *Hồ sơ của bạn* link is marked as the current page, and choosing it moves the focus to the page title rather than to nothing.

---

### Edge Cases

- **No house yet**: the start screen for a new account stays exactly as today (its text, its order, its ways in).
- **Only a pending request, no house**: the *Đang chờ duyệt* card leads the page and the ways in follow, as today.
- **One house**: one row in the block; the *Thêm nhà* block still stands to the right from 1280 px, so the row and the buttons are close.
- **Very long house name or a 13-digit amount**: the name wraps; the words and amount drop to their own line; nothing is clipped at 320 px or at 200% zoom.
- **A brand-new house with no expense**: it shows *Đã xong* like a settled one (unchanged; telling them apart is out of scope).
- **The waiting badge**: keeps announcing politely as today; no other part of a row becomes a live region (the list refreshes every 30 s).
- **No receiving account, or a bank no longer listed**: the card shows no hint line; the part shows today's empty state or today's "Ngân hàng này không còn trong danh sách VietQR" message.
- **No status**: the card shows *Chưa có trạng thái* in the quiet colour.
- **Photo too big or unreadable**: the error shows in the card under the photo buttons, as today, and the focus stays on the picker.
- **Dark theme and Windows high contrast**: every state (open fold, chosen gender, *Chưa lưu*, focus) is carried by text, a mark or an outline, not by a fill or a shadow alone.
- **English**: all new texts exist in English too; English keeps "group" as DESIGN §7.1 decided.
- **The computer zoom of 110% from 1024 px**: every width in this spec is the screen width; the plan states the matching layout width.

## Requirements *(mandatory)*

### Functional Requirements

**House list (`/`)**

- **FR-001**: The houses MUST show as rows inside one block, separated by thin lines, each row being one link to the house.
- **FR-002**: Each row MUST show a small house sticker in the house's own colour (decoration, hidden from screen readers), the house name, the *Trưởng nhóm* chip for an owner, the waiting badge when something waits, and on the right the money words in the quiet text colour plus the amount in bold, tabular figures and the money colour (owing, owed), or *Đã xong*.
- **FR-003**: From 1024 px the amounts of all rows MUST end on one right edge; on narrow screens the words and amount MUST move under the name instead of being cut.
- **FR-004**: With at least one house, the page MUST NOT show the two help paragraphs; the new-account start screen MUST keep them.
- **FR-005**: The page MUST NOT show a total across houses.
- **FR-006**: A block titled *Thêm nhà* MUST hold the two folds *Nhập mã mời* and *+ Tạo nhà mới*; from 1280 px it MUST stand in a right column (about 360 px) beside the list; below 1280 px it MUST follow the list and the *Đang chờ duyệt* section.
- **FR-007**: A fold's title MUST stay visible and state open or closed; opening MUST move the focus to the fold's first field; Escape or the title MUST close it and return the focus to the title.
- **FR-008**: The invite hint MUST appear inside the create fold, not on the page.
- **FR-009**: Opening `/join/<code>` with houses MUST open the code fold with the code, scroll it into view and focus it.
- **FR-010**: The spec 015 rules MUST stay: while an invite is checked or waits, creating a house waits behind *Tạo nhà khác*; the *Đang chờ duyệt* card and the refusal notes keep their content and actions.
- **FR-011**: The join and create fields MUST tie their error text to the field (described-by with an id) and keep their announcement area present from the start, never hidden while empty.

**Profile (`/account`)**

- **FR-012**: The page MUST show *‹ Nhà của bạn* above its title, linking to `/`.
- **FR-013**: From 1024 px the page MUST have two areas: the card *Bạn cùng nhà thấy bạn thế này* on the left (about 320 px) and the parts on the right; below 1024 px the card first, then the parts. The order in the page MUST be today's order (photo and identity, name, status, receiving account, password, gender) so the screen order and the keyboard order are the same at every width.
- **FR-014**: The card MUST show the avatar, display name, status or *Chưa có trạng thái*, the receiving-account hint when one is saved and supported, the email read-only with its note, *Đổi ảnh* (or *Chọn ảnh* without a photo) as a secondary button and *Gỡ ảnh* as a quiet link; it MUST show saved values only.
- **FR-015**: The parts MUST sit in one block split by thin lines, each with its heading; no in-page menu; nothing sticky.
- **FR-016**: Each part MUST keep its own form and save action (an error in one part never loses what was typed in another), with distinct visible names: *Lưu ảnh*, *Lưu tên*, *Lưu trạng thái*, *Lưu tài khoản*, *Đổi mật khẩu*, *Lưu giới tính*. No save button is ever disabled.
- **FR-017**: A part changed and not saved MUST show the text *Chưa lưu* beside its button until saved or reset.
- **FR-018**: Only one filled main button may show in the card: *Lưu ảnh*, after a photo is picked. *Chọn ảnh* / *Đổi ảnh* are secondary.
- **FR-019**: A saved receiving account MUST show as three labelled values (bank or wallet, account number, holder), with *Sửa* and *Xoá*; the add and edit forms and the privacy line stay as spec 016 defined them.
- **FR-020**: The gender part MUST keep the notice before the choices and real radio buttons in a labelled group, shown as pills where the chosen one has a visible mark.
- **FR-021**: Errors MUST show under their field, be tied to it and announced, and MUST NOT replace the status counter.
- **FR-022**: After any control that replaces itself (listed in User Story 4, scenario 6) the focus MUST land inside the same part, never on the page body.
- **FR-023**: *Đăng xuất* MUST stay in the account menu only.

**Every page touched**

- **FR-024**: Each of the two pages MUST set its own browser tab title ("Nhà của bạn · Fair-Share", "Hồ sơ của bạn · Fair-Share", and English equivalents).
- **FR-025**: The account button MUST show the user's photo, or their initial on their own tint, the same as on the profile page (a house's member list may give them another colour); it MUST update after the photo changes; the *Hồ sơ của bạn* link MUST be marked current on `/account`, and following it MUST put the focus on the page title.
- **FR-026**: Both pages MUST work from 320 to 2560 px wide, in Vietnamese and English, light and dark, and at 200% zoom, with no sideways scroll, every control at least 44 × 44 px, text lines at most about 65 characters, and no fixed heights that clip text.
- **FR-027**: No new server endpoint, no new library and no new colour token; the existing tokens, fonts and Sticker pop rules (one loud place per page, hard shadows only on a form's main action) apply.

**Delivery**

- **FR-028**: Before any page changes, the profile tests (unit and the end-to-end smoke run against the live site after each deploy) MUST find each save button by its part, not by its position, so renaming and moving buttons cannot break the live smoke run.
- **FR-029**: The work MUST ship as four pull requests in this order: tests by part; the house list; the profile; the account button. The house-list one MUST be reviewed by Duy Anh, since it changes the list he built in spec 012, and MUST update the end-to-end check that expects at least two columns at 1024 px.
- **FR-030**: DESIGN.md §6.1, §6.6, §6.8 and §6.10 MUST be updated in the pull request that changes each page.

### Key Entities

No new data. The pages show what the app already returns: each house with its name, owner role, own balance and waiting count; the signed-in person's display name, status, gender, photo version, email and receiving account.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: At 1440 px with three houses, the right edges of the three amounts differ by 0 px, and the distance from the house list to the *Thêm nhà* block is at most 48 px (today about 800 px).
- **SC-002**: At 1440 px every part of the profile is visible within 1.5 screen heights (today about 2.5).
- **SC-003**: In each of the 8 self-replacing actions of User Story 4 scenario 6, plus opening each of the 2 folds and following the menu link to the profile, the focus lands on a control or heading on the page, never on the page body: 11 out of 11.
- **SC-004**: The six save actions on the profile have six different accessible names (today five share "Lưu").
- **SC-005**: No sideways scroll and no clipped text on either page at 320, 360, 390, 768, 1024, 1280, 1440 and 2560 px, in Vietnamese and English, light and dark.
- **SC-006**: The automated accessibility check reports no new problem on either page, every control measures at least 44 × 44 px, and all existing unit and end-to-end tests pass after each of the four pull requests, including the live smoke run.
- **SC-007**: In a hallway check with the three team members, each one finds "how much do I owe in house X" and "where do I enter an invite code" on `/`, and "is my receiving account saved" on `/account`, in under 5 seconds each.

## Assumptions

- The approved mock-up was the visual reference; the screenshots in `screenshots/` record what was built, and small differences in spacing are settled in the plan, not here.
- Houses as rows (not cards) was chosen by the owner on 11/11/2026, following the design review and Astryx's "records as rows in one section" rule.
- English keeps "group" ("Your groups", "+ New group"), as DESIGN §7.1 decided and as the English tests check; only Vietnamese wording is changed where this spec says so.
- The right-hand *Thêm nhà* column from 1280 px keeps the 3:2 decision of DESIGN §6.6 and §6.8 in spirit (list first, ways in beside it); the exact widths follow the 110% zoom.
- The account button can read the user's photo and tint from what the app already loads for the profile; if it cannot without a new request, the plan says so and User Story 5 waits.
- A cross-house total, member avatars on house rows, a new-house versus settled-house difference, a "sign out everywhere" action and an unsaved-changes dialog are out of scope.
- Teammates: Duy Anh reviews the house-list pull request; Minh reviews all four as usual.
