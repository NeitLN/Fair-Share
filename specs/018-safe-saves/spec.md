# Feature Specification: Safe saves

**Feature Branch**: `spec/018-safe-saves`

**Created**: 2026-11-12

**Status**: Ready for planning (reviewed in 6 rounds, last verdict "Ready for planning")

**Input**: Package 2 of the 12/11 product review ([docs/review/2026-11-12-bien-ban-danh-gia-lan-2.md](../../docs/review/2026-11-12-bien-ban-danh-gia-lan-2.md), §3.2 and §5). The aim: a save never hangs and never says something false. Findings covered:

- **B01/E02:** an offline save hangs, then fires on its own later.
- **E03:** typing during a slow save is lost.
- **B02:** the "Đã lưu" toast covers Lưu and the save error on phones, sometimes over a save that was just refused.
- **E06:** a toast with a button disappears after 7 s even while focused.
- **D23:** the sticky save bar on phones has no top edge.

This applies to every action that records money, not only the expense form. The request key that makes a repeated save safe (E01) is package 5 and a separate spec. Only its interim wording belongs here.

## Scope

**Covered actions**, called "a save" below. Each one changes money data on the server.

| # | Action | Where it is pressed |
|---|---|---|
| A1 | Add or edit an expense (including the recurring tick) | Chi tiêu form |
| A2 | Record a repayment by hand ("Ghi khoản trả khác") | Tổng quan, history panel |
| A3 | Tell a transfer: "Tôi đã chuyển", "Chuyển số khác", "Báo thêm" | Tổng quan, debtor block |
| A4 | Take a notice back: "Huỷ thông báo" | Tổng quan, debtor block |
| A5 | Answer a notice: "Xác nhận đã nhận", "Nhận số khác", "Chưa nhận được" | Tổng quan, transfer card |
| A6 | Undo a confirmation ("Hoàn tác" on the card or in its toast) | Tổng quan |
| A7 | Delete an expense or a repayment | Chi tiêu list, history panel |

**Toast rules** (User Story 3) apply to every toast, because the app has one toast area.

**Out of scope:**

- **E01, package 5:** a request key that makes a repeated save return the first one.
- **E10, package 9:** keeping a draft across a refresh or a sign-out. This includes a save that ends in a 401 sign-out, which keeps today's behaviour.
- **Package 3:** the "Tôi đã chuyển" double-press guard (C08) and the notice copy redesign.
- **Package 8:** new confirm-and-undo behaviour for deletes.
- **Profile saves (spec 017):** their behaviour does not change.
- **Saving later:** offline queueing of any kind. This feature does the opposite: nothing is sent unless the person activates the control.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A failed save says what is known, and nothing is sent behind the person's back (Priority: P1)

Lan is at the market on weak 4G and saves "Đi chợ 347.500đ". Today, with no connection, the button stays on "Đang lưu…" with no message. When the signal returns, the expense is sent on its own, even if Lan has gone to another page or typed it again on her laptop.

After this feature, the save ends within a few seconds with a message that says only what the app knows:

- **The browser already knew it was offline, so nothing was sent.** The message says the expense was not saved.
- **The request went out and no answer came back.** The message says the result is unknown and asks Lan to check the list before saving again.

In both cases the form keeps every field, and nothing is ever sent later on its own.

**Why this priority**: Two things break the one thing the app must get right, knowing whether the money was recorded: a save that hangs and then happens behind the person's back, and a message that claims a result the app does not know. This is the first trust-loss moment the review panel named.

**Independent Test**:

- **Offline:** go offline (browser offline mode), fill the expense form, press Lưu. Within 3 s the "not saved" message shows, the fields still hold what was typed, and Lưu works again. Come back online and wait 60 s on any page: no write request is sent.
- **Dropped answer:** let the write request through but drop its answer. The "unknown result" message shows.

**Acceptance Scenarios**:

1. **Given** the browser reports it is offline, **When** the person activates a covered save (click, or Enter in a form), **Then** no request is sent. Within 3 s the action's error place (table under FR-016) shows the "not done" line for that action. The typed values stay, and the control is usable again.
2. **Given** a covered save failed for any reason, **When** the connection comes back or the person moves to another page, **Then** no write request is sent until the person activates a covered control again. Reads may refresh as they do today.
3. **Given** a covered request was sent, **When** the network fails before a full answer arrives, or no full answer arrives within 90 s, **Then** the action's error place shows the "result unknown" line for that action. The form keeps its values, the slow-server notice for that request ends, and the household's data is asked to refresh right away.
4. **Given** a covered request gave up after 90 s, **When** its answer arrives later, **Then** that answer has no direct effect: no toast, no form reset, no focus move. It does ask the household's data to refresh again. Whatever the refreshed data shows (for example the new expense in the list) appears as any data change does.

