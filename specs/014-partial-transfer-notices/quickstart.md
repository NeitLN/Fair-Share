# Quickstart: check telling the amount actually sent

## Automated

```bash
ruff check .                                            # repo root
pytest -q tests/test_notices.py tests/test_settlements.py  # versions, partial, races, give-back
cd frontend && npm run lint && npm test && npm run build
E2E_BASE_URL=http://<host>:3000 E2E_API_URL=http://<host>:3000 npx playwright test e2e/notices.spec.ts
```

## By hand (local stack, three accounts: Lan owes Tiến; Minh is in the house)

PR-1

1. Lan tells the full amount; Tiến "Nhận số khác" a smaller one: exactly that is recorded, the rest still waits.
2. Tiến types a repayment by hand from Lan as "Đây là tiền Lan đã báo": the notice shrinks; as "Khoản khác": it stays.
3. Open Tổng quan in two tabs as Tiến; confirm in one, then in the other: the second is refused, nothing doubles.
4. Confirm by mistake, then "Hoàn tác": the notice is back, waiting.
5. While confirming, throttle the network: the pair never shows "sạch nợ" before the balances arrive.

PR-2

6. Lan "Chuyển số khác" 1tr with a note: Tiến sees 1.000.000đ and the note; Lan sees "còn thiếu".
7. Add an expense that raises Lan's debt: both lines show told and current; "Báo thêm" shows the sum and adds it.
8. Lower Lan's debt below what she told: "nhiều hơn", no "Báo thêm".
9. 0, "abc", "1,5", above the debt, above 10^12: each refused under the field, typed value kept.
10. 320 px and 200% zoom: the steps fit, Enter sends, Escape returns focus, new totals read once.
