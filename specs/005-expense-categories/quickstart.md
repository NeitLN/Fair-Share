# Quickstart: check expense categories

## Automated

```bash
ruff check . && pytest -q                       # from the root, real PostgreSQL
cd frontend && npm run lint && npm test && npm run build
# local stack only, never the live site
E2E_BASE_URL=http://localhost:3000 E2E_API_URL=http://localhost:3000 npx playwright test categories a11y
```

## By hand, on `docker compose down -v && docker compose up --build`, as `minh@demo.local`

| # | Do | Expect |
|---|---|---|
| 1 | Chi tiêu: the five demo expenses | Each row ends with its category: Tiền nhà, Đi chợ, Điện nước, Ăn uống, Đi chợ |
| 2 | Type "Tiền nước tháng 11", 120k, Lưu | Danh mục showed Điện nước before saving; the row says Điện nước |
| 3 | Type "Mua bóng đèn" | Danh mục: Sinh hoạt; Đổi → pick Khác → type more: stays Khác |
| 4 | Type "lau nuong" without accents | Ăn uống |
| 5 | Edit "Tiền điện", change Danh mục to Khác, Lưu | Saved; the balances on Tổng quan are unchanged |
| 6 | Báo cáo tháng (this month) | Chi theo danh mục: biggest first, amounts add up to Cả nhà chi, percentages to 100 |
| 7 | Press a category in the chart | Chi tiêu filtered to that month and category |
| 8 | Filters: Danh mục = Đi chợ, Tháng = Tất cả | Both months' Đi chợ expenses only |
| 9 | Xuất CSV | A Danh mục column with the Vietnamese names |
| 10 | As Duy Anh, open Minh's expense | No Sửa (as today), so no way to change its category |
| 11 | English; 1440, 360, 320 px; light and dark; 200% zoom | Names in English; chart readable as text; no sideways scroll; controls ≥ 44 px |
