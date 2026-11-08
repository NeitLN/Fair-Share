# Feature Specification: An invited person knows which house they are joining

**Feature Branch**: `spec/015-invite-preview`

**Created**: 2026-11-08

**Status**: Reviewed, ready for planning

**Input**: G2-06 of the work plan of 08/11 (`docs/review/2026-11-08-ke-hoach-cong-viec.md`): with an invite code,
show the house's name and its owner's name, under the code-guessing limits of rule J2, a wrong code answered as
today (J1); the invite page and the "Đang chờ duyệt" card say "Bạn đang xin vào Nhà trọ Q7 của Tiến"; while waiting,
ask again every 10 seconds while the page is open; when refused, keep one line "Yêu cầu chưa được duyệt" (rule D4 of
`docs/ACCOUNTS.md` changes with it); after signing up from an invite link, hide the form that creates a house.
Coordinated with PR-L of spec 012 (the house list page), still in progress.

## Context

Today an invite link leads to a sign-in form, then to "Vào nhà bằng mã mời" with the code filled in. After "Gửi yêu
cầu vào nhà" the card says only "Yêu cầu vào nhà gửi ngày 08/11, đang chờ trưởng nhóm duyệt". Rule D4 hides even the
house's name until the owner approves. So:

- the person cannot tell whether the link is the right one (two houses, or an old link);
- right after signing up from a link, the start page offers "Chưa ai tạo nhà?" next to the join form, and some people
  create a second, empty house;
- a refused request disappears without a word;
- approval shows up only on the next 30-second check.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See the house before asking to join (Priority: P1)

Lan, signed in, opens the link Tiến sent. Before she asks, the page says "Lời mời vào Nhà trọ Q7 của Tiến"; after she
asks, the card says "Bạn đang xin vào Nhà trọ Q7 của Tiến".

**Why this priority**: it is the one fact a person needs to trust an invite.

**Independent Test**: open a valid link signed in and see the house and owner before asking; ask, and see them on
the waiting card; try a wrong code and see today's message and nothing else.

**Acceptance Scenarios**:

1. **Given** Lan is signed in and opens a valid invite link, **When** the page shows, **Then** above "Gửi yêu cầu vào
   nhà" it says "Lời mời vào Nhà trọ Q7 của Tiến".
2. **Given** she types a code by hand, **When** it reads as a complete code (rule J1: case, spaces, dashes, O/0, I/L/1
   do not matter), **Then** the same line shows; changing the code removes it, and an answer for an older code is
   never shown for a newer one.
3. **Given** she sends the request, **Then** the card "Đang chờ duyệt" says "Bạn đang xin vào Nhà trọ Q7 của Tiến"
   with the date; the code is checked again when sending, so one that expired or was replaced in between gets
   today's message.
4. **Given** a wrong, expired or replaced code, **Then** the page shows the same message as today; the three cases
   cannot be told apart.
5. **Given** Lan is already in that house, **When** the preview answers, **Then** it says "Bạn đã ở trong nhà này"
   with a way to open it (new: today she learns it only after sending).
6. **Given** someone tries many codes, **When** they pass the limits of rule J2, **Then** previews and requests are
   refused alike for the rest of that minute, with the time to wait.

---

### User Story 2 - Waiting, then in, without reloading (Priority: P1)

While Lan waits, the page checks every 10 seconds. When Tiến approves, the house appears with "Bạn đã vào Nhà trọ
Q7"; if he refuses, a line stays: "Tiến không duyệt yêu cầu vào Nhà trọ Q7 của bạn."

**Why this priority**: being let in is the first impression of the house; a request that vanishes looks like a bug.

**Independent Test**: ask to join, approve from another account, and see the house appear within about 10 seconds
with the message; refuse instead, and see the line on a reload and on another device until it is dismissed.

**Acceptance Scenarios**:

1. **Given** Lan's request waits and the page is open and in front, **When** 10 seconds pass, **Then** the page asks
   about her requests again (one check for all of them, never two at once); in the background it does not ask, and
   it asks once at once when the page is in front again; with no request waiting it stops.
2. **Given** Tiến approves, **When** the next check answers, **Then** the house appears in her list and a message says
   "Bạn đã vào Nhà trọ Q7" with a way to open it.
3. **Given** Tiến refuses, **When** the next check answers, **Then** the waiting card is replaced by "Tiến không duyệt
   yêu cầu vào Nhà trọ Q7 của bạn." with "Đã hiểu"; it stays after a reload and on her other devices until she presses
   "Đã hiểu".
