# Tasks: Pay by VietQR

**Input**: Design documents from `specs/016-vietqr/` (plan.md, spec.md, research.md, data-model.md, contracts/api.md, contracts/ui-contract.md, quickstart.md)

**Tests**: required. The spec asks for known-answer payload fixtures (SC-003), an access matrix with identical answers (SC-004), no outside request (SC-005) and no account data in logs (SC-006). Tests are written first in each story and must fail before the code they check exists.

**Organization**: two pull requests (research R11). PR-1 holds the privacy rules and the data (US1, US3); PR-2 draws the code (US2) and updates the documents. US2 needs the payment endpoint of US3, so the order is US1 → US3 → US2.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: US1, US2 or US3 from spec.md

## Path Conventions

API in `app/`, migrations in `db/migrations/`, backend tests in `tests/`, web app in `frontend/src/`, E2E in `frontend/e2e/`.

---

## PR-1: the account and who sees it

### Phase 1: Setup

- [X] T001 Open a GitHub issue "VietQR PR-1: receiving account, hint and payment details (spec 016)" with US1 and US3 as done criteria; branch `feat/016-vietqr-accounts` from `main`; commit `specs/016-vietqr/` with the code

### Phase 2: Foundational (blocks US1 and US3)

- [X] T002 Write `db/migrations/012_receiving_accounts.sql`: table `receiving_accounts` with `user_id bigint PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE`, `bank_bin text NOT NULL CHECK (bank_bin ~ '^[0-9]{6}$')`, `account_number text NOT NULL CHECK (account_number ~ '^[0-9]{6,19}$')`, `holder_name text NOT NULL CHECK (holder_name ~ '^[A-Z0-9]+( [A-Z0-9]+)*$' AND char_length(holder_name) <= 50)`, `version text NOT NULL CHECK (char_length(version) = 12)`, `updated_at timestamptz NOT NULL DEFAULT now()`; `ALTER TABLE receiving_accounts ENABLE ROW LEVEL SECURITY`; header comment in the style of `008_user_photos.sql`
- [X] T003 [P] Write `app/data/vietqr_banks.json` and an identical `frontend/src/data/vietqr-banks.json`: `{version: "2026-11-09", source: <NAPAS member list URL>, banks: [{bin, name, transfer}]}` for the 12 banks of research R3, each BIN checked against the NAPAS list when written (note the check in the PR)
- [X] T004 [P] pytest `tests/test_vietqr_banks.py`: the two files are byte-identical, BINs are six digits and unique, names non-empty, `transfer` boolean
- [X] T005 [P] pytest `tests/test_vietqr_service.py` (first, red): `clean_ascii` pairs ("Nguyễn Văn Minh" → "NGUYEN VAN MINH", "Đỗ Thị  Lan" → "DO THI LAN", "  a-b_c 2 " → "ABC 2", "😀" → "", "Lan 2" → "LAN 2"); `clean_account_number` ("0123 456.789" → "0123456789", "12a45" refused, 5 and 20 digits refused, leading zeros kept); `transfer_message("Nhà trọ Quận 7", "Lan")` → "FS NHATROQUAN7 LAN" cut to 12 + 8, at most 24 characters, empty parts left out; `payment_state` for every row of data-model.md "State rules" including Q ≤ 0, declined with and without acknowledgement, Q = 499 999 999 and 500 000 000
- [X] T006 Implement `app/services/vietqr.py`: load the bank list once (`BANKS`, `bank_for(bin)` returning only `transfer: true` entries), `clean_ascii` (FR-003: NFD, drop combining marks, `Đ/đ` → `D/d`, upper-case, keep `[A-Z0-9 ]`, collapse spaces, trim), `clean_account_number` (FR-002), `transfer_message` (FR-014), `FAST_TRANSFER_LIMIT = 500_000_000` and `payment_state(suggested, notice, acknowledge)` (FR-015); make T005 pass
- [X] T007 [P] In `app/schemas.py`: `ReceivingAccountIn {bank_bin, account_number, holder_name}` (strict strings), `ReceivingAccount {bank_bin, bank_name, account_number, holder_name, version, supported}`, `MyReceivingAccount {account: ReceivingAccount | None}`, `ReceivingHint {bank_name, last4}`, `Member.receiving_hint: ReceivingHint | None = None`, `PaymentDetails` (fields of data-model.md "Payment snapshot", optional where the state leaves them out)
- [X] T008 [P] Shared cleaning cases: `frontend/src/lib/clean-ascii-cases.json` (input → output pairs from T005; inside `frontend/` because the web image is built from that folder alone), read by T005 and by the Vitest twin in T014

