# Research: First impressions that hold up

Decisions behind [plan.md](plan.md), checked against `main` at `e1ebaa1`.

## R1. The save summary (FR-001 to FR-006)

- **Fact**: `ExpenseForm.tsx` has `check()` returning `Problems` per field, `handleSubmit()` opens the date or split
  fold for the first problem and an effect focuses `[data-field="<field>"]`; for `split` that is the active split-mode
  button. Field messages render under each field, the server message is a `string` prop `error` rendered as
  `<p role="alert">` before `.form-actions`, which is `position: sticky; bottom: 0`. Problems clear on any edit
  (`clearProblem`).
- **Decision**:
  - A `FormSummary` line rendered **inside** `.form-actions`, above the buttons, showing the first problem (field
    order `description, amount, payer, date, split`) or the general server message. `role="status"` with
    `aria-live="polite"`, and the field messages keep `aria-describedby` but are no longer live, so one announcement.
  - Finer split focus targets via new `data-field` values: `split-share-<id>` (first unreadable share, else first
    custom share for mismatch / no share) and `split-person` (first person checkbox when nobody is ticked). `check()`
    returns the target alongside the message; `handleSubmit` stores it in `focusField`.
  - After a failed submit, a `submittedOnce` flag makes edits re-run `check()` instead of clearing; the summary shows
    the next problem or hides.
  - Server errors: `ExpensesPage` passes the `ApiError` (not only its message) as a new optional prop
    `serverError?: { message: string; field: Field | null }` built by a new helper `lib/formError.ts`:
    `validation_error` details `loc` → field (`description`, `amount`, `payer_id` → payer, `spent_at` → date,
    `split` → split); codes `unknown_member`, `member_without_account` → split; others → `null` (general).
    The server message clears on the events of FR-004 (edit of its field, amount/payer/date/split change, new
    submit). `recurring_month_taken` keeps its current presentation (ExpensesPage already withholds it).
  - Scrolling: `element.scrollIntoView({ block: 'center', behavior: prefersReducedMotion ? 'auto' : 'smooth' })` before
    `focus({ preventScroll: true })`.
- **Alternatives**: an error dialog (blocks, worse on phones); toasts (vanish, not tied to fields).

## R2. The slow notice (FR-007 to FR-009)

- **Fact**: every API call goes through `request()` in `frontend/src/api/client.ts`. `App.tsx` renders the header
  (hidden on the desktop sign-in layout) and `<main>`.
- **Decision**: a tiny store `lib/slowRequests.ts` (module state + `useSyncExternalStore`, like `lib/session.ts`):
  `begin()` returns a token and starts a 5 s timer that marks it slow; `end(token)` clears it. `request()` calls
  `begin()` before `fetch` and `end()` in a `finally` that wraps the fetch **and** the body read (so parsing counts),
  covering success, HTTP error, network error, abort and the session-changed throw. `App.tsx` renders `<SlowNotice>`
  just before `<main>` in both layouts (signed out on desktop it sits above the sign-in block), so `AuthPage` is not
  touched. The notice shows while `slowCount > 0`. Announcement: a visually present `role="status"` region whose
  text is set only when a new episode starts; an episode ends after 10 s hidden (a timestamp in the store).
- **Alternatives**: TanStack Query's `isFetching` (misses mutations and the sign-in call, which does not use queries);
  a timeout (the spec forbids adding one).

## R3. Repeat vs Tự chia (FR-010)

- **Fact**: `repeat`/`varying` are local state, offered only for new expenses (`offerRepeat`); `check()` refuses
  repeat + custom with `t.recurring.equalOnly`; `fill()` and `undoFill()` set `splitType` without touching `repeat`;
  `lastFill.before` does not store `repeat`.
- **Decision**: one effect-free rule applied wherever `splitType` is set: a helper `chooseSplit(next)` used by the two
  mode buttons, `fill()` and `undoFill()`; when `next === 'custom' && offerRepeat`, it also sets `repeat=false`,
  `varying=false`. The checkbox renders `disabled` with the line `t.recurring.equalOnly` under it while custom.
  `lastFill.before` gains `repeat` and `varying` so undo restores them. The save check stays.

## R4. Large amount confirmation (FR-011 to FR-013)

- **Fact**: `amount` is `parseAmount(amountText)` (integer or null). The API maximum is 1.000.000.000.000đ
  (`app/schemas.py`); the page does not check it today.
