# Feature Specification: No double save

**Feature Branch**: `spec/020-no-double-save`

**Created**: 2026-11-12

**Status**: Implemented on `feat/020-no-double-save` (2 review rounds against the code before planning; results at the end of [tasks.md](tasks.md))

**Input**: Package 5 of the 12/11 product review ([docs/review/2026-11-12-bien-ban-danh-gia-lan-2.md](../../docs/review/2026-11-12-bien-ban-danh-gia-lan-2.md), §3.2, §4.1, §5), findings E01 (L8 since 08/11) and A01:

- **E01:** the server saved an expense, but its answer was lost. Pressing Lưu again, as the app suggests, records it twice.
- **A01:** a double tap on "Tạo nhà" creates two houses.

Builds on spec 018 (safe saves: a lost answer says "Chưa nhận được kết quả. Có thể … đã được lưu …", and the house is read again at 0, 10 and 30 s) and spec 019 (notice versions, add-back on delete).

## Scope

**Writes covered**, each called a *save* below. Each can record money with no version to protect it:

| # | Save | Where |
|---|---|---|
| S1 | Add an expense (form, quick add, "Ghi kỳ này" of a recurring item, the recurring tick) | Chi tiêu |
| S2 | Record a repayment by hand, with or without told money ("Ghi khoản trả khác") | Tổng quan, history |
| S3 | The receiver's "Xác nhận đã nhận" on a suggested transfer that has no notice (it records the suggestion as a repayment) | Tổng quan, transfer card |

**Also in:**

- the spec 018 "result unknown" lines for S1–S3;
- a guard against a double tap on "Tạo nhà".

**Out:**

- **Actions on an existing notice** (tell, add, take back, decline, confirm a notice): they carry the notice version, so a repeat is refused, never recorded twice.
- **Editing and deleting:** a repeat writes the same values, or finds nothing.
- **A server-side identity for creating a house:** an extra empty house does no money harm.
- **Existing house-delete gaps:** spec 013.

## Vocabulary

- **Draft**: one thing the person means to record once. For S1 and S2 it is the form's content from when the form starts empty (or prefilled) until it is saved. For S3 it is one card's transfer.
- **Draft identity**: an opaque value the page makes for each draft, sent with every press of that draft.
- **Request fingerprint**: the normalized content of the first request that created a record with that identity. It is stored with the record and compared on a repeat. It is not the record's current values.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Pressing Lưu again never records an expense twice (Priority: P1)

Lan saves "Đi chợ 347.500đ" on weak 4G. The server records it, but the answer never reaches her phone (spec 018: "Chưa nhận được kết quả…"). She presses Lưu again.

Today that makes two rows and doubles the money. After this feature, the second press gets the expense already saved and shows it as saved, once, exactly as if the first answer had arrived. This holds even if, since the first save, its recurring month was taken, a member was removed, or someone edited it.

**Why this priority**: it is the last way money is counted twice without anyone noticing.

**Independent Test**: save an expense, drop the answer at the network layer (the request reaches the server, the response is aborted), press Lưu again. The list has one row, the form resets as after a normal save, and the balances moved by the amount once.

**Acceptance Scenarios**:

1. **Given** a draft whose first save created an expense but whose answer was lost, **When** the same draft is pressed again with the same content, **Then** no new expense is created. The answer is a success carrying the existing expense as it is now, and the page shows it as saved (toast, form reset, list).
2. **Given** the same, **When** the content was changed before pressing again, **Then** nothing is created or changed. The form keeps what was typed and says "Khoản chi này đã được lưu rồi, có thể khác những gì đang nhập. Xem trong danh sách rồi sửa nếu cần." with:
   - a "Xem" link to that expense;
   - a "Ghi thành khoản mới" button that starts a new draft from what is typed and saves it.
3. **Given** a "Ghi kỳ này" draft whose first save recorded the month, **When** it is pressed again, **Then** it gets the recorded expense back as a success, not "this month is already recorded".
4. **Given** the recurring tick was on, **When** the draft is pressed again, **Then** no second recurring item is made, and the existing expense and item come back.
5. **Given** an expense that was saved and then deleted, **When** the same draft is pressed again, **Then** a new expense is recorded. Deleted means gone, and pressing again means the person wants it.
6. **Given** a successful save, **When** the person types the next expense in the emptied form, **Then** it is a new draft, and saving the same values again records a second expense ("Đi chợ" twice in a day is allowed).
7. **Given** quick add fills a form that is waiting after a "result unknown", **Then** the fill does not start a new draft. A save of the filled form is a changed draft and gets scenario 2's answer.

