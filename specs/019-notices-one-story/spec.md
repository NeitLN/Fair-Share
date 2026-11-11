# Feature Specification: Notices tell one story

**Feature Branch**: `spec/019-notices-one-story`

**Created**: 2026-11-12

**Status**: Ready for planning (3 review rounds against the code; last verdict "Ready for planning")

**Input**: Package 3 of the 12/11 product review ([docs/review/2026-11-12-bien-ban-danh-gia-lan-2.md](../../docs/review/2026-11-12-bien-ban-danh-gia-lan-2.md), §3.1, §4.1, §4.2, §5). One screen tells one story about money:

- **C02:** a notice that no longer matches a suggestion must not read as a debt.
- **C03:** deleting a repayment must not lose told money.
- **C07:** the debtor's own row must say what is really missing.
- **C08:** a double press must not raise a false error.
- **C09:** a lost race must say what happened, when that is known.
- **D06/C12:** the transfer block must not repeat itself.
- **C05:** telling more than owed stays refused (team decision of 12/11), but the refusal offers the right amount.

Builds on spec 014 (partial transfer notices) and spec 018 (safe saves, PR #295, merged first).

## Scope

**In:** what each card says, the receiver's answers to a notice that no longer matches, the server check behind them, the add-back when a repayment is deleted, press guards, race lines, and the debtor block's repeats.

**Out:**

- **C10, naming notices in the expense-delete dialog:** notices are not tied to expenses, and the expense page has no balances or notices. The cards of User Story 1 already stop the misleading confirm after an expense is deleted.
- **C06, a hand-recorded repayment above what is owed:** a later package.
- **Leaving a house with a balance:** spec 013 (Minh).
- **Request keys:** package 5.

## Vocabulary

- **Notice**: what a debtor told with "Tôi đã chuyển", "Chuyển số khác" or "Báo thêm" (spec 014). Its status is *sent* (waiting for the receiver) or *declined* (after "Chưa nhận được"). Told money is not recorded money until the receiver confirms it.
- **Suggestion**: a "X cần trả Y <amount>" line from the household's suggested transfers.
  - The app settles each person's net balance across the whole house. It does not track debts between two people.
  - So a suggestion only says who should pay whom right now. Recording more than a suggestion does not create a debt from Y back to X. It changes everyone's net balance, and the suggestions are worked out again.
- **Directed pair**: debtor X and receiver Y, in that direction.
- **Unmatched notice**: a *sent* notice whose directed pair has no suggestion right now.
- **Over-suggestion part**: the part of a notice above its directed pair's suggestion.
  - Example: told 30.000đ when the suggestion is 10.000đ gives an over-suggestion part of 20.000đ.
  - An unmatched notice is entirely over-suggestion.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A notice that no longer matches never reads as a debt (Priority: P1)

Bình told Chi he sent 30.000đ for the gas. Then the gas expense was deleted, and Bình no longer needs to pay Chi.

Today Chi sees a card "Bình cần trả bạn 30.000đ" with a big "Xác nhận đã nhận 30.000đ" button, even under "Cả nhà sạch nợ". Pressing it records 30.000đ without a word.

After this feature:

- **What Chi sees:** "Bình đã báo chuyển 30.000đ cho bạn, nhưng lúc này Bình không cần trả bạn nữa."
- **Chi's main action:** "Không ghi khoản này", which answers it like "Chưa nhận được".
- **Chi's secondary action:** "Vẫn ghi đã nhận". It first says "Lúc này Bình không cần trả bạn; ghi 30.000đ thì số dư cả nhà sẽ tính lại.", and records only after "Ghi".
- **What the server does:** it refuses to record over-suggestion money unless the person saw that warning for the same notice and the same suggestion.

**Why this priority**: a one-press button that records money nobody owes moves everyone's balance without a word, and on a "sạch nợ" screen it contradicts what the page says.

**Independent Test**:

- Make a sent notice, then delete the expense behind it.
- **Every member:** sees no "cần trả" sentence for that pair.
- **Receiver:** "Vẫn ghi đã nhận" records nothing on the first press and shows the warning. "Ghi" records it.
- **Stale press:** pressing "Ghi" after a new expense has changed the suggestion is refused and shows the new state.

**Acceptance Scenarios**:

1. **Given** an unmatched notice from B to C, **When** C opens Tổng quan, **Then** the card says "B đã báo chuyển <amount> cho bạn, nhưng lúc này B không cần trả bạn nữa."
   - When every member's net is 0, the card adds "(cả nhà đã sạch nợ)".
   - No line on the card says that B owes C.
2. **Given** that card, **When** C presses "Không ghi khoản này", **Then** the notice is declined and nothing is recorded. Because the pair has no suggestion, B's block does not say "chưa nhận được". It says "C không ghi <amount> vì lúc này bạn không cần trả C." and offers "Huỷ thông báo". A declined notice on a pair that has a suggestion keeps spec 014's line.
3. **Given** that card, **When** C presses "Vẫn ghi đã nhận", **Then** nothing is recorded yet. The card shows "Lúc này B không cần trả bạn; ghi <amount> thì số dư cả nhà sẽ tính lại." with "Ghi" and "Thôi".
   - "Ghi" records it as told money.
   - "Thôi" goes back.
4. **Given** a sent notice with an over-suggestion part (told 30.000đ, B now needs to pay C 10.000đ), **Then** the card keeps spec 014's line ("B báo đã chuyển 30.000đ · lúc này B cần trả bạn 10.000đ").
   - "Xác nhận đã nhận 30.000đ" first shows "Lúc này B cần trả bạn 10.000đ; ghi 30.000đ là nhiều hơn 20.000đ, số dư cả nhà sẽ tính lại.", then "Ghi" / "Thôi".
   - "Nhận số khác" stays. An amount typed there that is above the suggestion gets the same warning before it is sent; an amount at or under it does not.
5. **Given** the warning is on screen, **When** the notice version or the pair's suggestion changes (another member's write, the next read), **Then** the warning is withdrawn. The card shows the current state, and pressing again starts over.
6. **Given** a "Ghi" sent for a notice version and a suggestion that are no longer current at the server, **Then** the server refuses it ("notice changed" or "suggestion changed", FR-006) and records nothing. User Story 4 then says what changed.
7. **Given** a third member D, **When** D views the house, **Then** D sees "B đã báo chuyển <amount> cho C" as a status line with no action, and no "cần trả" line for B→C.
8. **Given** B, the debtor of an unmatched notice, **Then** B's block says "Bạn đã báo chuyển <amount> cho C; lúc này bạn không cần trả C nữa, C chưa trả lời." and offers "Huỷ thông báo".

