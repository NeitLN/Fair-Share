# Quickstart: check first impressions

## Automated

```bash
ruff check .                                   # from the repo root
pytest -q tests/test_health.py                 # /api/version carries ai
cd frontend && npm run lint && npm test && npm run build
E2E_BASE_URL=http://localhost:3000 E2E_API_URL=http://localhost:3000 npx playwright test   # local stack
```

## By hand, local stack (no Gemini key, so AI is "off")

1. **US1**: Chi tiêu at 360 px; Tự chia with shares 50.000đ short → Lưu: the summary sits in the save area, the focus
   is on the first share. Empty description, bad amount, nobody ticked: each focuses its field. Stop the API container
   and save: the summary shows the network message, no field is focused.
2. **US2**: throttle the network in DevTools to make a request last more than 5 s (or pause the API container): the
   notice appears at second 5, under the header signed in, above the sign-in block signed out on a laptop; it hides by
   itself when the answer comes.
3. **US3**: new expense, tick "Lặp lại hằng tháng", switch to Tự chia: unticked, disabled, with the line.
4. **US4**: amount 60tr → Lưu: the confirmation; Escape returns to the amount; "Lưu thật" saves once. 50tr saves
   without asking. 2000000000000 is refused. 10đ for three people → Tự chia shows 3, 4, 3 (lowest id gets the extra).
   Type "120k" in a share: "= 120.000đ".
5. **US5**: with no key, the quick-add box is a single line once `/api/version` answers; type a sentence first on a
   slow network, then the sentence is kept under the line. With a key (live), press Enter three times: one request.
6. **US6**: stop a repeating item with the API stopped: the message shows under that item.

## Accessibility

At 360 px and 200% zoom: no sideways scroll; the summary, confirmation and notice are announced once; every new
button is at least 44 px with a visible focus ring; reduced motion makes the scroll instant.