---

### User Story 2 - Pressing again on a hand-recorded repayment never records it twice (Priority: P1)

An records "Bình trả An 50.000đ" by hand, perhaps choosing "Tiền Bình đã báo", and the answer is lost. Pressing "Lưu khoản trả" again must not record 100.000đ, nor take the told money twice.

**Independent Test**: record a repayment by hand (with and without told money), drop the answer, press again. One repayment is in the history, the balances moved once, and the notice was reduced once.

**Acceptance Scenarios**:

1. **Given** a hand-recorded repayment whose first save landed and whose answer was lost, **When** the draft is pressed again with the same content, **Then** the existing repayment comes back as a success. No notice changes again, even though the notice's version or existence changed since.
2. **Given** the same, **When** the content was changed, **Then** nothing is created. The form says "Khoản trả này đã được ghi rồi, có thể khác những gì đang nhập. Xem trong lịch sử rồi xoá nếu cần." with a "Xem" link and "Ghi thành khoản mới".
3. **Given** a repayment taken from told money that was then deleted (spec 019 put the money back into the notice), **When** the same draft is pressed again, **Then** it is recorded again and takes the told money once more. The money had been given back, so this is one recording, not two.

---

### User Story 3 - Confirming a suggested transfer twice records it once (Priority: P1)

Tiến presses "Xác nhận đã nhận 100.000đ" on a suggestion with no notice. The answer is lost, the card comes back, and he presses again before the page has read the house again.

**Acceptance Scenarios**:

1. **Given** a card's first press recorded the repayment but its answer was lost, **When** the card is pressed again, **Then** the same repayment comes back, and the card is stamped once.
2. **Given** a card whose press succeeded, **When** a later suggestion for the same pair appears (new expenses), **Then** pressing it is a new draft and records a new repayment.

---

### User Story 4 - The "result unknown" line says pressing again is safe (Priority: P2)

**Acceptance Scenarios**:

1. **Given** S1 with no answer, **Then** the line is "Chưa nhận được kết quả. Có thể khoản chi đã được lưu; bấm Lưu lại cũng không ghi trùng." (en: "No answer yet. The expense may already be saved; pressing Save again won't save it twice.")
2. **Given** S2 or S3 with no answer, **Then** the line is "Chưa nhận được kết quả. Có thể khoản trả đã được ghi; bấm lại cũng không ghi trùng." The same line serves confirming a notice, which shares it (spec 018 A5): a repeat there is refused by the notice version, never recorded twice, so it is true there too.

---

### User Story 5 - A double tap on "Tạo nhà" makes one house (Priority: P3)

**Acceptance Scenarios**:

1. **Given** a typed house name, **When** "Tạo nhà" is tapped twice before the first answer, **Then** one create request is sent.

---

### Edge Cases

- **Two requests with the same identity at the same moment** (a repeat while the first is still running): exactly one record. The other gets it back, never a "month taken" or "notice changed" refusal caused by its twin.
- **Two tabs, or two people, saving the same values:** two drafts, two records, as today.
- **Refresh:** a page refresh starts a new draft. Keeping a draft across a refresh is package 9.
- **Another account:** identities are per account in a house. One account's repeat never returns another account's record.
- **An owner who edited or deleted someone's expense:** the author's repeat still compares with the first request, not the edited row, so a pure retry still succeeds (scenario 1). After a deletion it records anew (scenario 5).
- **Old pages:** a request without an identity behaves as today.
- **A repeat whose first save left no record** (it was refused, or never arrived): it runs every normal check, like a first save.

## Requirements *(mandatory)*

### Functional Requirements

**Draft identity (page)**

- **FR-001**: Each draft MUST have an identity, kept for every press of that draft. A new identity starts only when:
  - **S1:** the form is shown empty or prefilled (page or house opened, "Ghi kỳ này" opened), after a successful save, after "Huỷ" on an edit, or by "Ghi thành khoản mới".
  - **S2:** the history form is opened, after a successful save, or by "Ghi thành khoản mới".
  - **S3:** a card press succeeds; or the pair's suggestion amount changes after a press that was answered (a refusal, or "not sent"). A card whose last press ended "result unknown" keeps its identity until a read of the house shows that press's repayment, or until the person presses "Ghi thành khoản mới". A new amount alone never starts a new identity then, since the first press may still commit.

  A refusal, a "result unknown", a quick-add fill or a field change does NOT start a new identity.
