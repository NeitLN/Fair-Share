# Feature Specification: Pay by VietQR

**Feature Branch**: `spec/016-vietqr`

**Created**: 2026-11-09

**Status**: Ready for planning (after review rounds 1 to 3)

**Input**: Plan item G3-02 (docs/review/2026-11-08-ke-hoach-cong-viec.md, round 3): "VietQR. The profile gains a bank, an account number and the account holder's name, seen only by housemates. On a suggested transfer, the person who owes gets 'Mở mã QR', a VietQR code made in the browser (no outside service), for the amount owed at that moment, with a short transfer message naming the house. The app never moves money: it only shows the code for the person to scan in their banking app, and they still press 'Tôi đã chuyển'. PROJECT_SPEC §3.3 says no bank account or payment link of any kind, so the scope change must be stated. Personal data: who can see it, how it is removed, and where only part of the account number shows."

## Why

Today a person who owes Minh 120.000đ reads the amount in Fair-Share, asks Minh in the group chat for his account number, types it into their banking app, types the amount, and comes back to press "Tôi đã chuyển". Every step is a chance to send the wrong amount to the wrong number. Almost every Vietnamese banking app scans a VietQR code, which carries the bank, the account number, the amount and a message. If Minh has saved his account once, the person who owes him scans one code and the amount is already right.

## Scope change (approved)

PROJECT_SPEC §3.3 puts "payments of any kind" out of scope, and UX-02 says the reminder message has "no bank or payment data". This feature changes the first, not the second. **Approved by the project owner (Võ Việt Tiến) on 09/11/2026**, with this spec.

- **What changes:** a person may save one bank account to receive money. A housemate who owes them right now can see it as a VietQR code and as text, to pay outside the app.
- **What does not change:** Fair-Share still never moves, holds or requests money, never talks to a bank or a payment service, and never records a payment by itself. Opening or scanning a code records nothing; the person still presses "Tôi đã chuyển" and the receiver still confirms (ACCOUNTS.md S2, S3). The reminder message for the group chat stays without bank data (UX-02).
- **Documents updated with the feature:** PROJECT_SPEC §3.3 (an "approved extension" note like the 07/11 photo note), the constitution's Scope, ACCOUNTS.md (a rule for receiving accounts, in the style of P3 and P4), DESIGN.md §6.2 and §6.10, and the API table in ARCHITECTURE.md.
- **Release prerequisites:** spec 014 (notices) and spec 010 (profile page), both live. This feature is not needed for the demo; it ships only if every check passes.

## The code (interoperability contract)

The code is a NAPAS VietQR **account transfer** payload, built in the browser from data the Fair-Share API returned. This version implements NAPAS "QR Format T&C", version 1.0, September 2021, in particular §§5.1, 5.2.2, 5.2.3, 5.2.14 to 5.2.15 and 6.1; the implementation PR records the exact source.

- `00` = `01`. Point of initiation `01`: `11` means a reusable (static) code, `12` a transaction-specific (dynamic) one. Fair-Share chooses `12` for its code with an amount and `11` for its code without; neither prevents replay or proves a payment.
- `38` (merchant account information): `00` = `A000000727`, `01` = beneficiary template with `00` = the bank's six-digit BIN and `01` = the account number (digits, leading zeros kept), `02` = `QRIBFTTA` (transfer to an account; cards are not supported).
- `53` = `704`, `58` = `VN`; `54` = the amount as plain decimal digits in whole đồng, only in a code with an amount (omitted entirely otherwise, never `0`).
- `62` / `08` = the transfer message (FR-014).
- `63` = CRC-16/CCITT-FALSE (polynomial `0x1021`, initial `0xFFFF`) over the payload up to and including `6304`, as four uppercase hexadecimal digits.
- The holder's name is **not** in the payload (no tag `59`): the payer's banking app shows the bank's own record of the name.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Save the account I receive money on (Priority: P1)

