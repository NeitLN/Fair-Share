# Feature Specification: Overview and lists that read right

**Feature Branch**: `feat/overview-and-lists`

**Created**: 2026-11-08

**Status**: Draft

**Input**: From the product review of 08/11 (`docs/review/2026-11-08-bien-ban-danh-gia.md`) and the work plan
(`docs/review/2026-11-08-ke-hoach-cong-viec.md`, section 6): work packages G1-01, G1-09, G2-08, G1-05, G1-10 (lists),
G1-07, G1-12 and G2-07, built by Duy Anh. The expense form, AI quick add and the API client belong to spec 011 and
are out of scope here.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The main answer reads whole on a phone (Priority: P1)

Tiến opens Tổng quan on a 360 px phone. The coloured block at the top says who he gets money from or who he owes,
and how much. Today the avatars of those people cover the end of the sentence ("Bạn được nhận từ 4 người"), and a
very large amount can be cut off.

**Why this priority**: it is the first thing every person sees on every visit, at the width the design targets.

**Independent Test**: open Tổng quan at 320, 360, 375 and 390 px with four people owing money, and with a
13-digit amount; the sentence, the amount and the avatars never overlap and every digit shows.

**Acceptance Scenarios**:

1. **Given** Tiến is owed by four people, **When** he opens Tổng quan at 320, 360, 375 or 390 px, **Then** the
   sentence "Bạn được nhận từ 4 người" and the avatars do not touch, and no word is hidden.
2. **Given** a balance of 999.999.999.999đ, **When** Tổng quan opens at 320 px, **Then** every digit and the
   currency sign are visible, without sideways scrolling.
3. **Given** a laptop at 1440 px, **When** Tổng quan opens, **Then** the block looks as it does today.

---

### User Story 2 - The person who owes sees their next step first (Priority: P1)

Lan owes Tiến 2.286.500đ. She transfers the money in her bank app and comes back to tell him. Today "Tôi đã
chuyển" is a small outlined button inside a list further down.

**Why this priority**: telling the receiver is the main job of everyone who owes money, and it closes the loop
of the whole app.

**Independent Test**: sign in as someone who owes money; the action to tell the receiver is the first button under
the coloured block; sign in as someone who is owed or settled; it is not there.

**Acceptance Scenarios**:

1. **Given** Lan owes Tiến and has not told him yet, **When** she opens Tổng quan, **Then** directly under the
   coloured block there is one primary button "Tôi đã chuyển 2.286.500đ cho Tiến", and pressing it does what the
   current button does.
