# Implementation Plan: Pay by VietQR

**Branch**: `spec/016-vietqr` | **Date**: 2026-11-09 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/016-vietqr/spec.md`

## Summary

A person saves one receiving account (bank from a small bundled list, account number, holder's name) on their profile. Current housemates see a hint (bank and last four digits) on Thành viên. A housemate who owes them right now opens *Mở mã QR* on Tổng quan: the page asks one endpoint, which takes the household lock, checks access in the same-404 order, works out the amount from the suggestion and the notice (spec 014), and returns the details, the amount and a cleaned message together. The page builds the NAPAS account-transfer payload and draws it as an SVG QR code with a small library; nothing leaves Fair-Share and nothing is recorded. The open panel rechecks on the existing 30-second foreground refresh and drops stale details. Two PRs: PR-1 privacy and data (US1, US3), PR-2 the code and the documents (US2).

## Technical Context

**Language/Version**: Python 3.12 (FastAPI, Pydantic v2, psycopg 3); TypeScript 5, React 19

**Primary Dependencies**: one new runtime dependency, `qrcode-generator` (MIT, no dependencies) for the QR matrix (R1); `jsqr` as a dev dependency for the E2E decode (R2)

**Storage**: PostgreSQL 16; new migration `db/migrations/012_receiving_accounts.sql` (data-model.md); a bundled bank list in two equal copies (R3)

**Testing**: pytest on PostgreSQL (access matrix, states, concurrency under the house lock, no-store header, no account data in logs), Vitest (payload fixtures, CRC, independent TLV parser, cleaning pairs shared with pytest, panel states), Playwright (scan-free decode with `jsqr`, no outside request)

**Target Platform**: Render API and static site; phones first

**Project Type**: web application (`app/`, `frontend/`)

**Performance Goals**: the payment read holds the house lock for one balance computation (milliseconds); the hint adds one join to the members list

**Constraints**: constitution I (never moves money, nothing recorded), II (server decides, same-404 order), III (new migration only), VI (44 px, 320 px, 200% zoom, both themes, both languages); spec 014 notice semantics; UX-02 unchanged; the PROJECT_SPEC §3.3 extension approved 09/11

**Scale/Scope**: 4 new endpoints (3 profile, 1 payment), 1 changed (members list); 1 table; about 8 frontend files; 2 PRs

## Constitution Check

| Principle | How this plan meets it | Status |
|---|---|---|
| I. Money is whole đồng | Amounts are integers from the existing balance computation; Q is never rounded; the app records nothing and moves no money (FR-020) | Pass |
| II. Access decided by the server | Payment answers go through `household_access` first, then the live-link member check, then the suggestion (R5); identical 404s by construction; owner gets nothing extra | Pass |
| III. New migration, real PostgreSQL | `012_receiving_accounts.sql`; access and concurrency tests on PostgreSQL | Pass |
| IV. Reviewed PRs, four checks | Two PRs reviewed by Minh; PR-2 updates ARCHITECTURE.md (new endpoints) | Pass |
| V. No secret | No key or service; no network call from the page | Pass |
| VI. Phone, Vietnamese and English | Panel and form in both languages, 44 px, 320 px, 200% zoom, both themes, code on a light background | Pass |
| VII. Quick add | Not touched | Pass |
| Scope | "Payments of any kind" stays out; the narrow extension (save an account, show a code) was approved by the owner on 09/11 and is written into PROJECT_SPEC §3.3 and the constitution's Scope in PR-2 | Pass (approved extension) |

Re-checked after Phase 1 design: unchanged, all pass.

## Project Structure

### Documentation

```text
specs/016-vietqr/
├── spec.md, plan.md, research.md, data-model.md, quickstart.md
├── contracts/api.md, contracts/ui-contract.md
└── checklists/requirements.md
```

### Source Code

```text
db/migrations/012_receiving_accounts.sql          # PR-1
app/data/vietqr_banks.json                        # PR-1 (R3)
app/services/vietqr.py                            # PR-1: bank list, clean_ascii, message, amount and state rules
app/routers/me.py                                 # PR-1: GET/PUT/DELETE /api/me/receiving-account
app/routers/households.py                         # PR-1: the hint in list_members
app/routers/settlements.py                        # PR-1: GET …/members/{id}/payment
app/schemas.py                                    # PR-1: ReceivingAccount, ReceivingHint, PaymentDetails
tests/test_receiving_accounts.py                  # PR-1
tests/test_payment_details.py                     # PR-1 (access matrix, states, locks, headers, logs)
tests/test_vietqr_banks.py                        # PR-1 (two copies equal, BINs unique)

frontend/src/data/vietqr-banks.json               # PR-1
frontend/src/api/types.ts, api/households.ts      # PR-1 (profile calls live here, next to me/photo)
frontend/src/pages/AccountPage.tsx (+ test)       # PR-1: "Tài khoản nhận tiền"
frontend/src/components/MemberList.tsx (+ test)   # PR-1: the hint
frontend/src/components/ReceivingAccountForm.tsx  # PR-1: the profile section
frontend/src/lib/cleanAscii.ts (+ test)           # PR-1: live preview of FR-003
frontend/src/lib/clean-ascii-cases.json           # PR-1: cases shared with pytest
frontend/src/lib/vietqr.ts (+ test)               # PR-2: payload + CRC (R2)
frontend/src/components/QrCode.tsx (+ test)       # PR-2: SVG from qrcode-generator
frontend/src/components/PaymentQrPanel.tsx (+ test) # PR-2: states, refresh, copy, focus
frontend/src/components/VerdictBlock.tsx          # PR-2: [Mở mã QR] in DebtorAction
frontend/src/api/households.ts                    # PR-2: payment query
frontend/src/i18n/vi.tsx, en.tsx, index.css       # both PRs
frontend/e2e/vietqr.spec.ts                       # PR-2
docs/PROJECT_SPEC.md, docs/ACCOUNTS.md, docs/DESIGN.md, docs/ARCHITECTURE.md   # PR-2 (PR-1 adds the API rows it creates)
```

**Structure Decision**: the existing web application layout (`app/` API, `frontend/` SPA, `db/migrations/`, `tests/`, `frontend/e2e/`); no new top-level directory.

## Complexity Tracking

No violations.