---

### User Story 2 - A save in flight cannot be changed underneath (Priority: P1)

The free server is waking up and a save takes 9 s. Meanwhile Minh fixes a typo in Nội dung, or the AI quick add finishes and fills the form. Today the server keeps the old values, then the form resets, so the change is lost without a word.

After this feature, from the moment a save's write request is sent until it ends (checks that happen before sending, such as a field error or the big-amount question, stay as today and lock nothing), the values being saved cannot change by any means. Minh cannot type into the fields, pick another payer, change the split or tick a box. The AI quick add, its undo, and default updates cannot change them either. The fields show that they are locked. If the save fails or its result is unknown, the fields unlock with exactly the values that were sent. If it succeeds, the form does what it does today.

**Why this priority**: Silently losing what someone typed is data loss. The screen must show exactly what is being saved.

**Independent Test**: Slow the network so a write takes 9 s. Press Lưu, then try to type in each field and run the quick add. Nothing in the form changes, and the fields look locked. The saved expense equals what was on screen when Lưu was pressed.

**Acceptance Scenarios**:

1. **Given** a covered save from a form (A1, A2, A3 "Chuyển số khác" / "Báo thêm", A5 "Nhận số khác") is in flight, **When** the person tries to change any field of that form, **Then** nothing changes. The fields are marked locked visually and for assistive technology until the write request ends.
2. **Given** an A1 save is in flight, **When** a quick-add answer arrives or "Hoàn tác" of a quick add is pressed, **Then** the form does not change. The quick-add box keeps its text so the person can press "Điền giúp" again after the save. A new quick add cannot be started while the save is in flight.
3. **Given** a covered save from a form ended in failure or an unknown result, **Then** the form is open again with exactly the values that were sent.
4. **Given** the "Chuyển số khác", "Báo thêm" or "Nhận số khác" step was used, **When** its save is in flight or fails, **Then** the step stays open with its amount and note; it closes on its own only after a confirmed success. While the save is in flight, "Huỷ" and Escape do nothing. After a failure or an unknown result, "Huỷ" and Escape close the step again and return focus to its opener (spec 014 FR-014).
5. **Given** the write request of a save has succeeded, **When** the data refresh that follows is still running or fails, **Then** the save counts as done: the lock lifts, the success feedback shows, and a refresh failure does not turn it into an error or an unknown result.
6. **Given** keyboard focus is in a field when the save starts, **Then** locking does not throw focus to the page body. Tab still moves through the page. The app does not pull focus back if the person moves it on purpose. The existing focus rules for errors (spec 011) and for controls that replace themselves (spec 014 FR-014, spec 017) stay as they are.

---

### User Story 3 - Toasts never cover the save, and never say "saved" next to a failure (Priority: P2)

Right after saving "Đi chợ", Lan adds a Tự chia expense that does not add up. The save is refused, but the "Đã lưu: Đi chợ… 347.500đ" toast from the first save sits over the refusal. She reads "Đã lưu" and moves on. On a phone, two stacked toasts can also hide the "Lưu khoản chi" button itself.

After this feature:

- **Old success toasts go:** a success toast from a covered save goes away as soon as a new save starts in that place, or as soon as an error shows there.
- **One toast on phones:** phones show one toast at a time, never over the save area or its error summary.
- **Toasts with a button stay while used:** such a toast stays while the person is on it.

**Why this priority**: A "saved" message next to a refused save is a false money signal, the same kind of problem as a wrong number. A toast over the button also blocks the main action.

**Independent Test**: At 360 px, save twice in a row, then make a refused save. At every moment at most one toast is visible, it does not overlap the save area or the error summary, and no success toast is visible while an error is shown. Then, with no error on screen, tab to "Hoàn tác" in a toast and wait 15 s while another toast is triggered: the focused toast is still there.

**Acceptance Scenarios**:

