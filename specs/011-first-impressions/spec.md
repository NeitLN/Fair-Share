# Feature Specification: First impressions that hold up

**Feature Branch**: `feat/011-first-impressions`

**Created**: 2026-11-08

**Status**: Draft (reviewed in two rounds, 08/11)

**Input**: Tiến's part of round 1 of the work plan (`docs/review/2026-11-08-ke-hoach-cong-viec.md`, section 6), from
the product review of 08/11 (`docs/review/2026-11-08-bien-ban-danh-gia.md`): work packages G1-02, G1-08, G1-10
(the form part), G1-03, G1-04, G1-11 and G1-06. The screens of spec 012 (Tổng quan's coloured block, the list of
houses, the expense list and table, the filters, the language default, the sign-in page) are out of scope.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A save that fails says why, where you can see it (Priority: P1)

Tiến records "Đi chợ" with Tự chia on his phone, types shares that are 50.000đ short, and presses "Lưu khoản chi".
Today the message sits outside the sticky save area, so it can be off screen, and the focus lands on the split
mode button rather than on a share to fix.

**Why this priority**: a save that seems to do nothing makes people think the app is broken, on the screen used
most.

**Independent Test**: submit the form with each kind of mistake at 360 px (keyboard open), at 200% zoom and on a
laptop; each time a summary is visible in the save area and the focus is on the field to fix, or the summary is
announced when there is no field.

**Acceptance Scenarios**:

1. **Given** shares that do not add up, **When** Tiến presses "Lưu khoản chi", **Then** a summary inside the save
   area, above the buttons, says what is wrong ("Chưa chia: 50.000đ"), the split part opens if folded, and the
   focus goes to the first custom share.
2. **Given** a share that cannot be read, **When** Tiến saves, **Then** the summary names it and the focus goes to
   that share.
3. **Given** Chia đều with nobody ticked, **When** Tiến saves, **Then** the focus goes to the first person checkbox.
4. **Given** several mistakes, **When** Tiến saves, **Then** the summary and the focus follow the first one in the
   order description, amount, payer, date, split.
5. **Given** the server refuses the expense for a reason tied to a field, **When** the answer comes back, **Then**
   the summary shows it and the focus goes to that field; nothing typed is lost.
6. **Given** a network failure or an unexpected server error, **When** it comes back, **Then** the summary shows the
   message and it is announced, without moving the focus to a field.
7. **Given** a failed save, **When** Tiến edits a field but the form is still invalid, **Then** the summary updates
   to the next problem instead of disappearing; it disappears only when the form is valid.
8. **Given** the month of a repeating item was already recorded, **When** that conflict comes back, **Then** it keeps
   today's presentation with "Xem khoản đã ghi", not the summary.

---

### User Story 2 - A slow answer says what may be going on (Priority: P1)

Lan opens the link after the house has been quiet for a while. The free server sleeps after about 15 minutes and
needs about 50 seconds to wake. Today the page says only "Đang tải…", and the sign-in button just spins.

**Why this priority**: it is the first thing a new person, or a lecturer opening the link, experiences, and it looks
broken.

**Independent Test**: make a request take more than 5 seconds; the notice appears at second 5, is announced once,
and hides by itself when no request has waited more than 5 seconds any more.

**Acceptance Scenarios**:

1. **Given** a request has waited more than 5 seconds, **When** Lan looks at the page, signed in or not, on a phone
   or a laptop, **Then** a notice above the page content says "Phản hồi đang lâu hơn bình thường. Máy chủ có thể
   đang khởi động, thường mất khoảng 1 phút. Bạn không cần tải lại trang."
2. **Given** the notice shows, **When** no request has waited more than 5 seconds any more, **Then** it hides by
   itself; a failure shows the usual error.
3. **Given** the notice hid less than 10 seconds ago, **When** it shows again, **Then** it is not announced again;
   after 10 seconds hidden, the next showing is a new episode and is announced once.
4. **Given** answers within 5 seconds, **When** Lan uses the app, **Then** the notice never shows.
5. **Given** the notice shows, **When** Lan moves to another page, scrolls or types, **Then** it is not announced
   again, covers no control and blocks nothing.

---

### User Story 3 - Repeating monthly and splitting by amount cannot clash (Priority: P2)

Tiến ticks "Lặp lại hằng tháng" for a new expense and picks Tự chia. A repeating item is made as an equal split, but
today he only finds out when he presses save.

**Why this priority**: a dead end that is easy to remove.

**Independent Test**: on a new expense, pick Tự chia (by hand, through a quick-add fill or by undoing one) and check
"Lặp lại hằng tháng" is off and unavailable, with its reason.

**Acceptance Scenarios**:

1. **Given** a new expense whose split is Tự chia, **When** Tiến looks at "Lặp lại hằng tháng", **Then** it is
   unavailable with the line "Khoản định kỳ chỉ chia đều được."