---

### User Story 2 - Deleting a repayment gives back what was told (Priority: P1)

Bình told 33.333đ. An recorded 20.000đ by hand and chose "Tiền Bình đã báo", so 13.333đ stays waiting. Then An deletes that 20.000đ repayment.

Today the dialog says "Bình đang có thông báo khác, nên số này không trở lại thông báo", although it is the same notice. The notice stays at 13.333đ, so Bình's block says "Đã báo 13.333đ, còn thiếu 20.000đ" although he told 33.333đ.

After this feature, deleting a repayment that took money from a notice puts exactly that amount back into the pair's notice. The dialog says it in words that are true whatever the screen shows.

**Why this priority**: today the app tells a debtor he still owes money he already sent.

**Independent Test**: tell 33.333đ, record 20.000đ of it by hand, then delete that repayment. The notice is 33.333đ again, and the debtor's block says "Đã báo 33.333đ".

**Acceptance Scenarios**:

1. **Given** a repayment that took 20.000đ from B's notice to A, and the pair now has a sent notice of 13.333đ, **When** it is deleted, **Then** the notice becomes 33.333đ, with a new version. Its note and the person who told it stay.
2. **Given** such a repayment and no notice for the pair, **When** it is deleted, **Then** a sent notice of 20.000đ is created for the pair, as today.
3. **Given** such a repayment and a declined notice of 10.000đ for the pair, **When** it is deleted, **Then** the notice becomes sent again with 30.000đ (the declined amount plus 20.000đ) and a new version; its note and author stay. When the pair's notice is loaded on screen, the dialog names the declined part: "…và 10.000đ A đã báo chưa nhận được cũng sẽ chờ A xác nhận lại." (FR-011). After the deletion the debtor's block shows the 30.000đ as waiting, as for any sent notice.
4. **Given** a repayment that took nothing from a notice, **When** it is deleted, **Then** no notice changes.
5. **Given** any way of deleting a repayment (history "Xoá", the card's "Hoàn tác", the toast's "Hoàn tác"), **Then** the server applies scenarios 1 to 4 the same way.
6. **Given** an add-back that would make the notice exceed 10¹² đồng, **Then** the deletion is refused with the existing amount-limit error, and nothing changes.
7. **Given** the history delete dialog for a repayment that took money from a notice, **Then** it says "Xoá khoản B trả A 20.000đ? 20.000đ B đã báo sẽ trở lại thành tiền đã báo, chờ A xác nhận lại."
   - The words "thông báo khác" are gone.
   - The dialog names a resulting total only when the pair's notice is on screen and loaded.