2. **Given** Lan already told Tiến, **When** she opens Tổng quan, **Then** that place shows the state ("Đã báo
   chuyển 2.286.500đ, chờ Tiến xác nhận") with the way to take the notice back, and no second button.
3. **Given** Lan owes two people, **When** she opens Tổng quan, **Then** there is one such button per person she
   must pay, in the order of the suggested transfers.
4. **Given** Tiến is owed money or everyone is settled, **When** he opens Tổng quan, **Then** no "Tôi đã chuyển"
   button appears under the block.
5. **Given** the list of transfers further down, **When** it shows Lan's own transfer, **Then** it shows the state
   only and does not repeat the button.

---

### User Story 3 - A new house points to the next real step (Priority: P2)

Tiến has just created "Nhà Gò Vấp" and nobody has joined yet. Today Tổng quan shows a page of zeros and suggests
recording the first expense, although the real next step is to invite his housemates.

**Why this priority**: it is the first screen after creating a house, and it decides whether anyone else joins.

**Independent Test**: create a house and open Tổng quan; an invite card is shown and the empty money sections are
not; once a second person joins, the normal Tổng quan returns.

**Acceptance Scenarios**:

1. **Given** a house with only its owner, **When** the owner opens Tổng quan, **Then** an invite card shows the
   current invite code with ways to share and copy it, and a short line saying the app is useful once housemates
   join.
2. **Given** that house, **When** Tổng quan opens, **Then** the month totals, the balances of each person and the
   repayment history are not shown; "+ Ghi khoản chi" stays available.
3. **Given** a second person has joined, **When** anyone opens Tổng quan, **Then** it looks exactly as today.

---

### User Story 4 - The list of houses says what is going on (Priority: P2)

Tiến belongs to two houses. Today each card on Nhà của bạn shows only the name and "Trưởng nhóm"; on a laptop two
thirds of the screen are empty, and on a phone the chip touches the name.

**Why this priority**: it is the start page for anyone in more than one house, and today it gives no reason to
open one house before the other.

**Independent Test**: sign in as someone in two houses with a balance in one and a pending request in the other;
each card shows the right balance and badge; at 1440 px the cards sit in a grid.

**Acceptance Scenarios**:

1. **Given** Tiến is owed 5.633.500đ in Nhà Q7, **When** he opens Nhà của bạn, **Then** that card shows
   "Bạn được nhận 5.633.500đ" in the credit colour; a card where he owes shows "Bạn cần trả …" in the debt colour;
   a settled card shows "Đã xong" (or the same words the app uses for zero).
2. **Given** someone is waiting for Tiến's approval in a house he owns, or a "Tôi đã chuyển" notice waits for his
   answer, **When** he opens Nhà của bạn, **Then** that card shows a badge with the number of things waiting.
3. **Given** a laptop at 1024 px or wider, **When** Nhà của bạn opens, **Then** the cards sit in a grid of two or
   three columns; on a phone they stay one per row.
4. **Given** a long house name with the "Trưởng nhóm" chip, **When** the card shows at 360 px, **Then** there is
   space between name and chip, and the name wraps instead of pushing the chip off the card.
5. **Given** the extra figures cannot be loaded, **When** Nhà của bạn opens, **Then** each card still shows its
   name and opens the house; no error replaces the list.

---

### User Story 5 - Lists stay short and filters stay honest (Priority: P2)

Minh scrolls Chi tiêu on his phone. One expense with a 120-character description takes about 17 lines. Elsewhere,
Tiến opens a past month in Báo cáo tháng, presses "Xem các khoản chi tháng này", and when that month has no
expenses the list quietly shows other months.

**Why this priority**: the list is the second most visited screen, and a filter that silently drops is a wrong
answer.

**Independent Test**: add an expense with a 120-character description and check the row is two lines tall; open
Chi tiêu filtered to a month without expenses and check it says so.

**Acceptance Scenarios**:

1. **Given** an expense with a 120-character description, **When** Chi tiêu shows it at 360 px, **Then** the
   description takes at most two lines with an ellipsis, and the meta line under it at most two lines.
2. **Given** that row, **When** Minh taps it or reaches it by keyboard, **Then** the whole description is
   readable, and a screen reader reads the whole description.
3. **Given** September 2026 has no expenses, **When** Tiến arrives on Chi tiêu filtered to that month (from the
   report or by choosing it), **Then** the month filter stays on, the list says "Tháng 9/2026 chưa có khoản chi
   nào", and "Bỏ lọc" clears it.
4. **Given** the last expense of the filtered month is deleted, **When** the list refreshes, **Then** the filter
   stays on that month and shows the same empty state.

---

### User Story 6 - The app opens in Vietnamese for Vietnamese students (Priority: P3)

Lan opens an invite link from Zalo in her phone's built-in browser. Today a first visit is always in English.

**Why this priority**: the audience is Vietnamese; English is the exception.

**Independent Test**: open the app in a fresh browser set to Vietnamese and one set to English.

**Acceptance Scenarios**:

1. **Given** no saved language and a browser whose first language is not English, **When** any page opens,
   **Then** it is in Vietnamese.
2. **Given** no saved language and a browser whose first language is English, **When** any page opens, **Then**
   it is in English.
3. **Given** a language chosen earlier with VI/EN, **When** the app opens, **Then** that choice is used whatever
   the browser says.

---

### User Story 7 - Words say exactly what happens (Priority: P3)

Several messages promise or describe more than the app does, or say the same thing twice.

**Why this priority**: small, but each one costs trust or attention.

**Independent Test**: go through each message listed in FR-016 to FR-021 in both languages.

**Acceptance Scenarios**:

1. **Given** an empty house name, display name or other required text field covered here, **When** it is
   submitted, **Then** the message says what to type ("Nhập tên nhà"), and the length rule appears only when the
   text is too long.
2. **Given** the sign-up form shows an error under a field, **When** that field also has a hint, **Then** the hint
   is hidden while the error shows, so the same sentence is not read twice.
3. **Given** a recurring item, **When** its line is shown, **Then** it says it shows on Tổng quan from that day,
   not that the app reminds anyone.
4. **Given** English is on, **When** any screen refers to a nhà, **Then** it uses one word, the one in the
   translation glossary at the top of the English messages ("group").

### Edge Cases

- A person who owes money to someone who has since left the house: the primary button follows the suggested
  transfers, exactly like today's list.
- Tổng quan of a one-person house where the owner already recorded expenses alone: the invite card shows and the
  expenses stay reachable on Chi tiêu.
- A house where the owner is alone but someone is waiting for approval: the invite card says one person is
  waiting and links to Thành viên.
- Nhà của bạn while one house's figures load slowly: that card shows the name first and its figures when they
  arrive.
- An amount of 0đ owed after rounding: shown as settled, never as "Bạn cần trả 0đ".
- A description with no spaces (a pasted link): the two-line limit still applies and the row does not overflow.
- A browser that reports no language at all, or storage that is blocked (private mode): Vietnamese, and no error.
- A notice taken back on another device while Tổng quan is open: the primary button returns at the next refresh.

## Requirements *(mandatory)*

### Functional Requirements

**Tổng quan: the coloured block (US1)**

- **FR-001**: From 320 px to 390 px wide, the sentence, the amount and the avatars of the coloured block MUST NOT
  overlap; below 380 px the avatars MAY move to their own row.
- **FR-002**: Every amount the app accepts (up to 1.000.000.000.000đ) MUST show in full in the block at 320 px,
  with no sideways scrolling; below 380 px the amount uses the smaller size DESIGN.md §5 already states.

**Tổng quan: the debtor's next step (US2)**

- **FR-003**: For each suggested transfer the signed-in person must make, a primary button "Tôi đã chuyển
  {amount} cho {name}" MUST appear directly under the coloured block, doing exactly what today's button does.
- **FR-004**: When a notice for that transfer is already sent, that place MUST show its state and the way to take
  it back instead of the button; when it was declined, the state MUST say so and the button returns.
- **FR-005**: The transfer list further down MUST NOT repeat the button for the signed-in person's own transfers;
  it keeps everything it shows today for the other pairs.
- **FR-006**: Someone who is owed or settled MUST NOT see this button.

**Tổng quan: a house with one person (US3)**

- **FR-007**: While the owner is the only member, Tổng quan MUST show an invite card (code, share, copy, and a
  link to Thành viên when someone is waiting) and MUST hide the month totals, the per-person balances and the
  repayment history.
- **FR-008**: As soon as a second member exists, Tổng quan MUST look exactly as it does today.

**Nhà của bạn (US4)**

- **FR-009**: Each house card MUST show the signed-in person's balance in that house with the app's usual words
  and colours ("Bạn được nhận …", "Bạn cần trả …", settled).
- **FR-010**: Each card MUST show a badge with the number of things waiting for the signed-in person there: join
  requests to approve (owner only) and "Tôi đã chuyển" notices to answer.
- **FR-011**: The figures MUST come from the server with the list of houses, so the page needs no request per
  house; if they cannot be loaded, the cards still show names and open the house.
- **FR-012**: From 1024 px the cards MUST sit in a grid of two or three columns; below, one per row; the chip
  "Trưởng nhóm" MUST keep a gap from the name and never push off the card.

**Chi tiêu (US5)**

- **FR-013**: A description longer than two lines MUST be cut to two lines with an ellipsis in the phone list
  and the laptop table, and the meta line to at most two lines; the full text MUST be reachable by tap or keyboard
  and read in full by screen readers.
- **FR-014**: A month filter MUST stay on when that month has no expenses (arriving from the report, choosing
  it, or after its last expense is deleted), with the empty state "Tháng {m}/{yyyy} chưa có khoản chi nào" and
  "Bỏ lọc".

**Language (US6)**

- **FR-015**: With no saved choice, the app MUST open in English only when the browser's first preferred language
  is English, and in Vietnamese otherwise (including no language reported or storage blocked); a saved choice
  MUST always win.

**Words (US7)**

- **FR-016**: Empty required text fields covered here (house name, display name at sign-up and on the profile
  page) MUST say what to type ("Nhập tên nhà", "Nhập tên của bạn" and the English equivalents); the length rule
  MUST appear only for text that is too long.
- **FR-017**: On sign-up, a field's hint MUST be hidden while that field shows an error.
- **FR-018**: The recurring hint MUST read "Hiện trên Tổng quan từ ngày {d} hằng tháng · không tự lưu khoản chi"
  and the stop question MUST say the item will no longer show on Tổng quan (not "không nhắc nữa"); English
  likewise.
- **FR-019**: The two conflict messages that say "Trang đã cập nhật" / "The page is up to date now" MUST instead
  say the figures just changed and are being refreshed, and ask the person to look again once they show.
- **FR-020**: English MUST use one word for a nhà everywhere, the glossary's "group" (the profile page's
  "household" sentences change), and "Take back" MUST read "Withdraw notice".
