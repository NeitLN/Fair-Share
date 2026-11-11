# Quickstart: checking "Notices tell one story"

## Prerequisites

- **Local stack:**
  1. `podman compose -p fsdemo build api web`.
  2. `podman compose -p fsdemo up -d --force-recreate api web`. The web app is at http://172.21.33.10:3000.
- **Rate limits:** clear them with `podman exec fsdemo-db-1 psql -U app -d appdb -qc "DELETE FROM rate_limits"`.
- **pytest:** use the test database of the repo (see README, "Tests").

## Automated

```powershell
# server
python -m pytest tests/test_notices.py -q
ruff check .
# client
cd frontend; npx vitest run src/lib/notices.test.ts src/components/VerdictBlock src/components/NoticeAmountStep src/components/SettlementList src/pages/DashboardPage.test.tsx
$env:E2E_BASE_URL='http://172.21.33.10:3000'; $env:E2E_API_URL='http://172.21.33.10:3000'; npx playwright test notices safe-saves
```

If an E2E run is red, keep `frontend/test-results/` before rerunning.

## By hand (two browsers, 360 px)

| Check | Expected |
|---|---|
| B tells C 30.000đ, then the expense behind it is deleted | C: "B đã báo chuyển 30.000đ cho bạn, nhưng lúc này B không cần trả bạn nữa." No "cần trả" line anywhere for B→C |
| C: "Vẫn ghi đã nhận" | Warning, nothing recorded; "Ghi" records; "Thôi" goes back |
| C: "Không ghi khoản này" | B sees "C không ghi 30.000đ vì lúc này bạn không cần trả C." |
| Tell 33.333đ, record 20.000đ of it by hand, delete it from Lịch sử | Notice back to 33.333đ; the dialog said so |
| Double tap "Tôi đã chuyển" | One notice, no error |
| Take back while the receiver confirms in the other browser | "An đã xác nhận 20.000đ." then it clears |
| Owe 133.333đ, type 135000 in "Chuyển số khác" | "Bạn chỉ cần trả An 133.333đ." + "Báo 133.333đ" |