Minh opens Hồ sơ của bạn and adds "Tài khoản nhận tiền": he picks his bank from a list, types his account number and the account holder's name as his bank shows it. Before saving he reads who will see it. He can change or remove it at any time.

**Why this priority**: Nothing else works until someone has saved an account, and this is where the privacy promise is made.

**Independent Test**: Save, change and remove an account on the profile page, then check through the API what each kind of account sees (US3).

**Acceptance Scenarios**:

1. **Given** Minh has no account saved, **When** he picks "Vietcombank", types `0123456789` and "Nguyễn Văn Minh" and saves, **Then** the profile shows "Vietcombank · 0123456789 · NGUYEN VAN MINH" with *Sửa* and *Xoá*.
2. **Given** the form is open, **When** Minh reads it, **Then** a line says, before he saves: "Chỉ bạn cùng nhà đang cần trả bạn mới thấy đầy đủ số tài khoản và tên. Những người khác trong nhà thấy ngân hàng và 4 số cuối."
3. **Given** Minh types "0123 456.789", **When** he saves, **Then** it is kept as `0123456789`; letters, fewer than 6 or more than 19 digits are refused under the field with what is wrong.
4. **Given** Minh types "Đỗ Thị  Lan" (accents, `Đ`, a double space), **When** he types, **Then** he sees "DO THI LAN" as what will be shown, before saving.
5. **Given** Minh has an account saved, **When** he presses *Xoá* and confirms, **Then** no later request from anyone returns it (FR-005).

---

### User Story 2 - Scan to pay what I owe (Priority: P1)

Lan owes Minh 120.000đ. Inside the verdict block, beside "Tôi đã chuyển 120.000đ cho Minh", she sees *Mở mã QR*. It asks the server for Minh's details for this payment and opens a code she scans with her banking app: bank, account, 120.000đ and the message are filled in. Under the code are the same details as text, each with *Sao chép*, for someone paying from the same phone. When the money has gone, she presses "Tôi đã chuyển" as before.

**Why this priority**: This is the value of the feature: the right amount to the right account in one scan.

**Independent Test**: With Minh's account saved and Lan owing him, open the code, decode it with an independent decoder and compare with known-answer fixtures; check no request leaves Fair-Share.

**Acceptance Scenarios**:

1. **Given** Lan owes Minh 120.000đ and Minh has an account saved, **When** Lan opens *Mở mã QR*, **Then** she sees the code (amount 120.000đ, message as FR-014) and, as text: "Vietcombank · 0123456789 · NGUYEN VAN MINH (tên Minh tự nhập)", the amount, the message, and "So tên người nhận trong app ngân hàng trước khi xác nhận."
2. **Given** the code is open, **When** Lan scans it with the banking apps in the compatibility record (SC-002), **Then** each shows Minh's account and 120.000đ ready to confirm; whether it shows or keeps the transfer message is recorded under SC-002.
3. **Given** Lan has a waiting notice of 100.000đ to Minh ("Đã báo 100.000đ, còn thiếu 20.000đ", spec 014), **When** she opens the code, **Then** it is for 20.000đ and says "120.000đ cần trả, đã báo 100.000đ, còn 20.000đ chưa báo".
4. **Given** a waiting notice already covers what is owed now (told 100.000đ, owed 80.000đ), **When** she looks, **Then** *Mở mã QR* is not offered, in either mode; the line says what was told is enough or more, as spec 014 does.
5. **Given** Minh answered her notice "Chưa nhận được 100.000đ" and the current suggestion is still 120.000đ, **When** Lan opens *Mở mã QR*, **Then** the panel first says "Minh báo chưa nhận được 100.000đ. Xem lại app ngân hàng trước khi chuyển nữa." and shows a code, in either mode, only after she presses "Vẫn chuyển 120.000đ".
6. **Given** the code with an amount is open, **When** Lan presses *Mã không kèm số tiền*, **Then** the code changes to one without an amount, the panel says "Không kèm số tiền", that she types the amount in her banking app, and that leaving the amount out does not change bank limits; 120.000đ stays as a reference, labelled as such.
7. **Given** Lan has paid, **When** she closes the panel with Escape or *Đóng*, **Then** focus goes back as FR-023 says, and nothing was recorded.
8. **Given** Minh has no account saved, **When** Lan looks at her transfer, **Then** there is no *Mở mã QR*, only "Minh chưa thêm tài khoản nhận tiền", and nothing else changes.