- **FR-021**: The gender notice MUST be shorter while keeping what it must say (purpose, who sees it, optional,
  kept until changed, Không nêu deletes it); since its words change, its notice version MUST change too, so a page
  showing the old words cannot record agreement to the new ones.

**For every part**

- **FR-022**: Every new word on screen MUST exist in Vietnamese and English (DESIGN.md §7.1).
- **FR-023**: Every new control MUST meet DESIGN.md §8: 44 px targets, visible focus, 4.5:1 text contrast in
  light and dark, no sideways scrolling at 360 px.
- **FR-024**: DESIGN.md MUST be updated in the same change for each screen whose look changes (§6.1 Nhà của bạn,
  §6.2 Tổng quan, §6.3 Chi tiêu, §7 copy).
- **FR-025**: The expense form, AI quick add and the API client MUST NOT be changed by this feature (spec 011).

### Key Entities

- **House summary**: what the list of houses now carries per house for the signed-in person: balance in đồng and
  the number of things waiting (join requests to approve, notices to answer).
- **Debtor's transfer**: a suggested transfer whose sender is the signed-in person, with the state of its notice
  (none, sent, declined).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: At 320, 360, 375 and 390 px, an automated check finds zero overlap between the sentence and the
  avatars of the coloured block, and a 13-digit amount shows with no hidden digit.
