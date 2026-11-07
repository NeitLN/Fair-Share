# Feature Specification: Profile page

**Feature Branch**: `feat/profile-page`

**Created**: 2026-11-07

**Status**: Draft (reviewed in two rounds, 08/11)

**Input**: User description: "Phần D từ góp ý của chủ dự án ngày 07/11: trang hồ sơ cá nhân (/account, mở từ
menu tài khoản). Gồm: (1) tải ảnh đại diện lên, mặc định vẫn là chữ cái đầu như hiện tại, có thể gỡ ảnh
để về mặc định; ảnh hiện ở mọi nhà mình đang ở, cho mình và bạn cùng nhà; (2) giới tính tuỳ chọn, mặc
định không nêu; (3) đổi tên (tên tài khoản và tên của mình ở mọi nhà, nhà nào đã có người khác trùng
tên thì giữ tên cũ ở nhà đó và báo rõ) và đổi mật khẩu (cần mật khẩu hiện tại, 8–128 ký tự, đổi xong
đăng xuất các phiên khác, giữ phiên đang dùng, sai bị tính chung giới hạn với đăng nhập); (4) trạng thái
vui ngắn (kiểu "đang ăn kiêng 🥗") bạn cùng nhà nhìn thấy, xoá được. Thay cho bản nháp chưa commit
specs/001-account-settings (bản đó chốt không tải ảnh, không giới tính; góp ý 07/11 đổi lại), dùng lại
phần đổi tên và đổi mật khẩu đã tính kỹ ở đó. Đọc docs/ACCOUNTS.md trước. Không đổi email, không xoá
tài khoản."

This spec replaces the uncommitted draft `specs/001-account-settings` (04/11). Its rename and password
stories are kept and tightened; its avatar story (8 colours, 8 drawings, no upload, no gender) is
replaced by the owner's decisions of 07/11: a photo, an optional gender and a status.

**Delivery**: four pull requests, in the order of the stories: PR1 the page with rename and password
(US1, US2), PR2 status (US3), PR3 photo (US4), PR4 gender (US5). Each one is usable on its own.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Change my name everywhere at once (Priority: P1)

A signed-in person opens the account menu, chooses the profile page, types a new name and saves. Their
account's display name changes, and so does their name in every household they belong to, as owner or
as member, so housemates see the new name in balances, expenses and history. If a household already has
someone else with that name (ignoring upper and lower case), their old name is kept in that household
only, and the page says which households kept the old name.

**Why this priority**: Today a person's name in a household can only be changed by the owner, one
household at a time, and the display name chosen at sign-up cannot be changed at all. It also brings the
page itself, which every later story uses.

**Independent Test**: Sign in as someone who is in two households, rename, and check the account and both
households show the new name; repeat with a name another person already has in one household and check
that household keeps the old name and is named in the result.

**Acceptance Scenarios**:

1. **Given** Lan is the owner of house A and a member of house B, and nobody else in either is called
   "Ngọc Lan", **When** she saves "Ngọc Lan", **Then** her account name and her name in A and in B are
   "Ngọc Lan", and the page confirms the change with no household kept back.
2. **Given** house B already has another person (with or without an account) called "ngọc lan",
   **When** Lan saves "Ngọc Lan", **Then** her account name and her name in A become "Ngọc Lan", her
   name in B stays "Lan", and the page names house B as keeping her old name and says why.
3. **Given** Lan is waiting for approval in house C, **When** she saves a new name, **Then** nothing
   about house C changes and house C is not listed in the result; the owner of C sees her new display
   name on the request.
4. **Given** Lan's names everywhere are already "Lan", **When** she saves "LAN", **Then** the change is
   accepted (a person never conflicts with themselves) and she is "LAN" everywhere.
5. **Given** her display name is "Lan" but the owner of house B renamed her there to "Lan B", **When**
   she saves "Lan" again, **Then** her name in B goes back to "Lan" under the same conflict rule.
6. **Given** any household, **When** Lan types an empty name, only spaces, or more than 40 characters,
   **Then** the page refuses to save, says what is wrong next to the field, and nothing changes.

---

### User Story 2 - Change my password (Priority: P2)

A signed-in person enters their current password and a new one. After the change, every other sign-in
of the account (another browser or phone) is ended; the sign-in they used stays.

**Why this priority**: There is no password reset (ACCOUNTS.md, Limits we accept), so changing the
password while signed in is the only way to replace a weak or shared password, and the only way to end a
sign-in left open elsewhere.

