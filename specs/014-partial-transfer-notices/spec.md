# Feature Specification: Telling the amount actually sent

**Feature Branch**: `spec/014-partial-transfer-notices`

**Created**: 2026-11-08

**Status**: Reviewed, ready for planning

**Input**: G2-03 of the work plan of 08/11 (`docs/review/2026-11-08-ke-hoach-cong-viec.md`), bug L7 of the
review (`docs/review/2026-11-08-bien-ban-danh-gia.md`): the person who owes tells "Tôi đã chuyển" with the
amount actually sent (at most what they owe that person), with an optional note; rule S3 of `docs/ACCOUNTS.md`
changes with it; the receiver confirms exactly the amount told; when the debt changes after telling, the line says
"Đã báo 2.286.500đ, còn thiếu 60.000đ" with "Báo thêm"; a short line explains that the suggested transfers already
combine the debts of the whole house. The screens of spec 012 still in progress (house list, expense list, filters)
are not touched.

## Context

Today "Tôi đã chuyển" tells the receiver the exact amount suggested at that moment, and nothing else can be told.
Two things go wrong:

- **Part of the money.** Lan owes Tiến 2.346.500đ but can only send 1.000.000đ today. The app offers only the full
  amount, so she either tells something untrue or tells nothing.
- **A notice that went stale (L7).** Lan told 2.286.500đ. Then someone added an expense and she now owes
  2.346.500đ. Her line still says "Đã báo, chờ Tiến xác nhận", as if she were done. Nobody sees the 60.000đ left.

Two weaknesses of today's rules matter once amounts can differ:

- A repayment typed in by hand removes a notice only when it is exactly the told amount; any other amount leaves
  the notice whole, so the same money can later be confirmed a second time.
- Answers are checked against the amount only, and taking a notice back is not checked at all, so a screen that is
  out of date can act on a notice that has changed since.

The suggested transfers come from a short greedy settlement of the balances (at most one transfer fewer than the
number of people), so "Lan trả Tiến 2.346.500đ" can include money Lan owed Minh. People who add up what they owe
each person get a different number and lose trust.

## The model in one paragraph

A notice is **money the payer told the receiver about that the receiver has not recorded yet**. Telling adds to
it; the receiver recording that money (by confirming all of it, by confirming a smaller amount, or by typing a
repayment in by hand and saying it is that money) takes the same amount out of it; what is left keeps waiting.
Deleting such a repayment gives the amount back when the pair has no notice at that moment (FR-011a). Money recorded as a separate repayment leaves the notice alone. A
notice is therefore never recorded twice, and every screen can show the told amount next to what is owed now.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Tell the amount actually sent (Priority: P1)

Lan owes Tiến 2.346.500đ and transfers 1.000.000đ now. She tells the app that amount, with "chuyển trước một nửa",
and Tiến confirms exactly 1.000.000đ. Afterwards Lan still owes the rest, and the app says so.

**Why this priority**: housemates often pay in parts; without this the notice is either untrue or not sent at all.

**Independent Test**: as the debtor, tell a smaller amount with a note; as the receiver, see that amount and the
note, confirm it, and check that the balances moved by exactly that amount.

**Acceptance Scenarios**:

1. **Given** Lan owes Tiến 2.346.500đ, **When** she presses "Tôi đã chuyển 2.346.500đ cho Tiến", **Then** the full
   amount is told in one press, as today.
2. **Given** the same, **When** she chooses "Chuyển số khác", types "1tr" and the note "chuyển trước một nửa" and
   sends, **Then** the notice says 1.000.000đ with that note, and her line reads "Đã báo 1.000.000đ, còn thiếu
   1.346.500đ" with "Báo thêm" (FR-004), never a plain "chờ xác nhận".
3. **Given** the amount field, **When** Lan types 0, "abc", a fraction of a đồng, or more than 2.346.500đ, **Then** the
   reason shows under the field, what she typed stays, and nothing is told.
