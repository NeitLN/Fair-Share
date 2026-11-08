# Quickstart: check the invite preview

## Automated

```bash
ruff check .
pytest -q tests/test_invites.py tests/test_accounts.py
cd frontend && npm run lint && npm test && npm run build
E2E_BASE_URL=http://<host>:3000 E2E_API_URL=http://<host>:3000 npx playwright test e2e/invite.spec.ts
```

## By hand (local stack; Tiến owns Nhà trọ Q7, Lan is a fresh account)

1. Lan opens Tiến's link signed in: "Lời mời vào Nhà trọ Q7 của Tiến"; no create form; "Tạo nhà khác" opens it.
2. A wrong code: today's message after sending, nothing while typing; six wrong codes in a minute: refused with the
   wait, previews and requests alike.
3. Lan sends: the card names the house and Tiến. Tiến approves in another browser: within about 10 s Lan sees the
   house and "Bạn đã vào Nhà trọ Q7".
4. Again with Minh's house, refused: the line stays after a reload and on another browser until "Đã hiểu".
5. Put the tab in the background for a minute: no checks in the network panel; back in front: one check at once.
6. 320 px: the lines wrap; a screen reader hears each outcome once.