2. **Given** repeat is ticked, **When** the split becomes Tự chia by hand, by a quick-add fill or by undoing a fill,
   **Then** repeat is unticked, the varying-amount option goes with it, and the line explains why.
3. **Given** Tiến goes back to Chia đều, **When** he looks at repeat, **Then** it is available again but stays unticked
   until he ticks it.
4. **Given** recording a due month of an existing repeating item, or editing an expense, **When** Tiến picks Tự chia,
   **Then** nothing changes from today.

---

### User Story 4 - Amounts are hard to get wrong (Priority: P2)

Tiến types 5000000000 instead of 5000000 for rent, and the app saves it. When he switches to Tự chia, every share is
empty and the share fields show no "= …đ" echo, unlike the total.

**Why this priority**: money typos are the costliest mistakes in the app, and splitting by amount is where people
type the most numbers.

**Independent Test**: save 50.000.001đ and check one confirmation; switch to Tự chia and check the shares start at
the equal split; type "120k" in a share and see "= 120.000đ".

**Acceptance Scenarios**:

1. **Given** a valid total above 50.000.000đ, **When** Tiến presses save, **Then** the save area shows "Số tiền
   {amount} lớn bất thường. Lưu thật nhé?" with "Sửa lại" (focused) and "Lưu thật"; Escape or "Sửa lại" puts the
   focus back on the amount; "Lưu thật" saves once.
2. **Given** the confirmation shows, **When** Tiến keeps Enter held or presses Enter in a field, **Then** nothing is
   saved; only a deliberate activation of "Lưu thật" saves.
3. **Given** Tiến confirmed 60tr, **When** he retypes it as 60.000.000, **Then** no new confirmation (the same parsed
   amount); a different large amount asks again; 50.000.000đ or less never asks.
4. **Given** a total above 1.000.000.000.000đ, **When** Tiến saves, **Then** the amount is refused with the usual
   message before any confirmation.
5. **Given** a total of 10đ shared by members 9, 2 and 5, **When** Tiến switches from Chia đều to Tự chia for the first
   time, **Then** the shares start at 3, 4, 3 (the leftover đồng to the lowest member id, as Chia đều does).
6. **Given** no valid total yet, **When** Tiến switches to Tự chia, **Then** the shares stay empty and fill once with
   the equal split when a valid total is typed, unless he has typed a share by then.
7. **Given** the shares were prefilled, **When** Tiến changes the total, **Then** the shares stay and the live
   remainder shows the difference.
8. **Given** an existing expense opened for editing, or a quick-add fill with a custom split, **When** the form shows
   Tự chia, **Then** its shares are used as they are.
9. **Given** a share field, **When** Tiến types "120k", **Then** "= 120.000đ" shows with it, as for the total; an
   unreadable share gets the same message as the total, tied to that field.

---

### User Story 5 - Quick add behaves when busy or switched off (Priority: P2)

Minh presses Enter several times while quick add is reading; each press sends another request. On a server without
AI, the box shows normally and only says it is off after you try.

**Why this priority**: duplicate requests spend the house's shared daily AI quota; a box that cannot work should not
invite typing.

**Independent Test**: press Enter three times quickly and count one request; on a server without AI, once that is
known, the box is replaced by one line that keeps what was typed.

**Acceptance Scenarios**:

1. **Given** quick add is reading, **When** Minh presses Enter, the button or Retry, **Then** no other request is
   sent; this also holds after "Nhập tay" until the earlier call has ended.
2. **Given** the server answers that AI is not set up, **When** any page with quick add shows, **Then** the box is
   replaced by "Gõ nhanh bằng AI chưa được bật trên máy chủ này." and the form below works as today.
3. **Given** Minh had typed a sentence before that answer, **When** the box is replaced, **Then** his sentence shows
   as selectable text under the line with "Nhập các thông tin trong câu vào biểu mẫu bên dưới."
4. **Given** the server's answer is not known yet (still waking, or the question failed), **When** the page shows,
   **Then** quick add looks and works as today.
5. **Given** the server answers that AI is set up, **When** the page shows, **Then** quick add works as today,
   including today's messages when the key is invalid or the quota is used up.

---

### User Story 6 - Stopping a repeating item says when it is unclear (Priority: P3)

Tiến presses "Ngừng lặp" on the internet item while offline. Today the button just comes back.

**Why this priority**: rare, but silent failures erode trust.

**Independent Test**: make stopping fail and check the message under that item; stop two items at once and check
each gets its own result.

**Acceptance Scenarios**:

1. **Given** stopping fails, **When** the answer comes back, **Then** under that item: "Chưa xác nhận được là đã ngừng
   lặp." with the reason, announced once; the item stays.
