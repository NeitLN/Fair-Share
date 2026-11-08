# Tasks: First impressions that hold up

**Input**: Design documents from `/specs/011-first-impressions/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md),
[contracts/api.md](contracts/api.md), [contracts/ui-contract.md](contracts/ui-contract.md),
[quickstart.md](quickstart.md)

**Tests**: included (constitution III, IV; each story's Independent Test becomes one).

**Organization**: by pull request, then by user story. PR-B = US1, US3, US4 (expense form); PR-D = US2, US5, US6
(app shell, quick add, recurring list). Either PR can go first.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: US1 … US6 from spec.md

---

## PR-B: the expense form (US1, US3, US4)

### Phase 1: Setup (PR-B)

- [X] T001 Open a GitHub issue "Expense form: visible save errors, repeat lock, large amounts, share prefill (spec 011, PR-B)" with the US1, US3, US4 scenarios as done criteria, and create branch `feat/011-form` from `main`
- [X] T002 [P] Add `LARGE_AMOUNT = 50_000_000` and `MAX_AMOUNT = 1_000_000_000_000` to frontend/src/lib/split.ts with a one-line comment each (FR-011, FR-013)
- [X] T003 [P] Add the PR-B strings in vi and en, in the `form` and `recurring` groups only: `form.summaryTitle`, `form.amountTooLarge` ("Số tiền tối đa là 1.000.000.000.000đ." / "The most an expense can be is 1,000,000,000,000đ."), `form.confirmLarge(amount)` ("Số tiền {amount} lớn bất thường. Lưu thật nhé?"), `form.confirmEdit` ("Sửa lại" / "Change it"), `form.confirmSave` ("Lưu thật" / "Save anyway"); reuse `recurring.equalOnly` for the repeat line, in frontend/src/i18n/vi.tsx and frontend/src/i18n/en.tsx

### Phase 2: User Story 1, a failed save says why where you can see it (P1) 🎯 MVP

**Goal**: a summary inside the sticky save area, precise focus, revalidation, server errors mapped to fields.

**Independent Test**: each form mistake at 360 px: summary visible in the save area, focus on the named field; a network error is announced without moving the focus.

- [X] T004 [P] [US1] Create frontend/src/lib/formError.ts exporting `formError(error: unknown): { message: string; field: Field | null } | null`: `ApiError` with code `validation_error` maps `details[0].loc` (`description` → description, `amount` → amount, `payer_id` → payer, `spent_at` → date, anything under `split` → split); codes `unknown_member` and `member_without_account` → split; `recurring_month_taken` → `null` (keeps its own presentation); other errors → `{ message, field: null }` using `errorMessage()`; with Vitest cases in frontend/src/lib/formError.test.ts for each mapping
- [X] T005 [US1] Write Vitest cases in frontend/src/components/ExpenseForm.test.tsx: (a) Tự chia 50.000đ short → summary "Chưa chia: 50.000đ" inside `.form-actions`, focus on the first share input; (b) an unreadable share → focus on that share; (c) Chia đều with nobody ticked → focus on the first person checkbox; (d) empty description and bad amount together → summary names the description, focus on it; (e) after a failed save, editing the description but leaving the amount bad → summary switches to the amount, does not disappear; fixing everything → summary hidden; (f) `serverError` with field `payer` → summary + focus on payer; (g) `serverError` with field null → summary shown, focus unchanged, announced through `role="status"`; (h) server message clears when its field is edited and on the next submit; (i) typed values survive every failed save
- [X] T006 [US1] In frontend/src/components/ExpenseForm.tsx make `check()` return, with each split problem, the focus target: `split-share-<id>` for the first unreadable share, the first custom share for mismatch or no share, `split-person` for nobody ticked; add those `data-field` attributes to the share inputs and the first person checkbox; `handleSubmit` stores the target in `focusField`, the existing effect scrolls it into view (`behavior: 'auto'` when `prefers-reduced-motion`, else `'smooth'`) then focuses it with `preventScroll`
- [X] T007 [US1] In the same file render `.form-summary` (`role="status"`, `aria-live="polite"`) as the first child of `.form-actions`, showing the first problem in `ORDER` or the server message; make the per-field messages non-live (keep `aria-describedby`); add `submittedOnce` so that after a failed submit every edit re-runs `check()` instead of clearing the problem
- [X] T008 [US1] Replace the `error: string | null` prop with `serverError?: { message: string; field: Field | null } | null` in frontend/src/components/ExpenseForm.tsx (the summary shows it; a non-null field also sets the focus target); clear it locally when its field, the amount, payer, date or split changes, or on submit; in frontend/src/pages/ExpensesPage.tsx pass `serverError={formError(form.error)}` and keep the existing `recurring_month_taken` handling untouched (no other change in that file)
- [X] T009 [P] [US1] Add `.form-summary` styles in frontend/src/index.css: inside the sticky bar, debt text colour on the bar surface (4.5:1 light and dark), wraps, at most 3 lines with the rest readable on focus of the field

### Phase 3: User Story 3, repeat and Tự chia cannot clash (P2)

**Goal**: whenever a new expense becomes Tự chia (hand, fill, undo), repeat is off and unavailable.

**Independent Test**: tick repeat, switch to Tự chia by each path: unticked, disabled, with the line.

- [X] T010 [US3] Write Vitest cases in frontend/src/components/ExpenseForm.test.tsx: repeat ticked then the Tự chia button → repeat unticked and disabled with "Khoản định kỳ chỉ chia đều được."; a quick-add fill with a custom split → same; undo of a fill that had changed the split → repeat and varying restored to their values before the fill; back to Chia đều → enabled but unticked; editing an existing expense or recording a due month → no change
- [X] T011 [US3] In frontend/src/components/ExpenseForm.tsx add `chooseSplit(next)` and use it in both mode buttons, `fill()` and `undoFill()`: when `next === 'custom' && offerRepeat`, also `setRepeat(false)` and `setVarying(false)`; render the repeat checkbox `disabled` with `t.recurring.equalOnly` under it while `splitType === 'custom'`; add `repeat` and `varying` to `lastFill.before` and restore them in `undoFill()`; keep the existing check in `check()`

### Phase 4: User Story 4, amounts hard to get wrong (P2)

**Goal**: inline confirmation above 50.000.000đ, the API maximum refused, one-time equal prefill, share echo.

**Independent Test**: 50.000.001đ asks once, 50.000.000đ does not, 2.000.000.000.000đ is refused; 10đ for members 9, 2, 5 prefills 3, 4, 3; "120k" in a share shows "= 120.000đ".

- [X] T012 [US4] Write Vitest cases in frontend/src/components/ExpenseForm.test.tsx for the confirmation: 50.000.001 → `.form-confirm` with "Sửa lại" focused; Escape → focus on amount, nothing saved; "Lưu thật" clicked → `onSubmit` called once; pressing Enter in the description while confirming → no submit; confirm 60tr then retype 60.000.000 → saves without asking; 70tr after confirming 60tr → asks again; failed save then retry of the same amount → no second question; 50.000.000 → no question; 2.000.000.000.000 → `form.amountTooLarge` under the amount, no question; a quick-add fill of 60tr does not open it
- [X] T013 [US4] Implement the confirmation in frontend/src/components/ExpenseForm.tsx per research R4: `MAX_AMOUNT` check in `check()`; `confirming`/`confirmedAmount` state; `handleSubmit` stops at a clean check when `amount > LARGE_AMOUNT && confirmedAmount !== amount`; while `confirming`, the form's submit handler returns early and `.form-actions` renders `.form-confirm` ("Sửa lại" autofocused, Escape handled on the container); "Lưu thật" acts only on a click or on a keydown that started on it, guarded by `submitting`; an effect clears `confirming` when the parsed `amount` changes; `confirmedAmount` cleared on successful save and on reset
- [X] T014 [US4] Write Vitest cases for the prefill: 10đ, members 9, 2, 5 ticked, click Tự chia → shares 3, 4, 3 in member order (lowest id gets the extra), summing to 10; no amount then Tự chia → empty, typing 300.000đ fills 100.000đ each; typing a share before the amount → no prefill ever; total changed after prefill → shares stay, remainder shows; switching back and forth → typed shares kept, no second prefill; editing an existing custom expense → its shares; a quick-add custom fill → its shares; undo of a fill → shares and prefill state restored; an AI-blocked preview is never replaced
- [X] T015 [US4] Implement the prefill in frontend/src/components/ExpenseForm.tsx per research R5: `prefill` state (`'pending'` for a new expense in Chia đều, `'off'` when the form starts in Tự chia or after a custom fill), fill on the first user switch to Tự chia using `equalSplit(amount, [...selected])` from frontend/src/lib/split.ts when the amount is valid and no share typed, otherwise an effect fills on the first valid amount while still in Tự chia; any typed share sets `'done'`; store `prefill` in `lastFill.before`
- [X] T016 [US4] Add the share echo in frontend/src/components/ExpenseForm.tsx: under each share input, `<span className="amount-preview share-preview">= {formatVND(n)}</span>` when its text parses to a positive integer; an unreadable share gets its own message element tied by `aria-describedby`; keep the typed text as typed and blank/zero meaning "not sharing"; Vitest: "120k" shows "= 120.000đ", "abc" shows the total's message under that share
- [X] T017 [P] [US4] Add `.form-confirm` and `.share-preview` styles in frontend/src/index.css: the confirm row replaces the button row in the sticky bar, two 44 px buttons ("Lưu thật" primary), text wraps at 360 px; the share echo matches `.amount-preview`
- [X] T018 [US4] Update docs/DESIGN.md §6.3 (save summary, confirmation, repeat lock, prefill, share echo) and §7 for the new copy

**Checkpoint PR-B**: lint, Vitest, build, local E2E (add to frontend/e2e/smoke.spec.ts or a new frontend/e2e/form.spec.ts one case: Tự chia short → summary visible and the first share focused at 360 px). Open PR-B.

---

## PR-D: app shell, quick add, recurring list (US2, US5, US6)

### Phase 5: Setup (PR-D)

- [X] T019 Open a GitHub issue "Slow-answer notice, quick add guard and AI availability, per-item stop errors (spec 011, PR-D)" and create branch `feat/011-app-shell` from `main`
- [X] T020 [P] Add the PR-D strings in vi and en, in new or owned groups only: `app.slowNotice` (the text of US2, scenario 1, and its English), `ai.unavailable` ("Gõ nhanh bằng AI chưa được bật trên máy chủ này."), `ai.typedSentence` ("Câu bạn đã gõ:"), `ai.typeIntoForm` ("Nhập các thông tin trong câu vào biểu mẫu bên dưới."), `recurring.stopUnclear` ("Chưa xác nhận được là đã ngừng lặp."), in frontend/src/i18n/vi.tsx and frontend/src/i18n/en.tsx

### Phase 6: User Story 2, a slow answer says what may be going on (P1)

**Goal**: a notice above the content while any request has waited more than 5 s, announced once per episode.

**Independent Test**: with fake timers, a request pending 6 s shows the notice; it hides when the request ends; reshowing within 10 s is not announced again.

- [X] T021 [P] [US2] Create frontend/src/lib/slowRequests.ts: `begin(): token` (starts a 5 s timer that marks the token slow), `end(token)` (clears timer and slow mark), `useSlowRequests(): { slow: boolean; announce: boolean }` via `useSyncExternalStore`; episode rule: `announce` becomes true when `slow` turns on and the notice has been hidden at least 10 s (or never shown), false otherwise; Vitest in frontend/src/lib/slowRequests.test.ts with fake timers for 4.9 s (not slow), 5 s (slow), two staggered tokens (hides only when both end), reshow within 10 s (no announce), after 10 s (announce)
- [X] T022 [US2] In frontend/src/api/client.ts call `begin()` before `fetch` and `end()` in a `finally` that wraps the fetch and the body read, so every exit (success, HTTP error, network error, abort, the session-changed throw) ends the token; add Vitest cases in frontend/src/api/client.test.ts that a request rejecting, a 401 and a session change all end their token
- [X] T023 [US2] Create frontend/src/components/SlowNotice.tsx rendering `.slow-notice` with `t.app.slowNotice` when `slow`, inside a `role="status"` region whose text is set only when `announce` is true (otherwise the visible text is in a non-live element); render `<SlowNotice />` in frontend/src/App.tsx just before `<main>` in both the signed-in and the signed-out layouts (no change to AuthPage)
- [X] T024 [P] [US2] Add `.slow-notice` styles in frontend/src/index.css: full width in the page column, muted surface, 44 px min height, not sticky, text 4.5:1 in light and dark, no layout jump larger than its own height
- [X] T025 [US2] Vitest in frontend/src/App.test.tsx: a request held 6 s shows the notice on the sign-in page and on a household page; it disappears when the request resolves; a route change while showing does not re-announce

### Phase 7: User Story 5, quick add when busy or switched off (P2)

**Goal**: one request at a time; the box replaced by a line once the server says AI is not set up.

**Independent Test**: three Enters, a button press and a Retry during one reading send one request; with `ai: false` the line shows and keeps a typed sentence.

- [X] T026 [P] [US5] Backend: in app/routers/system.py add `"ai": bool(request.app.state.gemini.configured)` to `/api/version` and set `Cache-Control: no-store` on that response; pytest in tests/test_health.py: `ai` is false without a key and true with a configured fake client, the header is `no-store`, the response never contains the key value
- [X] T027 [P] [US5] Create frontend/src/lib/aiAvailability.ts: a module-level promise fetching `/api/version` once per page load through `request()`, and `useAiAvailability(): 'unknown' | 'on' | 'off'` (missing field or error → `'unknown'`); Vitest in frontend/src/lib/aiAvailability.test.ts: one fetch for two components, `ai: false` → `'off'`, failure → `'unknown'`
- [X] T028 [US5] In frontend/src/components/AiComposer.tsx add an `inFlight` ref set at the start of `read()` and cleared in the `finally` of the call; `read()` returns at once while it is set, so Enter, the button and Retry share the guard, including after "Nhập tay" until the earlier call ends; keep Shift+Enter and the `isComposing` / keyCode 229 guards
- [X] T029 [US5] In the same file use `useAiAvailability()`: `'off'` replaces the composer with `ai.unavailable` and, when text was typed, `ai.typedSentence` + the sentence as selectable wrapping text + `ai.typeIntoForm`; `'unknown'` and `'on'` keep today's composer and today's `ai_not_configured` fallback
- [X] T030 [US5] Vitest in frontend/src/components/AiComposer.test.tsx: three Enters, a button press and a Retry during a pending read → exactly one request; after "Nhập tay" a new Enter while the first call is pending → no request; `'off'` → the line and no textarea; text typed then availability resolves `'off'` → the sentence is shown; `'unknown'` → today's composer
- [X] T031 [US5] Update docs/ARCHITECTURE.md (the `/api/version` `ai` field and why it is safe) and docs/DESIGN.md §6.3 (quick add when not set up)

### Phase 8: User Story 6, stopping a repeating item says when it is unclear (P3)

**Goal**: per-item waiting state and message; old-house answers dropped.

**Independent Test**: a failed stop shows the message under that item only; stopping two items keeps separate states; moving house drops a late answer.

- [X] T032 [US6] In frontend/src/pages/ExpensesPage.tsx replace the single stop mutation state with `stopping: Set<number>` and `stopErrors: Record<number, string>` keyed to the current `householdId` (reset when it changes); each stop call captures the house id and ignores its result if the house changed; on success clear that item's error and show today's toast; on failure set `t.recurring.stopUnclear` + the error message for that item (no other change in this file)
- [X] T033 [US6] In frontend/src/components/RecurringList.tsx replace `stoppingId` with `stoppingIds: Set<number>` and add `errors: Record<number, string>`; disable each "Ngừng lặp" only while its own stop waits; render the error under its item in `.recurring-error` with `role="alert"` (mounted even when the fold is closed so it is announced)
- [X] T034 [P] [US6] Add `.recurring-error` styles in frontend/src/index.css (debt text, wraps, 4.5:1)
- [X] T035 [US6] Vitest in frontend/src/components/RecurringList.test.tsx and frontend/src/pages/ExpensesPage.test.tsx: a failed stop shows "Chưa xác nhận được là đã ngừng lặp." under that item only; two stops at once keep separate disabled states; a late answer after switching house shows nothing; a later success clears the message and toasts

**Checkpoint PR-D**: `ruff check .`, pytest, lint, Vitest, build, local E2E (the local stack has no Gemini key: one case that the quick-add line shows once `/api/version` answers). Open PR-D.

---

## Phase 9: Polish (each PR, for its part)

- [X] T036 Accessibility pass on the changed screens: 360 px with the keyboard open and 200% zoom, no sideways scroll, every new button ≥ 44 px with a visible focus ring, one announcement for the summary, the confirmation and the notice, reduced motion respected (frontend/e2e/a11y.spec.ts stays green) Done 08/11 on the local stack: no sideways scroll at 320×640, 360×400 (keyboard open) and 640×400 (1280 at 200 %) with the summary and with the question; Sửa lại, Lưu thật and Ngừng lặp are 44 px; Lưu thật shows the yellow ring from the keyboard; reduced motion scrolls with `auto`. It found one gap, fixed after: a disabled Lưu dropped the keyboard focus to the page after a failed save, so the button is `aria-disabled` while saving and keeps the focus.
- [X] T037 Run [quickstart.md](quickstart.md) by hand for the PR's stories and put what was checked, with screenshots at 360 px and 1440 px, in the PR description Done 08/11: every by-hand step of quickstart.md for US1 to US6 on the local stack, 34 checks, all passed (the slow notice under the header signed in and above the sign-in block on a laptop; 10đ for three gives 4, 3, 3).
- [ ] T038 After each merge: wait for the deploy, check the live E2E run is green, and on the live site check `/api/version` shows `"ai": true` and quick add still works

---

## Dependencies & Execution Order

- PR-B (T001–T018) and PR-D (T019–T035) are independent; the second to merge rebases (both touch `ExpensesPage.tsx` in different props, `index.css` and `i18n` in different groups).
- In PR-B: T006–T008 before T010 (the summary also shows the repeat line), T013 before T015 is not required; T016 after T015.
- In PR-D: T021 before T022 and T023; T026 before T027 is not required (the lib tolerates a missing field); T027 before T029.
- Do not edit the files of spec 012: `VerdictBlock.tsx`, `DashboardPage.tsx`, `HouseholdList.tsx`, `ExpenseList.tsx`, `ExpenseTable.tsx`, `ExpenseFilters.tsx`, `i18n/language.ts`, `AuthPage.tsx`.

## Parallel Opportunities

- PR-B: T002, T003, T004, T009 at once; T017 alongside T013–T016.
- PR-D: T020, T021, T024, T026, T027, T034 at once.

### Parallel Example: PR-D

```text
Task: "slowRequests store with fake-timer tests"          (T021)
Task: "/api/version ai field + no-store, pytest"          (T026)
Task: "aiAvailability lib with tests"                      (T027)
Task: ".recurring-error styles"                            (T034)
```

## Implementation Strategy

### MVP first (PR-B, User Story 1)

1. T001–T009: failed saves are visible and focused; this alone removes the most common "nothing happens" moment.
2. T010–T011: the repeat lock.
3. T012–T018: amounts and prefill. Open PR-B.

### Then PR-D

T019–T025 the slow notice (the first-visit fix), T026–T031 quick add, T032–T035 stop errors. Open PR-D.