**Independent Test**: Sign in from two browsers, change the password in one, and check the first stays
signed in, the second is signed out at its next action, the old password no longer signs in and the new
one does.

**Acceptance Scenarios**:

1. **Given** Minh is signed in on his phone and on a laptop, **When** he changes his password on the
   phone with the right current password and a new password of 8 to 128 characters, **Then** the phone
   stays signed in, the laptop is signed out at its next action, the old password is refused at sign-in
   and the new one works.
2. **Given** Minh types a wrong current password, **When** he saves, **Then** nothing changes, he is told
   the current password is wrong, he stays signed in on this device, and the attempt counts toward the
   same limits as wrong passwords at sign-in.
3. **Given** the sign-in limit for Minh's email or address is reached (by wrong passwords at sign-in,
   here, or both), **When** he tries again, **Then** he is told to wait and for how many seconds, exactly
   as at sign-in, and he stays signed in on this device.
4. **Given** a new password shorter than 8 or longer than 128 characters, **When** he saves, **Then** the
   page refuses it, says the allowed length, and nothing changes; the attempt does not count as a wrong
   password.
5. **Given** someone signs in with Minh's old password at the very moment he changes it, **When** both
   finish, **Then** that sign-in either ends with the other sessions or is refused; it never survives the
   change.

---

### User Story 3 - Show a short status to my housemates (Priority: P3)

A signed-in person writes a short, light status such as "đang ăn kiêng 🥗". Their housemates see it under
their name in the household's member list (Thành viên). They can change or clear it at any time.

**Why this priority**: It makes the app feel like a shared home rather than a ledger, as the owner asked,
with no new data that needs protecting beyond a line of text.

**Independent Test**: Set a status, open each household the account is in as a housemate and check the
status shows in the member list; clear it and check it is gone everywhere.

**Acceptance Scenarios**:

1. **Given** Duy has no status, **When** he saves "đang ăn kiêng 🥗", **Then** in every household he
   belongs to, his housemates see it under his name on Thành viên after they reload or open the
   household again.
2. **Given** Duy has a status, **When** he clears it and saves, **Then** no status shows for him anywhere.
3. **Given** Duy types more than 60 characters or a line break, **When** he saves, **Then** the page
   refuses it, says the limit, and his old status stays.
4. **Given** a status with emoji, accents, something that looks like a link or like markup, **When**
   housemates see it, **Then** it shows as plain text: nothing is a link, nothing is formatted.

---

### User Story 4 - Put my photo on my avatar (Priority: P4)

A signed-in person picks a photo, sees how it will look in the round avatar, and saves. From then on
their avatar shows the photo wherever they appear as a person in each household they belong to, for them
and for their housemates. They can remove the photo at any time; their avatar then goes back to today's
colour and initial.

**Why this priority**: It is the owner's most visible request, but it is the only part that stores
pictures, so it comes after the parts that carry no new risk, with strict limits on size, access and
cost.

**Independent Test**: Sign in as someone in two households, upload a photo, open both households as a
housemate and check the person's avatars show the photo; remove it and check the initial is back.

**Acceptance Scenarios**:

1. **Given** Lan has no photo, **When** she opens the profile page, **Then** her preview shows the
   initial of her display name and a way to add a photo.
2. **Given** Lan picks a photo, **When** she looks at the preview, **Then** she sees it exactly as it
   will be saved (a square from the centre, upright) before anything is saved, and can cancel.
3. **Given** Lan saves a photo, **When** Minh (house A) or Duy (house B) reloads or opens that household,
   **Then** her avatars there show the photo at every size.
4. **Given** the photos are slow or fail to arrive, **When** a housemate opens the household, **Then**
   balances, expenses and buttons are usable at once and her avatar shows the initial until the photo
   arrives.
5. **Given** Lan has a photo, **When** she removes it, **Then** her avatar goes back to the colour and
   initial each household gives her today.
6. **Given** Lan picks a file that is not a supported image, **When** she tries to use it, **Then** she is
   told which kinds of picture work, and her avatar does not change.
7. **Given** someone who shares no household with Lan, or is only waiting for approval in hers, **When**
   they try to get her photo, **Then** they cannot.

---

### User Story 5 - Say my gender if I want to (Priority: P5)

A signed-in person may choose a gender on the profile page: Nam, Nữ, Khác, or Không nêu (not stated). Not
stated is the default and nobody is ever asked to choose. Before saving they see what it is for, who sees
it, that it is optional, how long it is kept and that choosing Không nêu deletes it. A stated gender shows
as a small label in their row on Thành viên.