### Phase 3: User Story 1 - Save the account I receive money on (P1)

**Goal**: save, change and remove one receiving account on Hồ sơ của bạn.

**Independent Test**: save "0123 456.789" and "Nguyễn Văn Minh" at Vietcombank, see it cleaned; change it (new version); remove it; a stranger's request for it cannot exist (no house route).

- [X] T009 [P] [US1] pytest `tests/test_receiving_accounts.py` (first, red): GET with none → `{account: null}`; PUT cleans and returns the account with a 12-hex `version`, a second PUT changes the version; `unknown_bank` for a BIN not listed and for one with `transfer: false`; `bad_account_number`, `bad_holder_name` (empty after cleaning, 51 characters); `true`, numbers, missing fields → 422; DELETE → 204, then GET → null, DELETE again → 204; every answer has `Cache-Control: no-store`; another account's session sees only its own; no session → 401; `supported: false` when the saved BIN is removed from the list (monkeypatch `BANKS`)
- [X] T010 [US1] Implement `GET`, `PUT`, `DELETE /api/me/receiving-account` in `app/routers/me.py` (upsert by `user_id`, `version = secrets.token_hex(6)`, `no-store` header, no logging of the body); make T009 pass
- [X] T011 [P] [US1] `frontend/src/api/types.ts` and `frontend/src/api/households.ts`: `ReceivingAccount`, `getReceivingAccount`, `saveReceivingAccount`, `deleteReceivingAccount`, `keys.receivingAccount`
- [X] T012 [P] [US1] Words in `frontend/src/i18n/vi.tsx` and `en.tsx` (`profile` block): section title "Tài khoản nhận tiền", bank, number, holder, "Sẽ hiện: …", the privacy line (US1 scenario 2), the after-delete line, "Ngân hàng này không còn trong danh sách VietQR…", delete question, field errors for `unknown_bank`, `bad_account_number`, `bad_holder_name`
- [X] T013 [US1] Vitest in `frontend/src/pages/AccountPage.test.tsx` (first, red): empty state → form; the live preview "Sẽ hiện: NGUYEN VAN MINH"; the privacy line is visible before saving; save sends cleaned values; field errors from the server land under their fields; Sửa, Xoá with the question; the unsupported-bank state
- [X] T014 [US1] Implement `frontend/src/lib/cleanAscii.ts` (the twin of `clean_ascii`, tested against `tests/fixtures/clean_ascii_cases.json` in `frontend/src/lib/cleanAscii.test.ts`) and the `ReceivingAccountForm` section in `frontend/src/pages/AccountPage.tsx` (bank `<select>` from `frontend/src/data/vietqr-banks.json`, only `transfer: true`; numeric keyboard for the number; query removed on unmount, R7); CSS in `frontend/src/index.css` (44 px, wraps at 320 px); make T013 pass

### Phase 4: User Story 3 - Only the right people see my account (P1)

**Goal**: the hint on Thành viên for current housemates; the payment endpoint with every state, in the same-404 order, under one consistent read.

**Independent Test**: the access matrix of T015 passes; Thành viên shows the hint only for current members with a supported account.

