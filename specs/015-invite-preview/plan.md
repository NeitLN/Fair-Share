# Implementation Plan: An invited person knows which house they are joining

**Branch**: `spec/015-invite-preview` | **Date**: 2026-11-08 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/015-invite-preview/spec.md`

## Summary

A signed-in person can preview a valid code (house name, owner's display name, whether they are already in it)
through a new endpoint that shares the J2 guessing buckets and has its own 30-a-minute cap. Waiting cards carry the
same two names. A new table keeps, for the requester only, what happened when a request was refused or its house
deleted. A light endpoint answers, for the signed-in person, which requests still wait, which houses they are in, and
their outcomes; the house page asks it every 10 seconds while a request waits and the page is in front. The start
page hides the create form while an invite is in progress. One PR.

## Technical Context

**Language/Version**: Python 3.12 (FastAPI, Pydantic v2, psycopg 3); TypeScript 5, React 19

**Primary Dependencies**: no new dependency

**Storage**: PostgreSQL 16; one new migration `db/migrations/011_join_outcomes.sql` (renumbered at merge time if
spec 014's `010` has not landed first, so numbers stay in merge order)

**Testing**: pytest on PostgreSQL, Vitest with fake timers, Playwright (shared accounts)

**Target Platform**: Render API and static site; phones first

**Project Type**: web application (`app/`, `frontend/`)

**Performance Goals**: the 10-second check reads only the caller's rows (`household_users` by user, the outcomes by
user), no balances; at most one check in flight per page

**Constraints**: constitution II (server decides, per account), III (new migration only), VI (phone, both languages);
rules J1/J2/J3 kept; spec 012 PR-L owns the house rows and their summaries

**Scale/Scope**: 3 new endpoints, 2 changed (reject, delete household; join clears outcomes), 1 table; about 5
frontend files

## Constitution Check

| Principle | How this plan meets it | Status |
|---|---|---|
| I. Money | Nothing about money is read or shown by the new endpoints | Pass |
| II. Access per account, decided by the server | Preview needs a session; it discloses two names only for a valid code; outcomes readable and dismissible only by their owner; A5 unchanged | Pass |
| III. New migration, real PostgreSQL | `011_join_outcomes.sql`; races (approve vs reject vs cancel) tested on two connections | Pass |
| IV. Reviewed PR, four checks | One PR, reviewed by Minh | Pass |
| V. No secret | none | Pass |
| VI. Phone, Vietnamese and English | lines wrap at 320 px, 44 px controls, both languages | Pass |
| VII. Quick add | not touched | Pass |

## Project Structure

### Documentation

```text
specs/015-invite-preview/
├── spec.md, plan.md, research.md, data-model.md, quickstart.md
├── contracts/api.md, contracts/ui-contract.md
├── checklists/requirements.md
└── tasks.md
```

### Source Code

```text
db/migrations/011_join_outcomes.sql           # join_outcomes (new)
app/schemas.py                                # InvitePreview, MyRequests, JoinOutcome; PendingRequest gains names
app/routers/accounts.py                       # POST /api/invites/preview (shares J2 buckets), join clears outcomes
app/routers/households.py                     # reject and delete write outcomes; pending carries names
app/routers/me.py                             # GET /api/me/requests, DELETE /api/me/outcomes/{id}
tests/test_invites.py (new), tests/test_join.py or test_accounts.py
frontend/src/api/households.ts, api/types.ts
frontend/src/lib/useJoinRequests.ts           # the 10-second check (new)
frontend/src/components/JoinForm.tsx          # preview line
frontend/src/pages/HouseholdsPage.tsx         # waiting cards, outcome lines, start page
frontend/src/components/InviteCard.tsx        # the hint where codes are shared
frontend/src/lib/refresh.ts                   # comment: the 10-second exception
frontend/src/i18n/vi.tsx, en.tsx              # join, pending, start groups
docs/ACCOUNTS.md (D4, J2), docs/DESIGN.md (§6.1), docs/ARCHITECTURE.md (API table)
```

**Structure Decision**: existing layout. Files shared with spec 012 PR-L: `households.py` (`list_my_households`),
`schemas.py`, `api/types.ts`, `HouseholdsPage.tsx`, translations, `index.css`. This plan adds fields to the pending
part only and leaves the house rows to PR-L; the second PR to merge rebases and runs both test sets.

## Complexity Tracking

None.