---

### User Story 3 - The debtor's block says it once, and says it right (Priority: P2)

Bình's suggestion is 33.333đ to An, and he has told 13.333đ. Today:

- **Contradicting lines:** the block says "Đã báo 13.333đ, còn thiếu 20.000đ." and the row under it says "Bạn cần trả An 33.333đ · Đã báo, chờ An xác nhận."
- **Repeats:** with one transfer, the block and the row repeat each other, "Vì sao ra số này?" appears twice in the block, and after a confirm the receiver sees three ways to undo.
- **Small mismatches:**
  - The busy label is "Đang ghi…" although Bình is telling.
  - "An chưa thêm tài khoản nhận tiền." is bold white, like an action.

**Why this priority**: lines that contradict each other make people distrust every number, and the repeats double the first screen on a phone.

**Independent Test**: as a debtor with one suggestion and a partial notice, at 360 px:

- The amounts agree everywhere.
- The block has one "Vì sao ra số này?".
- The busy label says "Đang báo…".
- After the receiver confirms, the receiver has at most two undo controls on screen.

**Acceptance Scenarios**:

1. **Given** a debtor with a partial notice, **Then** the row for that pair says "Đã báo 13.333đ, còn thiếu 20.000đ, chờ An xác nhận", matching the block.
2. **Given** a debtor whose suggestions are exactly one, the one the block is about, **Then** the transfer list does not repeat it as a row. Paid cards, unmatched-notice cards and other members' rows stay.
3. **Given** the debtor's action block, **Then** it contains exactly one "Vì sao ra số này?" link.
4. **Given** a receiver's card stamped "Đã trả" with its "Hoàn tác", **Then** the history row of that same repayment offers no "Xoá" while the card is on the page. When the card goes (undone, deleted, refreshed away, or the page is left), the history "Xoá" is back.
5. **Given** the debtor's "Tôi đã chuyển", "Chuyển số khác", "Báo thêm" or "Huỷ thông báo" is on its way, **Then** its busy label is "Đang báo…". The receiver's actions keep "Đang ghi…".
6. **Given** a receiver without a receiving account, **Then** the line "<name> chưa thêm tài khoản nhận tiền." is regular weight in the block's muted colour.

---

### User Story 4 - Presses and races say what really happened (Priority: P2)

**Double press:** a fast double tap on "Tôi đã chuyển" saves one notice, which is correct, then shows the 409 "Thông báo này vừa thay đổi hoặc đã được trả lời. Số liệu đang tải lại…" for nothing.

**Lost race:** Bình pressed "Huỷ thông báo" while An confirmed. The same 409 text stays and never says what happened.

**Why this priority**: false errors teach people to ignore errors, and a stuck error makes the page look broken.

**Independent Test**:

- **Double press:** double-tap "Tôi đã chuyển". One request goes out and no error shows.
- **Lost race:** take a notice back while the receiver confirms it from another browser. After the reload, the loser sees "An đã xác nhận 20.000đ." and no 409 text.

**Acceptance Scenarios**:

1. **Given** any notice action for a directed pair, **When** another notice action for the same pair is pressed before the first one has ended (including a "result unknown" from spec 018 until its refresh has read the pair again), **Then** the second press sends nothing and shows nothing.
   - The actions covered: send, "Chuyển số khác", "Báo thêm", take back, decline, "Không ghi khoản này", confirm, "Nhận số khác", "Ghi".
   - The guard is one per directed pair, shared by the debtor's and the receiver's controls on that page, including the receiver's confirm and undo on the card.
