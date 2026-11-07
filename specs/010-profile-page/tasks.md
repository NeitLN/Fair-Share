# Tasks: Profile page

**Input**: Design documents from `/specs/010-profile-page/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api.md, contracts/ui-contract.md,
quickstart.md

**Tests**: included. The project writes tests with every change (constitution III, IV) and the spec's
SC-005 to SC-007 are proven by tests (race, rate limits, access matrix).

**Organization**: by user story, in the spec's order. Delivery: PR1 = Phase 1–4 (US1 + US2), PR2 = Phase 5
(US3), PR3 = Phase 6 (US4), PR4 = Phase 7 (US5); Phase 8 runs in every PR for the parts it touches.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: US1 … US5 from spec.md

## Phase 1: Setup (PR1)

- [X] T001 Open the GitHub issue for PR1 ("Profile page: rename everywhere and change password", linking specs/010-profile-page) and create branch `feat/profile-name-password` from `main`; keep `specs/001-account-settings/` uncommitted (superseded by this spec)
- [X] T002 [P] Add the shared i18n keys for the page shell (`account.title` "Hồ sơ của bạn"/"Your profile", `account.email`, `account.save`, `account.saved`, `menu.profile`) in frontend/src/i18n/vi.tsx and frontend/src/i18n/en.tsx

---

## Phase 2: Foundational (PR1, blocks every story)

- [X] T003 Create `app/routers/me.py` with `router = APIRouter(prefix="/api", tags=["me"])` and every route requiring `CurrentUser` (401 `not_authenticated` without a session); include it in app/main.py
- [X] T004 [P] Add `frontend/src/pages/AccountPage.tsx`: signed-in only (redirect to sign-in and back like other private routes), email read-only at the top, an empty list of sections each meant to be its own `<form>` (FR-004); route `/account` in the router (frontend/src/App.tsx)
- [X] T005 [P] Add the "Hồ sơ của bạn" link to frontend/src/components/AccountMenu.tsx, pointing at `/account`, 44 px target
- [X] T006 [P] Vitest: AccountPage shows the email read-only and is reachable from the menu, signed-out visitors are sent to sign in, in frontend/src/pages/AccountPage.test.tsx and frontend/src/components/AccountMenu.test.tsx

**Checkpoint**: `/account` opens from the menu with the email; no section yet.

---

## Phase 3: User Story 1 - Change my name everywhere at once (P1, PR1) 🎯 MVP

**Goal**: one save renames the display name and the caller's name in every household, keeping a taken name per household and reporting it.

**Independent Test**: account in two households; rename; both show it; repeat with a name taken in one household; that one is listed as kept.

### Tests for User Story 1

- [X] T007 [P] [US1] pytest in tests/test_profile.py: rename changes `users.display_name` and the linked `members.name` in an owned and a joined household; `kept` lists `{household_id, household_name, name}` where another name equals the new one ignoring case (with and without an account, and a name from before accounts); a pending household (role `pending`, `member_id IS NULL`) is untouched and not listed; "LAN" over "Lan" is accepted; saving the same display name after an owner rename brings that household back in line; empty, spaces-only and 41-character names give 422 and change nothing; an unexpected failure mid-way (monkeypatched) rolls back the display name and every household; member ids, expenses and settlements unchanged

### Implementation for User Story 1

- [X] T008 [US1] Add `MeIn {display_name: DisplayName}` and `RenameResult {user: User, kept: list[KeptName]}` (`KeptName {household_id, household_name, name}`) in app/schemas.py
- [X] T009 [US1] Implement `PATCH /api/me` in app/routers/me.py per research R6: one transaction; `SELECT … FROM users WHERE id = %s FOR UPDATE`; update `display_name`; for each `household_users` row of the caller with role in ('owner','member') ordered by `household_id`, `UPDATE members SET name = %s WHERE id = member_id` inside a nested `conn.transaction()` savepoint; on `errors.UniqueViolation` from `members_household_name_key` record the kept name and continue; any other error ends the transaction
- [X] T010 [P] [US1] Add `api.updateMe(display_name)` and the `RenameResult` type in frontend/src/api/endpoints.ts and frontend/src/api/types.ts
- [X] T011 [US1] Name section in frontend/src/pages/AccountPage.tsx: field prefilled with the display name, Lưu disabled while unchanged, field errors next to it (FR-036), result line "Đã đổi tên ở mọi nhà." or one line per kept household (ui-contract), then invalidate `auth/me` and every cached `members` query; strings in vi.tsx/en.tsx
- [X] T012 [P] [US1] Vitest in frontend/src/pages/AccountPage.test.tsx: rename success line, kept-household lines, 422 message next to the field keeps the typed name, queries invalidated

**Checkpoint**: US1 works on its own (rename everywhere with the conflict report).

---

## Phase 4: User Story 2 - Change my password (P2, PR1)

**Goal**: change the password with the current one; every other session ends; the race with a sign-in is closed.

**Independent Test**: two browsers; change in one; the other is out; old password refused; new one works.

### Tests for User Story 2

- [X] T013 [P] [US2] pytest in tests/test_profile.py: success returns 204, the caller's session still works, another session of the account gets 401, the old password fails at login and the new one works; wrong current password gives 400 `wrong_password` (not 401) and nothing changes; a new password of 7 or 129 characters gives 422 and is not counted; wrong current passwords and wrong login passwords share `login-email:{email}` (5) and `login-ip:{ip}` (20) and reach 429 `too_many_attempts` at the same counts as login alone; a second change with the old current password after the first succeeded is answered as a wrong password; the race: a login that verified the old password and reaches its last step after the change commits gets 401 `invalid_credentials` and no session (simulate by patching `password_matches` to run the change in between)
- [X] T014 [P] [US2] Vitest in frontend/src/api/client.test.ts: a 400 `wrong_password` from `/api/me/password` does not sign out; a 401 still does

### Implementation for User Story 2

- [X] T015 [US2] Add `PasswordIn {current_password, new_password}` (new: 8 to 128 characters, as `RegisterIn`) in app/schemas.py and a `wrong_password()` ApiError (400) in app/auth.py
- [X] T016 [US2] Implement `POST /api/me/password` in app/routers/me.py per research R5: reserve the login buckets for the caller's email and address before checking; verify the current password outside any transaction; then one transaction: lock the user row, check the stored hash is still the verified one (else `wrong_password`), write `hash_password(new)`, `DELETE FROM sessions WHERE user_id = %s AND token_hash <> %s`; release both buckets on success
- [X] T017 [US2] Change the last step of `login` in app/routers/accounts.py: inside a transaction lock the user row and compare the stored hash with the one verified; if it changed answer `invalid_credentials()` without opening a session; keep the rehash and the bucket release
- [X] T018 [P] [US2] Add `api.changePassword(current, next)` in frontend/src/api/endpoints.ts
- [X] T019 [US2] Password section in frontend/src/pages/AccountPage.tsx: current and new fields (`type=password`, autocomplete `current-password`/`new-password`, length hint), cleared after any answer; `wrong_password` under the current field, 429 seconds at the top of the section, success line "Đã đổi mật khẩu. Các nơi khác đã đăng xuất."; strings in vi.tsx/en.tsx
- [X] T020 [P] [US2] Vitest in frontend/src/pages/AccountPage.test.tsx: wrong password message, wait seconds, success clears both fields
- [X] T021 [US2] Playwright e2e/profile.spec.ts on the local stack: two browser contexts of one account; rename with a taken name shows the kept household; change the password in context A; context B is signed out at its next click; login with the old password fails; add `/account` to e2e/a11y.spec.ts

**Checkpoint**: PR1 complete: US1 + US2 + docs (T046–T048). Open PR1.

---

## Phase 5: User Story 3 - Show a short status to my housemates (P3, PR2)

**Goal**: a plain-text status, 1 to 60 code points, shown under the name on Thành viên.

**Independent Test**: set a status; housemates see it after reload; clear it; gone.

- [ ] T022 [US3] Issue + branch `feat/profile-status` from `main`; migration db/migrations/007_user_status.sql: `ALTER TABLE users ADD COLUMN status text NULL CHECK (char_length(status) BETWEEN 1 AND 60)`
- [ ] T023 [P] [US3] pytest in tests/test_status.py: set, change, clear (null and spaces-only); 61 code points refused, 60 emoji accepted; bidi controls U+202A–U+202E and U+2066–U+2069 removed; line break refused; markup stored as text; `/auth/me` carries it; access matrix for `status` in the members response (housemate sees; stranger 404; pending applicant's request has no status even when sharing another household; a person who left A shows null in A and their status in B; a name from before accounts and an account that later takes it over show only the new account's status)
- [ ] T024 [US3] `StatusIn {status: str | None}` with the name cleaning, bidi removal, empty → None, max 60 in app/schemas.py; `User` and `Member` gain `status: str | None`; `PUT /api/me/status` in app/routers/me.py; `/auth/me` and login select `status`
- [ ] T025 [US3] Join profile fields in `SELECT_MEMBERS` (app/routers/households.py): `LEFT JOIN users u ON u.id = hu.user_id`, selecting `CASE WHEN hu.role IN ('owner','member') THEN u.status END AS status`; never select email or hash
- [ ] T026 [P] [US3] Frontend: `api.setStatus`, `Member.status` types; status section in frontend/src/pages/AccountPage.tsx (one line, counter with `[...text].length`, Xoá); status line under the name in frontend/src/components/MemberList.tsx (plain text, one line with ellipsis, full text in `title`); strings in vi.tsx/en.tsx
- [ ] T027 [P] [US3] Vitest: AccountPage status counter counts an emoji once, Xoá clears; MemberList renders `<a href>`-looking or `<b>` text as plain text, in frontend/src/pages/AccountPage.test.tsx and frontend/src/components/MemberList.test.tsx

**Checkpoint**: PR2 complete with its docs (T046–T047). Open PR2.

---

## Phase 6: User Story 4 - Put my photo on my avatar (P4, PR3)

**Goal**: a checked 256 × 256 photo on every avatar of the person in their households, delivered only to signed-in housemates, within the size, rate and storage limits.

**Independent Test**: upload; housemates in two households see it on every avatar after reload; remove; initials back; a stranger cannot get it.

### Tests for User Story 4

- [ ] T028 [P] [US4] Pure tests in tests/test_images.py for app/services/images.py: JPEG, PNG and WebP up to 512 × 512 accepted and returned as a 256 × 256 JPEG of at most 32 768 bytes; a photo with EXIF GPS and orientation 6 comes back upright with no EXIF; SVG, a text file named .jpg, declared type disagreeing with magic bytes, 600 × 600, an animated WebP/PNG with two frames, a truncated file: all refused as `unsupported_image`; the size check happens before decoding (a 512 × 20 000 header is refused without loading)
- [ ] T029 [P] [US4] pytest in tests/test_photos.py: `PUT /api/me/photo` stores one row and returns a 12-hex version; a second upload replaces it (one row); `DELETE` removes it (204 also when none); a body over 64 KiB is 413; the 11th upload in an hour for an account and the 31st for an address are 429 `too_many_attempts`, failed uploads stay counted; the ceiling (monkeypatched low) gives 507 `photo_storage_full` and leaves the old photo; `GET /api/me/photo` works with no household; `GET /api/households/{id}/photos` returns `data:image/jpeg;base64,` entries with `Cache-Control: no-store`; access matrix: housemate yes, stranger 404, pending 404, removed viewer 404, departed subject absent from A but present in B, old name taken over shows no earlier photo; `Member.photo_version` follows the same rules

### Implementation for User Story 4

- [ ] T030 [US4] Issue + branch `feat/profile-photo` from `main`; add Pillow (pinned, with a published wheel for Python 3.12 on linux/amd64) to requirements.txt; migration db/migrations/008_user_photos.sql: `user_photos (user_id bigint PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE, image bytea NOT NULL CHECK (octet_length(image) <= 32768), version text NOT NULL CHECK (char_length(version) = 12), updated_at timestamptz NOT NULL DEFAULT now())` and `ALTER TABLE user_photos ENABLE ROW LEVEL SECURITY`
- [ ] T031 [US4] Implement app/services/images.py per research R3: `clean_photo(data: bytes, declared: str) -> bytes`: magic bytes vs declared type; `Image.open` lazily; format in {JPEG, PNG, WEBP}; `size` ≤ 512 × 512 and `n_frames` == 1 before `load()`; `ImageOps.exif_transpose`; centre square with `ImageOps.fit` to 256 × 256; save JPEG without EXIF at quality 85, stepping down to 60 until ≤ 32 768 bytes; raise a typed error for refusals; a module `BoundedSemaphore(2)` acquired with a 5 s timeout (else `busy`)
- [ ] T032 [US4] Photo routes in app/routers/me.py: `PUT /api/me/photo` reads the raw body with `Content-Type` image/jpeg|png|webp, reserves `photo-user:{id}` (10 per hour) and `photo-ip:{ip}` (30 per hour) first, calls `clean_photo`, then in one transaction takes `pg_advisory_xact_lock(hashtext('photos'))`, checks the other rows' `sum(octet_length(image))` plus the new size ≤ 52 428 800 (else 507), and upserts with `version` = first 12 hex of SHA-256; `DELETE /api/me/photo`; `GET /api/me/photo` → `{version, data}` with `Cache-Control: no-store`; 415 `unsupported_image`, 503 `busy`
- [ ] T033 [US4] Members and household photos in app/routers/households.py: `LEFT JOIN user_photos p ON p.user_id = hu.user_id` with `CASE WHEN hu.role IN ('owner','member') THEN p.version END AS photo_version`; `GET /api/households/{id}/photos` (household access as other routes) returning `{photos: [{member_id, version, data}]}` for owner/member rows with a photo, `Cache-Control: no-store`; `Member.photo_version` in app/schemas.py
- [ ] T034 [P] [US4] frontend/src/lib/photoCrop.ts: `cropToSquare(file) -> Promise<Blob>` using `createImageBitmap(file, {imageOrientation: 'from-image'})`, centre square on a 256 × 256 canvas, `toBlob('image/jpeg', 0.85)`; refuse files over 10 MB and files the browser cannot open with a typed error; test the square maths in frontend/src/lib/photoCrop.test.ts with a mocked canvas
- [ ] T035 [US4] `MemberLook.photo?: string` in frontend/src/lib/names.ts (`memberLooks(members, photos?)`); frontend/src/components/Avatar.tsx renders `<img alt="" src={photo}>` inside the same circle (sizes, ring, shadow, `decorative`, `aria-label` unchanged) and falls back to the initial on `error`; CSS for `.avatar img` in frontend/src/index.css
- [ ] T036 [US4] frontend/src/pages/HouseholdLayout.tsx: when any member has `photo_version`, `useQuery(['photos', id, versionsKey])` calling `api.householdPhotos(id)` (no polling), and pass the photos into `memberLooks`; financial content never waits for it; after the person's own photo save or removal invalidate `members` and `photos` for every cached household
- [ ] T037 [US4] Photo section in frontend/src/pages/AccountPage.tsx: large preview (own photo from `GET /api/me/photo`, else the initial of the display name), "Chọn ảnh" file input with `accept` per ui-contract, preview of the cropped blob with Lưu / Huỷ, "Gỡ ảnh"; error messages for unreadable files, 415, 429, 507, 503 per ui-contract; strings in vi.tsx/en.tsx
- [ ] T038 [P] [US4] Vitest: Avatar shows the photo and falls back on error, keeps `aria-hidden` when decorative (frontend/src/components/Avatar.test.tsx); HouseholdLayout asks for photos once and not again with the same versions (frontend/src/pages/HouseholdLayout.test.tsx); AccountPage photo flow with a mocked `cropToSquare` (frontend/src/pages/AccountPage.test.tsx)
- [ ] T039 [US4] e2e/profile.spec.ts: upload a fixture photo (e2e/fixtures/photo.jpg) in context A; context B (housemate) reloads and sees an `<img>` in the header stack and on Thành viên; remove it; initials back; the photos batch for the house is one request

**Checkpoint**: PR3 complete with its docs (T046–T049). Open PR3.

---

## Phase 7: User Story 5 - Say my gender if I want to (P5, PR4)

**Goal**: an optional gender, stored with the notice shown, deleted with it, shown as a small label on Thành viên.

**Independent Test**: choose Nữ; housemates see the label; choose Không nêu; nothing shows and nothing is kept.

- [ ] T040 [US5] Issue + branch `feat/profile-gender` from `main`; migration db/migrations/009_user_gender.sql: `users.gender text NULL CHECK (gender IN ('male', 'female', 'other'))`, `users.gender_notice text NULL`, `users.gender_set_at timestamptz NULL`, `CHECK ((gender IS NULL) = (gender_notice IS NULL) AND (gender IS NULL) = (gender_set_at IS NULL))`
- [ ] T041 [P] [US5] pytest in tests/test_gender.py: never chosen = null; set with notice `2026-11-v1` stores all three; another notice version is 422; null clears all three; the members response carries `gender` with the same access matrix as status; `gender_notice` and `gender_set_at` never appear in any household response; no other route asks for gender
- [ ] T042 [US5] `GenderIn {gender: Literal['male','female','other'] | None, notice: str}` in app/schemas.py; `PUT /api/me/gender` in app/routers/me.py; `User.gender`, `Member.gender` (owner/member rows only) in app/routers/households.py
- [ ] T043 [P] [US5] Gender section in frontend/src/pages/AccountPage.tsx: radio group Không nêu (default) / Nam / Nữ / Khác with the notice text above it (ui-contract), Lưu sends the notice version; small muted label after the name in frontend/src/components/MemberList.tsx; strings in vi.tsx/en.tsx
- [ ] T044 [P] [US5] Vitest: the notice shows before saving, Không nêu sends null, MemberList shows the label only when stated (frontend/src/pages/AccountPage.test.tsx, frontend/src/components/MemberList.test.tsx)

**Checkpoint**: PR4 complete with its docs (T046–T047). Open PR4.

---

## Phase 8: Polish & Cross-Cutting Concerns (in each PR, for its part)

- [X] T045 Accessibility pass on `/account` for the part added: 360 px and 200% zoom with no sideways scroll, inputs 16 px, every control ≥ 44 px, contrast in both themes, keyboard order and focus after saving, errors announced (`aria-live`/`aria-describedby`), both languages (e2e/a11y.spec.ts)
- [X] T046 docs/ACCOUNTS.md: new rules (rename everywhere, password change and the login re-check, status, photo, gender), new rows in "Roles and rights", the API table, and "Limits we accept" (no review of photos or statuses)
- [X] T047 docs/DESIGN.md: the profile page, status line and gender label in member rows, the photo variant of the avatar (§5)
- [X] T048 docs/ARCHITECTURE.md: `/api/me` routes, the login re-check (PR1); images, the photos batch and the storage ceiling (PR3)
- [ ] T049 PR3 only: PROJECT_SPEC.md §3.3 and .specify/memory/constitution.md Scope ("Approved extensions": 07/11 profile photos with a narrow server-side check of small pictures; receipts and other images stay out of scope)
- [ ] T050 Before each PR: `ruff check .` from the root, full pytest, `npm run lint && npm test && npm run build`, local E2E; after merge and deploy, the live checks in quickstart.md

---

## Dependencies & Execution Order

- Phase 1 → Phase 2 → US1 (Phase 3) and US2 (Phase 4) → PR1.
- US3, US4, US5 each start from `main` after PR1 is merged (they need `/account` and `app/routers/me.py`);
  they do not depend on each other except for the migration number (007, 008, 009 in merge order).
- Within a story: tests first (they fail), then schema/migration, then server, then SPA, then E2E.
- T017 (login re-check) lands with T016 in the same PR: one without the other leaves the race open.
- T025 (join users in the members query) is reused by T033 and T042.

## Parallel Opportunities

- PR1: T002, T004, T005, T006 together; T007 and T013 (same file, write one after the other) alongside
  T010, T014, T018.
- PR3: T028, T029, T034 together; T035 and T037 after T034.
- PR2 and PR4 can be built at the same time on separate branches after PR1, by different people.

### Parallel Example: User Story 4

```text
Task: "Pure tests for app/services/images.py in tests/test_images.py"            (T028)
Task: "API tests for photos and the access matrix in tests/test_photos.py"       (T029)
Task: "frontend/src/lib/photoCrop.ts with frontend/src/lib/photoCrop.test.ts"    (T034)
```

## Implementation Strategy

### MVP First (PR1: User Stories 1 and 2)

1. Phase 1 + Phase 2: the page opens from the menu.
2. US1: rename everywhere. Validate with T007/T012 and by hand (quickstart step 2).
3. US2: password with the race closed. Validate with T013/T021 (quickstart step 3).
4. Docs, a11y, checks (T045–T048, T050); open PR1, Minh and Duy Anh review; merge; live check.

### Incremental Delivery

PR2 (status) → PR3 (photo) → PR4 (gender), each from `main`, each reviewed, merged and checked live before
the next. Every PR leaves the app working; a later PR can wait without blocking the earlier ones.