---

### User Story 3 - Only the right people see my account (Priority: P1)

Minh's account number and name are personal. Only a housemate who owes him right now sees them in full, in the code panel, and only in that house and while they are both in it. His other housemates see that he has one, with the bank and the last four digits; nobody outside the house sees anything, not even whether he has one.

**Why this priority**: A leaked account number with a real name is a real harm (scam calls, fake transfer screenshots). The rules must hold on the server.

**Independent Test**: Through the API, as each kind of account, in each house, ask for Minh's details and his hint, and compare the answers (status, body, headers) with the same requests about a member without an account and about ids that do not exist.

**Acceptance Scenarios**:

1. **Given** Lan and Minh are both members of house A and a suggested transfer in house A goes from Lan to Minh, **When** Lan asks house A for Minh's payment details, **Then** she gets them.
2. **Given** An is in house A but owes Minh nothing there right now, **When** An asks, **Then** An gets only the hint (bank and last four digits), no full number, no name, no code.
3. **Given** Lan owes Minh in house A but not in house B, **When** she asks house B, **Then** she gets only the hint there: eligibility never carries across houses.
4. **Given** someone is waiting to join house A, has left or been removed from it, or is only in another house, **When** they ask house A about Minh, **Then** they get the same "house not found" answer as for a house that does not exist, before anything about Minh is looked at.
5. **Given** Minh has left house A (his name stays on old expenses), **When** anyone in house A asks about him, **Then** they get the same "member not found" answer as for an id that never existed, and no hint.
6. **Given** Lan paid and no transfer to Minh is suggested any more, **When** she opens *Mở mã QR* again (if her page still shows it), **Then** the server refuses and the page shows the current state instead of the old details.
7. **Given** the owner of house A owes Minh nothing, **When** the owner asks, **Then** the owner gets only the hint: being owner gives no extra access.

---

### Edge Cases

- **The suggestion is a route, not a direct debt.** With Lan owing An and An owing Minh, netting may suggest Lan → Minh. That is enough for Lan to see Minh's details: she is the one asked to pay him.
- **Making oneself eligible.** A member can create eligibility by recording an expense Minh "paid" for them (even 1đ), read the details, then delete it. The gate keeps casual housemates and outsiders out; it does not stop a determined member. While it exists, the expense may appear in other members' Mới ghi, but that is not an audit trail: deleting it can remove that trace before anyone sees it. This feature accepts that limit, writes it in ACCOUNTS.md with the rule, and adds no audit log or recipient-approval flow.
- **Something changes while the panel is open.** The next foreground refresh checks the panel again (FR-022); if the pair, the amount, the notice or the account changed, or access is gone, the code and every detail under it are removed and replaced by "Số tiền hoặc tài khoản vừa đổi" with a button to load it again. A code is a snapshot, not a reservation. Money already sent with an old code is outside the app: if spec 014 then refuses the notice, the receiver records it with "Ghi khoản trả khác" as today.
- **Large amounts.** NAPAS fast transfers carry less than 500.000.000đ. From 500.000.000đ this version offers no code at all: the panel shows the receiving details as text and says the amount is above what VietQR fast transfers carry. It never splits, rounds or reduces the amount. Banks may have lower limits; the panel does not promise otherwise.
- **Two houses.** One account serves all of Minh's houses; the hint and the details are decided per house.
- **A bank withdrawn or no longer supported.** A saved account whose bank is no longer listed, or no longer marked as taking account transfers, shows "Ngân hàng này không còn trong danh sách VietQR" to Minh; to housemates it is as if he had no account (no hint, no code) until he changes it (FR-016).
- **Clipboard refused.** Each value is also shown as selectable text.
- **Old phone or no camera.** The copyable text works without scanning.
- **Dark theme, 320 px, 200% zoom.** The code keeps a light background and a quiet zone, at least 200 px wide; long names and messages wrap; nothing scrolls sideways.
- **Screenshots.** A screenshot of a code holds the account number; nothing can prevent that and the page does not pretend otherwise.

