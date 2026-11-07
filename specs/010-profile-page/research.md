# Research: Profile page

Decisions behind [plan.md](plan.md). Facts about the current code are checked against `main` at 69718eb.

## R1. Where profile data lives

- **Decision**: on the account. `users` gains `status` (PR2) and `gender`, `gender_notice`,
  `gender_set_at` (PR4); photos get their own table `user_photos (user_id PK, image bytea, version,
  updated_at)` (PR3), so ordinary account reads (`user_for_token`, `/auth/me`) never load picture bytes.
- **Rationale**: a profile belongs to a person, not to a historical name. `members ← household_users →
  users` already links a name to its account, and leaving or losing access deletes the `household_users`
  row while keeping the `members` row for the money history (003_accounts.sql). Joining profile fields
  through that live link gives FR-031 for free: a person who left A has no profile in A's rows, a pending
  person has `member_id IS NULL` and never matches a name, and an account that takes over an old name
  later brings its own profile, not someone else's.
- **Alternatives**: columns on `members` (rejected: one person would have one status per household and a
  departed person's photo would stay in the history); Supabase Storage (rejected: our sign-in is not
  Supabase Auth, so every read would still go through the API to check membership, plus a second service
  to run in Compose and CI).

## R2. Getting photos to the browser

- **Decision**: the members response carries `photo_version` (or null) per name with an account. The
  household page asks once for `GET /api/households/{id}/photos`, which returns every current member's
  photo as `data:image/jpeg;base64,...` with its version, `Cache-Control: no-store`. The SPA keeps it in
  the TanStack Query cache under `['photos', householdId, versionsKey]`, where `versionsKey` joins the
  versions in member order; a change in any version (or in who is a member) makes a new key and one new
  batch. `/api/me/photo` returns the caller's own photo for the profile page, which works with no
  household.
- **Rationale**: `<img src>` cannot send the Bearer token (ACCOUNTS.md D2: no cookie), and any URL that
  works without it breaks FR-026. One batch keeps SC-003 (one extra request; 8 × 32 KiB × 4/3 ≈ 342 KiB
  of base64 at worst, under 360 KiB). Data URLs need no object-URL bookkeeping, and the cache is already
  cleared at logout (`AccountMenu`) and sign-in (`AuthPage`), so a switched account never sees the old
  photos.
- **Alternatives**: one authenticated request per person into blob URLs (more requests, URL revocation);
  signed URLs (whoever has the URL sees the photo until it expires, even after leaving).

## R3. Checking pictures on the server (the narrow exception)

- **Decision**: Pillow, added to `requirements.txt`. `PUT /api/me/photo` takes the raw bytes
  (`Content-Type: image/jpeg|png|webp`) within the existing 64 KiB body limit (`app/limits.py`, not
  raised). The server: reserves the rate limits; checks magic bytes against the declared type; opens the
  image lazily and refuses it unless its format is JPEG/PNG/WEBP, its size is at most 512 × 512 and it has
  one frame; only then decodes, applies the EXIF orientation, crops the centre square, resizes to 256 ×
  256, and saves a new JPEG with no metadata (quality 85, lowered in steps until it is at most 32 KiB).
  Decoding runs under a process-wide semaphore of 2 (a third upload waits at most 5 s, then gets 503
  `busy`), so a burst cannot take the free instance's memory.
- **Rationale**: the browser crops and shrinks the picture for a good preview, but a direct caller can
  send anything (spoofed type, GPS data, a small file that decodes huge). Checking the declared size
  before decoding stops decompression bombs; re-encoding is what removes metadata and hidden content.
  This is the "narrow, documented exception" agreed in review; the constitution's Scope and PROJECT_SPEC
  §3.3 are updated in PR3.
- **Alternatives**: trust the browser's JPEG (rejected: FR-021); magic-byte checks only (rejected: keeps
  EXIF and anything appended).

## R4. Storage ceiling and upload limits

- **Decision**: in the same transaction as the write, take `pg_advisory_xact_lock(hashtext('photos'))`,
  sum `octet_length(image)` of the other accounts' photos, and refuse with 507 `photo_storage_full` when
  that sum plus the new image would pass 52 428 800 bytes. Uploads reserve `photo-user:{id}` (10 per hour)
  and `photo-ip:{ip}` (30 per hour) in `rate_limits` before any decoding; a refused or failed upload keeps
  its count (like a wrong password) so failures cannot be used to burn CPU for free.