2. **Given** a notice action refused with "notice changed", **When** the pair has been read again, **Then** the error is replaced by one line. It names what happened only when the new data proves it:

| What the new data shows | Line |
|---|---|
| The notice is now declined | "An đã báo chưa nhận được <amount>." On a pair with no suggestion: the FR-004a line |
| The notice is gone, and a repayment from the debtor to the receiver appeared that took notice money | "An đã xác nhận <amount>." |
| The notice is gone, and nothing else changed for the pair | "Thông báo này đã được huỷ." |
| Anything else (amount changed, several changes) | "Số liệu vừa thay đổi, đã tải lại." |

3. **Given** that line, **Then** it goes away on the next action for that pair, or after 10 seconds.
4. **Given** the read after the refusal fails, **Then** the line is "Số liệu vừa thay đổi; chưa tải lại được." with "Thử lại".

---

### User Story 5 - Telling more than owed offers the right amount (Priority: P3)

Students send round amounts: 135.000đ for 133.333đ. Telling 135.000đ is refused, which the team decided to keep on 12/11, but today the refusal is only a sentence.

After this feature the refusal says "Bạn chỉ cần trả An 133.333đ." and offers "Báo 133.333đ", which fills the exact amount.

**Why this priority**: it turns the first trust-loss moment the panel named into one more press, without changing spec 014's rules.

**Independent Test**: owing 133.333đ, type 135000 in "Chuyển số khác" and press Gửi. The step offers "Báo 133.333đ", which puts 133.333 in the field. Gửi then tells 133.333đ.

**Acceptance Scenarios**:

1. **Given** the debtor's "Chuyển số khác", **When** the amount typed is above `max = min(suggestion, 10¹²)`, **Then** the problem line says "Bạn chỉ cần trả <name> <max>." and offers "Báo <max>". Pressing it fills <max> and keeps the focus in the field.
2. **Given** "Báo thêm", **When** the amount is above `max = min(suggestion − told, 10¹² − told)`, **Then** the line says "Chỉ cần báo thêm <max>." with "Báo thêm <max>".
3. **Given** the cap comes from 10¹² rather than the suggestion, **Then** the line is today's amount-limit message, with no fill button.
4. **Given** max is 0 or less after a refresh (nothing left to tell), **Then** no fill button is offered, and the step says "Bạn đã báo đủ số cần trả."

---

### Edge Cases

- **A notice becomes unmatched while the receiver looks at it:** the card changes on the next read. A press on the old card is guarded by the server check (US1 scenario 6) or refused as today.
- **The suggestion flips direction** (C now needs to pay B): the B→C notice is unmatched. The card never offers to net it against C→B.
- **Paid card of the same pair:** an unmatched notice is shown even while the pair has a stamped "Đã trả" card on the page. It is classified against suggestions only, not against which cards exist.
- **Add-back racing with accept, add, decline, take back or another deletion:** the deletion and every notice change on the same house run one at a time. The result is the same as if they had happened in some order, one after the other, and no told money is counted twice or lost.
- **Loading:** while notices or suggestions have not loaded, no notice card shows actions (as today).

## Requirements *(mandatory)*

### Functional Requirements

**Unmatched notices and over-suggestion parts (US1)**

- **FR-001**: A sent notice MUST be classified against the household's current suggestions for its directed pair, never by which cards exist on the page.
  - **Unmatched:** the pair has no suggestion.
  - **Over-suggestion part:** the amount above the pair's suggestion.
- **FR-002**: An unmatched notice's lines:
  - **Receiver:** "<debtor> đã báo chuyển <amount> cho bạn, nhưng lúc này <debtor> không cần trả bạn nữa." Add "(cả nhà đã sạch nợ)" only when every net is 0.
  - **Debtor:** "Bạn đã báo chuyển <amount> cho <receiver>; lúc này bạn không cần trả <receiver> nữa, <receiver> chưa trả lời." with "Huỷ thông báo".
  - **Other members:** "<debtor> đã báo chuyển <amount> cho <receiver>", with no action.

  No line about that pair may say that the debtor needs to pay the receiver.