4. **Given** Lan told 1.000.000đ, **When** Tiến opens Tổng quan, **Then** he sees "Lan báo đã chuyển 1.000.000đ",
   the note, and "Xác nhận đã nhận 1.000.000đ".
5. **Given** Tiến confirms, **Then** a repayment of exactly 1.000.000đ is recorded once, the notice is gone, and the
   balances are recomputed (Lan's remaining 1.346.500đ is then suggested, to whoever the settlement picks).
6. **Given** the suggestion changed between loading the page and sending, **When** Lan's amount is still within the
   new suggestion to Tiến, **Then** it is told; **when** it is not, or Tiến is no longer suggested, **then** nothing
   is told, the new suggestion shows, and what she typed stays in the field for her to change.
7. **Given** Tiến confirms 1.000.000đ, **While** the page waits for the new balances, **Then** nothing on screen says
   Lan and Tiến are settled; the confirmed amount shows, and the rest shows as soon as the balances arrive.

---

### User Story 2 - A notice that no longer matches says what is left (Priority: P1)

Lan told 2.286.500đ. A new expense makes her owe Tiến 2.346.500đ before Tiến answers. Her line now says "Đã báo
2.286.500đ, còn thiếu 60.000đ" with "Báo thêm". She sends the 60.000đ and tells it; the notice now says
2.346.500đ in all.

**Why this priority**: this is L7, the bug that made a debtor look settled when she was not.

**Independent Test**: tell the full amount, add an expense that raises the debt, and check both lines show the
two numbers; tell the rest with "Báo thêm" and confirm the total once.

**Acceptance Scenarios**:

1. **Given** Lan told 2.286.500đ and now owes Tiến 2.346.500đ, **When** she looks at Tổng quan, **Then** she sees "Đã
   báo 2.286.500đ, còn thiếu 60.000đ" and "Báo thêm", not a plain "chờ xác nhận".
2. **Given** that line, **When** she presses "Báo thêm", **Then** the amount starts at 60.000đ, she may lower it, the
   step shows "2.286.500đ + 60.000đ = 2.346.500đ" before she sends, and sending adds it to the same notice.
3. **Given** Tiến's screen, **When** the told amount is below what Lan owes him now, **Then** he sees "Lan báo đã
   chuyển 2.286.500đ · lúc này Lan cần trả bạn 2.346.500đ".
4. **Given** Lan told 2.286.500đ and the debt then fell to 2.000.000đ, **When** either of them looks, **Then** the
   line says the told amount is more than what is owed now ("Đã báo 2.286.500đ, nhiều hơn số cần trả lúc này
   2.000.000đ"); there is no "Báo thêm"; Tiến can still confirm what he received (which may leave Tiến owing Lan),
   confirm a smaller amount, or answer "Chưa nhận được".
5. **Given** Tiến's screen still shows 2.286.500đ while Lan has just added 60.000đ, **When** Tiến confirms, **Then**
   his answer is refused, nothing is recorded, and the screen shows the new total.

---

### User Story 3 - The receiver got only part of it (Priority: P1)

Lan told 2.346.500đ in all, but only 2.286.500đ reached Tiến. He confirms that amount; the 60.000đ stays told and
waiting, and he can answer "Chưa nhận được" for it.

**Why this priority**: once a notice can grow, confirming "all or nothing" would force a false answer; this is
what keeps money from being recorded wrongly or twice.

**Independent Test**: tell an amount, confirm a smaller one, and check the rest still waits; type a repayment by
hand instead and check the same.

**Acceptance Scenarios**:

1. **Given** a notice of 2.346.500đ, **When** Tiến chooses "Nhận số khác" and enters 2.286.500đ, **Then** exactly
   that is recorded and the notice now tells 60.000đ, still waiting.
2. **Given** a notice of 1.060.000đ, **When** Tiến records a repayment of 1.000.000đ from Lan by hand, **Then** the
   form asks whether it is the money Lan told ("Đây là tiền Lan đã báo") or another repayment ("Khoản khác"); as the
   told money it is taken out of the notice, which now tells 60.000đ, and confirming later can record at most
   60.000đ; as another repayment the notice stays 1.060.000đ.
3. **Given** a notice of 1.000.000đ, **When** Tiến records it by hand as the told money, **Then** the notice is closed;
   nothing of it can be confirmed again. If the notice changed or was answered in between, nothing is recorded and
   the form says so.
4. **Given** Tiến answered "Chưa nhận được" for 60.000đ, **Then** the notice keeps its amount and note, Lan sees "Tiến
   báo chưa nhận được 60.000đ", and she can tell again (which replaces it) or take it back; if Tiến later records
   part of it as the told money, the rest stays answered "Chưa nhận được".
5. **Given** Tiến confirmed the whole 1.000.000đ of a notice by mistake (so it closed) and Lan has told nothing since,
   **When** he presses "Hoàn tác" or deletes that repayment later, **Then** the balances go back and the 1.000.000đ
   waits as told again, so Lan does not have to tell it again. Whenever the pair has a notice at that moment (Lan told
   something since, or a part of the old notice was still waiting), deleting leaves that notice as it is and Tiến is
   warned first that Lan may need to tell the deleted amount again.

---

### User Story 4 - Why the suggestion is one transfer to one person (Priority: P2)

Lan owes Minh 300.000đ and Minh owes Tiến 300.000đ; the app suggests only "Lan trả Tiến". Next to her action a short
line says the suggested amount already combines the debts of the whole house, with the existing "Vì sao ra số
này?" for the detail.

**Why this priority**: it prevents the "that is not what I owe him" doubt, but nothing breaks without it.

**Independent Test**: in a house where the suggestion crosses people, the line is shown once near the debtor's
action and leads to the existing explanation.

**Acceptance Scenarios**:

1. **Given** Lan is told to pay someone, **When** she looks at her action, **Then** one short line under it says the
   amount already combines the house's debts, so she pays only the people suggested.
2. **Given** the line, **When** she opens "Vì sao ra số này?", **Then** the existing explanation opens.

### Edge Cases

- **Two tabs or two people at once**: every change to a notice (telling, adding, confirming, confirming less,
  declining, taking back) names the version of the notice the person saw; a version that has changed since is
  refused without changing anything, and the screen refreshes. Pressing twice, or a retry after a lost answer, never
  adds or records twice.
- **The pair is no longer suggested** (the debt now goes to someone else): the notice keeps its own card with the
  told amount and "Hiện không còn gợi ý chuyển cho Tiến"; Tiến can still confirm, confirm less, or decline; Lan can
  take it back; nobody can add to it. Telling anew needs a current suggestion.
- **A person loses access** while a notice waits (removed, or left with the name kept): today's behaviour stays
  (the notice remains; only the receiver can record, rule S2), and the case is listed for the member lifecycle spec
  (013, bug L3) rather than solved here. When a name is deleted, its notices go with it, as today.
- **Amounts**: whole đồng from 1đ, sent as whole numbers (never text or true/false); a notice's total never above
  1.000.000.000.000đ (the app's limit for any amount) nor above what was suggested when it was last told or added to;
  when a suggestion is above that limit, "Tôi đã chuyển" says the limit and opens "Chuyển số khác" instead of telling
  in one press; "1tr", "500k", "1.000.000" are read the way the
  expense form reads them, with "= 1.000.000đ" under the field; a fraction of a đồng is refused, never rounded.
- **Note**: at most 120 characters, trimmed, line breaks become spaces, spaces only means no note. Telling again
  after "Chưa nhận được" replaces the note (none typed means none); "Báo thêm" replaces it only if a new one is typed.
- **Repayment date**: confirming records the repayment on the day it is confirmed, as today; the note of the notice
  goes with it.
- **The reminder message** ("Tin nhắn nhắc nợ") names the told amount when a notice waits, and says when the pair is
  no longer suggested.

## Requirements *(mandatory)*

### Functional Requirements

**Telling**

- **FR-001**: The person who owes MUST be able to tell any whole-đồng amount from 1đ up to the amount currently
  suggested from them to that receiver (and at most 10^12 đồng). The full amount MUST stay one press ("Tôi đã chuyển
  {amount} cho {to}") whenever it is within that limit; a smaller amount and a note are reached through "Chuyển số
  khác".
- **FR-002**: Telling MUST be refused, without changing anything, when the amount is not a positive whole number of
  đồng (422), or when it is above what is suggested for that pair at that moment or the pair is not suggested
  (409, the suggestion changed); the check and the change MUST be one step with respect to every other change of
  money in the house, so an expense or repayment saved in between cannot slip past it. The page MUST show the
  reason, the new suggestion when there is one, and keep what was typed.
- **FR-003**: A notice MAY carry a note of at most 120 characters (rules in Edge Cases). Like the notice, it is seen
  by everyone in the house.

**When the debt moves**

- **FR-004**: While a notice waits and its amount is below what is suggested now for the same pair, the payer's line
  MUST say "Đã báo {told}, còn thiếu {rest}" and offer "Báo thêm" only when FR-005 allows it (at the 10^12 đồng limit
  the line says that limit instead of offering it); the receiver's line MUST say "{payer} báo đã chuyển {told} · lúc
  này {payer} cần trả bạn {current}".
- **FR-005**: "Báo thêm" MUST show the previous total, the addition and the new total before sending, and add the
  amount to the same notice; it is offered only while the told amount is below both what is suggested now and
  10^12 đồng, and the new total MUST NOT exceed either (FR-002 applies).
- **FR-006**: While a notice waits and its amount is above what is suggested now, or the pair is no longer suggested,
  the lines MUST say so and MUST NOT offer "Báo thêm"; no screen may present such a notice as plainly "chờ xác
  nhận".

**Recording**

- **FR-007**: The receiver MUST be able to confirm the whole amount of a notice ("Xác nhận đã nhận {told}") or a
  smaller amount ("Nhận số khác", 1đ up to the told amount); exactly the amount confirmed is recorded as one
  repayment, and taken out of the notice; the notice closes when nothing is left.
- **FR-008**: When the receiver types in a repayment by hand from a payer whose notice to them exists (waiting or
  answered "Chưa nhận được"), the form MUST ask whether it is that told money or another repayment. As told money it
  is taken out of the notice (at most the notice's amount; the rest of the repayment, if any, is recorded as well),
  naming the notice's version: recording and taking out are one step, and a changed or closed notice means nothing is
  recorded. As another repayment it leaves the notice unchanged. The same money can therefore never be recorded once
  by hand and again by confirming.
- **FR-009**: "Chưa nhận được" MUST keep the notice's amount and note and show it to the payer. It stays until the payer
  tells again (replacing it) or takes it back; money the receiver records as that told money is taken out of it, and
  what is left stays answered "Chưa nhận được" until nothing is left.
- **FR-010**: Every change to a notice (telling, adding, confirming all or part, declining, taking back, recording by
  hand as told money) MUST name the version the person saw, or that there was none; a changed version, or a notice
  that has appeared or gone since, MUST be refused (409) without any change. When both the notice and the suggestion
  changed, the notice's refusal is the one reported. A repeated request MUST NOT add or record twice.
- **FR-011**: While a confirmation is on its way, the notice shows as being recorded, and no screen may show the pair
  as settled until the new balances arrive. On success the confirmed amount shows at once and the rest when the
  balances arrive. On a refusal the page loads the notice as it is now. When the outcome is unknown (the answer was
  lost), the page reloads the notice and the balances before anything can be recorded again; it never shows an old
  notice as one that can still be confirmed.
- **FR-011a** (superseded by [spec 019](../019-notices-one-story/spec.md) FR-007: the amount now always goes back into the pair's notice): Deleting a repayment that was recorded from a notice (by "Hoàn tác" or later from the list) MUST give
  the amount it took back as a waiting notice when that pair has no notice at that moment, so the payer does not
  tell it again; the receiver is told so before deleting. When the pair already has a notice (waiting or answered
  "Chưa nhận được"), nothing is given back and that notice is left as it is; the receiver is told before deleting
  that the payer may need to tell it again. The amount given back is never more than the repayment took.

**Showing**

- **FR-012**: Everyone in the house MUST see each notice's told amount and note; the reminder message MUST name the
  told amount when one waits.
- **FR-013**: Near the debtor's action, one short line MUST say that the suggested amount already combines the debts
  of the whole house, with the existing "Vì sao ra số này?" for the detail; shown once, not on every row.

**Everywhere**

- **FR-014**: The "Chuyển số khác", "Báo thêm" and "Nhận số khác" steps MUST have labelled fields, errors tied to
  their field, Enter to send, Escape to close with the focus back on the button that opened them, what was typed kept
  after a refusal, and new totals announced once to screen readers; they MUST fit 320 px and 200% zoom, with 44 px
  controls and a visible focus; every word in Vietnamese and English.
- **FR-015**: `docs/ACCOUNTS.md` rule S3 (and S2 for repayments typed by hand), `docs/DESIGN.md` (§6.2, §7) and the
  API description MUST say what this spec changes.
- **FR-016**: The behaviour of what spec 012 still has in progress (the house list, the expense list and the
  filters) MUST NOT change; edits to files both specs touch (translations, styles) are coordinated in the plan.

### Key Entities

- **Transfer notice**: one per payer and receiver in a house: money told and not yet recorded. Holds the told amount,
  an optional note, its state (waiting, or answered "Chưa nhận được"), a version that changes with every change, and
  when it was last told. Money the receiver records as that told money (confirming all or part, or typing it in by
  hand and choosing "Đây là tiền {payer} đã báo") takes from it; a repayment recorded as "Khoản khác" does not. It
  moves no balance itself.
- **Suggested transfer**: computed from the balances, never stored; a short set of transfers that settles the house.
  The ceiling for telling.
- **Repayment**: money the receiver recorded (rule S2), by confirming a notice or by hand; when it was recorded from a
  notice it remembers how much it took from it. Recording a repayment changes balances (as expenses do); telling or
  answering a notice without recording money does not.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On a phone, telling a part with a note takes at most 4 presses besides typing (open "Chuyển số khác",
  amount, note, send) and under 30 seconds for someone who knows the amount.
- **SC-002**: In every state where a waiting notice's amount differs from what is owed now, or its pair is no longer
  suggested, both the payer and the receiver see it said; no such notice is ever shown as plainly "chờ xác nhận".
- **SC-003**: In tests that run confirmations, partial confirmations, hand-typed repayments recorded as told money,
  deletions and additions at the same time, the money recorded against a notice never exceeds what was told, and no
  screen's stale action changes anything.
- **SC-004**: Telling the full amount stays a single press whenever it is within the app's amount limit.
- **SC-005**: Every told amount or total outside 1đ to the current suggestion (and 10^12 đồng) is refused, and
  nothing changes when it is.

## Assumptions

- A note is as visible as the notice: everyone in the house sees it.
- The notice keeps only the amount still waiting and the latest note, not each part told; the "Báo thêm" step shows
  the sum before sending, and partial confirmation covers the case where only part arrived. A history of parts is
  left out.
- Telling more than currently owed is not allowed; money sent in excess is recorded by the receiver by hand, as today.
- People who lose access while a notice waits keep today's behaviour; the member lifecycle spec (013) owns that case.
- The wording follows `docs/DESIGN.md` §7: "Đã báo", "còn thiếu", "Báo thêm", "Chuyển số khác", "Nhận số khác".
- The demo on 12/11 does not depend on this spec; it ships when reviewed, like the rest of round 2.