- **Rationale**: the lock makes two uploads at the same moment see each other's bytes; at ≤ 32 KiB a
  photo, the ceiling is about 1 600 photos and the sum stays cheap. One row per account, updated in place,
  so nothing accumulates.
- **Alternatives**: a running total in a counter row (one more thing that can drift); no ceiling
  (rejected: registration is open and emails are not verified).

## R5. Password change and the sign-in race

- **Decision**: `POST /api/me/password`. Reserve the login buckets for the account's email and the
  address (same windows and limits as `/auth/login`); verify the current password outside any transaction
  (argon2 is slow); then in one transaction lock the user row (`SELECT … FOR UPDATE`), check the stored
  hash is still the one just verified (else answer as a wrong password, so a double tap cannot apply
  twice), write the new hash, and delete every session of the account except the caller's. Login's last
  step changes the same way: inside a transaction it locks the user row and checks the stored hash is the
  one it verified before opening a session; if the password changed in between, it answers 401
  `invalid_credentials`.
- **Rationale**: today login verifies outside any transaction and opens the session later
  (`app/routers/accounts.py`), so a login that verified the old password could open a session after the
  change deleted the others (review B3). With both steps under the row lock, either the login's session
  exists before the change (and is deleted by it) or the login sees the new hash and is refused.
- **Wrong current password**: 400 `wrong_password`, never 401, because `api/client.ts` signs out on any
  401 outside the sign-in routes; it keeps the attempt counted. Success releases both buckets, as login
  does.

## R6. Rename everywhere

- **Decision**: `PATCH /api/me {display_name}`. One transaction: lock the user row; update
  `users.display_name`; for each `household_users` row of the caller with role owner or member (ordered by
  household id, to lock in a fixed order), run `UPDATE members SET name = … WHERE id = member_id` inside a
  savepoint (`with conn.transaction()` nested); a `UniqueViolation` on `members_household_name_key` rolls
  back that savepoint only and records `{household_id, household_name, kept_name}`. Any other error ends
  the whole transaction. Saving the same name runs the same loop, so household names drift back in line
  (FR-006).
- **Rationale**: a unique violation aborts a PostgreSQL transaction unless it happened inside a savepoint;
  the savepoint makes the expected conflict a skip and keeps FR-010 for everything else. Row locks on the
  member rows serialise a concurrent owner rename.

## R7. Status text

- **Decision**: `PUT /api/me/status {status: string | null}`; the schema reuses the member-name cleaning
  (NFC, no control characters) with a 60 limit, also removes bidi controls (U+202A–U+202E, U+2066–U+2069),
  and treats an empty or spaces-only value as null. PostgreSQL `char_length` counts code points, so the
  `CHECK (char_length(status) BETWEEN 1 AND 60)` matches Python's `len`; the page counts with
  `[...text].length` (code points), not `text.length` (UTF-16 units). Rendered as a React text node only.

## R8. Gender with its notice

- **Decision**: `PUT /api/me/gender {gender: "male" | "female" | "other" | null, notice: "2026-11-v1"}`.
  A value stores `gender`, `gender_notice` and `gender_set_at` together; null clears all three (CHECK:
  all null or all set). The notice version is a constant in the SPA and the server; a different version
  is refused (422) so a stale page cannot record consent to text it did not show.
- **Rationale**: FR-029 asks for the choice and the notice shown to be kept together and deleted together.

## R9. What does not change

- No new polling (constitution, narrow refresh): members are fetched when a household opens, and on the
  person's own save the SPA invalidates `members` and `photos` for every household it has cached.
- Avatars: `MemberLook` gains `photo?: string`; `Avatar` shows an `<img alt="">` inside the same circle
  (ring, shadow, sizes, `decorative` and `aria-label` unchanged) and falls back to the initial on error.
  Every avatar in the app gets its look from `memberLooks` in `HouseholdLayout`, so one change covers all
  of them (list in plan.md); `AuthPage`'s sample avatars keep building their own looks.
