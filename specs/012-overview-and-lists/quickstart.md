# Quickstart: check the overview and lists

## Automated, every PR

```bash
ruff check .                                   # from the repo root (PR-L touches app/)
pytest -q                                      # real PostgreSQL (DATABASE_URL)
cd frontend && npm run lint && npm test && npm run build
E2E_BASE_URL=http://localhost:3000 E2E_API_URL=http://localhost:3000 npx playwright test   # local stack
```

## Local stack and data

`docker compose up --build` (or `podman compose -p fsdemo up --build -d`). Sign up two or three accounts, put them
in one house (invite code + approve), record a few expenses so one person owes money, and create a second, empty
house. If sign-ups start answering 429, clear `rate_limits` in the local database.

## By hand, per user story

1. **US1** (PR-A): DevTools device toolbar at 320, 360, 375, 390 px on Tổng quan of the owner who is owed by 3+
   people: sentence and avatars never touch. Record an expense of 999.999.999.999đ split with one other person:
   every digit shows at 320 px.
2. **US2** (PR-A): sign in as the person who owes: the first button under the purple block is "Tôi đã chuyển … cho
   …"; press it: the block shows "Đã báo chuyển …, chờ … xác nhận" and "Huỷ thông báo"; the list below has no second
   button. As the receiver press "Chưa nhận được": the debtor sees it and the button again.
3. **US3** (PR-A): open the empty house: invite card with code and share/copy, no "Tháng này", no balances, no
   history. Join with another account: Tổng quan becomes normal.
4. **US4** (PR-L): Nhà của bạn shows each house's balance with the right colour and a badge when a request or a
   notice waits; at 1440 px the cards form a grid; at 360 px a long name wraps beside "Trưởng nhóm".
5. **US5** (PR-L): add an expense with a 120-character description: two lines and "Xem đủ"; open Báo cáo tháng of
   a month without expenses and press "Xem các khoản chi tháng này": the filter stays and says the month is empty.
6. **US6** (PR-E): fresh profile with browser language Vietnamese → Vietnamese; English → English; choose EN, set
   the browser back to Vietnamese, reload → English (saved choice wins).
7. **US7** (PR-E): submit an empty house name and an empty sign-up name ("Nhập …"); the sign-up hint disappears
   while its error shows; a recurring item reads "Hiện trên Tổng quan từ ngày …"; English profile sentences say
   "group"; the gender notice is the short version and saving it works.

## Accessibility, each PR

At 360 px and 200% zoom: no sideways scroll; Tab reaches the new buttons with a visible ring; the new texts pass
4.5:1 in light and dark (the existing `e2e/a11y.spec.ts` stays green).