4. **Given** the house is deleted while she waits, **Then** the card is replaced by "Nhà trọ Q7 không còn nữa, yêu cầu
   của bạn đã dừng." with "Đã hiểu".
5. **Given** a refusal line, **When** Lan asks the same house again with any valid code and the request is accepted
   as waiting, **Then** the line goes.
6. **Given** Lan cancels her own request, **Then** nothing about it stays, as today.

---

### User Story 3 - No second house by mistake (Priority: P2)

Lan signed up from Tiến's link. Her start page shows the invite and the request, not "Chưa ai tạo nhà?", both before
she sends the request and while it waits. If the request is refused or cancelled, creating a house is offered again.

**Why this priority**: an empty second house confuses the person and the owner, but it does not lose money.

**Independent Test**: sign up from an invite link and check the create form is not offered before or after sending;
refuse the request and check the form is back.

**Acceptance Scenarios**:

1. **Given** Lan has no house and arrived with a valid invite link (signed up or signed in from it), **When** the page
   shows, before or after she sends, **Then** the create form is not shown; a small "Tạo nhà khác" link opens it if
   she really wants her own.
2. **Given** the link's code is wrong or expired, **Then** the page is as today, with both ways to start.
3. **Given** her request is refused or cancelled, or its house deleted, and she has no house and no other request
   waiting, **Then** both ways to start are offered again, even if the link's code is still valid, with the outcome
   line above them while it stays.
4. **Given** a person with no house, no request and no invite link, **Then** the start page is as today.

### Edge Cases

- The owner renames the house or changes their name while Lan waits: the card shows the names at each check. A
  refusal line keeps the names as they were when it happened.
- The owner replaces the code after Lan asked: her request still waits and still shows the house.
- Two waiting requests to two houses: each card names its house; the one check covers both; each outcome is said
  once.
- Approval, refusal and cancel happening at the same moment: exactly one outcome stands; a "Đã hiểu" pressed on a line
  that has changed since does nothing to the new state.
- A refusal line goes by itself 30 days after the refusal.
- Names are shown as text, never as markup; long names wrap at 320 px.
- Offline or a sleeping server during a check: nothing on screen changes; a check that has not answered within 20
  seconds is given up so the next one can start; a "too many requests" answer is respected for the time it gives; a
  session that ended sends the person to sign in, as everywhere else.
- Lan cancels on her phone while the laptop waits: the laptop's next check says the request was cancelled, and the
  card goes without a message.

## Requirements *(mandatory)*

### Functional Requirements

**Preview**

- **FR-001**: A signed-in person who enters a valid invite code MUST see the house's current name and the owner's
  current display name. That is all the house discloses (no members, amounts or size); the answer may also say that
  the person is already in it (FR-005). Seeing it grants no access to the house. Signed out, nothing is previewed;
  the sign-in page is as today.
- **FR-002**: A valid code intentionally reveals that it is valid and those two names. Wrong, expired and replaced
  codes MUST get the same answer as each other (status, body and headers), identical to today's answer to a join
  request (rule J1), and the work done for them MUST NOT depend on whether a house exists, so their timing gives
  nothing away either.
- **FR-003**: Previews MUST share the code-guessing limits of rule J2 with requests to join: five wrong codes a minute
  per account and twenty per address, counted together across both, and a burst at the same moment MUST NOT get
  past them. Once a J2 limit is reached, both previews and requests are refused for the rest of that minute with the
  time to wait, and the page does not retry by itself before then. Correct codes are not counted as guesses.
  Separately, previews in all are limited to 30 a minute per account (across sessions); past that, further previews
  are refused with the time to wait, while joining is not blocked unless J2 is reached.
- **FR-004**: The preview MUST show on the page of an invite link and on the join form once a complete code is typed;
  an answer for a code that is no longer in the field MUST be dropped; sending MUST check the code again.
- **FR-005**: A preview of a house the person is already in MUST say so and offer to open it.

**Waiting and outcomes**

- **FR-006**: Each waiting request MUST show the house's name and the owner's name ("Bạn đang xin vào {house} của
  {owner}") with the date it was sent.
- **FR-007**: While at least one request waits and the page is in front, the app MUST check every 10 seconds, one
  check at a time for all requests, asking only for the person's requests and their outcomes (not the house list
  and its amounts). Each check MUST tell apart, for each request: still waiting, approved, refused, cancelled,
  house deleted. In the background it MUST NOT check; back in front it MUST check once at once. With nothing waiting
  it MUST stop. A check unanswered after 20 seconds is given up. This replaces today's 30-second check for waiting
  requests only, and the documented 30-second rule says so.