## Requirements *(mandatory)*

### Functional Requirements

**Saving the account (US1)**

- **FR-001**: A signed-in person MUST be able to save at most one receiving account on their own profile: a bank from the bank list (FR-016), an account number and the holder's name.
- **FR-002**: The account number MUST be stored as a string of 6 to 19 digits, leading zeros kept; spaces, dots and dashes typed with it are removed; anything else is refused with a message under the field. Card numbers, phone numbers and other aliases are not supported.
- **FR-003**: The holder's name MUST be cleaned as follows: Unicode NFD normalisation; combining marks removed; `Đ/đ` mapped to `D/d`; ASCII letters upper-cased; every character outside `[A-Z0-9 ]` removed; repeated spaces collapsed; trimmed. The stored result MUST be 1 to 50 characters; empty or longer results are refused. The person sees the exact cleaned value before saving. The name is display-only: it is what the person typed, not a verified bank record, and it is never put in the code.
- **FR-004**: Only the person themselves MUST be able to save, change or remove their account; nobody, not even a house owner, can do it for them.
- **FR-005**: Removing the account MUST delete it from the live data. Every read taken after the deletion commits returns neither the account nor its hint. A response read just before may still arrive; details already shown to someone, and the database's own backups for their retention period, cannot be recalled (the profile says so in one line). Open panels drop their data when the removal is noticed (FR-022).
- **FR-006**: Real users' account numbers and holder names MUST NOT appear in logs, error messages, URLs, analytics or saved test artifacts. Known-answer fixtures and automated test evidence may hold clearly made-up account data; manual evidence from banking apps hides real details.

**Who sees it (US3)**

- **FR-007**: A request for another person's account or hint MUST name one house and be decided only within that house. Reading, saving, changing and removing the signed-in person's own account are profile operations that need no house.
- **FR-008**: No session gets the usual 401. A signed-in person who is not an approved owner or member of that house (waiting, removed, left, never in it) MUST get the existing "house not found" answer, before the person asked about or any account is looked at.
- **FR-009**: A person asked about who is not a current owner or member of that house (left, removed, never there, an id that does not exist) MUST get the existing "member not found" answer. For the requests in FR-008 and FR-009, the status, body and headers MUST NOT depend on whether an account is saved.
- **FR-010**: Except for a person's own account (FR-012), full details (bank, full number, holder's name) MUST be given only when, in that house and at that moment, both people are current owners or members AND the server's own current suggested transfers include one from the asker to the person asked about. A suggestion the page sent, or one fetched earlier, never counts. Being owner gives no extra access.
- **FR-011**: Any other current member of that house MUST get only the hint: that an account exists, the bank's name and the last four digits of the number. A current member with no account saved gives "no account" to every current member. Lists of members (Thành viên) carry only hints, for everyone, including eligible payers.
- **FR-012**: The person always sees their own full details on their profile.
- **FR-013**: The server MUST decide membership, the suggested pair and amount, the pair's notice (state and amount) and the account in one consistent read, and return together: the details, the amount to put in the code (FR-015) and what the panel must say. The browser builds the code only from that answer.

**The code (US2)**

