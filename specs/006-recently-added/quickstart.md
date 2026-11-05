# Quickstart: check "Mới ghi"

## Automated

```bash
cd frontend
npm run lint && npm test && npm run build
# local stack only, never the live site
E2E_BASE_URL=http://localhost:3000 E2E_API_URL=http://localhost:3000 npx playwright test recent a11y
```

## By hand, on `docker compose down -v && docker compose up --build`

The demo expenses were seeded without a recording account, so they never show; use the accounts.

| # | Do | Expect |
|---|---|---|
| 1 | As `tien@demo.local`, open Tổng quan | No strip (nothing recorded by others in 7 days) |
| 2 | As `minh@demo.local` in another browser, add "Lẩu tối" 90k paid by Tiến | |
| 3 | Still as Minh, on Tổng quan press Xác nhận đã nhận 440.000đ on Tiến's card (the demo verdict has Tiến owing Minh) | |
| 4 | Tiến reloads Tổng quan at 1440 × 900 | Top of the right column: "Mới ghi" with "Minh ghi đã nhận 440.000đ từ bạn" then "Minh ghi Lẩu tối · 90.000đ"; "Tháng …" and "Báo cáo tháng" still visible |
| 5 | Tiến adds an expense in their own browser, reloads | Not in the strip |
| 6 | Press Minh's item | Chi tiêu, "Lẩu tối" revealed |
| 7 | Back, press the repayment item | Moves to the repayment in Lịch sử trả |
| 8 | Đã xem tất cả, reload | No strip |
| 9 | Minh adds another expense; Tiến reloads | Strip with only that one |
| 10 | 360 and 320 px, light and dark, English | After the verdict and transfers; no sideways scroll; ≥ 44 px; English words |
| 11 | Sign out, sign in as Minh in the same browser | Minh's own marks: Tiến's expense from row 5 is new for Minh, Minh's own records are not listed |
