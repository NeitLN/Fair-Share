# Quickstart: check the wider frame and the sign-in page

## Setup

```bash
# local stack with a fresh database; the web app is on port 3000
# (from Windows with Podman on WSL, use the WSL address, e.g. http://172.21.33.10:3000)
podman compose -p fsdemo up --build -d
```

Then make one household with three or four accounts and a few weeks of expenses, so Tổng quan shows
Mới ghi, the month, Số dư and several transfers (the owner's 06/11 preview used four people and three
months). Below, "Tiến" is the owner who is owed by the three others.

## Checks

1. **Frame** (US1): signed in as Tiến, open Tổng quan at 1366, 1536, 1920 and 2560 px. Side gutters:
   38, 40, 200 and 520 px. Same on Chi tiêu, Thành viên and the monthly report.
2. **640 px lines** (US1): at 1920 px on Tổng quan, measure Tiến's name to his amount in the month list
   and in Số dư: ≤ 640 px; the panels' edges still span the right column. Open "Vì sao" on a balance:
   the explanation stays inside the 640 px line.
3. **Month link** (US3): "Báo cáo tháng" is on the month title's line at 1280 px and wider.
4. **Outlined actions** (US3): as Tiến (owed by three), the three "Mark … as received" are outlined;
   press one: the repayment is recorded as before. Sign in as Lan: "I sent it" on her card is outlined.
   Light and dark.
5. **Chi tiêu** (US4): at 1536 px the form is ≤ 420 px, the three filters share a row, "Xăng đi chợ đầu
   mối" is on one line, 6.000.000đ does not wrap; open a row's shares: the amounts line up.
6. **Sign-in** (US2): sign out. At 1366 × 768 and 1920 × 1080, in EN and VI, light and dark: one centred
   block, no wordmark in the corner, switches under the form. Tab from the address bar: tabs, fields,
   submit, EN, VI, Auto, Light, Dark. Switch to Create account and submit empty: errors show, the page
   scrolls if needed. Open `/join/ABCDEFGH` signed out: the invited title and note show. At 390 px:
   identical to before.
7. **Regression**: at 320 and 360 px every screen as before, no horizontal scroll.

## Automated

```bash
cd frontend
npm run lint && npm test && npm run build
E2E_BASE_URL=http://172.21.33.10:3000 E2E_API_URL=http://172.21.33.10:3000 npx playwright test
```

Compare the result with the approved captures (sign-in 1366, Tổng quan A 1536, Chi tiêu 1536).