2. **Given** Tiến stops two items, **When** one fails, **Then** only that item shows the message; each item has its
   own waiting state.
3. **Given** a later attempt on that item succeeds, **When** it does, **Then** its message goes and the toast says it
   stopped, as today.
4. **Given** Tiến moves to another house while a stop is waiting, **When** the old answer arrives, **Then** nothing
   shows in the new house.

### Edge Cases

- Laptop layout (no sticky bar): the summary and the confirmation still sit directly above the save button.
- A request slow because the phone is offline: the notice shows (its words do not claim the cause); the request
  ends when the browser gives up, and the usual error follows.
- Staggered slow requests and automatic retries: one notice; it hides only when none has waited more than 5 seconds.
- Large amount confirmed, then the save fails: retrying the same amount does not ask again.
- Tự chia when people change after prefilling: kept people keep their shares; a person added starts empty; a person
  removed loses their share; the prefill never runs again on that form.
- Quick-add fill followed by undo: the shares, the prefill state and the repeat option return to what they were.
- An AI-blocked split preview (spec 009): prefilling never replaces the preview.
- Availability answer arrives after the person typed in quick add: the sentence is kept (US5, scenario 3).
- A full browser reload asks the server about AI again; moving between pages in the app does not.

## Requirements *(mandatory)*

### Functional Requirements

**Failed saves (US1)**

- **FR-001**: When saving the expense form fails, a summary MUST appear inside the save area, above its buttons,
  naming the first problem in the order description, amount, payer, date, split.
- **FR-002**: For a problem tied to a field (found on the page, or a server refusal tied to a field), the page MUST
  open the part holding it if folded, scroll to it (without animation when reduced motion is on) and focus it: the
  first unreadable share; the first custom share when the shares do not add up or none is given; the first person
  checkbox when nobody is ticked in Chia đều.
- **FR-003**: For a problem not tied to a field (network, unexpected server error), the summary MUST show the message
  and announce it once, without moving the focus.
- **FR-004**: After a failed save, the summary MUST follow edits: it shows the next problem while any remains and
  hides when the form is valid. A server message MUST clear when the person changes the field it is about, changes
  the amount, payer, date or split, or saves again.
- **FR-005**: Each message MUST be tied to its field for assistive technology, and the summary, the server message and
  the live remainder MUST NOT announce the same thing twice. Nothing typed may be lost.
- **FR-006**: The recurring-month conflict MUST keep its own presentation with "Xem khoản đã ghi".

**Slow answers (US2)**

- **FR-007**: While at least one request has waited more than 5 seconds (counting until its answer has been read in
  full), a notice MUST show above the page content on every page, signed in or not, with the words in US2,
  scenario 1 (and English).
- **FR-008**: The notice MUST hide as soon as no request has waited more than 5 seconds; it MUST be announced politely
  once per episode, where an episode ends after the notice has stayed hidden for 10 seconds; it MUST NOT be
  announced on page changes and MUST NOT cover or block any control.
- **FR-009**: Request tracking MUST end for every outcome: success, refusal, network failure, cancellation and a change
  of signed-in account. No timeout or automatic retry is added.

**Repeat and split (US3)**

- **FR-010**: For a new expense, whenever the split becomes Tự chia (by hand, by a quick-add fill, or by undoing a
  fill), "Lặp lại hằng tháng" and its varying-amount option MUST be unticked and unavailable, with the line "Khoản định
  kỳ chỉ chia đều được."; returning to Chia đều makes it available but unticked. Recording a due month and editing an
  expense are unchanged. The existing check at save stays as a safeguard.

**Amounts (US4)**

- **FR-011**: A valid total above 50.000.000đ MUST ask for confirmation inside the save area before saving, as in US4
  scenarios 1 and 2: "Sửa lại" focused, Escape returns to the amount, and only a deliberate activation of "Lưu thật"
  saves, once; pressing Enter elsewhere or holding it MUST NOT save while the confirmation shows.
