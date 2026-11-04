# Quickstart: check "Why this number?" end to end

## Prerequisites

- A clean clone on this branch, Docker or Podman.
- `docker compose up --build` (fresh volume: `docker compose down -v` first), then http://localhost:3000.
- Demo accounts: `tien@demo.local`, `minh@demo.local`, `duyanh@demo.local`, password `fairshare-demo`.

## Automated

```bash
cd frontend
npm run lint && npm test && npm run build      # includes lib/explain.test.ts and the page tests
E2E_BASE_URL=http://localhost:3000 E2E_API_URL=http://localhost:3000 npx playwright test
```

Expected: everything green; the a11y walk opens an explanation and finds no contrast, 44 px or
sideways-scroll problem.

## By hand (Nhà trọ Bình Thạnh, signed in as Tiến)

| # | Do | Expect |
|---|---|---|
| 1 | Tổng quan → "Vì sao ra số này?" under 440.000đ | +450.000đ, −1.890.000đ, +1.000.000đ, 0đ, total −440.000đ "Còn cần trả" |
| 2 | Open "Phần của bạn trong các khoản chi" | 5 expenses, newest first, shares 40.000 + 80.000 + 150.000 + 120.000 + 1.500.000 = 1.890.000đ |
| 3 | Open "Bạn đã nhận lại" | "Không có khoản nào" |
| 4 | Click "Mì gói và trứng" | Chi tiêu opens with that expense revealed and in view |
| 5 | Back, open Duy Anh's row in Số dư từng người | +460.000đ, −1.910.000đ, 0đ, 0đ, total −1.450.000đ, worded "Duy Anh …" |
| 6 | Press "Tôi đã chuyển" on your card, reopen your explanation | A line says the 440.000đ notice is waiting and not counted; totals unchanged |
| 7 | Switch to EN, dark theme, 360 px wide | Same numbers, English wording, no sideways scroll, every control ≥ 44 px |
| 8 | Sign in as someone not in the house and open `/households/1` | The house is not found (404 page); nothing of the explanation is reachable |