1. **Given** a success toast from a covered save is visible and not in use, **When** a new covered save starts from the same place (same form, card or panel), **Then** that toast is removed at once.
2. **Given** a success toast from a covered save is visible, **When** a save error shows anywhere on screen (a field check before sending, a refusal, "not done" or "result unknown"), **Then** that toast is removed, even if it is in use. If it had keyboard focus, focus moves to the control that started the failing save, or to the error summary where spec 011 sends it there.
3. **Given** a save error is visible on screen, **When** a success toast from a covered save would appear or come out of waiting, **Then** it is not shown, and its leaving behaviour runs once.
4. **Given** a screen narrower than 600 px, **When** a new toast arrives while one is visible and not in use, **Then** the new toast replaces the old one. The old toast's leaving behaviour runs exactly once, as when a toast times out today. Its action button disappears, and any undo on the card or in the history stays.
5. **Given** a toast that is in use (keyboard focus or pointer on it), **When** a new toast arrives, **Then** the toast in use is never removed to make room, at any width. Below 600 px the new toast waits and shows after the person leaves the one in use. If several arrive meanwhile, only the newest is shown, and the leaving behaviour of the skipped ones runs once each. From 600 px, the oldest toast not in use makes room.
6. **Given** the phone layout (below 1024 px, where the save area is sticky) with a sticky save area on screen, **Then** no toast overlaps the save area or its error summary, whatever their height at that moment. If the toast does not fit in the visible screen above the save area, for example with the on-screen keyboard open, it shows at the top of the visible screen instead. A toast's text takes at most two lines here. If it fits in neither place, it waits, with its timer stopped, until it fits. A toast in use may move to the top, but it is not removed to make room for another toast.
7. **Given** a toast with an action, **When** it has keyboard focus or the pointer is over it, **Then** its timer is paused, and it restarts for the full 7 s when both leave.
8. **Given** a screen 600 px or wider, **Then** up to three toasts may stack as today, and each still follows scenarios 2, 3, 5, 6 and 7.

---

### User Story 4 - The phone save bar reads as a bar (Priority: P3)

On a phone, the sticky save bar slices through the payer chips scrolling under it. With no edge, it looks like an overlap glitch.

**Why this priority**: Polish, but the toasts must clear this same element, so it belongs in the same change.

**Independent Test**: At 360 px, scroll the expense form so payer chips pass under the sticky bar. The bar has a visible top edge in light and dark themes.

**Acceptance Scenarios**:

1. **Given** the phone layout of a form with a sticky save area, **When** content scrolls under it, **Then** the area shows a 1 px top border in the theme's line colour and a soft upward shadow, in both themes. The desktop layout does not change.

---

### Edge Cases

- **The browser says online but the server is unreachable** (DNS failure, captive Wi-Fi, server down): the request was attempted, so this gives the "result unknown" line, not the "not done" line. The app cannot know whether anything reached the server.
- **The browser says offline but the network actually works:** the save is not sent and says "not done". That is true, because nothing was sent. The person presses again once the browser sees the network.
- **The person navigates away, or switches household, during a save:** the request is not cancelled. When it ends, it shows no toast, moves no focus and changes no screen state on the page the person is now on. The original household's data still refreshes. If the person comes back to the page, the list shows what the server holds.
- **A save that ends in a 401:** today's sign-out behaviour stays (package 9).
- **A refused save that is not a network problem** (validation, 409, 422): the current messages and focus stay. Only the toast rules (User Story 3) apply.
- **Quick add while offline:** it is not a save, but it must not hang either. Offline, "Điền giúp" fails at once with its own line, "Đang mất mạng, chưa đọc được câu này.". With no answer, its current failure line applies.
- **A server that keeps working after the app gave up:** possible. The "result unknown" wording exists for exactly this case, and package 5 makes the retry safe.

## Requirements *(mandatory)*

### Functional Requirements

**Never sent behind the person's back**

- **FR-001**: Covered saves MUST NOT wait for the network to come back, MUST NOT be retried automatically, and MUST NOT be resumed later. Each write request is sent only as the direct result of the person activating its control (a click, a tap, or Enter submitting a form).
- **FR-002**: Reads (lists, balances, notices) MAY keep refreshing as they do today, including on reconnect.

**Saying only what is known**

- **FR-003**: When the browser reports offline at the moment of activation, the covered save MUST NOT be sent. The action MUST end within 3 s with its "not done" line (FR-016).
- **FR-004**: When a covered write request was sent and the network fails before a full answer is read, the action MUST end with its "result unknown" line (FR-016). Words saying the action surely failed MUST NOT be used.
- **FR-005**: A covered write request that has no full answer 90 s after it was sent MUST be given up, with the same "result unknown" line. Giving up MUST end that request's slow-server tracking (spec 011 FR-009). For covered writes only, this replaces spec 011's "no timeout is added".
- **FR-006**: A "result unknown" outcome MUST ask the original household's data to refresh at once, and again 10 s and 30 s later, because the server may commit after the first read. An answer that arrives after a covered request was given up MUST have no direct effect (no toast, no form reset, no focus move), but MUST ask for a refresh again. Screen changes that come from refreshed data are allowed. A refresh that does not show the record MUST NOT clear or soften the "result unknown" line. That line stays until the person starts a new save from that place, closes the step, or leaves the page.