- **SC-002**: A person who owes money reaches "Tôi đã chuyển" without scrolling on a 360 × 800 screen, in 100% of
  the cases where they have a transfer to make.
- **SC-003**: A newly created house shows the invite card on its first Tổng quan; zero sections of zeros are shown.
- **SC-004**: On Nhà của bạn, 100% of cards show the right balance and waiting count compared with the house's own
  pages, using one request for the whole list.
- **SC-005**: An expense row with a 120-character description is at most 2 lines of description tall at 360 px.
- **SC-006**: Every month filter reached from the report keeps the chosen month; zero cases show expenses of
  another month.
- **SC-007**: A fresh browser set to Vietnamese or to no language opens in Vietnamese; one set to English opens in
  English; a saved choice wins in 100% of tries.
- **SC-008**: Every message listed in FR-016 to FR-021 reads as specified in both languages, and the existing
  automated contrast and 44 px checks stay green.

## Assumptions

- The order and amounts of the debtor's buttons follow the suggested transfers the app already computes; no new
  money rule is introduced.
- "Things waiting" counts only what the signed-in person can act on: join requests in houses they own, and notices
  where they are the receiver.
- The invite card on a one-person house reuses the invite code and sharing that Thành viên already has.
- English keeps "group" because the translation review chose it (glossary at the top of the English messages);
  the review's suggestion of "house" is set aside in favour of that decision.
- The gender notice is shared with the server's accepted notice version (spec 010, FR-029), so changing the words
  is a coordinated change of that version on both sides.
- Spec 011 (Tiến) touches the expense form, AI quick add, the API client and recurring errors; this spec avoids
  those files, and both add their own message keys in separate groups of the message files.
