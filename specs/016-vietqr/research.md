# Research: Pay by VietQR

Decisions taken while planning [spec.md](spec.md). Each one: what we chose, why, and what else we looked at.

## R1. Drawing the code: a small QR library, rendered as SVG by us

- **Decision**: add `qrcode-generator` (MIT, no dependencies, about 20 KB) to the web app. It turns the payload string into a module matrix (error correction level M); a small component draws that matrix as one SVG `<path>` with a 4-module quiet zone on a light background, so it scans in the dark theme.
- **Why**: writing a QR encoder ourselves (Reed-Solomon, masking, version selection) is too much risk for a student team. This library only computes the matrix: no network, no canvas, nothing stored. SVG scales cleanly at 200% zoom.
- **Alternatives**: `qrcode` (bigger, pulls Node polyfills into Vite); a QR image from an online service (forbidden by FR-016/SC-005); a server-rendered PNG (the API would then build the payload, and the spec puts the code in the browser).

## R2. The payload: one pure module with fixtures

- **Decision**: `frontend/src/lib/vietqr.ts` builds the EMV TLV string exactly as spec "The code" says: `00 01`, `01 11|12`, `38 {00 A000000727, 01 {00 BIN, 01 account}, 02 QRIBFTTA}`, `53 704`, `54 amount` (only with an amount), `58 VN`, `62 {08 message}`, `63` CRC-16/CCITT-FALSE over everything up to and including `6304`, four upper-case hex digits. Lengths are two decimal digits; values are ASCII only (the server sends a cleaned message).
- **Tests**: known-answer fixtures written by hand from the NAPAS document (one with an amount, one without, a leading-zero account, a 24-character message), checked against a separate TLV parser written only for the tests, and the CRC against the standard check value (`"123456789"` → `29B1`). The E2E test decodes the rendered code with `jsqr` (dev dependency only) and compares it with the payload: an independent decoder (SC-003).
- **Alternatives**: building the payload on the server (spec says the browser builds the code from the API's answer; the server still sends every field, so nothing is computed twice).

## R3. The bank list: a small dated dataset, two copies checked equal

- **Decision**: `app/data/vietqr_banks.json` for the API and `frontend/src/data/vietqr-banks.json` for the page, the same content: `{ "version": "2026-11-09", "source": "<NAPAS member list URL>", "banks": [{ "bin": "970436", "name": "Vietcombank", "transfer": true }, …] }`. A pytest test fails if the two files differ. Release set (12 banks, BINs checked against the NAPAS list when the file is written, task T003): Vietcombank 970436, VietinBank 970415, BIDV 970418, Agribank 970405, Techcombank 970407, MB 970422, ACB 970416, VPBank 970432, TPBank 970423, Sacombank 970403, VIB 970441, HDBank 970437.
- **Why**: FR-016 wants no run-time bank requests and one version for API and page. The web image is built from `frontend/` only, so it cannot read a file under `app/`; two copies with an equality test is the simplest safe way.
- **Alternatives**: `GET /api/banks` (a run-time request for bank data, which FR-016 rules out); a generated TypeScript file (one more build step).

## R4. One consistent read for the payment details

- **Decision**: `GET /api/households/{household_id}/members/{member_id}/payment` (in `app/routers/settlements.py`, next to the notices) runs in the request's one transaction and first takes the household lock `FOR UPDATE` (`lock_household`, spec 014). Every money write already holds that lock (`FOR SHARE` for expenses and repayments, `FOR UPDATE` for notices), so while the read runs no balance, suggestion or notice can change: the suggestion, the notice and the amount come from one state (FR-013). The account row is read in the same transaction.
- **Why**: the alternative isolation level (`REPEATABLE READ`) cannot be set after the access dependency's first query in the same transaction. The lock is held for a few milliseconds and only blocks writes to that house.
- **Alternatives**: computing twice and comparing (racy); a separate connection at `REPEATABLE READ` (breaks the one-transaction-per-request rule).

## R5. Who gets what: order of checks and answers

- **Decision**, in this order (FR-008 to FR-011):
  1. no session → 401 (existing);
  2. the path's `household_id` goes through the existing `household_access` dependency first, so a non-member gets `404 household_not_found` before anything else is read;
  3. the member must be a current owner or member of that house (live link, as `SELECT_MEMBERS` does for photos): otherwise `404 member_not_found`, the same as an id that does not exist;
  4. the answer's `state` then says what the page may show; the details are included only when allowed:
     - `self` (asking about yourself) → `409 payment_not_suggested`;
     - no account, unsupported bank → `200 {state: "no_account"}`;
     - no suggested transfer from the asker to that member → `409 payment_not_suggested` (no data at all; the hint comes from the members list);
     - waiting notice that covers the debt → `200 {state: "covered"}` without details;
     - declined notice and no acknowledgement → `200 {state: "declined", notice: {...}}` without details; with `?acknowledge=<notice version>` matching → `declined_acknowledged` with details;
     - `Q ≥ 500 000 000` → `too_large` with details (text only, no code);
     - otherwise `ready` or `partly_told` with details.
- **Why**: steps 2 and 3 reuse the existing same-404 machinery, so FR-008/FR-009 answers are byte-identical by construction; nothing about the account is read before them. A current housemate learns from a `409` only that they owe nothing, which they already know from Tổng quan.
- **Alternatives**: `403` for "owes nothing" (reads like a permission problem); returning the hint here (the members list already carries it).

## R6. The hint in the members list

- **Decision**: `list_members` reads the hints with a separate query over live owner/member links joined to `receiving_accounts`, maps the BIN to the bank name and drops it when the BIN is not in the supported list (FR-016). `Member` gains `receiving_hint: {bank_name, last4} | null`. Kept out of `SELECT_MEMBERS`, which other answers reuse, so none of them can carry account data by accident.
- **Why**: one place already decides that profile data reaches only live links; the members list is only served to current members.

## R7. Not keeping the details in the browser

- **Decision**: the payment answer and `GET /api/me/receiving-account` send `Cache-Control: no-store`. On the page, the payment query is a TanStack Query with `gcTime: 0` and `staleTime: 0`, enabled only while the panel is open, removed with `removeQueries` on close, sign-out (already clears the cache) and house change; it is never persisted. The account form's query is removed when the profile page unmounts.
- **Why**: FR-021. TanStack Query keeps data in memory only; `gcTime: 0` drops it as soon as no component uses it.

## R8. Noticing a change while the panel is open

- **Decision**: while the panel is open, the payment query refetches every `REFRESH_MS` (30 s) in the foreground and when the tab comes back (`refetchIntervalInBackground: false`), the existing schedule. The answer carries `snapshot`, a short token the server builds from the pair, the suggested amount, the notice version and the account version; when it differs from the one the code was drawn from, or the answer is no longer `ready`/`partly_told`/`too_large`, the panel drops the code and every detail and shows the "vừa đổi" state with *Tải lại* (FR-022). A response for a request the panel no longer waits for is ignored (TanStack cancels it on remove).
- **Account version**: `receiving_accounts.version` is a random 12-hex value replaced on every save, like `user_photos.version`.

## R9. Cleaning the holder's name and the message on the server

- **Decision**: one function `app/services/vietqr.py: clean_ascii(text)` implements FR-003 (NFD, drop combining marks, `Đ/đ` → `D/d`, upper-case, keep `[A-Z0-9 ]`, collapse spaces, trim). The page shows the same cleaning live (a TypeScript twin with shared test cases in both suites, the same input/output pairs). The server builds the message (FR-014) from the house name and the payer's member name; the page never builds it.
- **Why**: the stored name and the message must not depend on the browser; the live preview is only a courtesy.

## R10. The 500 000 000 đ limit and the amount

- **Decision**: `FAST_TRANSFER_LIMIT = 500_000_000` in `app/services/vietqr.py`. `Q = S` (no notice), `S − T` (waiting), `S` (declined, after acknowledgement); `covered` when `Q ≤ 0`; `too_large` when `Q ≥ limit`. All integers, never rounded (constitution I).

## R11. Two pull requests

- **PR-1 (US1 + US3)**: migration, profile section, hint on Thành viên, the payment endpoint with every state and the access tests. No code is drawn yet; the endpoint is ready.
- **PR-2 (US2)**: the payload module, the QR drawing, the panel on Tổng quan, E2E with an independent decode, the compatibility record, and the documents (PROJECT_SPEC §3.3, ACCOUNTS, DESIGN, ARCHITECTURE).
- **Why**: PR-1 holds all the privacy rules, so its review can focus on them; PR-2 is mostly UI.