**Why this priority**: The owner asked for it as optional information; it changes nothing in how the app
works, and it is personal data, so it comes last and stays minimal.

**Independent Test**: Choose Nữ, check housemates see the label in the member list; choose Không nêu and
check nothing about gender shows and nothing is kept.

**Acceptance Scenarios**:

1. **Given** an account that never chose, **When** its owner opens the profile page, **Then** gender is
   Không nêu, and nothing about gender shows to housemates.
2. **Given** Lan reads the notice and chooses Nữ, **When** she saves, **Then** her housemates see Nữ in
   her row on Thành viên.
3. **Given** Lan chooses Không nêu and saves, **When** housemates look, **Then** nothing about gender
   shows, and her earlier choice is no longer kept.
4. **Given** sign-up, joining a household or any other step, **When** a person goes through it, **Then**
   they are never asked for a gender.

---

### Edge Cases

- A rename races another person taking the same name in a household at the same moment: exactly one of
  them gets it there; the other keeps their old name in that household and is told so.
- A rename races the owner renaming the same person, or removing them, in one household: the result is
  one of the two orders, never a half-applied rename.
- The account belongs to no household: the rename changes only the display name and says so; the profile
  page still shows the person their own photo and status.
- Every household conflicts: the display name still changes, and every household is listed as keeping
  the old name.
- A name typed with combining accents is the same name as one typed with precomposed letters ("Tiến");
  control characters and line breaks are refused, as for any name (ACCOUNTS.md A1).
- The owner later renames the person in one household: still the owner's right; the next rename from the
  profile page overwrites it again under the conflict rule.
- A name from before accounts that matches the new name counts as "someone else".
- The session expires or is ended elsewhere while the page is open: saving asks the person to sign in
  again and nothing changes.
- A person is removed from, or leaves, a household between opening the page and saving: that household is
  simply not changed.
- A password change is sent twice (double tap): the second either succeeds with no further effect or
  fails as a wrong current password, and never signs out the sign-in that sent it.
- Names from before accounts (no account) have no photo, status or gender; they keep today's avatar.
- A person who leaves household A, or whose access to it is taken away, keeps their name in A's history,
  but A no longer shows their photo, status or gender, even to someone who still shares household B with
  them (who sees them in B).
- An account that later takes over an old name from before accounts never inherits another account's
  photo, status or gender.
- Someone waiting for approval: the owner sees their display name on the request, as today, never their
  photo, status or gender, even if they already share another household.
- A housemate already saw a photo or status before the person left or changed it: the app stops serving
  it, but cannot recall what was already on someone's screen.
- A photo turned sideways by the phone camera is saved upright; the preview and the saved picture agree.
- An animated image is saved as a still picture of its first frame.
- A phone photo format the browser cannot open (for example HEIC on some browsers): the person is told to
  pick a JPEG, PNG or WebP picture instead.
- A failed or refused upload leaves the previous photo, or none, exactly as it was.
- Photo storage reaches its overall ceiling: new photos are refused with a plain message; expenses,
  balances and repayments keep working.
- A status made only of spaces counts as no status; a status about a date ("về quê tới CN") stays until
  its author changes it.
- Two members of the same household change their photos at once: each sees both new photos after
  reloading.

## Requirements *(mandatory)*

### Functional Requirements

**Page and access**

- **FR-001**: The account menu MUST offer a link to a profile page at `/account`.
- **FR-002**: The page MUST be reachable only when signed in; a signed-out visitor is sent to sign in
  first.
- **FR-003**: The page MUST show the account's email as read-only and offer no way to change the email or
  delete the account.
- **FR-004**: Each part (name, password, status, photo, gender) MUST save on its own, so an error in one
  never loses what was typed in another.

**Name**

- **FR-005**: A person MUST be able to change their display name to 1 to 40 characters after trimming,
  cleaned the same way as a member name (ACCOUNTS.md A1).
- **FR-006**: Saving a name MUST set the display name and the person's own name in every household where
  they are owner or member, except where FR-007 applies; saving the same display name again brings
  household names back in line under the same rule.
- **FR-007**: In a household where someone else's name already equals the new name ignoring case, the
  person's name there MUST stay as it was; this is an expected outcome, not a failure.
- **FR-008**: The result MUST list each household that kept the old name, with the household's name and
  the name kept, and say why; when none was kept it MUST say the name changed everywhere.
