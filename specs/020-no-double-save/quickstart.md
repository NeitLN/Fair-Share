# Quickstart: checking No double save

## Automated

```powershell
$env:DATABASE_URL='postgresql://app:test@172.21.33.10:55432/appdb'   # local fstest
python -m pytest tests/test_drafts.py tests/test_expenses.py tests/test_settlements.py tests/test_notices.py -q
ruff check .
cd frontend; npx vitest run; npm run lint; npx tsc -b --noEmit
$env:E2E_BASE_URL='http://172.21.33.10:3000'; $env:E2E_API_URL='http://172.21.33.10:3000'; npx playwright test safe-saves notices
```

If an E2E run is red, keep `frontend/test-results/` before rerunning.

## By hand (local stack)

| Check | Expected |
|---|---|
| Save an expense with DevTools blocking the response, then press Lưu again | One row; the form resets; the toast "Đã lưu" |
| The same, but change the amount before pressing again | No new row; "Khoản chi này đã được lưu rồi…" with "Xem" and "Ghi thành khoản mới" |
| "Ghi thành khoản mới" | One new row with the changed amount |
| "Ghi kỳ này" with the response blocked, press again | One expense for the month, no "đã có người ghi" |
| A hand repayment from told money, response blocked, press again | One repayment, the notice reduced once |
| Double tap "Tạo nhà" | One house |