- **FR-014**: The server MUST build the transfer message from the house's current name and the payer's current member name in that house, read in the same snapshot (FR-013): apply FR-003's character cleaning (without its length rule) to each, remove spaces from each, keep the first 12 characters of the house and the first 8 of the payer, and join `FS` and the non-empty parts with one space (at most 24 ASCII characters). The panel shows and copies exactly this text.
- **FR-015**: After the eligibility of FR-010 and the bank checks of FR-016, these rules apply in order. Let S be the current suggested amount and T the notice's told amount (spec 014). With no notice, Q = S. With a waiting notice, Q = S − T; if Q ≤ 0, neither the opener nor either mode of the code is offered. With a declined notice, Q = S whatever T is, and neither mode is shown until the payer acknowledges the warning for that snapshot ("Vẫn chuyển …"). If Q ≥ 500.000.000đ, no code is offered: the receiving details show as text with the reason (Edge Cases).
- **FR-016**: The bank list MUST be a dated, reviewed dataset bundled with the app: for each bank, the name people know, its six-digit BIN, and whether it takes VietQR account transfers, with the source and the date it was taken. The API and the page use the same version; it changes only by a pull request. The page makes no request for bank data or logos at run time. Only banks marked as taking account transfers can be chosen or used in a code. A saved account whose BIN is missing or unsupported is unavailable to housemates (the same answer as no account, no hint); its owner can still see, change or remove it. The list may be a small, explicitly supported set of banks; covering every bank is not a release requirement.
- **FR-017**: Where FR-015 allows the panel, the page MUST offer *Mở mã QR* beside the debtor's current action inside the verdict block (DESIGN.md §6.2), stacking under it on a narrow screen. Opening it always asks the server again.
- **FR-018**: Under the code, the bank, number, holder's name (marked as self-entered), amount and message MUST show as selectable text, each with *Sao chép*, and the line asking the payer to compare the name in their banking app. In the code without an amount, the panel says "Không kèm số tiền", labels any amount it shows as a reference (not in the code), and says leaving it out does not change bank limits.
- **FR-019**: The page MUST also offer the code without an amount, only by an explicit choice (*Mã không kèm số tiền*), never as an automatic fallback. It inherits every gate of FR-015 (eligibility, covered notice, declined warning, large amount).
- **FR-020**: Opening, scanning or copying MUST record nothing and change no balance or notice; "Tôi đã chuyển" stays the only way to tell the receiver (constitution I). The reminder message stays without bank data (UX-02).
- **FR-021**: Full account details MAY be held only in memory, while the owner's own account section or an allowed payment panel is open. Answers holding them use `Cache-Control: no-store`; they never go into local storage or any offline cache, and their cached entries are removed when that view closes. Closing the panel, signing out, switching account or house, or a refusal from the server drops them; a late answer for a panel already closed is ignored.
- **FR-022**: While the payment panel is open, the existing foreground refresh (every 30 s and when the tab comes back; no new timer) MUST also check its snapshot again: both memberships, the suggested pair and amount, the notice's state and version, and the account's availability and version. On a change or a refusal it removes the code and every detail and copy button, shows the changed or unavailable state, and loading again repeats the authorization. Answers for an earlier panel, session, house or request are ignored.
- **FR-023**: The panel MUST have Vietnamese and English text, explicit loading and error states, labelled controls, 44 × 44 px targets, and work at 320 px and at 200% zoom in light and dark themes. Escape and *Đóng* close it; focus returns to the opener if it is still there, else to the payer's current action for that transfer (including *Báo thêm*), else to the verdict heading.

### Key Entities

- **Receiving account**: belongs to one person. Bank (BIN from the list), account number (digit string), holder's name (cleaned, display-only), when it was last changed. At most one per person; deleted when removed.
- **Bank list**: dated dataset (name, BIN, account-transfer support, source, date), part of the app.
- **Payment details**: what an eligible payer gets for one house at one moment: bank name and BIN, full number, holder's name, the amount for the code, the message, and the state the panel must show (normal, partly told, covered, declined, too large).
- **Account hint**: what other current housemates get: exists or not, bank name, last four digits.

## Clarifications

### Session 2026-11-09