- **FR-008**: When a check finds a request approved, the house list MUST be loaded once, the house MUST appear, and
  the person MUST be told "Bạn đã vào {house}" with a way to open it. Any visit to the page, even with nothing
  waiting, MUST show the person's outcomes that still stand.
- **FR-009**: When a request is refused, or its house is deleted, the person MUST keep an outcome: which house, which
  owner (names as they were then), what happened, and when. Only that account can read or dismiss it; it grants no
  access; it survives the house's deletion; it is created in the same step that ends the request.
- **FR-010**: An outcome MUST be shown as one line ("{owner} không duyệt yêu cầu vào {house} của bạn." or "{house}
  không còn nữa, yêu cầu của bạn đã dừng.") with "Đã hiểu", and MUST go when dismissed, when the person's new request
  to the same house is accepted as waiting, or 30 days after it happened.
- **FR-011**: Cancelling one's own request MUST leave nothing behind, as today.

**Start page**

- **FR-012**: A person with no house who arrived with a valid invite link and has not yet had a request to that house
  refused or cancelled, or who has a request waiting, MUST NOT see the form to create a house; a "Tạo nhà khác" link
  MUST open it at any time. A refusal, a cancellation or a deleted house ends that invite: with no house and nothing
  waiting, both ways to start are offered again even if the code is still valid. Otherwise the start page is as
  today.

**Rules, access, boundaries**

- **FR-013**: Rule D4 of `docs/ACCOUNTS.md` MUST say that a signed-in person holding a valid code, or waiting, may
  see the house's name and its owner's display name, and that a refused person keeps the outcome line; rule J2 MUST
  say previews count. This is an exception to D4 only: rule A5 (what someone outside a house gets from its pages) is
  unchanged, and the server still decides it per signed-in account (constitution II). Where codes are shared (the invite card on Thành viên), a hint MUST say that whoever has the
  code sees the house's name and the owner's name.
- **FR-014**: Screen readers MUST hear the preview once per code, and each outcome (approved, refused, house gone)
  once when it happens, never on every check; the preview and code errors MUST be tied to the code field; each
  waiting card's actions MUST name their house; the focus MUST stay where it is unless the focused element itself
  disappears, in which case it moves to the message that replaced it, or to the nearest remaining control. Every new word in Vietnamese and English; 44 px controls with a visible focus.
- **FR-015**: Spec 012 PR-L owns the house rows and the summaries it adds to the house list. This spec changes the
  waiting cards, the outcome lines, the join form, the start page and the invite hint. Files both touch (the
  households API module and its schemas, the frontend types, the translations, the house list styles) MUST be
  changed so that PR-L's summaries and layout stay as they are, waiting cards and outcomes never carry amounts, and
  the tests of both pass together after the second one merges.

### Key Entities

- **Invite preview**: the answer to a valid code for a signed-in person: the house's name and the owner's display
  name at that moment, and whether the person is already in it. The server does not store it; the page keeps it only
  while that code stays in the field.
- **Join request**: a person asking to join a house; waiting until the owner approves or refuses, the person cancels,
  or the house is deleted. Now names its house and owner to the person who asked.
- **Request outcome**: what remains for the person after a refusal or a deleted house: the house's and owner's
  names as they were, what happened and when. Belongs to that account only; removed when dismissed, on a new
  waiting request to the same house, or after 30 days.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every signed-in person with a valid code sees which house and whose house it is before sending the
  request.
- **SC-002**: With the page open in front and each check answered within one second, an approval shows on the
  waiting person's page within 15 seconds without a reload. (A server waking from sleep adds its own wait, already
  explained by the slow-server notice of spec 011.)
- **SC-003**: A refused person sees the outcome on their next visit, on any device, until they dismiss it, ask that
  house again, or 30 days pass.
- **SC-004**: A person who arrived from a valid invite link, has no house, and whose request to that house has not
  ended, never sees the create form unless they open it with "Tạo nhà khác".
- **SC-005**: In tests, wrong, expired and replaced codes get identical answers, and the J2 numbers hold for previews
  and requests together, at the same moment and across both.

## Assumptions

- Showing the house's name and the owner's display name to a signed-in person who holds a valid code is acceptable:
  codes are shared on purpose (by the owner or a member), expire in 7 days, and guessing is limited; the invite hint
  says so. Members, amounts and size stay hidden. Signed-out visitors see nothing new, so the constitution's access
  rule is unchanged.
- 10 seconds is for waiting people only, on the page that shows their requests; the rest of the app keeps 30 seconds.
- The outcome keeps no reason; owners do not give one today.
- The demo on 12/11 does not depend on this spec; it ships when reviewed, like the rest of round 2.
