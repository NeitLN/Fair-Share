# Research: An invited person knows which house they are joining

## R1. Preview endpoint and limits (FR-001 to FR-005)

- **Fact**: `POST /api/join` reserves the J2 buckets (`join-user:{id}` 5/min, `join-ip:{ip}` 20/min) before looking at
  the code, releases them when the code is right, and answers 404 `invalid_code` the same way for wrong, expired and
  revoked codes.
- **Decision**: `POST /api/invites/preview {code}` (a POST keeps the code out of URLs and logs) reserves the same two
  buckets and a third, `preview-user:{id}` 30/min, which is never released. Order: J2 buckets first; if they refuse,
  429 as join does; then the preview bucket (429 `too_many_previews` with Retry-After); then one lookup with the same
  query as join. Valid: release the J2 buckets, answer `{household_id, house_name, owner_name, member}` (`household_id`
  only when `member` is true). Invalid: the same `invalid_code` answer as join. The work for an invalid code is the
  same query whatever exists, so timing gives nothing extra.
- **Alternatives**: `GET /api/invites/{code}` (code in access logs); a separate preview budget for guesses (would
  double the guesses an attacker gets).

## R2. Names on waiting cards (FR-006)

- **Decision**: `list_my_households` adds to each pending row `household_name` and `owner_name` (the display name of
  the `owner` row of `household_users` joined to `users`). Only the pending part changes; the house rows stay PR-L's.

## R3. Outcomes (FR-009, FR-010)

- **Decision**: table `join_outcomes` (data-model.md). `reject_request` inserts the outcome then deletes the
  membership row in its transaction (it already locks the request `FOR UPDATE`). `delete_household` inserts one
  outcome per `pending` row before the cascade. `join` deletes the caller's outcomes for that household when it
  inserts a `pending` row. Reads skip rows older than 30 days and delete them on the way.
- **Alternatives**: keep a `refused` role in `household_users` (dies with the household; mixes with access rules).

## R4. The check (FR-007, FR-008)

- **Decision**: `GET /api/me/requests` → `{pending: [...], joined: [household_id...], outcomes: [...]}`: only the
  caller's own rows, no balances. The page tracks the household ids it saw waiting; for each: still in `pending` →
  waiting; in `joined` → approved (invalidate the house list once, toast "Bạn đã vào {house}"); in `outcomes` → refused
  or deleted; none of them → cancelled (card goes silently). `useJoinRequests` runs a `setTimeout` chain (never two
  at once), 10 s while `document.visibilityState === 'visible'` and something waits, one check on `visibilitychange`
  to visible, an `AbortController` timeout of 20 s, Retry-After respected on 429, 401 handled by the client as
  everywhere. The existing 30-second `refetchInterval` on the house list for pending requests is removed.
- **Alternatives**: polling the house list faster (reads balances once PR-L lands); server-sent events (Render free
  tier sleeps; more moving parts).

## R5. Start page (FR-012)

- **Fact**: `HouseholdsPage` reads `linkCode` from `/join/:code`; `none` = no house and no pending, showing both ways
  to start.
- **Decision**: "invite in progress" = (a valid preview for `linkCode` and no outcome or cancellation for that house
  since) or any pending request. While in progress and no house: hide `HouseholdCreateForm`, show a "Tạo nhà khác"
  link that opens it. An outcome or a cancellation for that house ends it.

## R6. Accessibility (FR-014)

- **Decision**: one polite live region per page for outcomes, written only on a state change; the preview line has
  its own polite region tied to the code field (`aria-describedby`); focus moves only if the focused element was in a
  card that disappeared (to its replacement line, else the join field).