- **FR-009**: Households where the person is still waiting for approval MUST NOT change.
- **FR-010**: The display name, every household rename and the result MUST take effect together; any
  failure other than an expected name conflict MUST leave everything as it was.
- **FR-011**: A person MUST be able to rename only their own name this way; the owner's right to rename
  names in their household (ACCOUNTS.md, Roles and rights) is unchanged, and member ids, expenses and
  repayments are untouched.

**Password**

- **FR-012**: Changing the password MUST require the current password and a new password of 8 to 128
  characters.
- **FR-013**: A wrong current password MUST change nothing and MUST NOT sign the person out; it MUST be
  answered differently from an ended session.
- **FR-014**: Wrong current passwords MUST count in the same per-email and per-address limits as wrong
  passwords at sign-in (ACCOUNTS.md A2: 5 per email, 20 per address, the same time windows), counted
  before the password is checked; when a limit is reached, the page MUST say how many seconds to wait,
  as sign-in does.
- **FR-015**: After a successful change, every other session of the account MUST end and the session that
  made the change MUST stay valid; a sign-in that checked the old password MUST NOT produce a session
  that outlives the change.
- **FR-016**: The new password MUST be stored the same way as at registration (ACCOUNTS.md A4), and
  neither password may ever be logged.

**Status**

- **FR-017**: A person MUST be able to set a status of 1 to 60 characters (counted after cleaning, each
  emoji or accented letter as written counting once) on one line, cleaned like a name with direction
  control characters removed, or clear it.
- **FR-018**: The status MUST show as plain text, never as a link, markup or embedded content, under the
  person's name in the member list (Thành viên) of every household they belong to, and on their own
  profile page.
- **FR-019**: The status MUST stay until the person changes or clears it.

**Photo**

- **FR-020**: A person MUST be able to choose a JPEG, PNG or WebP picture (and HEIC where the browser can
  open it); the page turns it upright, takes a square from the centre, and shows that preview before
  saving.