- **FR-012**: The confirmation MUST be tied to the parsed amount: a different parsed amount (typed, filled or undone)
  asks again, the same amount written differently does not; a failed save keeps it; a successful save or a reset
  clears it. It applies to new expenses, edits, recording a due month and creating a repeating item; a quick-add fill
  never opens it, and neither does an edit that keeps the amount already saved (review of PR-B, #235). The question
  is read out with whichever of its two buttons has the focus.
- **FR-013**: A total above 1.000.000.000.000đ MUST be refused on the page with the usual message, before any
  confirmation.
- **FR-014**: The first time a person switches a form from Chia đều to Tự chia, the shares MUST start at the equal
  split of the current valid total between the people ticked, with the leftover đồng rule of Chia đều. Without a valid
  total, the prefill waits until the person leaves the amount field with a valid total (not on each digit, so "3" on
  the way to "300000" never splits 3đ), unless a share has been typed. It MUST never replace shares from
  an existing expense, a quick-add fill or the person's typing, MUST never run twice on a form, and an undo MUST
  restore both the shares and whether the prefill has run.
- **FR-015**: Share fields MUST show the same "= …đ" echo as the total and tie their own error to themselves; the text
  typed is kept as typed, and an empty or zero share keeps today's meaning (not sharing).

**Quick add (US5)**

- **FR-016**: Quick add MUST send at most one request at a time, whatever starts it (Enter, button, Retry), including
  after "Nhập tay" until the earlier call ends; Shift+Enter and typing with an input method keep working as today.
- **FR-017**: The server MUST report whether AI quick add is set up, as the presence of its configuration only (the
  same condition it uses itself), never a credential and never by calling the AI service.
- **FR-018**: The page MUST ask once per full page load, share the answer, and treat a missing or failed answer as
  unknown; browser and proxy caching MUST NOT serve an old answer on a full reload.
- **FR-019**: Unknown keeps quick add as today; an explicit "not set up" MUST replace the box with the line and the
  kept sentence of US5, scenarios 2 and 3; "set up" keeps quick add as today, with today's failure messages.

**Stopping a repeating item (US6)**

- **FR-020**: Each repeating item MUST have its own waiting state and its own message; a failed or unclear stop MUST
  show "Chưa xác nhận được là đã ngừng lặp." with the reason under that item, announced once even if its fold is
  closed, and keep the item; that item's later success clears it; answers from a previous house MUST NOT show.

**For every part**

- **FR-021**: Every new word MUST exist in Vietnamese and English, in the message groups this spec owns (form, quick
  add, recurring, app-wide notice).
- **FR-022**: Every new control MUST meet DESIGN.md §8 and constitution VI: 44 px targets, visible focus, 4.5:1
  contrast in light and dark, usable at 360 px and at 200% zoom with no sideways scroll, reduced motion respected.
- **FR-023**: DESIGN.md (§6.3 form, §6.5 states, §7 copy) and ARCHITECTURE.md (the server's AI configuration answer)
  MUST be updated in the same change.
- **FR-024**: This spec MUST stay out of the screens of spec 012. It owns the expense form, quick add, the recurring
  list, the request layer and the app shell's notice slot; on the expenses page it only passes the form error and the
  stop errors through.

### Key Entities

- **Slow request**: a request still unanswered after 5 seconds; while one exists, the slow notice shows.
- **Notice episode**: from a showing of the slow notice until it has stayed hidden 10 seconds; announced once.
- **AI availability**: unknown, set up, or not set up, as the server reports; asked once per page load.
- **Large amount confirmation**: the parsed amount the person confirmed.
- **Share prefill state**: whether the one-time prefill has run on this form, restored by undo.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For each listed form mistake, at 360 px with the keyboard open, at 200% zoom and on a laptop, the
  summary is fully visible in the save area, and the focus is on the named field (or the summary is announced when
  no field applies).
- **SC-002**: With an answer delayed 50 seconds, the notice is visible from second 5 until the answer and announced
  once; with every answer under 5 seconds it never shows; reshowing within 10 seconds is not announced again.
- **SC-003**: No new expense can be saved as a repeating item with Tự chia through any path (hand, fill, undo).
- **SC-004**: Every valid submission above 50.000.000đ whose parsed amount is not already confirmed asks once (tested
  at 50.000.001đ, and a retry of the same amount after a failed save does not ask again); at 50.000.000đ and below it
  never asks; above 1.000.000.000.000đ it is refused before asking.
- **SC-005**: Switching to Tự chia on 10đ for members 9, 2, 5 shows 3, 4, 3 and adds up to the total.
- **SC-006**: Three quick Enters, a button press and a Retry during one reading send exactly one request in total.
- **SC-007**: Once availability resolves to "not set up", no one can type into quick add and a sentence typed before
  is still shown; with "set up" or unknown it works as before.
- **SC-008**: Every failed stop shows a message under its own item, and none shows after moving to another house.

## Assumptions

- 50.000.000đ is above any normal shared expense for a student house (a month's rent for four is usually well below
  it); the confirmation guards against typos, it is not a limit.
- The client cannot know why an answer is slow; 5 seconds is the point where waiting is unusual, and the words say
  "có thể" rather than claiming the server is waking.
- The 30-second refresh of some pages counts like any request; a page that polls is open, so the server is mostly
  awake, and a slow poll showing the notice is truthful.
- The equal split rule is the existing one (leftover đồng to the lowest member ids).
- Reporting whether AI is set up discloses only that it is configured, which the server already acts on.
- Spec 012 (Duy Anh) works on its screens in parallel; both add new message keys in different groups, and the second
  pull request to merge rebases.
