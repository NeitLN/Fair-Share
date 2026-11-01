# 6. AI API integration: Quick add

*Owners: Việt Tiến, screenshots Duy Anh. Sources: `app/services/gemini.py`, `app/services/rate_limit.py`,
`app/routers/ai.py`, [screenshots](img/README.md); live measurements from 21–27/10/2026.*

Quick add turns one sentence, such as *"lẩu 240k Minh trả chia đều cả nhà"*, into a **pre-filled expense
form**. The AI never saves anything: it proposes a draft, the user checks it, the normal form saves it. If
the AI is slow, wrong, over quota or switched off, the user still has the form and loses nothing.

**Where the call happens.** The browser never talks to Gemini. It sends the sentence to our API,
`POST /api/households/{id}/ai/parse-expense`, and only the server calls Google:

1. **Check the request:** at most 300 characters, the household key, members exist, the visitor and the
   global budget have room.
2. **Call Gemini** (`generateContent`, `gemini-3.5-flash-lite`) from `app/services/gemini.py`, the only file
   that knows Gemini. The prompt carries the sentence, the members' names and today's date, and asks for an
   answer in a **JSON schema** (description, amount, payer, participants, date).
3. **Treat the answer as untrusted:** schema-checked, positive whole đồng, names matched to real members
   ignoring case and accents (`"tien"` → Tiến); a name that is not a member becomes a **warning**, never a
   new person.
4. **Return a draft** in the shape of the normal expense body, plus warnings (`unknown_member`, `no_payer`,
   `no_amount`, `participants_assumed`). Saving it is the ordinary `POST /expenses` with `source: "ai"`.

| ![Idle](img/ai-1-idle.png) | ![Filled](img/ai-3-filled.png) | ![Warning](img/ai-4-warnings.png) |
|---|---|---|
| Idle: "AI fills the form below, you check it before saving" | A real Gemini answer: Lẩu · 240.000đ · Minh trả · split between 3 | "Hùng" is not a member: the payer is left empty, with a note |

**The key.** `GEMINI_API_KEY` exists in one place, an environment variable of the Render API. It is sent
to Google in the `x-goog-api-key` **header** (never in a URL, which could reach a log), and never logged,
returned or sent to the browser. CI never has it: the tests replace Gemini with a fake. A server without a
key answers `503 ai_not_configured` and the page turns Quick add off.

**Limits and 429.** Our server enforces its own limits below Google's free quota, before any call
(`app/services/rate_limit.py`):

| Requests | Per minute | Per day | Per visitor |
|---|---|---|---|
| Google's free tier for `gemini-3.5-flash-lite` | 15 | 500 | — |
| Our global budget | 10 | 200 | 5 per minute |
| Our real peak, 28 days to 27/10 (AI Studio), demo testing included | 6 | 70 | — |

So a busy minute is refused by our limiter, never by Google. The hard part was **who one visitor is**:
behind Render each proxy appends to `X-Forwarded-For`; the live logs showed the visitor third from the end,
so the API reads that entry (`FORWARDED_HOPS=3`) and ignores the forgeable rest (section 2). From a phone
on 21/10, the sixth request within a minute got `429`. We never retry a `429` or a timeout (it burns quota
and makes the user wait); only a *fast* `5xx` is retried once, within the budget.

| Code | When | What the page does |
|---|---|---|
| `429 ai_rate_limited` | Our limit or Google's quota | "Busy, wait a minute", **Thử lại**; the sentence and the form stay |
| `503 ai_unavailable` | Gemini down or slower than 20 s | Same; the form stays usable |
| `422 ai_unparseable` | No usable answer | Fix the sentence, or fill in the form |
| `503 ai_not_configured` | No key on this server | Quick add disabled, no *Thử lại* |

| ![Busy](img/ai-5-busy-429.png) | ![Not configured](img/ai-6-not-configured-dark.png) |
|---|---|
| 429: the sentence is kept and the form works at once | No key (dark mode): Quick add is off |

*Screenshots 1–4 are real; in 5 and 6 the API's error answer is simulated in the browser, since Gemini
cannot be made busy, nor its key removed, on demand on the live site.*

**Latency.** The live server measured **7.2 to 8.8 s** per answer on 21/10; our first 10 s timeout cut
answers off, so it became 20 s. The page shows the seconds and a **Nhập tay** link; a late answer is
dropped, typed fields are never overwritten, and **Hoàn tác điền** undoes the fill.

**Data sent to Google** is only the sentence, the members' names and today's date. We do not try to make
the prompt injection-proof; we treat the answer as untrusted, so "ignore the rules" can at worst produce a
wrong draft, which the user sees before anything is saved.
