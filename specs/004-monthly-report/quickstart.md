# Quickstart: check the monthly report

## Automated

```bash
cd frontend
npm run lint && npm test && npm run build
# local stack only, never the live site
E2E_BASE_URL=http://localhost:3000 E2E_API_URL=http://localhost:3000 npx playwright test report a11y
```

## By hand, on `docker compose up --build` (fresh volume), as `minh@demo.local`

The demo house has expenses last month and this month and one repayment ([db/seed.sql](../../db/seed.sql)).

| # | Do | Expect |
|---|---|---|
| 1 | Tổng quan → "Báo cáo tháng" in the Tháng block | `…/report/<this month>`; "Cả nhà chi" equals the Tháng block's figure |
| 2 | Compare the Cuối tháng column with Số dư từng người | Same amount and direction for every housemate |
| 3 | Add up each row by hand | Đầu tháng + Đã chi − Phần + Đã trả lại − Nhận lại = Cuối tháng; total row: starts and ends 0 |
| 4 | Tháng trước | Last month; its Cuối tháng equals this month's Đầu tháng; no "Tháng trước" link on the first month, every Đầu tháng 0 |
| 5 | Copy the address, open it in a new tab | Same month |
| 6 | Change the address to `…/report/2026-13`, then `…/report/1999-01` | Replaced by the last, then the first month |
| 7 | Xem các khoản chi tháng này | Chi tiêu filtered to that month |
| 8 | As someone waiting for approval, open a report address | The not-found page |
| 9 | Send "Tôi đã chuyển" as Duy Anh, reopen the report | No figure changes |
| 10 | English; 1440, 360, 320 px; light and dark; 200% zoom | Words in English; table on 1440, cards on phones; no sideways scroll; controls ≥ 44 px |
