# Quickstart: check AI quick add with named amounts

## Automated

```bash
ruff check .                                   # from the repo root
pytest -q tests/test_allocation.py tests/test_gemini.py tests/test_ai.py
cd frontend && npm run lint && npm test && npm run build
```

Expected: every row of the spec's allocation table and every blocked case pass with the fake Gemini;
today's quick add tests pass unchanged (FR-010).

## By hand, local stack (no Gemini key needed)

`podman compose -p fsdemo up --build -d`, sign in to a house with four members. Without
`GEMINI_API_KEY` in `.env` (never committed) quick add answers `ai_not_configured` and the manual form
stays usable (US-10); the fill behaviour itself is covered by the Vitest suite. With a key, the corpus
below can be run locally too.

## Live corpus (SC-004), after deploy or with a key

House: Tiến (you), Minh, Lan, Duy Anh. Type each sentence on a fresh form, compare, then press *Hoàn tác*.
Pass: at least 16 of the 17 supported sentences (marked S) fill exactly the expected split; #9, #19, #20 are blocked with the reason shown; no sentence fills
a usable split different from the expected one.

| # | Sentence | Expected |
|---|---|---|
| 1 S | lẩu 500k Tiến trả, Minh 200k, Lan 100k | payer Tiến; Minh 200k, Lan 100k, Tiến 200k |
| 2 S | lẩu 500k Tiến trả, Minh 200k | Minh 200k, Tiến 300k |
| 3 S | 500k Tiến trả, Tiến 100k, Minh 200k, còn lại Lan | Tiến 100k, Minh 200k, Lan 200k |
| 4 S | 500k Tiến trả, Lan 100k, Minh 200k, còn lại Lan | Lan 300k, Minh 200k |
| 5 S | 500k Tiến trả, Minh 500k | Minh 500k only |
| 6 S | lẩu 500k, Minh 200k, Lan 100k, còn lại mình | no payer; Minh 200k, Lan 100k, Tiến 200k |
| 7 S | điện 900k Minh trả, Lan 400k, còn lại chia đều | Lan 400k; Tiến, Minh, Duy Anh 166.667/166.667/166.666 by id |
| 8 S | điện 900k Minh trả, Lan 400k, còn lại chia đều cho Tiến và Duy Anh | Lan 400k, Tiến 250k, Duy Anh 250k |
| 9 | lẩu 500k Lan trả, Minh 300k, Duy Anh 300k | blocked over_total (600k > 500k) |
| 10 S | tiền chợ 350k Duy Anh trả, Lan 50k, Minh 100k | payer Duy Anh; Lan 50k, Minh 100k, Duy Anh 200k |
| 11 S | hotpot 500k Tiến paid, Minh 200k, Lan 100k | as #1 |
| 12 S | hotpot 500k Tiến paid, Minh 200k | as #2 |
| 13 S | 500k Tiến paid, Tiến 100k, Minh 200k, rest Lan | as #3 |
| 14 S | 500k Tiến paid, Minh 500k | as #5 |
| 15 S | hotpot 500k, Minh 200k, Lan 100k, rest me | as #6 |
| 16 S | power bill 900k Minh paid, Lan 400k, split the rest | as #7 |
| 17 S | power bill 900k Minh paid, Lan 400k, split the rest between Tiến and Duy Anh | as #8 |
| 18 S | groceries 350k Duy Anh paid, Lan 50k, Minh 100k | as #10 |
| 19 | dinner 600k Tiến paid, Minh 1/3, Lan 40% | blocked fraction_or_percent |
| 20 | dinner 500k, Minh paid 300k, Lan paid 200k | blocked several_payers |

Also: a sentence with no named amounts ("lẩu 500k Minh trả chia 3") must fill an equal split exactly as before.

Not counted, but noted with the score (#220 review): "mình trả 500k, Minh 200k, Lan 100k" is expected to be blocked
(`no_rest_taker`), because "mình trả" is not turned into a payer (research R3). How often people type it this way
tells whether that rule is worth revisiting.