- **FR-002**: Every press of a covered save MUST send its identity, as a version-4 UUID. A malformed identity is refused (422). A request without one behaves as today.

**Server**

- **FR-003**: For a request with an identity, the server MUST:
  1. check access;
  2. take the house lock;
  3. serialize all requests of the same house, account and identity;
  4. look the identity up, before any other check (splits, members, recurring items and month, notice version, suggestion).
- **FR-004**: If a record of the same house, account and identity exists:
  - **Same fingerprint:** answer success (200) with the record as it is now. Nothing is changed (no notice, no recurring item).
  - **Different fingerprint:** answer 409 `draft_already_saved`, with the record's kind and id in its details. Nothing is changed.
- **FR-005**: If no such record exists, the request runs every check as a first save, and the record stores the identity and the request's fingerprint. A record that was deleted takes its identity with it.
- **FR-006**: The fingerprint is the normalized content of the request as sent:
  - **For S1:** description trimmed, amount, payer, date, split as a member set or a member→share map, category, and recurring as sent (the tick and its varying flag, or the recurring item id for "Ghi kỳ này").
  - **For S2:** payer, receiver, amount, date, and note trimmed (a blank note counts as no note).
  - **For S3:** payer, receiver and amount; the date is left out, so a retry across midnight still matches.
  - **Not compared:** `source` (manual or AI), and the told-money choice with its notice version.
- **FR-007**: Concurrency: a unique-index collision on any other index, during a request with an identity, MUST first look the identity up again and apply FR-004, before answering any other refusal.

**Page**

- **FR-008**: A 200 repeat MUST look like a 201 save: toast, form reset, list, stamped card.
- **FR-009**: A `draft_already_saved` answer MUST keep the form's values and show the US1/US2 scenario 2 line. "Xem" reveals the record (reading the list again if it is not loaded). "Ghi thành khoản mới" starts a new draft and saves. On an S3 card, the answer stamps the card as paid (the repayment exists) with "Xem" to that repayment in the history.
- **FR-010**: The spec 018 "result unknown" lines for S1, and for S2 and S3, MUST become the US4 lines, in Vietnamese and English.
- **FR-011**: "Tạo nhà" MUST ignore a second press while the first is unanswered. The guard runs synchronously at the press, not after a re-render.

### Key Entities

- **Draft identity**: a UUID made by the page, sent with the save. Stored with the expense or repayment it created, unique per (house, author account) while the record exists.
- **Request fingerprint**: stored with the record, compared on a repeat.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For S1, S2 and S3, saving, aborting the response after the server committed, and pressing again records exactly 1 row in 100% of runs. The balances move once, and told money is taken once.
- **SC-002**: Two simultaneous requests with the same identity record exactly 1 row in 100% of runs, in two-connection tests. Neither gets `month_taken` or `notice_changed`. This includes two concurrent recurring-tick saves, which today can deadlock.
- **SC-003**: A repeat of "Ghi kỳ này", or of told money whose notice changed since, succeeds with the first record.
- **SC-004**: A changed draft records nothing new, and "Ghi thành khoản mới" then records exactly one.
- **SC-005**: A double tap on "Tạo nhà" sends 1 request.
- **SC-006**: Existing pytest, Vitest and E2E suites stay green, and requests without an identity keep working.

## Assumptions

- **Migration number:** identity and fingerprint are new nullable columns on expenses and settlements, with a partial unique index (house, author, identity) where identity is set. They come in one new migration whose number is agreed with Minh's spec 013 first: 013 if this lands first, else the next free one.
- **Serializing (FR-003):** done with a lock keyed on house, account and identity, taken after the house lock, so the existing lock order (house first) holds.
- **Existing deadlock:** the deadlock between two concurrent recurring-tick saves (a shared house lock, then a row update of the same house) is fixed in the same change, because SC-002 tests that path.
- **"Ghi thành khoản mới":** a deliberate second recording, offered only after a refusal that names the existing record, so a double recording is always a choice the person sees.
