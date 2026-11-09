# Quickstart: check Pay by VietQR

## Automated

```bash
ruff check .                                               # repo root
pytest -q tests/test_receiving_accounts.py tests/test_payment_details.py tests/test_vietqr_banks.py
cd frontend && npm run lint && npx tsc -b && npm test && npm run build
E2E_BASE_URL=http://<host>:3000 E2E_API_URL=http://<host>:3000 npx playwright test e2e/vietqr.spec.ts
```

The E2E test fails on any request to a host other than Fair-Share while the panel is open (SC-005), and decodes the drawn code independently (SC-003).

## By hand (local stack; Minh is owed, Lan owes him, An owes nothing, Hoa is in another house)

1. Minh saves Vietcombank, "0123 456.789", "Nguyễn Văn Minh": stored as `0123456789` and `NGUYEN VAN MINH`; the privacy line shows before saving.
2. On Thành viên, An and Lan see "Có tài khoản nhận tiền · Vietcombank •••• 6789" under Minh; Hoa cannot open the house.
3. Lan on Tổng quan: [Mở mã QR] next to "Tôi đã chuyển". Scan with two banking apps: account and 120.000đ ready; note whether each keeps the message (SC-002 record, real details hidden in screenshots).
4. Lan tells 100.000đ: the code is for 20.000đ with the "đã báo" line. Minh answers "Chưa nhận được": the panel warns first; "Vẫn chuyển 120.000đ" shows the code.
5. With the panel open, Minh changes his account: within 30 s Lan's panel says "vừa đổi" and shows no old detail.
6. Minh removes his account: Lan sees "Minh chưa thêm tài khoản nhận tiền"; An no longer sees the hint.
7. An expense making Lan owe ≥ 500.000.000đ: no code, details as text with the reason.
8. 320 px and 200% zoom, light and dark: the panel fits, 44 px controls, Escape returns focus, the code scans in dark theme.
9. While doing 1 to 8, the server log shows no account number or holder's name.
