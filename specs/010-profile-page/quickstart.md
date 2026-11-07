# Quickstart: check the profile page

## Automated, every PR

```bash
ruff check .                                   # from the repo root
pytest -q                                      # real PostgreSQL (DATABASE_URL)
cd frontend && npm run lint && npm test && npm run build
```

Expected per PR (details in [contracts/api.md](contracts/api.md)):

- PR1: `tests/test_profile.py` passes: rename everywhere, a household kept back by a taken name, pending
  household untouched, same name resynchronises, rollback on an unexpected error; password change keeps
  the caller's session and ends the others; wrong current password is 400 and counted with login (5 per
  email, 20 per address); a login that verified the old password gets no session after the change.
- PR2: status limits (60 code points, emoji, bidi removed, spaces = null) and the access matrix below for
  `status`.
- PR3: JPEG/PNG/WebP accepted; SVG, a renamed text file, a 600 × 600 picture, an animated WebP and a
  64 KiB+ body refused; the stored picture is 256 × 256, ≤ 32 KiB, has no EXIF (a test photo with GPS
  data comes back without it); the ceiling refuses a new photo when lowered in the test; rate limits;
  access matrix for photos.
- PR4: gender stored with its notice, cleared together; wrong notice version refused; access matrix.

Access matrix (SC-007), each a test: the person with no household (sees own data on /account only), a
current housemate (sees), a stranger (404 / nothing), a pending applicant (nothing, also when sharing
another household with the owner), a removed viewer (404), a person who left A but shares B (nothing in
A, everything in B), an account that later takes over an old name (no earlier profile).

## By hand, local stack

`podman compose -p fsdemo up --build -d`, then sign up three accounts and put them in two households
(owner approves). Reset sign-up limits with
`podman exec fsdemo-db-1 psql -U app -d appdb -c "DELETE FROM rate_limits"` when needed.

1. Account menu → Hồ sơ của bạn. Email read-only.
2. Rename to a name a housemate already has in one household: the result names that household.
3. Sign in as the same account in a second browser; change the password in the first; the second is
   signed out at its next click; the old password no longer signs in.
4. (PR2) Set "đang ăn kiêng 🥗"; a housemate reloads Thành viên and sees it; clear it.
5. (PR3) Pick a phone photo; the preview is a centred square, upright; save; a housemate reloads the
   household: the photo is on the header stack, the verdict, the expense list and Thành viên. Throttle the
   network: balances show before photos. Remove the photo: initials are back.
6. (PR4) Read the notice, choose Nữ; a housemate sees the label on Thành viên; choose Không nêu: gone.
7. At 360 px and at 200% zoom: no sideways scroll; keyboard reaches every control; errors are announced.

## Live, after each deploy

Repeat 1, 3 and (PR3) 5 on the live site with test accounts; check the photo batch for a house of three
is one request and well under 360 KiB in the browser's network panel.
