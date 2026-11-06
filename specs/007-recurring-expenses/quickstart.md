# Quickstart: check recurring expenses

## Automated

```bash
ruff check . && pytest -q                      # from the root, real PostgreSQL
cd frontend && npm run lint && npm test && npm run build
# local stack only, never the live site
E2E_BASE_URL=http://localhost:3000 E2E_API_URL=http://localhost:3000 npx playwright test recurring a11y
```

## By hand, on `docker compose down -v && docker compose up --build` (migration 006 at start-up)

| # | Do | Expect |
|---|---|---|
| 1 | As `minh@demo.local`, add "Internet" 300k today, tick Lặp lại hằng tháng | Hint "Nhắc ngày <today> mỗi tháng · không tự ghi tiền"; saved; Chi tiêu › Khoản định kỳ (1): Internet, đã ghi |
| 2 | Tổng quan | No "Tới hạn" (this month is recorded) |
| 3 | In Chi tiêu, delete that Internet expense; back to Tổng quan | "Tới hạn: Internet · 300.000đ · Minh trả · ngày <today>" under the transfers |
| 4 | Ghi luôn | Chi tiêu, form filled, "Đang ghi kỳ <this month>"; Lưu → saved; Tổng quan: no card |
| 5 | Open the same filled form again in another tab (from step 3's state) and Lưu | "Kỳ … của Internet đã có người ghi" + Xem khoản đã ghi; nothing saved |
| 6 | Add "Tiền điện" with a custom split, tick | "Khoản định kỳ chỉ chia đều", not saved |
| 7 | Add "Tiền điện" equal, tick + Số tiền thay đổi | Listed with "số tiền thay đổi" |
| 8 | As `duyanh@demo.local`, Chi tiêu › Khoản định kỳ | No "Ngừng lặp" on Minh's items |
| 9 | As Minh, Ngừng lặp on Internet | Leaves the list; its expenses stay |
| 10 | Tổng quan at 1440 × 900 with a due card | "Mới ghi" title and "Báo cáo tháng" still in the first screen |
| 11 | English; 360 and 320 px; light and dark | Words in English; card after the transfers; no sideways scroll; ≥ 44 px |