**What is being saved cannot change**

- **FR-007**: From the moment its write request is sent until it ends, a covered save's values MUST NOT change by any route. Checks before sending (field errors, the big-amount question of spec 011, the offline check of FR-003) lock nothing. The routes covered are typing, pickers, ticks, the AI quick-add fill or its undo, or default updates from props. The form's fields MUST be shown as locked, visually and to assistive technology.
- **FR-008**: While an A1 save is in flight, quick add MUST NOT start. A quick-add answer that arrives during the save MUST NOT be applied, and the quick-add box MUST keep its text.
- **FR-009**: On failure or an unknown result, the form or step MUST unlock with exactly the values that were sent. The "Chuyển số khác", "Báo thêm" and "Nhận số khác" steps MUST close on their own only after a confirmed success. While their save is in flight, "Huỷ" and Escape MUST do nothing. After a failure or an unknown result, both MUST close the step and return focus to its opener, as spec 014 FR-014 says.
- **FR-010**: A save is "in flight" only until its write request ends. A data refresh after a successful write MUST NOT keep the lock on, MUST NOT delay the success feedback, and MUST NOT turn the success into an error.
- **FR-011**: Locking MUST NOT move focus to the page body or trap it. Existing focus rules (spec 011 errors, spec 014 FR-014, spec 017) MUST keep working.

**Toasts**

- **FR-012**: A success toast from a covered save that is not in use MUST be removed when a new covered save starts from the same place. Any success toast from a covered save MUST be removed when a save error shows on screen, including field checks before sending, even if it is in use. If the removed toast had keyboard focus, focus MUST move to the control that started the failing save, or to the error summary when spec 011 sends focus there. While a save error is on screen, success toasts from covered saves MUST NOT be shown or released from waiting.
- **FR-013**: Below 600 px wide, at most one toast MUST be visible. A new toast replaces a visible toast that is not in use. At any width, a toast in use (focus or pointer) MUST NOT be removed to make room. Below 600 px newer toasts wait and only the newest shows afterwards; from 600 px the oldest toast not in use makes room. Every toast's leaving behaviour MUST run exactly once.
- **FR-014**: In the phone layout (below 1024 px, where save areas are sticky), a toast MUST NOT overlap a sticky save area or its error summary at any moment, measured against the visible screen. If it does not fit above the save area, it MUST show at the top of the visible screen. A toast's text MUST be limited to two lines in the phone layout, with the full text kept in its accessible name. If a toast still fits neither above the save area nor at the top (for example the on-screen keyboard leaves almost no room), it MUST wait without its timer running until it fits. Not overlapping the save area wins over every other toast rule. A toast in use may move to the top of the visible screen, but it is not removed to make room for another toast. If the screen shrinks so much that even a toast in use fits nowhere, it MUST be hidden with its timer paused until it fits again. If it had keyboard focus, focus moves to the save control of the form on screen. The 1024 px layout breakpoint and the 600 px stacking breakpoint stay separate.
- **FR-015**: A toast's timer MUST pause while it has keyboard focus or pointer hover, and MUST restart at the full duration when both leave. One exception: the A6 undo toast that shows a "result unknown" line MUST NOT time out. It stays, with a close button, until the person closes it, uses its action, or leaves the page, so FR-006 holds for undo too. It counts as "in use" for FR-013 the whole time: no other toast replaces it or pushes it out. Below 600 px newer toasts wait behind it.

**Where each action reports, and in what words**

- **FR-016**: Each covered action MUST report where its errors show today, with these lines (Vietnamese shown; English equivalents required). There is one new error place. Today the "Nhận số khác" step closes on submit and its server errors go to the transfers panel's alert. Because FR-009 keeps the step open, its server errors MUST show inside the step, as the debtor's amount step already does.

