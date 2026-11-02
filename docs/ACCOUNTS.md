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
| D4 | Joining with an invite code waits for the owner's approval; until then the household shows nothing, not even its name |
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
| Delete a repayment | any | the ones they recorded | |
| Quick add | yes | yes | |
| Leave | no (would need a new owner first) | yes | cancel the request |

Every check is in the API (`app/access.py`, the routers). Hiding a button only makes the page easier
to use.

## Rules

| ID | Rule | Tests |
|---|---|---|
| A1 | Email trimmed and lower-cased, at most 254 characters, one account per email; password 8 to 128 characters; display name 1 to 40 characters, cleaned like a member name | `test_accounts.py`: register tests |
| A2 | A wrong password and an unknown email get the same 401. Five failed logins in 15 minutes for one email, or 20 from one address, give 429 with the seconds to wait; ten registrations an hour from one address | `test_five_wrong_passwords_…`, `test_one_address_…` |
| A3 | A session ends 30 days after it was last used and 90 days after the login at the latest; logging out ends it at once | `test_logout_…`, `test_an_old_session_…`, `test_a_session_in_use_…` |
| A4 | Passwords are stored as argon2id hashes, session tokens as SHA-256; neither is ever logged | `test_passwords_and_tokens_…` |
| A5 | No session: 401. Not in the household, or still waiting: the 404 of a household that does not exist. In it but not allowed: 403 | `test_access.py` |
| J1 | Codes are read without case, spaces or dashes, O as 0, I and L as 1; a wrong, expired or replaced code gets one answer that reveals nothing | `test_a_wrong_code_…`, `test_an_expired_or_renewed_…` |
| J2 | Five wrong codes a minute for one account, 20 for one address, then 429 | `test_guessing_codes_…` |
| J3 | Asking again does not ask twice; a member using the code is sent to the household | `test_asking_again_…` |
| M1 | One account per name, one name per account in each household | `test_a_name_someone_has_…` |
| M2 | Creating a household makes its creator the owner, with their display name in the split | `test_households.py` |
| M3 | Names are only added by approving someone. A name from before accounts stays in the expenses it is in, but a new expense is only split between people with an account | `test_a_new_expense_is_only_…` |
| S1 | Expenses and repayments remember who recorded them (`created_by`); older ones belong to the owner | `test_a_member_adds_expenses_…` |
| S2 | A repayment is recorded by the person who received it | `test_only_the_person_who_received_…` |
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
| `GET`, `POST /api/households/{id}/claim` with `X-Household-Key` | take over a household from before accounts |

## Data

`db/migrations/003_accounts.sql` adds `users`, `sessions`, `household_users` (role and linked
name), `invite_codes` and `rate_limits`, and `created_by` on expenses and settlements. 001 and 002
are unchanged; `households.access_key` stays only for L1.

## Limits we accept

* Emails are not verified and there is no password reset yet: no email is sent (Render's free plan
  blocks SMTP; a reset would go through an HTTPS email API).
* The session token is kept in the browser's `localStorage`, so a script injected into the page
  could read it. The page loads no third-party script.
* An old `#k=` link can make its holder the owner until someone takes the household over: owners
  should open their old links right after the release.
* The `/join/CODE` link puts the code in the path, which the static host may log (found in review).
  A code alone only asks to join: the owner still approves, and a new code replaces it.
* Each run of the live E2E tests leaves its two or three test accounts (`@fair-share.test`); their
  households are deleted. A clean-up, or a way to delete an account, is future work.