- Q: Who sees the full account details? → A: **B.** Only a housemate who owes the person right now (a suggested transfer to them) sees the full details, in the code panel. Other current housemates see that an account exists, the bank and the last four digits. Anyone outside the house sees nothing. (Options not chosen: A, every housemate sees the full number; C, other housemates see nothing.) Applied in US3, FR-010 and FR-011.
- Review round 1 (09/11): eligibility scoped to one house and live links (FR-007 to FR-011); one consistent read (FR-013); non-enumeration order (FR-008, FR-009); no browser caching (FR-021); declined, covered and partly told notices (FR-015, US2 scenarios 3 to 5); stale codes (FR-022); the code's fields pinned (The code); amount limit at 500.000.000đ; message length and cleaning (FR-014); the name display-only and outside the code (FR-003, FR-018); dated bank list (FR-016); the self-made-eligibility limit stated (Edge Cases); scope approval recorded.
- Review round 2 (09/11): one ordered rule for when a code is offered (FR-015, FR-017, FR-019, US2 scenarios 3 to 6); the open panel rechecked on each refresh, account changes included, and stale details removed (FR-022); own-profile access separated from house rules (FR-007, FR-010, FR-021); deletion worded against snapshots (FR-005); no code from 500.000.000đ (scope cut); exact cleaning and message rules (FR-003, FR-014); test data rule (FR-006); unsupported banks (FR-016); NAPAS version pinned and `11`/`12` explained (The code); focus fallback (FR-023); the Mới ghi claim corrected (Edge Cases); success criteria aligned (SC-001, SC-002, SC-004, SC-006).
- Review round 3 (09/11): no High or Medium finding left. Fixed: the message's maximum length is 24, not 23 (FR-014); US2 scenario 2 and SC-002 agree that a banking app dropping the message is recorded, not a failure. Verdict: ready for planning.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For an allowed transfer with no notice or a waiting one, below 500.000.000đ, one tap opens the code and one more copies a detail when the clipboard works; a declined notice needs one more tap to acknowledge; when the clipboard is refused the value stays selectable. Neither the account nor the amount is typed. (Banking-app steps are outside Fair-Share and not counted.)
- **SC-002**: A compatibility record in the PR lists at least two banking apps (name and version) and, for each, the result of scanning: a code with an amount, without an amount, after a partial notice, with a long house name. Codes with an amount show the right bank, account and Q; codes without an amount show the right bank and account and ask for the amount. Both tested apps MUST pass these bank, account and amount checks. Whether each app shows or keeps the message is recorded; losing the message is a documented limit and does not block release, as long as SC-003 checks the exact FR-014 message in the payload and the panel offers it for copying.
- **SC-003**: Known-answer fixtures: for fixed inputs, the payload string and its CRC equal hand-checked values, and an independent decoder reads back the same fields.
- **SC-004**: In the API tests, among the cases refused for the house (FR-008), every answer equals the answer for a house that does not exist; among the cases refused for the person (FR-009), every answer equals the answer for a member that does not exist; in each group, status, body and data-dependent headers do not depend on whether an account is saved. Housemates who owe nothing get only the hint: 0 leaks.
- **SC-005**: Opening the code sends no request outside Fair-Share (checked in an automated browser test that fails on any other host).
- **SC-006**: During the whole test suite, no account number or holder's name appears in the server log or in error responses; saved test artifacts hold only the made-up fixture data of FR-006.
- **SC-007**: The panel passes the a11y checks (44 px, 320 px, 200% zoom, no sideways scroll, focus on close) in both themes, and the code scans in dark theme.

## Assumptions

- **Storage:** the account number is plain text in the database, which Supabase encrypts at rest; the app does not encrypt it again because it must show it back to payers. It is not a password or a card number.
- **One account per person**, used in all their houses; no per-house choice in this version.
- **No bank checks:** Fair-Share cannot check that the account exists or belongs to the name typed; the payer's banking app shows the bank's record of the name, and the panel asks them to compare.
- **Not in this version:** codes in the reminder message (UX-02 stays), one code for several people, a code for a typed "Chuyển số khác" amount (the no-amount code covers it), recipient-approved disclosure, and any payment status from a bank.
- **Refresh:** the existing foreground refresh schedule is reused; its work grows to recheck an open payment panel (FR-022), with no new timer.
