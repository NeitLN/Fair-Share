# Implementation Plan: Profile page

**Branch**: `feat/profile-page` (one branch per PR: `feat/profile-name-password`, `feat/profile-status`,
`feat/profile-photo`, `feat/profile-gender`) | **Date**: 2026-11-08 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/010-profile-page/spec.md`

## Summary

A new page `/account`, linked from the account menu, with one form per part, delivered in four PRs.
PR1 adds `PATCH /api/me` (rename the display name and the caller's name in every household in one
transaction, a taken name kept per household via savepoints) and `POST /api/me/password` (current
password checked against the login rate limits, new hash and the end of every other session under the
user row lock; login re-checks the hash under the same lock, closing the race). PR2 adds `users.status`
and shows it on Thành viên. PR3 adds `user_photos`, a Pillow-based check that accepts only a small picture
and re-saves it as a clean 256 × 256 JPEG, a storage ceiling and upload limits, and one authenticated
batch per household that feeds every avatar through `memberLooks`. PR4 adds an optional gender kept
together with the notice shown. Profile fields join through the live `household_users` link only, so
pending, departed and old names never expose anything.

## Technical Context

**Language/Version**: Python 3.12 (FastAPI, Pydantic v2, psycopg 3); TypeScript 5, React 19

**Primary Dependencies**: Pillow (new, PR3 only, in `requirements.txt`); nothing new in the SPA

**Storage**: PostgreSQL 16: `users.status` (PR2), `user_photos` (PR3), `users.gender*` (PR4); see
[data-model.md](data-model.md)

**Testing**: pytest on real PostgreSQL: `tests/test_profile.py` (PR1), `tests/test_status.py` (PR2),
`tests/test_photos.py` and `tests/test_images.py` (pure checks of the image module, PR3),
`tests/test_gender.py` (PR4), each with its part of the access matrix. Vitest: `AccountPage.test.tsx`,
`Avatar.test.tsx` (photo, fallback on error), `MemberList.test.tsx` (status, gender label),
`photoCrop.test.ts` (square maths; canvas mocked), `client.test.ts` (400 `wrong_password` does not sign
out). Playwright on the local stack: `e2e/profile.spec.ts` (rename + password in two contexts; PR3 adds a
photo upload with a fixture image) and the existing `a11y.spec.ts` gains `/account`.

**Target Platform**: Render (API Docker, static SPA), Supabase free PostgreSQL; phones first for this page

**Project Type**: web application (API + SPA)

**Performance Goals**: SC-003: one extra request and ≤ 360 KiB for photos of eight members; nothing
waits for photos. Image work bounded to two at a time.

**Constraints**: cost zero (free tiers); 64 KiB body limit unchanged; no new polling; constitution II
(server decides access), III (new migrations only), VI (phone, 44 px, both languages); spec FR-021 to
FR-023 exact limits

**Scale/Scope**: about 4 endpoints in a new `app/routers/me.py`, `app/services/images.py` (PR3), changes
to `accounts.py` (login race), `households.py` (members query), `schemas.py`; SPA: `AccountPage.tsx`,
`AccountMenu.tsx`, `Avatar.tsx`, `names.ts`, `HouseholdLayout.tsx`, `MemberList.tsx`, `api/*`, about 40
strings per language over the four PRs; docs ACCOUNTS, DESIGN, ARCHITECTURE, and in PR3 PROJECT_SPEC §3.3
and the constitution's Scope

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | How this feature meets it | Status |
|---|---|---|
| I. Money in whole đồng | No money changes; renames keep member ids, so expenses and balances are untouched | Pass |
| II. Access by the server | Every route needs a session; household data goes through `find_access`; profile fields only via owner/member `household_users` rows; photos only through authenticated requests, checked each time | Pass |
| III. Migrations, real PostgreSQL | 007/008/009 are new files; all new tests run on PostgreSQL | Pass |
| IV. Reviewed PRs, four green checks | Four PRs, each reviewed by Minh or Duy Anh | Pass |
| V. No secret in the repo | No new secret; Pillow is a public package | Pass |
| VI. For phones, Vietnamese | 360 px, 44 px controls, 16 px inputs, 200% zoom, vi + en strings, a11y spec covers `/account` | Pass |
| VII. Quick add | Untouched | Pass |
| Scope (§3.3: images out of scope) | **Extension needed**: profile photos with a narrow server check. PR3 records it in PROJECT_SPEC.md §3.3 and the constitution's Scope ("Approved extensions"), owner's approval of 07/11; receipts and other images stay out | Justified, see Complexity Tracking |
| Cost is zero | Photos ≤ 32 KiB each, ≤ 50 MB total, in the existing database | Pass |

Re-check after Phase 1: unchanged. The design adds no polling, no new service, and keeps the body limit.

## Project Structure

### Documentation (this feature)

```text
specs/010-profile-page/
├── plan.md              # this file
├── research.md          # R1–R9 decisions
├── data-model.md        # migrations per PR, derived member fields
├── quickstart.md        # automated + by hand + live checks
├── contracts/
│   ├── api.md           # endpoints per PR
│   └── ui-contract.md   # page, sections, avatar places, strings
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
app/
├── routers/me.py            # NEW: PATCH /api/me, POST /api/me/password, PUT status, photo, gender
├── routers/accounts.py      # login: re-check the hash under the row lock (PR1)
├── routers/households.py    # SELECT_MEMBERS joins users (+ user_photos); GET /households/{id}/photos (PR3)
├── services/images.py       # NEW (PR3): check + re-save one small picture
├── schemas.py               # MeIn, PasswordIn, StatusIn, GenderIn, RenameResult, Member fields
└── main.py                  # include me.router
db/migrations/007_user_status.sql, 008_user_photos.sql, 009_user_gender.sql
tests/test_profile.py, test_status.py, test_photos.py, test_images.py, test_gender.py

frontend/src/
├── pages/AccountPage.tsx    # NEW: sections per PR
├── components/AccountMenu.tsx   # link to /account
├── components/Avatar.tsx    # photo variant with fallback
├── components/MemberList.tsx    # status, gender label
├── lib/names.ts             # MemberLook.photo
├── lib/photoCrop.ts         # NEW (PR3): orientation + centre square + JPEG blob
├── pages/HouseholdLayout.tsx    # photos query, looks with photos
├── api/{client,endpoints,types}.ts
└── i18n/{vi,en}.tsx
e2e/profile.spec.ts          # NEW
```

**Structure Decision**: same layout as every earlier feature: a router per concern, pure services for
logic worth testing alone (`images.py`), one page component with its sections.

## Delivery and review

| PR | Stories | Migration | Docs in the same PR |
|---|---|---|---|
| PR1 `feat/profile-name-password` | US1, US2 | none | ACCOUNTS (rules, rights row "Change your own name and password"), DESIGN (profile page), ARCHITECTURE (`/api/me`, login race) |
| PR2 `feat/profile-status` | US3 | 007 | ACCOUNTS (status visibility), DESIGN (status in member rows) |
| PR3 `feat/profile-photo` | US4 | 008 | ACCOUNTS (photo rules, "Limits we accept": no review), DESIGN (photo avatar), ARCHITECTURE (images, batch, ceiling), PROJECT_SPEC §3.3 + constitution Scope |
| PR4 `feat/profile-gender` | US5 | 009 | ACCOUNTS (gender, notice), DESIGN (label) |

Each PR: issue first, branch from `main`, commit as Võ Việt Tiến, push as NeitLN, Minh and Duy Anh as
reviewers, local E2E before asking for review, live check after deploy (quickstart).

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| Profile photos although §3.3 puts images out of scope | The project owner asked for photos on 07/11 | Keeping initials only does not meet the owner's request; drawings instead of photos were the old draft's answer and were replaced |
| Server-side decoding and re-encoding (the brief warns against image processing) | A direct caller can send spoofed types, GPS data or decompression bombs; re-encoding is what removes them | Trusting the browser's crop, or magic-byte checks alone, keep metadata and hidden content (review B2) |
| New dependency (Pillow) | Safe bounded decoding and JPEG re-encoding | Writing a decoder is out of the question; storing unchecked bytes fails FR-021 |