| Action | Error place today | "Not done" (offline) | "Result unknown" |
|---|---|---|---|
| A1 add/edit expense | The form's error summary above Lưu | "Chưa lưu được: bạn đang mất mạng. Khoản chi này chưa được lưu." | "Chưa nhận được kết quả. Có thể khoản chi đã được lưu, xem danh sách trước khi lưu lại." |
| A2 hand-recorded repayment | The form's error line | "Chưa ghi được: bạn đang mất mạng. Khoản trả này chưa được ghi." | "Chưa nhận được kết quả. Có thể khoản trả đã được ghi, xem lịch sử trước khi ghi lại." |
| A3 tell ("Tôi đã chuyển", "Chuyển số khác", "Báo thêm") | Inside the amount step when it is open; otherwise the transfers panel's alert | "Chưa báo được: bạn đang mất mạng." | "Chưa nhận được kết quả. Có thể đã báo rồi, xem lại khối của bạn trước khi báo lại." |
| A4 take a notice back ("Huỷ thông báo") | The transfers panel's alert | "Chưa huỷ được: bạn đang mất mạng." | "Chưa nhận được kết quả. Có thể đã huỷ rồi, xem lại khối của bạn trước khi bấm lại." |
| A5 answer a notice | Inside the "Nhận số khác" step (new, see above); "Xác nhận đã nhận" and "Chưa nhận được" use the transfers panel's alert as today | "Chưa ghi được: bạn đang mất mạng." | "Chưa nhận được kết quả. Có thể đã ghi rồi, xem lại thẻ trước khi bấm lại." |
| A6 undo | The retry toast it uses today | "Chưa hoàn tác được: bạn đang mất mạng." | "Chưa nhận được kết quả. Có thể đã hoàn tác rồi, xem lại thẻ trước khi bấm lại." |
| A7 delete | The list or history error line | "Chưa xoá được: bạn đang mất mạng." | "Chưa nhận được kết quả. Có thể đã xoá rồi, xem lại danh sách trước khi xoá lại." |

- **FR-016a**: A "result unknown" line MUST be shown on its own. It MUST NOT be wrapped in a prefix that claims failure: not "Chưa lưu được: …" / "Not saved: …" in the expense form, and not "Couldn't undo." in the undo toast. The "not done" lines carry their own prefix, as in the table.

- **FR-017**: For reads, today's network message and "Thử lại" button stay.

**Look**

- **FR-018**: In the phone layout, a sticky save area MUST have a 1 px top border in the theme's line colour and a soft upward shadow, in light and dark themes. DESIGN.md MUST record this, together with the toast rules of FR-013 to FR-015.

### Key Entities

No data or API change. Everything happens in the web client.

- **Save attempt**: one activation of a covered control. Its state is in flight, then exactly one of: succeeded, refused, not done (offline), or result unknown (sent, no full answer, or gave up after 90 s).
- **Toast**: as today, plus where it came from (which covered place, and whether it is a success) and whether it is in use, so FR-012 and FR-013 can act on it.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With the browser offline, each covered action A1 to A7 shows its "not done" line within 3 s. 0 write requests are sent in the next 60 s, including after coming back online and after moving to another page.
- **SC-002**: With a dropped answer, each covered action shows its "result unknown" line. With an answer held back for more than 90 s, the line shows at 90 s (±2 s), and the slow-server notice for that request is gone.
- **SC-003**: With a 9 s write delay, 0 changes typed or filled in during the save reach the saved record or are lost. The saved values equal the values on screen at activation, and after a failure the form shows them again.
- **SC-004**: At 360 px, during 2 successful saves and 1 refused save, at most 1 toast is visible at any moment, it overlaps the save area and the error summary by 0 px, and no success toast is visible while an error is shown.
- **SC-005**: With no save error on screen, a toast with an action that keeps focus or hover is still visible after 15 s, at 360 px and at 1280 px, including when other toasts arrive and when another save starts from the same place.
- **SC-007**: After a "result unknown" outcome where the server committed 20 s late, the record appears in the list within 35 s without the person reloading, and the "result unknown" line stays visible until the person acts.
- **SC-006**: The existing E2E smoke stays green (form, notices, quick-add and security specs). The axe check on the expense form while it is locked reports 0 violations.

## Assumptions

- **Offline is a hint only.** The browser's "offline" signal is used solely to avoid sending. Once a request is sent, only a full answer counts as a result.
- **90 s give-up.** Cold starts usually take about 50 s, and the slow-server notice from spec 011 already explains the wait after 5 s. The server may still finish after the client gives up. That is why the line says "có thể đã lưu" and why package 5 matters.
- **Locking scope.** Only the covered money actions lock. Profile, house name, invite and member actions keep their behaviour.
- **Existing guards stay.** One POST for a triple click on Lưu, and the guard on "Xác nhận đã nhận", stay as they are. The missing guard on "Tôi đã chuyển" (C08) is package 3.
- **Toast basics stay.** The 7 s duration, the toast area, and up to three toasts from 600 px stay (DESIGN.md §5). Only stacking below 600 px, placement and pausing change.