- **FR-003**: The receiver's actions on an unmatched notice:
  - **Main:** "Không ghi khoản này", the existing decline.
  - **Secondary:** "Vẫn ghi đã nhận". It records nothing on the first press and shows "Lúc này <debtor> không cần trả bạn; ghi <amount> thì số dư cả nhà sẽ tính lại." with "Ghi" and "Thôi".
- **FR-004**: Recording a notice amount, or a "Nhận số khác" amount, that has an over-suggestion part MUST show a warning first, naming the suggestion and the excess separately: "Lúc này <debtor> cần trả bạn <suggestion>; ghi <amount> là nhiều hơn <excess>, số dư cả nhà sẽ tính lại." No warning line may read as a debt that is not suggested. Amounts at or under the suggestion record as today, without a warning.
- **FR-004a**: A declined notice on a pair with no suggestion MUST NOT say "chưa nhận được" to the debtor. The debtor sees "<receiver> không ghi <amount> vì lúc này bạn không cần trả <receiver>." with "Huỷ thông báo". A declined notice on a suggested pair keeps spec 014's line.
- **FR-005**: A shown warning MUST be withdrawn when the notice version or the pair's suggestion changes.
- **FR-006**: Recording money from a notice (the receiver's confirm, "Nhận số khác", "Ghi") MUST run under the exclusive household lock, as telling already does, and MUST compute the pair's current suggestion there, for every request:
  - **At or under the suggestion:** records as today; no statement is needed.
  - **Above it, with no statement:** refused with 409 `warning_required`, carrying the current suggestion; nothing changes. The client then shows the FR-004 warning.
  - **Above it, with a statement:** the request carries `warned_suggestion` (a whole number of đồng, 0 meaning "no suggestion"), next to the notice version it already sends. If it differs from the current suggestion, the answer is the existing 409 `suggestion_changed` (spec 014 FR-010); a version mismatch stays `notice_changed`. Nothing changes in either case.
  - **Two accepts on different pairs** that together would pass the suggestions cannot both pass: each runs alone under the exclusive lock and sees the other's result.
  - **Out of scope:** a hand-recorded repayment taken from a notice ("Tiền Bình đã báo" in the history form) keeps today's rules. Recording more than owed by hand is C06, a later package.

**Add-back on deletion (US2)**

- **FR-007**: Deleting a repayment that took an amount from a notice (its recorded notice amount) MUST, in the same transaction, put exactly that amount back:
  - **Pair has a sent notice:** add to its amount, with a new version. Note and author stay.
  - **Pair has no notice:** create a sent notice of that amount, as today.
  - **Pair's notice is declined:** set it to sent, with the declined amount plus that amount and a new version; note and author stay. The dialog (FR-011) names the declined part that waits again.
  - **The debtor or the receiver is no longer a member of the house:** no notice is created or changed, as today.
- **FR-008**: The add-back is not capped by the pair's suggestion: it restores money that was told. The resulting amount MUST be at most 10¹²; otherwise the deletion is refused with the existing amount-limit error, and nothing changes.
- **FR-009**: The deletion MUST take the exclusive household lock, then lock the pair's notice row, and do the add-back as one upsert (create, add, or re-send, with a new version).
  - **Accept, send and add** take the house lock too.
  - **Decline and take-back** lock the notice row.

  So no deletion interleaves with any of them, and the house lock is always taken before any row lock.
- **FR-010**: FR-007 MUST apply to every way a repayment is deleted (history "Xoá", the card's or the toast's "Hoàn tác").
- **FR-011**: The history delete dialog for a repayment that took notice money MUST say "<amount> <debtor> đã báo sẽ trở lại thành tiền đã báo, chờ <receiver> xác nhận lại." It MUST NOT say "thông báo khác". A resulting total is shown only when the pair's notice is loaded on screen.
- **FR-012**: This replaces spec 014 FR-011a's rule that an existing notice is left unchanged. docs/ACCOUNTS.md S3 is updated in the same change.

**One story in the debtor's block (US3)**

- **FR-013**: The debtor's row for a pair with a partial notice MUST state the told amount and the amount still missing, matching the block.
- **FR-014**: When the debtor has exactly one suggestion and it is the one the block is about, the transfer list MUST NOT show it again. Paid cards, unmatched-notice cards and other members' rows are unaffected.
- **FR-015**: The debtor's action block MUST contain exactly one "Vì sao ra số này?" link.
- **FR-016**: While a receiver's stamped card offers "Hoàn tác" for a repayment, that repayment's history row MUST NOT offer "Xoá". It comes back when the card goes.
- **FR-017**: The debtor's busy label for send, "Chuyển số khác", "Báo thêm" and take back MUST be "Đang báo…".
- **FR-018**: "<name> chưa thêm tài khoản nhận tiền." MUST be regular weight in the block's muted colour.

**Presses and races (US4)**

- **FR-019**: One guard per directed pair MUST make every notice action on that pair ignore a press while another one is unanswered, including a "result unknown" until its refresh has read the pair. The actions are the ones listed in US4 scenario 1, from both the debtor's and the receiver's controls.
- **FR-020**: After a "notice changed" refusal and a fresh read of the pair's notice and the house's repayments, the error MUST become the one line from the US4 table whose condition the data proves, else the generic line. "A repayment appeared" means one whose id was not in the list shown when the press was made. It clears on the next action for the pair or after 10 s. If the read fails, the line is "Số liệu vừa thay đổi; chưa tải lại được." with "Thử lại".

**Telling the right amount (US5)**

- **FR-021**: When the debtor's typed amount is above what can be told, the step MUST offer a fill button:
  - **"Chuyển số khác":** `max = min(suggestion, 10¹²)`, with the line "Bạn chỉ cần trả <name> <max>." and the button "Báo <max>".
  - **"Báo thêm":** `max = min(suggestion − told, 10¹² − told)`, with the line "Chỉ cần báo thêm <max>." and the button "Báo thêm <max>".

  Pressing it fills <max> and keeps the focus in the field. When 10¹² binds, the step shows the existing limit message with no button. When max ≤ 0, it shows "Bạn đã báo đủ số cần trả." with no button. The cap itself does not change.

**Copy**

- **FR-022**: Every new line MUST exist in Vietnamese and English.

### Key Entities

- **Notice** (spec 014): directed pair, amount, note, status, version, author. No new field. A deletion can now raise a sent notice's amount, or re-send a declined one (FR-007).
- **Repayment**: unchanged. Its recorded notice amount decides the add-back.
- **Warned recording**: the confirm request may carry the version and the suggestion amount the person was warned about (FR-006). Nothing is stored.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With an unmatched notice, 0 lines on any member's Tổng quan say that the debtor needs to pay the receiver for that pair. Recording it takes two presses, the first showing the over-suggestion warning. A stale "Ghi" is refused in 100% of tries.
- **SC-002**: Tell 33.333đ, record 20.000đ of it by hand, delete that repayment: the notice is 33.333đ again in 100% of runs, whatever the deletion entry point. Two-connection tests, run in both orders, never count told money twice or lose it. They cover a deletion against an accept, an add, a decline, a take-back and a second deletion.
- **SC-003**: For a debtor with one suggestion and a partial notice at 360 px:
  - every line about the pair agrees on the amounts;
  - the block shows one "Vì sao ra số này?";
  - the transfer is not repeated;
  - the receiver sees at most 2 undo controls after a confirmation.
- **SC-004**: A double tap on "Tôi đã chuyển" sends 1 request and shows 0 errors. A lost race shows a proven or generic line after one read, and no 409 text after 10 s.
- **SC-005**: Owing 133.333đ and typing 135000: "Báo 133.333đ" then Gửi tells exactly 133.333đ.
- **SC-006**: The existing pytest suite (notices, settlements, balances) stays green, except the spec 014 test that expected an existing notice to be left unchanged, which is replaced. New pytest cases cover every FR-007 case and FR-008. They also cover FR-006's `warning_required` and `suggestion_changed` refusals, including two accepts on different pairs that together would pass the suggestions. E2E smoke stays green.

## Assumptions

- **"Huỷ thông báo":** the debtor's existing take-back.
- **New server behaviour:** only two things change on the server. Recording a notice amount above the suggestion needs the warned statement (FR-006). Deleting a repayment does the add-back (FR-007 to FR-009).
- **Lost races:** "who did what" is decided on the client from the fresh data, only for the provable cases in the table.
- **Dependencies:** spec 018 (#295) is merged before this is built. Spec 013 is independent.