- **Decision**: constants `LARGE_AMOUNT = 50_000_000`, `MAX_AMOUNT = 1_000_000_000_000` in `lib/split.ts` (or a
  small `lib/amountLimits.ts`). `check()` adds `amount > MAX_AMOUNT → t.form.amountTooLarge`. In `handleSubmit`, after
  a clean check, if `amount > LARGE_AMOUNT && confirmedAmount !== amount`, set `confirming = amount` and stop. While
  `confirming`, `.form-actions` renders the question and two buttons instead of the save row; the form's `onSubmit`
  returns early (implicit submit ignored); "Sửa lại" focus on mount; `Escape` → cancel → focus amount. "Lưu thật":
  `onClick` only when `event.detail > 0 || key Enter/Space pressed on it` (a keydown that started before the button
  appeared is ignored by tracking `pointer/key down` on the button itself), plus `submitting` guard; it sets
  `confirmedAmount = amount` and calls the submit path. Any change of the parsed `amount` (effect on `amount`) clears
  `confirming`; `confirmedAmount` survives a failed save, cleared on successful save and on reset; a fill never sets
  `confirming` (it does not submit).
- **Alternatives**: a modal (agreed against in review; more focus management); `window.confirm` (labels cannot be set).

## R5. Share prefill (FR-014) and echo (FR-015)

- **Fact**: `customText: Record<number, string>`; share inputs render for every member in custom mode; blank or `0`
  = not sharing; parsing already uses `parseAmount`. `equalSplit(amount, ids)` in `lib/split.ts` gives leftover đồng
  to the lowest ids.
- **Decision**: state `prefill: 'pending' | 'done' | 'off'`, starting `'pending'` for a new expense with Chia đều,
  `'off'` when the form starts in custom (an existing expense) or after a quick-add custom fill. On the first user
  click from Equal to Custom: if `amount` valid and no share typed → write `equalSplit(amount, [...selected])` as
  strings, set `'done'`; if no valid amount → stay `'pending'` and fill when the amount field loses focus with a valid
  `amount` while still in custom and no share typed, then `'done'`. Not on the first valid `amount`: typing "300000"
  passes through "3", which would split 3đ and then never run again (found while implementing). Typing any share sets `'done'` (never overwrite). Members added
  later start empty, removed members' entries are dropped on submit as today. `lastFill.before` stores `prefill`.
  Echo: under each share input, `<span className="amount-preview">= {formatVND(n)}</span>` when the text parses to a
  positive integer, mirroring the total; each share gets its own `aria-describedby` error when unreadable.
- **Alternatives**: recompute shares on every total change (overwrites the user's intent).

## R6. Quick add guard and availability (FR-016 to FR-019)

- **Fact**: `AiComposer.read()` has no in-flight guard; Enter calls it directly; `latest` counter discards stale
  answers; "Nhập tay" bumps `latest` without cancelling. `notConfigured` becomes true only after `ai_not_configured`.
  `/api/version` (`app/routers/system.py`) is public, database-free; `GeminiClient.configured` exists.
- **Decision**:
  - A ref `inFlight` set at the start of `read()` and cleared in `finally` of the actual call (not on "Nhập tay");
    `read()` returns at once while it is set. Enter, button and Retry all go through `read()`.
  - `/api/version` adds `"ai": bool(request.app.state.gemini.configured)` and sends `Cache-Control: no-store`.
  - `lib/aiAvailability.ts`: one module-level promise per page load fetching `/api/version` through `request()`;
    `useAiAvailability()` returns `'unknown' | 'on' | 'off'`; missing field or error → `'unknown'`.
  - `AiComposer` with `'off'`: render the line and, if `text` is not empty, the sentence as selectable text with the
    hint; with `'unknown'` or `'on'`: as today (today's `ai_not_configured` handling stays as a fallback).
- **Alternatives**: a new endpoint `/api/ai/status` (one more route for one boolean).

## R7. Stop errors per item (FR-020)

- **Fact**: `ExpensesPage` has one `useMutation` for stop; `RecurringList` gets `stoppingId` and `onStop`, no error.
- **Decision**: `ExpensesPage` keeps `stopping: Record<itemId, 'pending'>` and `stopErrors: Record<itemId, string>` in
  state keyed by house id (reset when `householdId` changes); each stop call captures the house id and ignores its
  result if the house changed. `RecurringList` gets `stoppingIds: Set<number>` and `errors: Record<number, string>`,
  renders the error under the item (`role="alert"`, so it is announced even if the fold is closed; the region stays
  mounted with `hidden` only when there is nothing to say). Message `t.recurring.stopUnclear` + the error text.

## R8. Boundaries with spec 012

Owned here: `ExpenseForm.tsx`, `AiComposer.tsx`, `RecurringList.tsx`, `api/client.ts`, `App.tsx` (notice slot only),
new `lib/slowRequests.ts`, `lib/aiAvailability.ts`, `lib/formError.ts`, `lib/split.ts` (constants), `app/routers/
system.py`. Shared with 012: `ExpensesPage.tsx` (here only the `serverError` and stop props; 012 changes the filter),
`index.css` (new selectors `.form-summary`, `.form-confirm`, `.slow-notice`, `.recurring-error`, `.share-preview`),
`i18n/vi.tsx` and `en.tsx` (keys in `form`, `ai`, `recurring`, `app`). The second PR to merge rebases.