- [X] T015 [P] [US3] pytest `tests/test_payment_details.py` (first, red), access: (a) no session 401; (b) a stranger, someone waiting, someone removed, someone who left: answer identical (status, body, data-dependent headers) to a house that does not exist, with and without Minh having an account; (c) a current member asking about someone who left, an old name without account, an id from another house, an id that does not exist: identical to `member_not_found`, with and without an account; (d) An owing nothing → `409 payment_not_suggested`, no account data in the body; (e) the owner owing nothing → 409 too; (f) asking about yourself → 409; (g) Lan owing Minh in house A but not in house B → details in A, 409 in B; (h) `Cache-Control: no-store` on every 200
- [X] T016 [P] [US3] pytest in `tests/test_payment_details.py`, states: `ready` (Q = S, message, account); `partly_told` with a waiting notice (Q = S − T, `notice_version`); `covered` when T ≥ S, no account in the body; `declined` without details, `declined_acknowledged` with `?acknowledge=<current version>`, a stale version stays `declined`; `too_large` at 500 000 000 with details, `ready` at 499 999 999; `no_account` when none saved and when the BIN is unsupported; the `snapshot` token changes when S, the notice or the account changes, and only then; nothing in the database changes (row counts of settlements and notices before and after)
- [X] T017 [P] [US3] pytest in `tests/test_payment_details.py`, consistency and logs: with a second connection holding the household lock `FOR SHARE` (an expense being written), the payment read waits, then returns the new state (interleaved, like spec 014's tests); a run of the whole module with `caplog` at DEBUG and the API's own logger finds neither the test account number nor the holder's name (SC-006)
- [X] T018 [US3] Implement `GET /api/households/{household_id}/members/{member_id}/payment` in `app/routers/settlements.py` (next to the notices; `households.py` cannot import the balances, which import it): `household_access` first (existing), then `lock_household(conn, household_id)` `FOR UPDATE` (R4), then the live-link member check (`member_not_found`), then the suggestion from `compute`, the pair's notice, the account and `payment_state`; build the answer and `snapshot` (R8); `no-store`; make T015 to T017 pass
- [X] T019 [US3] Pytest in `tests/test_households.py` (first, red) then implement: `list_members` in `app/routers/households.py` reads the hints with a separate query on live owner/member links joined to `receiving_accounts` (so no other answer built from `SELECT_MEMBERS` can carry account data) and sets `receiving_hint` from `bank_for(bin)` and the last four digits, `null` for an unsupported BIN, no account, or no live link
- [X] T020 [P] [US3] Vitest in `frontend/src/components/MemberList.test.tsx` (first, red), then show "Có tài khoản nhận tiền · Vietcombank •••• 6789" under a member with a hint in `frontend/src/components/MemberList.tsx` (where the status line is); words in `vi.tsx`, `en.tsx` (`members` block)

### Phase 5: Polish (PR-1)

- [X] T021 `docs/ARCHITECTURE.md` API table: the three profile routes and the payment route; `docs/ACCOUNTS.md`: rule P6 (receiving account: who sees the details, the hint, the same-404 order, the self-made-eligibility limit, deletion and backups) with its tests
- [X] T022 Run `ruff check .`, full pytest, `npm run lint`, `npx tsc -b`, Vitest, `npm run build`, local E2E (all green, stack rebuilt so `012` applies); quickstart steps 1, 2, 6 and 9 by hand

---

## PR-2: the code on Tổng quan

### Phase 6: Setup

- [X] T023 Open the issue "VietQR PR-2: the code on Tổng quan (spec 016)" with US2 as done criteria; branch `feat/016-vietqr-code` from `main` after PR-1 is merged
- [X] T024 Add `qrcode-generator` (dependency) and `jsqr` (dev dependency) to `frontend/package.json` with exact versions; `npm install`; note both licences (MIT, Apache-2.0) in the PR

### Phase 7: User Story 2 - Scan to pay what I owe (P1)

**Goal**: *Mở mã QR* beside the debtor's action opens a panel with the code, the details as copyable text and every state of FR-015.

**Independent Test**: Lan owing Minh opens the panel; the drawn code decodes (with `jsqr`) to the payload of the known-answer fixtures; no request leaves Fair-Share; nothing is recorded.

- [X] T025 [P] [US2] Vitest `frontend/src/lib/vietqr.test.ts` (first, red): CRC-16/CCITT-FALSE of "123456789" = `29B1`; hand-made fixtures from the NAPAS document for (a) Vietcombank `0123456789`, 120 000, "FS NHATROQ7 LAN", point of initiation `12`; (b) the same without amount, `11`, no tag `54`; (c) a leading-zero 19-digit account; (d) a 24-character message; each fixture is also read back by a separate TLV parser written only in the test file, field by field
- [X] T026 [US2] Implement `frontend/src/lib/vietqr.ts`: `vietqrPayload({bin, account, amount?, message})` exactly as spec "The code" (two-digit lengths, ASCII only, `6304` + CRC upper-case hex); make T025 pass
- [X] T027 [P] [US2] Implement `frontend/src/components/QrCode.tsx`: `qrcode-generator` at level M, auto type number, drawn as one SVG `<path>` with a 4-module quiet zone, light background in both themes, `role="img"` with a label, at least 200 px wide; Vitest `QrCode.test.tsx` checks the label, the light background and that the path is not empty
- [X] T028 [P] [US2] `frontend/src/api/households.ts` and `types.ts`: `getPaymentDetails(householdId, memberId, acknowledge?)`, `PaymentDetails` type, `keys.payment(householdId, memberId)`
- [X] T029 [P] [US2] Words in `vi.tsx` and `en.tsx` (`verdict` block): every text of contracts/ui-contract.md "The panel" and "Tổng quan", including "Không kèm số tiền", "Số tiền tham khảo", the declined warning and "Vẫn chuyển {amount}", "vừa đổi", too-large reason, "Minh chưa thêm tài khoản nhận tiền", "Đã chép", the code's label
- [X] T030 [US2] Vitest `frontend/src/components/PaymentQrPanel.test.tsx` (first, red; the panel opens inline under the debtor's action, with focus on its heading): loading; `ready` shows the code and the five copyable values and the compare line; `partly_told` line; *Mã không kèm số tiền* switches the code and the labels, *Mã kèm số tiền* back; `declined` shows the warning and no code until "Vẫn chuyển", which asks again with `acknowledge`; `covered`, `no_account`, 409 and 404 drop the code and details; `too_large` shows text, no code; a refetch with another `snapshot` drops the code and details and shows *Tải lại*; clipboard refused selects the text; Escape and *Đóng* close and focus the opener, else the debtor's action, else the verdict heading; nothing is sent but GETs to the payment route
- [X] T031 [US2] Implement `frontend/src/components/PaymentQrPanel.tsx`: a dialog using the payment query (`gcTime: 0`, `staleTime: 0`, `refetchInterval: REFRESH_MS`, `refetchIntervalInBackground: false`, enabled only while open, `removeQueries` on close), snapshot comparison (R8), the states of the UI contract, copy buttons with fallback; CSS in `frontend/src/index.css`; make T030 pass
- [X] T032 [US2] Vitest in `frontend/src/pages/DashboardPage.test.tsx` (first, red), then in `frontend/src/components/VerdictBlock.tsx` (`DebtorAction`): *Mở mã QR* next to "Tôi đã chuyển … cho …" when the receiver has a hint and the pair is not covered by a waiting notice; "… chưa thêm tài khoản nhận tiền" when there is no hint; no button for a covered notice; stacks below 480 px; opening it renders `PaymentQrPanel`; nothing is recorded (no POST, PUT or DELETE)
- [X] T033 [US2] E2E `frontend/e2e/vietqr.spec.ts` (shared Tiến pays; Minh is an own account, since shared accounts are never changed; own house; the code is also decoded in the dark theme): Minh saves an account (made-up number), Lan owes him; Lan opens the panel; `page.route` fails the test on any request to a host other than Fair-Share (SC-005); the drawn SVG is rasterised and decoded with `jsqr`, and the payload equals `vietqrPayload` of the API's answer (SC-003); Lan tells part, the code shows the rest; Minh removes his account, the next refresh drops the code; the house is deleted at the end

### Phase 8: Polish (PR-2)

- [X] T034 Documents: `docs/PROJECT_SPEC.md` §3.3 "Since 09/11 (approved by the owner)" note (narrow extension; UX-02 unchanged); `docs/DESIGN.md` §6.2 (*Mở mã QR*, the panel) and §6.10 (Tài khoản nhận tiền); local `.specify/memory/constitution.md` Scope gains the extension (not committed)
- [X] T035 Accessibility pass at 320 px and 720 px (200% zoom of 1440), light and dark (20/20; the panel's text was white on white in light inside the taro block, fixed), on the form, the hint and the panel (44 px, no sideways scroll, focus on close); `frontend/e2e/a11y.spec.ts` stays green; the code scans in the dark theme
- [X] T036 Compatibility record in the PR (SC-002): two banking apps with name and version; with amount, without, after a partial notice, long house name; real details hidden in screenshots (11/11, two comments on #271: MB Bank app, latest, with and without the amount and in the dark theme; Minh's phone; Timo account as receiver; 50.000đ told of 150.000đ gives a 100.000đ code; a long house name scans; ZaloPay and MoMo listed but not scanned)
- [X] T037 Quickstart steps 3, 4, 5, 7 and 8 by hand; screenshots at 360 and 1440 px in the PR; full checks green; after merge, the live E2E run green (live 27/27 at 67fce95, deploy and smoke green again at 522d6fd)

## Phase 7: More banks and wallets (11/11, after the first scan test)

- [X] T038 Add 15 entries to both bank list copies (research R3 "Since 11/11"), each BIN checked on api.vietqr.io on 11/11; pytest that Timo, MoMo and ZaloPay are listed and Viettel Money, VNPT Money are not
- [X] T039 Labels "Ngân hàng hoặc ví" / "Bank or wallet" on the form and the panel, the number hint and the unknown bank error in `frontend/src/i18n/vi.tsx` and `en.tsx`; `AccountPage.test.tsx` follows
- [X] T040 After deploy, Duy Anh saves a Timo or MoMo account in the test house and Tiến scans his code with a banking app (the second app of T036); a wallet that does not fill in right is taken out of the list (11/11: Timo with MB Bank works, on #274)

---

## Dependencies & Execution Order

- PR-1: T001 → T002 → T003/T004/T005/T007/T008 → T006 → US1 (T009 → T010; T011, T012 → T013 → T014) → US3 (T015–T017 → T018; T019; T020) → T021 → T022.
- PR-2 starts after PR-1 is merged: T023 → T024 → T025 → T026; T027, T028, T029 in parallel → T030 → T031 → T032 → T033 → T034–T037.
- US1 and US3 share the foundational phase; US3 does not need the profile page (tests insert accounts through the API). US2 needs US3's endpoint.

## Parallel Opportunities

- Foundational: T003, T004, T005, T007, T008 touch different files.
- US1: T011 and T012 alongside T009/T010.
- US3: T015, T016, T017 are one file written in three passes; T020 alongside T018/T019.
- US2: T027, T028, T029 alongside T025/T026.

## Parallel Example: User Story 3

```text
T015 access matrix, T016 states, T017 consistency and logs   (tests/test_payment_details.py, red first)
T020 hint on Thành viên (frontend)                           (independent of the endpoint)
```

## Implementation Strategy

1. **PR-1 first (US1 + US3)**: every privacy rule ships and is reviewed before any code is drawn. After it, a housemate sees the hint, and the endpoint already answers; nothing on Tổng quan changes yet.
2. **PR-2 (US2)**: the payload, the drawing and the panel, then the documents and the compatibility record.
3. The feature is optional for the demo: if PR-2 is not green and reviewed in time, PR-1 alone is harmless (a saved account shows only as a hint).

## Notes

- Tests are written first and must fail before their code exists.
- Never log, print or put in a URL a real account number or name; fixtures use made-up data (FR-006).
- Commit only after the owner's approval; local tool folders stay out of commits.
