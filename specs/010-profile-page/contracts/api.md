# API contract: Profile page

All routes need a session (`Authorization: Bearer`); without one: 401 `not_authenticated`. Errors use the
usual shape `{"error": {"code", "message"}}`. Field limits are enforced by the schemas (FR-033).

## PR1

### `PATCH /api/me` `{display_name}`

- `display_name`: member-name rules (1 to 40 after trimming, NFC, no control characters).
- 200 `{user: {id, email, display_name}, kept: [{household_id, household_name, name}]}`; `kept` lists the
  households where the name was taken by someone else and the caller's name there stayed `name`.
- 422 `validation_error` for a bad name; nothing changes.

### `POST /api/me/password` `{current_password, new_password}`

- `new_password`: 8 to 128 characters (as at registration). A bad length is 422 and is not counted.
- Counts in `login-email:{email}` (5 per window) and `login-ip:{ip}` (20 per window) before checking.
- 204 on success: every other session of the account ends; the caller's stays.
- 400 `wrong_password` (never 401, so the SPA does not sign out); the attempt stays counted.
- 429 `too_many_attempts` with the seconds to wait, exactly as `/auth/login`.

### `/auth/login` (changed)

Its last step re-checks the stored hash under the user row lock; a login that verified a password changed
meanwhile gets 401 `invalid_credentials` and no session (research R5).

## PR2

### `PUT /api/me/status` `{status: string | null}`

- 1 to 60 code points after cleaning (bidi controls removed); empty or spaces only = null.
- 200 `{user}` with `status`. `GET /auth/me` and the `user` of `/auth/login` also carry `status`.
- `GET /api/households/{id}/members`: each `Member` gains `status` (null unless that name's account is
  owner or member there).

## PR3

### `PUT /api/me/photo` (raw body, `Content-Type: image/jpeg | image/png | image/webp`)

- Body within the global 64 KiB limit (413 `payload_too_large` otherwise).
- Reserves `photo-user:{id}` (10 per hour) and `photo-ip:{ip}` (30 per hour) first: 429
  `too_many_attempts` with seconds, as at sign-in.
- 415 `unsupported_image`: type not allowed, magic bytes disagree, not decodable, more than one frame,
  larger than 512 × 512 (checked before decoding).
- 507 `photo_storage_full`: the ceiling would be passed; nothing changes.
- 503 `busy`: no decoding slot within 5 s.
- 200 `{version}`; the stored picture is the server's 256 × 256 JPEG without metadata.

### `DELETE /api/me/photo`

204, also when there was none.

### `GET /api/me/photo`

200 `{version, data}` (`data` = `data:image/jpeg;base64,...`) or 200 `{version: null, data: null}`.
`Cache-Control: no-store`.

### `GET /api/households/{id}/photos`

- Access as any household route (ACCOUNTS.md A5): not in it or pending → the 404 of a missing household.
- 200 `{photos: [{member_id, version, data}]}` for names whose account is owner or member and has a photo.
  `Cache-Control: no-store`.
- `Member` gains `photo_version` (same visibility as `status`).

## PR4

### `PUT /api/me/gender` `{gender: "male" | "female" | "other" | null, notice: string}`

- `notice` must equal the current notice version (`2026-11-v1`), else 422.
- A value stores gender + notice + time together; null deletes all three.
- 200 `{user}` with `gender`. `Member` gains `gender` (same visibility as `status`).

## Never in a household response

`email`, `password_hash`, `gender_notice`, `gender_set_at`, session data.
