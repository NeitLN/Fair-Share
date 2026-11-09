# Tasks: An invited person knows which house they are joining

**Input**: Design documents from `specs/015-invite-preview/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api.md, contracts/ui-contract.md, quickstart.md

**Tests**: requested by the spec (SC-002, SC-005 and the acceptance scenarios), written before the code they check.

**Organization**: one PR, by user story. Coordinated with spec 012 PR-L (see Dependencies).

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup

- [X] T001 Open a GitHub issue "Invite preview, outcomes and the 10-second check (spec 015)" with US1–US3 as done criteria; branch `feat/015-invite-preview` from `main`

## Phase 2: Foundational

- [X] T002 Write `db/migrations/011_join_outcomes.sql`: table `join_outcomes (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, user_id bigint NOT NULL REFERENCES users (id) ON DELETE CASCADE, household_id bigint NOT NULL, household_name text NOT NULL CHECK (char_length(household_name) <= 60), owner_name text NOT NULL CHECK (char_length(owner_name) <= 40), kind text NOT NULL CHECK (kind IN ('refused', 'house_deleted')), happened_at timestamptz NOT NULL DEFAULT now())`, index `(user_id, happened_at)`, `ENABLE ROW LEVEL SECURITY`; renumber at merge time if spec 014's `010` is not on main yet
- [X] T003 [P] In `app/schemas.py`: `InvitePreviewIn {code}` (same as `JoinIn`), `InvitePreview {house_name, owner_name, member: bool, household_id: int | None}`, `JoinOutcome {id, household_id, household_name, owner_name, kind, happened_at}`, `MyRequests {pending: list[PendingRequest], joined: list[int], outcomes: list[JoinOutcome]}`; `PendingRequest` gains `household_name`, `owner_name`
- [X] T004 [P] A helper `owner_and_name(conn, household_id)` in `app/routers/households.py` returning the house name and the owner's display name (join `household_users` role `owner` to `users`)

## Phase 3: User Story 1 - See the house before asking to join (Priority: P1)

**Goal**: preview on the invite page and the join form; names on waiting cards; J1/J2 kept.

**Independent Test**: a valid link shows the house and owner before sending; the waiting card names them; a wrong code gets today's answer; limits shared.

- [X] T005 [US1] pytest in `tests/test_invites.py` (first, red): a valid code → 200 with the two names and `member` false; a member's own house → `member` true with `household_id`; wrong, expired and revoked codes → bodies, status and headers identical to `/api/join`'s; 5 wrong previews then a join with a wrong code → 429 for both (J2 shared, per account), 20 per address across accounts; 30 previews of a valid code → the 31st is 429 `too_many_previews` while `/api/join` still works; a burst of 10 wrong previews on two connections never gets more than 5 through; signed out → 401
- [X] T006 [US1] Implement `POST /api/invites/preview` in `app/routers/accounts.py` following research R1 (reserve `join-user`, `join-ip`, then `preview-user` 30/min never released; same lookup as join; release J2 on a valid code)
- [X] T007 [US1] In `app/routers/households.py` `list_my_households`: each pending item gains `household_name` and `owner_name` (pending part only; the house rows stay as PR-L has them); pytest in `tests/test_accounts.py`
- [X] T008 [P] [US1] `frontend/src/api/households.ts` and `api/types.ts`: `previewInvite(code)`, the new pending fields; Vitest
- [X] T009 [US1] In `frontend/src/components/JoinForm.tsx`: when the normalized code is complete (rule J1), preview it; show "Lời mời vào {house} của {owner}" in a polite region tied to the field; "Bạn đã ở trong nhà này." with [Mở nhà] when `member`; drop an answer whose code is no longer in the field; no wrong-code hint while typing; Vitest in `JoinForm.test.tsx` (US1 scenarios 1, 2, 4, 5)
- [X] T010 [US1] In `frontend/src/pages/HouseholdsPage.tsx` the waiting card reads "Bạn đang xin vào {house} của {owner}" with the date, and its cancel button names the house; Vitest in `HouseholdsPage.test.tsx`
- [X] T011 [P] [US1] Words in `vi.tsx` and `en.tsx` (`join`, `pending`): `preview`, `alreadyIn`, `openHouse`, `waitingFor`, `cancelFor`

## Phase 4: User Story 2 - Waiting, then in, without reloading (Priority: P1)

**Goal**: outcomes kept for the requester; the 10-second check; "Bạn đã vào".

**Independent Test**: approve from another account → the house appears within about 10 s; refuse → the line stays across reloads and devices until "Đã hiểu".

- [X] T012 [US2] pytest in `tests/test_invites.py` (first, red): reject creates a `refused` outcome with the names as they were; deleting the house creates `house_deleted` outcomes for everyone waiting; a new waiting request to the same house removes the outcome; `GET /api/me/requests` returns only the caller's rows and skips (and removes) outcomes older than 30 days; `DELETE /api/me/outcomes/{id}` of another account → 404; reject and approve on two connections → exactly one stands; cancel then reject → nothing recorded
- [X] T013 [US2] Implement in `app/routers/households.py`: outcome inserted in `reject_request` before the delete, and in `delete_household` for every pending row before the cascade; in `app/routers/accounts.py` `join` removes the caller's outcomes for that house when it inserts a pending row
- [X] T014 [US2] Implement in `app/routers/me.py`: `GET /api/me/requests` (pending with names, joined ids, outcomes ≤ 30 days, older ones deleted) and `DELETE /api/me/outcomes/{id}`
- [X] T015 [US2] Create `frontend/src/lib/useJoinRequests.ts` per research R4: `setTimeout` chain of 10 s while visible and something waits, one check on return to visible, 20 s abort, Retry-After on 429; returns waiting, outcomes and the transitions (approved, refused, deleted, cancelled); on approved invalidate `keys.households` once; Vitest in `useJoinRequests.test.ts` with fake timers: never two checks at once, none in the background, one on return, stop when nothing waits
- [X] T016 [US2] In `HouseholdsPage.tsx`: remove the 30-second `refetchInterval` for pending; use `useJoinRequests`; toast "Bạn đã vào {house}" with [Mở]; outcome lines with [Đã hiểu] (calls the delete); one polite live region written only on transitions; focus moves only when the focused element's card disappears; Vitest (US2 scenarios 2 to 6)
- [X] T017 [P] [US2] In `frontend/src/lib/refresh.ts` comment the 10-second exception for waiting requests
- [X] T018 [P] [US2] Words (`pending`): `joined`, `refused`, `houseGone`, `gotIt` "Đã hiểu"

## Phase 5: User Story 3 - No second house by mistake (Priority: P2)

**Goal**: no create form while an invite is in progress; it comes back when the invite ends.

**Independent Test**: sign up from a link: no create form before or after sending; refuse: the form is back.

- [X] T019 [US3] In `HouseholdsPage.tsx`: "invite in progress" per research R5; while in progress with no house, hide `HouseholdCreateForm` and show a "Tạo nhà khác" link that opens it; a refusal, a cancellation or a deleted house ends it; Vitest (US3 scenarios 1 to 4); word `createAnyway` "Tạo nhà khác"

## Phase 6: Polish

- [X] T020 [P] In `frontend/src/components/InviteCard.tsx` the hint "Ai có mã này sẽ thấy tên nhà và tên trưởng nhóm." (both languages); Vitest
- [X] T021 Docs: `docs/ACCOUNTS.md` D4 (what a code holder and a waiting person see, the outcome line) and J2 (previews count; the 30-a-minute preview cap); `docs/DESIGN.md` §6.1 (preview, waiting card, outcomes, start page); `docs/ARCHITECTURE.md` API table
- [X] T022 E2E `frontend/e2e/invite.spec.ts` (shared accounts for Tiến; the invited person is a fresh account only where the start page must have no house): the preview names the house; approve from Tiến's context and see the house appear without reload; refuse and see the line until "Đã hiểu"
- [X] T023 Accessibility at 320 px and 200% zoom; quickstart by hand; screenshots at 360 and 1440 px in the PR; after merge, the live E2E run green

## Dependencies & Execution Order

- T002 → T003/T004 → US1 (T005 red → T006, T007 → T008 → T009, T010) → US2 (T012 red → T013, T014 → T015 → T016) → US3 (T019) → polish.
- Spec 012 PR-L touches `list_my_households`, `schemas.py`, `api/types.ts`, `HouseholdsPage.tsx`, translations and `index.css`. Whichever merges second rebases and runs both test sets; this spec changes only the pending part and the start page, never the house rows or their summaries.
- Spec 014 adds migration `010`; this one is `011` (renumbered if it merges first).

## Parallel Opportunities

- T003 and T004; T008 and T011 alongside T006–T007; T017, T018 and T020 at any time.

## Implementation Strategy

US1 alone already answers "which house is this?"; US2 removes the silent refusal and the 30-second wait; US3 stops the empty second house.