- **FR-021**: The server MUST accept only a small square picture (at most 512 × 512 pixels, one frame,
  within the app's existing request size limit), check that it really is one of the accepted kinds, and
  keep a clean copy of its own: 256 × 256, a still JPEG of at most 32 KiB, with no camera or location
  data. Any other content, including SVG, MUST be refused.
- **FR-022**: Each account MUST have at most one stored photo; a new photo replaces the old one and a
  removed photo is deleted, with no earlier versions kept.
- **FR-023**: Photo uploads MUST be limited to 10 per hour per account and 30 per hour per address, and
  all stored photos together MUST stay under 50 MB (52 428 800 bytes); past that, new photos are refused
  with a plain message while every other part of the app keeps working.
- **FR-024**: The photo MUST appear on every avatar that stands for that person in the households they
  belong to, at every size, keeping the avatar's current ring, shadow and accessibility behaviour; while
  photos are loading or if they fail, the avatar shows the initial and nothing else waits for photos.
- **FR-025**: A person MUST be able to remove their photo; household avatars then use the colour and
  initial each household gives them today, and the profile page preview shows the initial of the display
  name.
- **FR-026**: A photo MUST only reach the person themselves and people who currently share a household
  with them, through signed-in requests checked on every request; no address that works without signing
  in may ever lead to a photo.

**Gender**

- **FR-027**: A person MAY choose one of Nam, Nữ, Khác or Không nêu; accounts that never chose MUST be
  Không nêu.
- **FR-028**: The app MUST NOT require choosing a gender at any step.
- **FR-029**: Before saving a gender, the page MUST say: it is for sharing your gender with your
  housemates; current and future housemates see it; it is optional; it is kept until you change or clear
  it; choosing Không nêu deletes it. The choice and which notice was shown MUST be kept together, and
  choosing Không nêu MUST delete both.
- **FR-030**: A stated gender MUST show only as a small label in the person's row on Thành viên and on
  their own profile page; Không nêu shows nothing.

**Visibility of profile information**

- **FR-031**: Photo, status and gender MUST be visible only to the person and to people who currently
  share a household with them, and only in that shared household; never to people waiting for approval,
  to people in a household the person has left, or to anyone signed out. Household responses MUST NOT
  carry anyone's email or anything about passwords.
- **FR-032**: After a person saves a change, their own pages MUST show it at once; housemates MUST see it
  after reloading or opening the household again. No new periodic refresh is added.

**For every part**

- **FR-033**: Every rule about access, limits, validation and storage above MUST be enforced by the
  server; the page only makes it easier to use (ACCOUNTS.md, Roles and rights).
- **FR-034**: Every new word on screen MUST exist in both English and Vietnamese (DESIGN.md §7.1).
- **FR-035**: The page MUST meet the accessibility checklist (DESIGN.md §8): text contrast at least 4.5:1
  in light and dark, every control at least 44 × 44 px, inputs at 16 px, usable at 360 px and at 200%
  zoom with no sideways scrolling, usable by keyboard with focus returned sensibly after saving, errors
  announced.
- **FR-036**: Errors about a field MUST show next to it and keep what was typed (except passwords);
  errors about the connection, a limit or storage MUST show at the top of that part. No technical
  details are ever shown.
- **FR-037**: The same change that brings each part MUST update ACCOUNTS.md (new rules, new rows in the
  table of rights, and in "Limits we accept": no review of photos or statuses), DESIGN.md (the profile
  page, the photo avatar, the status and gender label in member rows) and ARCHITECTURE.md; the photo part
  MUST also record in PROJECT_SPEC.md §3.3 and the constitution's Scope that profile photos, with their
  narrow server-side check of small pictures, are an approved extension, while receipts and other images
  stay out of scope.

### Key Entities

- **Account**: email (read-only here), display name, password, status (optional), gender (Không nêu by
  default, with the notice shown when it was chosen), photo version (or none).
- **Photo**: at most one small square picture per account; replaced or removed by its owner only.
- **Name in a household**: the account's linked name in one household; renamed by FR-006 unless FR-007
  applies.
- **Session**: one sign-in; all but the current one end on a password change.
- **Rename result**: the households that kept the old name, each with its name and the kept name.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In a scripted run on a 360 px screen with the server already awake, changing the name, the
  status, the gender or the password each takes under one minute from the account menu (choosing a file
  from the phone not counted).
- **SC-002**: The next time a housemate reloads or opens a household, 100% of the places listed in the
  plan show the saved value: the photo on every avatar of that person, the new name everywhere it
  appears (except in a household listed as keeping the old name, FR-007), and the status in the member
  list (FR-018).
- **SC-003**: Balances, expenses and buttons of a household page are usable while photos are delayed or
  fail. A household of eight members who all have photos needs at most one extra request and at most
  360 KiB of response for photos on a first visit, and opening it again in the same session downloads no
  photo unless a member or a photo changed.
- **SC-004**: After a rename, in 100% of the households the person belongs to, their name is either the
  new one or listed in the result as kept; never silently unchanged.
- **SC-005**: After a password change, 100% of the account's other sessions are refused at their next
  action, including a sign-in made with the old password during the change, and the session used stays.
- **SC-006**: Wrong current passwords and wrong sign-in passwords together reach the wait message at
  exactly the same counts as sign-in alone, per email and per address.
- **SC-007**: In an access matrix covering: the person with no household, a current housemate, a
  stranger, someone waiting for approval, a removed viewer, a person who left one household but shares
  another, and a switch to another account in the same browser, nobody sees a photo, status or gender
  they are not allowed to see (0 failures).
- **SC-008**: Every new control passes the existing automated contrast and 44 px checks in both themes
  and both languages, and the page has no sideways scrolling at 360 px.

## Assumptions

- Profile photos extend the agreed scope ("receipts and images" are out of scope in PROJECT_SPEC.md §3.3);
  the project owner approved them in the feedback of 07/11. The server's work on a picture is limited to
  checking and re-saving one small square; receipts and other images stay out of scope.
- The project costs nothing to run, so photos are small and kept with the app's own data; the limits in
  FR-021 to FR-023 keep all photos together well inside the free database.
- There is no review of photos or statuses. The owner can take a member's access away; that does not
  delete the account's photo or status, or remove it from other households, and leaving does not erase
  financial history. An abusive owner is out of reach except by leaving. This is a documented limit.
- No legal review is part of this feature; the product rules for gender (optional, notice before saving,
  clearing deletes it, visible only to housemates) are design choices, not a compliance claim.
- The initial shown without a photo uses the same rule as today (the last word of the name), so it
  changes with a rename; the colour per household follows the existing rules (DESIGN.md §3).
- A new password equal to the current one is accepted; it still ends the other sessions.
- Renaming does not change who recorded or paid for anything; history shows the current name, as it does
  today after an owner's rename.
- No notification is sent to housemates about any profile change (PROJECT_SPEC.md §3.3).
- Depends on the accounts feature (sessions, rate limits, linked names) already live.
