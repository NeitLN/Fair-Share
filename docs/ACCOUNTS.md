# Accounts, joining a household and who may do what

Agreed on 02/11/2026 after a walkthrough of the app as three users. Before this, a household was
open to anyone holding its secret key (#132): access lived in one browser, was lost with it, and
anyone with the link could change anything, including marking someone else's debt as paid.

## Decisions

| | Decision |
|---|---|
| D1 | Accounts with roles: an owner, members, and people waiting for approval |
| D2 | Our own sign-in: email + password (argon2id), a random session token sent as `Authorization: Bearer`, no cookie |
| D3 | Everyone signs in, and everyone in a household's split has an account; nobody adds a name without one |
| D4 | Joining with an invite code waits for the owner's approval. A signed-in person holding a valid code, or waiting, sees the house's name and its owner's display name, and nothing else of it (no member, no amount); its pages stay closed (A5). A refusal, or the house deleted while waiting, leaves that person a line saying so, which only they read and dismiss, kept at most 30 days ([spec 015](../specs/015-invite-preview/spec.md)) |
| D5 | Invite codes: 8 characters (Crockford base32, shown `ABCD-EFGH`), valid 7 days, one current code per household |
| D6 | A household from before accounts: the first signed-in person who opens its old `#k=` link becomes its owner; after that the key opens nothing |
| D7 | Shipped only if every check below passes by the evening of Thu 05/11; otherwise the demo uses `main` as it was |

Why our own sign-in and not Supabase Auth: `docker compose up --build` from a clean clone with no
`.env` must run the whole product, and CI runs everything against a throw-away PostgreSQL; neither
has Supabase Auth. Why a header and not a cookie: the web app and the API are two different sites
(`onrender.com` is on the Public Suffix List), so a cookie from the API would be a third-party
cookie that browsers block, and a header needs no CSRF protection.

## Roles and rights

| Action | Owner | Member | Waiting |
|---|---|---|---|
| See the household, its expenses and balances | yes | yes | no |
| Rename or delete the household | yes | | |
| See the invite code | yes | yes | |
| Make a new invite code | yes | | |
| Approve or reject a request; take someone's access away | yes | | |
| Rename a name; remove a name nobody uses | yes | | |
| Add an expense (paid by anyone in the household) | yes | yes | |
| Change or delete an expense | any | the ones they recorded | |
| Record a repayment ("received") | when they received it | when they received it | |
| Tell the receiver "I've sent it"; say "not received" | when they owe it / received it | when they owe it / received it | |
| Delete a repayment | any | the ones they recorded | |
| Quick add | yes | yes | |
| Change their own name everywhere, and their password (profile page) | yes | yes | yes, name and password only: no household changes |
| Set their own status; see housemates' statuses | yes | yes | sets it; sees none, and nobody sees theirs there |
| Set or remove their own photo; see housemates' photos | yes | yes | sets it; sees none, and nobody sees theirs there |
| State or clear their own gender; see housemates' stated genders | yes | yes | states it; sees none, and nobody sees theirs there |
| Leave | no (would need a new owner first) | yes | cancel the request |

Every check is in the API (`app/access.py`, the routers). Hiding a button only makes the page easier
to use.

## Rules

| ID | Rule | Tests |
|---|---|---|
| A1 | Email trimmed and lower-cased, at most 254 characters, one account per email; password 8 to 128 characters; display name 1 to 40 characters, cleaned like a member name | `test_accounts.py`: register tests |
| A2 | A wrong password and an unknown email get the same 401. Five failed logins in 15 minutes for one email, or 20 from one address, give 429 with the seconds to wait; 60 registrations an hour from one address (a whole class on one campus Wi-Fi shares one address). An attempt is counted before the password is checked, so attempts at the same moment cannot slip past the limit, and a refused one costs no password hash | `test_five_wrong_passwords_…`, `test_one_address_…`, `test_wrong_passwords_at_the_same_moment_…`, `test_a_refused_registration_…` |
| A3 | A session ends 30 days after it was last used and 90 days after the login at the latest; logging out ends it at once | `test_logout_…`, `test_an_old_session_…`, `test_a_session_in_use_…` |
| A4 | Passwords are stored as argon2id hashes (OWASP's minimum: t=2, 19 MiB, 1 lane, about 0.4 s in a container limited like the free instance; a login makes a hash from older settings again), session tokens as SHA-256; neither is ever logged | `test_passwords_and_tokens_…`, `test_passwords_are_hashed_with_owasps_minimum_…`, `test_a_hash_made_with_the_old_settings_…` |
| A5 | No session: 401. Not in the household, or still waiting: the 404 of a household that does not exist. In it but not allowed: 403 | `test_access.py` |
| J1 | Codes are read without case, spaces or dashes, O as 0, I and L as 1; a wrong, expired or replaced code gets one answer that reveals nothing | `test_a_wrong_code_…`, `test_an_expired_or_renewed_…` |
| J2 | Five wrong codes a minute for one account, 20 for one address, then 429, counted together for previews and requests to join. Previews in all (right or wrong) are also limited to 30 a minute per account (`too_many_previews`), which never blocks joining | `test_guessing_codes_…`, `test_invites.py` |
| J3 | Asking again does not ask twice; a member using the code is sent to the household | `test_asking_again_…` |
| M1 | One account per name, one name per account in each household | `test_a_name_someone_has_…` |
| M2 | Creating a household makes its creator the owner, with their display name in the split | `test_households.py` |
| M3 | Names are only added by approving someone. A name from before accounts stays in the expenses it is in, but a new expense is only split between people with an account | `test_a_new_expense_is_only_…` |
| S1 | Expenses and repayments remember who recorded them (`created_by`); older ones belong to the owner | `test_a_member_adds_expenses_…` |
| S2 | A repayment is recorded by the person who received it | `test_only_the_person_who_received_…` |
| S3 | The person who owes can tell the receiver "Tôi đã chuyển": the whole suggestion in one press, or any amount up to it with "Chuyển số khác", with an optional note of 120 characters; the server checks, with the household locked against every other change of money, that it is a transfer suggested right now and not more than it (else 409 `suggestion_changed`). "Báo thêm" adds to a notice still waiting, so the receiver confirms the total once; the total stays within the suggestion and 10^12, and a note given replaces the old one. It changes no balance; everyone in the household sees it, with its note. A notice is money told and not yet recorded ([spec 014](../specs/014-partial-transfer-notices/spec.md)): the receiver's "Đã nhận" records all of it, or less with "Nhận số khác", and takes that out of it in one transaction, once however often it is pressed; what is left keeps waiting. A repayment typed in by hand is taken out of the notice only when the receiver says it is the told money; any other repayment leaves it as it is (the old "same amount" rule let money count twice). Deleting a repayment recorded from a notice gives its amount back as a waiting notice when the pair has none. "Chưa nhận được" marks it declined until the payer tells again; the payer can take it back. Every action names the version of the notice its screen showed, so one from an old screen never touches a notice that changed since (409 `notice_changed`). A notice whose pair is no longer suggested keeps its own card until it is answered or taken back. One notice per pair (added 03/11 after the UI review) | `test_notices.py` |
| P1 | `PATCH /api/me` sets the display name and the person's own name in every household where they are owner or member, in one transaction. A household where someone else's name already equals it ignoring case keeps the old name (a savepoint per household) and is listed in `kept`; any other failure changes nothing. Households still waiting are not touched. Saving the same name brings a household the owner renamed back in line. The owner's right to rename a name is unchanged (specs/010-profile-page) | `test_profile.py`: rename tests |
| P2 | `POST /api/me/password` needs the current password; wrong ones count in the login limits of A2 (same buckets, counted before the check) and answer `400 wrong_password`, never 401, so the page does not sign out. A change ends every other session of the account and keeps the caller's. Both the change and the last step of a login take the user row lock and compare the stored hash, so a login that checked the old password during a change gets `401 invalid_credentials` and no session | `test_profile.py`: password tests, `test_a_login_with_the_old_password_during_the_change_…` |
| P3 | A status (`PUT /api/me/status`) is 1 to 60 code points after cleaning like a name, direction controls removed; empty clears it. It belongs to the account and shows in a household only through a live owner or member link: someone waiting, someone who left or lost access, and a name from before accounts show none, and an account approved onto an old name shows only its own. Plain text, never a link (specs/010-profile-page, US3) | `test_status.py` |
| P4 | A photo (`PUT /api/me/photo`, the raw picture as `image/jpeg`, `image/png` or `image/webp` within the 64 KiB body limit) is checked by `app/services/images.py`: the declared type must match the first bytes, the picture must be at most 512 × 512 (read from the header, before decoding) and one frame, and what is kept is the server's own 256 × 256 JPEG without metadata, at most 32 KiB, one per account, replaced in place. Uploads count before checking: 10 an hour per account, 30 per address (`429`); a refused one stays counted. All photos together stay under 50 MB, checked under an advisory lock (`507 photo_storage_full`); two decodings at a time (`503 busy`). A photo reaches only the person (`GET /api/me/photo`) and their current housemates (`GET /api/households/{id}/photos`, one batch, `no-store`), through signed-in requests, never at an address of its own; the same live-link rule as P3 | `test_photos.py`, `test_images.py` |
| P5 | A gender is optional and never asked for: `null` ("Không nêu") for every account until its owner chooses `male`, `female` or `other` with `PUT /api/me/gender`. The request names the notice version the page showed (`2026-11-v2`); another version is a `422`, so a stale page cannot record agreement to words it did not show. The choice, the notice version and the time are kept together (a database check) and "Không nêu" deletes all three. Only the gender reaches housemates, under the same live-link rule as P3; the notice record never leaves the server | `test_gender.py` |
| P6 | A receiving account (`PUT /api/me/receiving-account`, [spec 016](../specs/016-vietqr/spec.md)) is the person's own: a bank from the bundled VietQR list (`app/data/vietqr_banks.json`, only banks taking transfers), an account number of 6 to 19 digits, and the holder's name cleaned to capital ASCII as banking apps show it. Only its owner reads, changes or removes it, with no house needed; answers are `no-store`. In a house, a current owner or member with an account carries a hint in the members list (the bank and the last four digits, never the number or the name). The full details come only from `GET /api/households/{id}/members/{member}/payment`, checked in this order: the house's own 404 for anyone not an owner or member of it, the member's own 404 for someone not a current owner or member there (both identical whether an account exists), then `409 payment_not_suggested` unless the server's current suggested transfers, under the house lock, include one from the asker to that member. Being owner gives nothing more. Limit we accept: a member can make themselves owe someone with a small expense, read the details, and delete it; the gate stops casual viewing, not a determined housemate. Removing the account stops every later read; details already seen and backups cannot be recalled. Account numbers and names are never logged | `test_receiving_accounts.py`, `test_payment_details.py`, `test_housemates_see_only_the_bank_…` |
| L1 | The old key shows an ownerless household to take over; with an owner it answers "ask for an invite code"; a wrong key is a 404 | `test_the_first_signed_in_person_…` |

## API

| Endpoint | |
|---|---|
| `POST /api/auth/register`, `POST /api/auth/login` | `{token, user}` |
| `POST /api/auth/logout`, `GET /api/auth/me` | |
| `GET /api/households` | `{households: [...with role and member_id], pending: [{household_id, requested_at}]}` |
| `POST /api/households` | the creator becomes the owner |
| `GET`, `POST /api/households/{id}/invite` | the current code; a new one (owner) |
| `POST /api/join` `{code}` | `{status: "pending"}` or `{status: "member", household_id}` |
| `DELETE /api/me/requests/{household_id}` | cancel a request |
| `GET /api/households/{id}/requests` | who is waiting (owner) |
| `POST /api/households/{id}/requests/{user_id}/approve` `{member_id?, name?}` | onto a free name, or a new one |
| `POST /api/households/{id}/requests/{user_id}/reject` | |
| `DELETE /api/households/{id}/people/{user_id}` | take someone's access away (owner) |
| `POST /api/households/{id}/leave` | |
| `GET`, `PUT /api/households/{id}/notices` `{to_member_id, amount}` | the household's "Tôi đã chuyển" notices; tell someone (S3) |
| `DELETE /api/households/{id}/notices/{to_member}` | take your own notice back |
| `POST /api/households/{id}/notices/{from_member}/accept` `{amount, settled_at}` | "Đã nhận" on a notice (the receiver): records it, 201 with the settlement |
| `POST /api/households/{id}/notices/{from_member}/decline` `{amount}` | "Chưa nhận được" (the receiver) |
| `GET`, `POST /api/households/{id}/claim` with `X-Household-Key` | take over a household from before accounts |
| `PATCH /api/me` `{display_name}` | `{user, kept: [{household_id, household_name, name}]}` (P1) |
| `POST /api/me/password` `{current_password, new_password}` | `204`; `400 wrong_password`; `429` as login (P2) |
| `PUT /api/me/status` `{status}` | the account with its status (P3); `Member` and `User` carry `status` |
| `PUT`, `DELETE`, `GET /api/me/photo` | upload (`{version}`), remove, or read your own photo (P4) |
| `GET /api/households/{id}/photos` | `{photos: [{member_id, version, data}]}`; `Member` carries `photo_version` (P4) |
| `PUT /api/me/gender` `{gender, notice}` | the account with its gender (P5); `Member` and `User` carry `gender` |
| `GET`, `PUT`, `DELETE /api/me/receiving-account` | read, save or remove your own receiving account (P6); `Member` carries `receiving_hint` |
| `GET /api/households/{id}/members/{member}/payment[?acknowledge=]` | the payment details for one suggested transfer (P6) |

## Data

`db/migrations/003_accounts.sql` adds `users`, `sessions`, `household_users` (role and linked
name), `invite_codes` and `rate_limits`, and `created_by` on expenses and settlements. 001 and 002
are unchanged; `households.access_key` stays only for L1. `004_payment_notices.sql` adds
`payment_notices` (S3): one row per pair, removed with either name, when it is answered "Đã nhận", or when
the told amount is recorded by hand. `007_user_status.sql` adds `users.status` (P3), `008_user_photos.sql` the table `user_photos` (P4), `009_user_gender.sql` `users.gender` with its notice record (P5), `012_receiving_accounts.sql` the table `receiving_accounts` (P6).

## Limits we accept

* Emails are not verified and there is no password reset yet: no email is sent (Render's free plan
  blocks SMTP; a reset would go through an HTTPS email API).
* The session token is kept in the browser's `localStorage`, so a script injected into the page
  could read it. The page loads no third-party script.
* Anyone who knows an email can lock it out of signing in for 15 minutes with five wrong passwords
  (A2). A lock per email is what stops guessing one account's password, so we keep it; a signed-in
  session is not affected.
* `409 email_taken` on sign-up tells whether an email has an account. Without email verification
  there is no way to hide it, so we keep the clear answer.
* A password hash takes 19 MiB and most of the free instance's 0.1 CPU, so at most two run at a time
  (`HASHING_AT_ONCE` in `app/auth.py`) and a burst of logins waits instead of slowing down every
  other request.
* "Tôi đã chuyển" can be sent to a name from before accounts, which nobody can sign in as, so nobody
  can answer it; it stays until the payer takes it back (found in review). Repayments to such a
  name wait too (S2), until the owner approves someone onto that name.
* An old `#k=` link can make its holder the owner until someone takes the household over: owners
  should open their old links right after the release. Two people opening it at the same moment get
  one owner; the other is told to ask for an invite code.
* The `/join/CODE` link puts the code in the path, which the static host may log (found in review).
  A code alone only asks to join: the owner still approves, and a new code replaces it.
* Photos and statuses are not reviewed by anyone. The owner can take a member's access away, which
  hides them in that household but does not delete them or remove them from other households; an
  owner who misuses them is out of reach except by leaving. A photo already shown on someone's screen
  cannot be called back; the app only stops serving it.
* Each run of the live E2E tests leaves its two or three test accounts (`@fair-share.test`); their
  households are deleted. A clean-up, or a way to delete an account, is future work.
