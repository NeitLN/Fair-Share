# Tasks: Safe saves

**Input**: Design documents from `specs/018-safe-saves/`: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/ui-contract.md](contracts/ui-contract.md), [quickstart.md](quickstart.md)

**Tests**: requested. Vitest for every rule, plus one new E2E file `frontend/e2e/safe-saves.spec.ts`. Tests are written first in each story and must fail before the code that makes them pass.

**Delivery**: one PR `feat/018-safe-saves` (from main), four commits:

1. US1 (Phases 1–3);
2. US2 (Phase 4);
3. US3 (Phase 5);
4. US4 and polish (Phases 6–7).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: US1–US4 from spec.md
- Paths are from the repository root

## Path Conventions

Frontend only: `frontend/src/...`, `frontend/e2e/...`, plus `docs/DESIGN.md`. No change under `app/`, `migrations/` or `tests/`.

---

## Phase 1: Setup

- [X] T001 Create branch `feat/018-safe-saves` from `main` (after `spec/018-safe-saves` is merged or rebased onto it). Confirm `npm test` and `npm run lint` are green in `frontend/` before any change.
- [X] T002 [P] Add the `save` block to `frontend/src/i18n/vi.tsx` and `frontend/src/i18n/en.tsx`. It holds the offline and unknown lines for A1–A7 plus the quick-add offline line, word for word from contracts/ui-contract.md §2, keyed as `save.<action>.offline` and `save.<action>.unknown`. Add the close label `save.close` ("Đóng" / "Close").

---

## Phase 2: Foundational (blocks every story)

- [X] T003 [P] Write `frontend/src/api/client.test.ts` cases covering:
  - a write (POST, PUT, PATCH, DELETE) with `navigator.onLine === false` throws `ApiError(0,'offline')` and `fetch` is never called;
  - a GET while offline still tries `fetch` (reads unchanged);
  - a write whose `fetch` rejects throws `ApiError(0,'outcome_unknown')`;
  - a write whose body read fails throws `outcome_unknown`;
  - a read whose `fetch` rejects still throws `network_error`;
  - with fake timers, a write with no answer aborts at `WRITE_GIVE_UP_MS` (90 000) and throws `outcome_unknown`;
  - `endRequest` is called in every case above (spy on `lib/slowRequests`).
- [X] T004 Implement R1 and R2 in `frontend/src/api/client.ts`:
  - export `WRITE_GIVE_UP_MS = 90_000`;
  - for non-GET methods, check `navigator.onLine` before `fetch`;
  - use an `AbortController` whose timer covers `fetch` and the body read, and clear it in `finally`;
  - map a rejection or abort of a write to `outcome_unknown` with the message `messages().failure.unknown`;
  - keep `endRequest` in `finally`;
  - add `failure.offline` and `failure.unknown` generic fallbacks to both i18n files.
- [X] T005 [P] Write `frontend/src/api/queryClient.test.ts`:
  - a mutation with `meta.householdId` failing with `outcome_unknown` invalidates `keys.household(id)` at 0, 10 000 and 30 000 ms (fake timers);
  - one failing with `offline` or a 4xx does not;
  - mutations are not paused when `onlineManager` says offline (`networkMode 'always'`);
  - mutations are not retried.
- [X] T006 Implement R3 in `frontend/src/api/queryClient.ts`:
  - `defaultOptions.mutations = { networkMode: 'always', retry: 0 }`;
  - a `MutationCache` with `onError` scheduling the three invalidations for `outcome_unknown` when `mutation.meta?.householdId` is a number;
  - declare the `meta` type through TanStack's `Register` interface.
- [X] T007 [P] Write `frontend/src/lib/saveOutcome.test.ts`. `outcomeOf()` returns:
  - `offline` for code `offline`;
  - `unknown` for `outcome_unknown`;
  - `other` for anything else, including `network_error` from reads and `ApiError` 4xx/5xx.

  `outcomeLine(action, outcome, t)` returns the exact contract line for each A1–A7 in vi and en, and `null` for `other`.
- [X] T008 Create `frontend/src/lib/saveOutcome.ts` with `type SaveAction = 'A1'|…|'A7'|'quickAdd'`, `outcomeOf(error)` and `outcomeLine(action, outcome, t)`, as tested in T007.

**Checkpoint**: the request layer reports offline, unknown and give-up. Covered saves are never paused or retried. Unknown results refresh the household 3 times.

---

## Phase 3: User Story 1 - A failed save says what is known, and nothing is sent behind the person's back (P1) 🎯 MVP

**Goal:** A1–A7 report "not done" when offline and "result unknown" when the answer is lost. Nothing is ever sent later on its own. A success ends with the write, not with the refresh.

**Independent test:** quickstart E2E 1 and 2. Offline: the line shows within 3 s and 0 POSTs follow. Dropped answer: the unknown line shows, and the row appears within 35 s.

### Tests for User Story 1

- [X] T009 [P] [US1] In `frontend/src/components/ExpenseForm.test.tsx`, add two cases:
  - a save rejected with `offline` shows "Chưa lưu được: bạn đang mất mạng. Khoản chi này chưa được lưu." in the summary and keeps every field;
  - a save rejected with `outcome_unknown` shows "Chưa nhận được kết quả. Có thể khoản chi đã được lưu, xem danh sách trước khi lưu lại." with no "Chưa lưu được:" before it (FR-016a).
- [X] T010 [P] [US1] In `frontend/src/pages/ExpensesPage.test.tsx`:
  - a `create` whose refetch of the household hangs still clears the form and shows the toast as soon as the POST resolves (FR-010);
  - a success after the page unmounted shows no toast and still invalidates `keys.household(id)` (R8).
- [X] T011 [P] [US1] In `frontend/src/pages/DashboardPage.test.tsx`:
  - offline and unknown lines for A2 (`SettlementForm` alert), A3/A4 (transfers panel alert, and inside the open amount step for "Chuyển số khác"), A5 "Xác nhận đã nhận" (panel alert) and A7 history delete (history error line);
  - `record`, `notice` and `remove` end when their write ends even if the refetch hangs.
- [X] T012 [P] [US1] In `frontend/src/lib/usePaidTransfers.test.ts`:
  - an undo rejected with `outcome_unknown` shows a toast with the A6 unknown line, `sticky: true` and no "Couldn't undo." prefix;
  - an offline undo shows "Chưa hoàn tác được: bạn đang mất mạng.".
- [X] T013 [P] [US1] Create `frontend/e2e/safe-saves.spec.ts` with quickstart cases 1 (offline A1, 0 POSTs after reconnect and after moving to Tổng quan) and 2 (dropped answer via `route.fetch()` + `route.abort('connectionreset')`, unknown line, row visible within 35 s, no reload). Use shared accounts and delete the household in `finally`.

### Implementation for User Story 1

- [X] T014 [US1] In `frontend/src/pages/ExpensesPage.tsx`:
  - `create`, `update` and the expense `remove`: `meta: { householdId }`, and `onSuccess` calls `void refresh()` instead of returning it;
  - wrap the toast and the `setEditing`/`setComposerKey` calls in a `useAlive()` check (create `frontend/src/lib/useAlive.ts` if no shared helper exists; reuse the one in `usePaidTransfers.ts` by moving it there);
  - pass `outcomeLine('A7', …)` into the list and table delete error line.
- [X] T015 [US1] In `frontend/src/components/ExpenseForm.tsx`, render `outcomeLine('A1', outcomeOf(error), t)` when it is not null, without `t.form.notSaved()`. Other errors keep `notSaved()` as today.
- [X] T016 [US1] In `frontend/src/pages/DashboardPage.tsx`:
  - `notice`, `record` and `remove` get `meta: { householdId }`, and `onSuccess` becomes `void refresh…()`;
  - the toasts are behind `useAlive()`;
  - `tellPart` returns `outcomeLine('A3', …)` when not null;
  - the transfers panel alert and the history error line use the A3/A4/A5/A7 lines through `outcomeLine`.
- [X] T017 [P] [US1] In `frontend/src/components/SettlementForm.tsx`, show `outcomeLine('A2', …)` in its alert line when not null.
- [X] T018 [US1] In `frontend/src/lib/usePaidTransfers.ts`:
  - `meta: { householdId }` on the confirm and undo mutations;
  - the confirm error uses A5 lines;
  - an undo error uses A6 lines, and on `outcome_unknown` shows the toast with `sticky: true` (the toast field comes in T034; until then pass it and let the provider ignore it).
- [X] T019 [P] [US1] In `frontend/src/components/AiComposer.tsx`, an `offline` failure from the parse request shows `save.quickAdd.offline` at once.

**Checkpoint (commit 1)**: US1 is complete and shippable on its own. Run Vitest and the new E2E cases 1 and 2.

---

## Phase 4: User Story 2 - A save in flight cannot be changed underneath (P1)

**Goal:** from dispatch until the write ends, a covered form's values cannot change by any route. The form shows that it is locked, and focus is never thrown away.

**Independent test:** quickstart E2E 3 (a 9 s POST, typing changes nothing, the saved values equal the values at press time), plus axe on the locked form.

### Tests for User Story 2

- [X] T020 [P] [US2] Create `frontend/src/lib/useSaveLock.test.tsx`:
  - `locked` follows `pending`;
  - `guard(fn)` does not call `fn` while locked and calls it otherwise;
  - focus on an input stays on it when the lock turns on.
- [X] T021 [P] [US2] In `frontend/src/components/ExpenseForm.test.tsx`, with a pending save:
  - typing in Nội dung or Số tiền, picking a payer or category, changing the split or ticking "Lặp lại hằng tháng" changes nothing;
  - inputs have `readOnly` and `aria-readonly`, pickers `aria-disabled`, and the form `aria-busy="true"`;
  - `fill()`, `undoFill()` and a new default payer prop do nothing;
  - after a rejected save every value is back and editable;
  - a field error or the big-amount question before sending does not lock.
- [X] T022 [P] [US2] In `frontend/src/components/AiComposer.test.tsx`:
  - with `blocked`, "Điền giúp" is `aria-disabled` and pressing it sends nothing;
  - an answer that arrives while `blocked` is not passed to `onDraft`, and the text stays.
- [X] T023 [P] [US2] In `frontend/src/components/NoticeAmountStep.test.tsx`:
  - with `busy`, the amount and note are read-only, and Escape and Huỷ do nothing;
  - after `busy` ends with a `serverProblem`, Escape closes and calls `onCancel`.
- [X] T024 [P] [US2] In `frontend/src/components/VerdictBlock.test.tsx`, "Nhận số khác":
  - submitting keeps the step open while pending;
  - a rejection keeps it open with the amount and shows the A5 line inside the step (new error place);
  - success closes it and returns focus as spec 014 FR-014 says.
- [X] T025 [P] [US2] In `frontend/src/components/SettlementForm.test.tsx`, its fields are locked while pending and restored on failure.
- [X] T026 [P] [US2] Add quickstart case 3 to `frontend/e2e/safe-saves.spec.ts`. Delay POST `/expenses` by 9 s with `route` and type during it. The saved description is the one at press time. Run axe on the locked form: 0 violations.

### Implementation for User Story 2

- [X] T027 [US2] Create `frontend/src/lib/useSaveLock.ts` (R5). It returns `{ locked, guard }` and is driven by the mutation's `isPending`. Native `disabled` is never used on focusable controls.
- [X] T028 [US2] Lock `frontend/src/components/ExpenseForm.tsx` with `useSaveLock(saving)`:
  - `readOnly` and `aria-readonly` on text, amount and date inputs;
  - `aria-disabled` plus guarded handlers on payer, category, split, member ticks and the recurring tick;
  - `aria-busy` and `.is-locked` on the form;
  - `fill()`, `undoFill()` and the default-payer effect return early while locked;
  - pass `locked` up through the existing ref or props so ExpensesPage can block quick add.
- [X] T029 [US2] In `frontend/src/pages/ExpensesPage.tsx` and `frontend/src/components/AiComposer.tsx`:
  - pass `blocked={create.isPending || update.isPending}` to the composer;
  - the composer ignores presses and drops answers while blocked, keeping its text;
  - `onDraft` also checks the form's lock (FR-008).
- [X] T030 [P] [US2] In `frontend/src/components/SettlementForm.tsx`, lock its fields while `record` is pending, using the same hook.
- [X] T031 [US2] In `frontend/src/components/NoticeAmountStep.tsx`, while `busy`:
  - the amount and note are `readOnly`;
  - Escape and Huỷ are ignored;
  - after `busy` ends they work again.
- [X] T032 [US2] In `frontend/src/components/VerdictBlock.tsx` (R9), "Nhận số khác":
  - `onSubmit` awaits `onPaid(...)` and closes the step only on success;
  - a failure line goes into the step's `serverProblem`.

  In `frontend/src/pages/DashboardPage.tsx` and `frontend/src/lib/usePaidTransfers.ts`, return a `Promise<string | null>` for the partial confirm, like `tellPart`.
- [X] T033 [P] [US2] In `frontend/src/index.css`, add an `.is-locked` look for form fields: muted field background and `cursor: progress`. Use no opacity on text, so contrast stays AA.

**Checkpoint (commit 2)**: US1 and US2 pass. The axe check on the locked form is clean.

---

## Phase 5: User Story 3 - Toasts never cover the save, and never say "saved" next to a failure (P2)

**Goal:**

- One toast at a time on phones, placed above the sticky save area or at the top, never over it.
- Success toasts disappear when a new save starts or when an error shows.
- Toasts pause while in use.
- The A6 unknown toast stays until closed.

**Independent test:** quickstart E2E 4 at 360 px (2 saves plus 1 refusal: at most one toast, 0 px overlap, no success toast next to an error; a focused "Hoàn tác" still there after 15 s).

### Tests for User Story 3

- [X] T034 [P] [US3] Rewrite and extend `frontend/src/components/Toast.test.tsx`. With fake timers and `matchMedia` mocked to < 600 px and ≥ 600 px:
  - focus or hover pauses the timer and it restarts at 7 s;
  - a `sticky` toast never times out and has "Đóng";
  - below 600 px: one visible, a newcomer replaces one that is not in use, and waits behind one in use (newest waiter wins); every `onGone` runs exactly once;
  - from 600 px: up to 3, the oldest not in use is evicted, and one in use is never evicted;
  - `started(source)` removes success toasts from that source that are not in use, and keeps one in use;
  - `errorShown(true)` removes every success toast, even in use, moves focus to the given target if the toast had it, and blocks new or queued success toasts until `errorShown(false)`.
- [X] T035 [P] [US3] Create `frontend/src/components/Toast.placement.test.tsx`. Mock `ResizeObserver`, `visualViewport` and element rects:
  - with a sticky `.form-actions` 120 px tall, the region bottom is 128 px;
  - when the toast does not fit above, the region gets `.toasts--top`;
  - when it fits nowhere, the toast is hidden with its timer paused, and focus moves to the form's submit control if the toast had it;
  - ≥ 1024 px: no measuring.
- [X] T036 [P] [US3] Add quickstart case 4 to `frontend/e2e/safe-saves.spec.ts` at 360x800:
  - two saves, then a Tự chia mismatch;
  - after each step, count `.toast` elements that are visible (≤ 1);
  - assert their bounding boxes do not intersect `.form-actions` or the error summary;
  - assert no success toast is visible while the summary shows;
  - then tab into "Hoàn tác" and wait 15 s with another toast triggered.

### Implementation for User Story 3

- [X] T037 [US3] Extend `frontend/src/lib/toast.ts` (R6):
  - `ToastInput` gains `kind?: 'success' | 'info'`, `source?: string` and `sticky?: boolean`;
  - add the `SaveFeedback` context with `started(source)` and `errorShown(active, focusTarget?)`, plus the `useSaveFeedback()` and `useVisibleSaveError(message, focusTarget)` hooks;
  - keep `TOAST_MS = 7000` and `MAX_TOASTS = 3`;
  - add `PHONE_TOAST_QUERY = '(max-width: 599.98px)'`.
- [X] T038 [US3] Rework `frontend/src/components/Toast.tsx` (R6, R7, data-model.md "Provider rules" 1–6):
  - in-use tracking per toast (`focusin`/`focusout`, `pointerenter`/`pointerleave`);
  - timers only for visible toasts that are not in use and not sticky;
  - the phone one-visible rule with a one-slot queue; the ≥ 600 px eviction of the oldest not in use;
  - the success removal and blocking driven by `errorShown`;
  - focus recovery;
  - sticky toasts with a "Đóng" button;
  - `onGone` exactly once.
- [X] T039 [US3] Add placement to `frontend/src/components/Toast.tsx`, below 1024 px only:
  - a `ResizeObserver` on the visible sticky `.form-actions`, plus `visualViewport` `resize`/`scroll`;
  - set `--toast-bottom` to its height plus 8 px;
  - switch to `.toasts--top` when the toast does not fit above;
  - hide with the timer paused when it fits nowhere.
- [X] T040 [US3] Tag every success toast with `kind: 'success'` and `source`:
  - `frontend/src/pages/ExpensesPage.tsx` uses `expense-form`;
  - `frontend/src/pages/DashboardPage.tsx` and `frontend/src/lib/usePaidTransfers.ts` use `transfer-<from>-<to>`, `settlement-form` and `history`.

  Call `started(source)` when each covered save is dispatched.
- [X] T041 [US3] Call `useVisibleSaveError(message, focusTarget)` in each error place:
  - the ExpenseForm summary (target: the summary or the first invalid field, as spec 011);
  - the SettlementForm alert;
  - the transfers panel alert;
  - the NoticeAmountStep problem line;
  - the history error line;
  - the expense list and table delete line.
- [X] T042 [P] [US3] In `frontend/src/index.css`, add the toast rules:
  - replace the fixed 80 px padding (near line 2774) with `bottom: var(--toast-bottom, 16px)`;
  - add `.toasts--top` (top of the visual viewport, 8 px gap);
  - below 1024 px, clamp `.toast span` to 2 lines (`-webkit-line-clamp: 2`), with the full text in `aria-label` set in `Toast.tsx`.

**Checkpoint (commit 3)**: US1–US3 pass, including E2E case 4.

---

## Phase 6: User Story 4 - The phone save bar reads as a bar (P3)

**Goal:** below 1024 px, the sticky save area has a visible top edge in both themes.

**Independent test:** a 360 px screenshot in light and dark with payer chips under the bar.

- [X] T043 [US4] In `frontend/src/index.css` `.form-actions` (near line 1347), inside the < 1024 px media rule, add `border-top: 1px solid var(--line)` and `box-shadow: 0 -4px 12px` with a soft ink colour token. Check light and dark; desktop is unchanged.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T044 [P] Update `docs/DESIGN.md` §5 (toasts):
  - one toast below 600 px with a one-slot queue;
  - pause while in use;
  - placement above the sticky save area or at the top;
  - the 2-line clamp;
  - the sticky "result unknown" toast;
  - the success-toast rules;
  - the sticky bar's top edge and shadow (FR-018).
- [X] T045 [P] Add quickstart case 5 to `frontend/e2e/safe-saves.spec.ts`: "Nhận số khác" offline keeps the step open with the amount and the A5 offline line inside it.
- [X] T046 Run the full checks on the local stack:
  - `npm test`, `npm run lint` and `npx tsc -b --noEmit` in `frontend/`;
  - `npx playwright test safe-saves form notices quick-add security` against http://172.21.33.10:3000;
  - the by-hand table in quickstart.md at 360 px, light and dark.

  If a run is red, copy `frontend/test-results/` to the scratchpad before rerunning.
- [X] T047 Mark the results in `specs/018-safe-saves/tasks.md`:
  - SC-001 to SC-007, each with the evidence (test name or screenshot);
  - set spec.md status to Implemented after the merge, once the live smoke is green.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1:** T001 first; T002 is parallel.
- **Phase 2:** T003–T008. Blocks every story, because the lines and outcomes come from here.
- **US1 (Phase 3):** needs Phase 2.
- **US2 (Phase 4):** needs Phase 2. It touches `ExpenseForm.tsx` and `ExpensesPage.tsx` like US1, so it runs after US1 in this single PR.
- **US3 (Phase 5):** needs Phase 2. T040 and T041 touch files changed in US1 and US2, so it comes after them.
- **US4 (Phase 6):** independent. It sits in commit 4 with the polish.
- **Polish (Phase 7):** last.

### User Story Dependencies

- US1 stands alone (the MVP).
- US2 can be reviewed without US3.
- US3 uses US1's tags on errors (`useVisibleSaveError` needs the US1 lines in place).
- US4 stands alone.

### Within Each User Story

Tests first (they fail), then the implementation, then the story's E2E case.

### Parallel Opportunities

- **Phase 2:** T003, T005 and T007 (three test files).
- **US1:** T009–T013 (different test files); T017 and T019 alongside T014–T016.
- **US2:** T020–T026; T030 and T033.
- **US3:** T034–T036; T042.
- **Polish:** T044 and T045.

## Parallel Example: User Story 1

```text
Together: T009 ExpenseForm.test.tsx, T010 ExpensesPage.test.tsx, T011 DashboardPage.test.tsx,
          T012 usePaidTransfers.test.ts, T013 e2e/safe-saves.spec.ts (cases 1-2)
Then:     T014 ExpensesPage.tsx → T015 ExpenseForm.tsx → T016 DashboardPage.tsx → T018 usePaidTransfers.ts
Alongside: T017 SettlementForm.tsx, T019 AiComposer.tsx
```

## Implementation Strategy

### MVP First (User Story 1 Only)

Phases 1–3 alone fix the worst finding (B01/E02): no hang, no save behind the person's back, honest lines. This becomes commit 1. If review time is short, it can be merged on its own.

### Incremental Delivery

Commit 1 US1, then commit 2 US2, then commit 3 US3, then commit 4 US4 plus DESIGN.md. Each commit keeps `npm test` green.

### Parallel Team Strategy

One builder (Tiến), reviewer Minh. Package 5 (request keys) can start alongside on its own branch, since it touches the API and migrations, not these files, except `client.ts`. Rebase it after this PR.

## Notes

- **Out of scope:** no change to `app/`, migrations or the API.
- **Spec Kit files:** `.claude/` and `.specify/` are never committed.
- **Commits:** author and committer must be Võ Việt Tiến <tien.vo539@gmail.com>.

---

## Results (12/11/2026, local stack at the branch head)

| Check | Result | Evidence |
|---|---|---|
| Unit tests | 1016 passed (977 before) | `npx vitest run` |
| Lint, types | Clean | `npm run lint`, `npx tsc -b --noEmit` |
| E2E, whole suite on the local stack | 34 passed (29 before + 5 new) | `npm run e2e` |
| SC-001 offline: line within 3 s, 0 POSTs after, also after reconnecting and moving page | Met | `e2e/safe-saves.spec.ts` "offline: …"; `ExpensesPage.test.tsx`, `DashboardPage.test.tsx` "… no connection …" |
| SC-002 dropped answer gives the unknown line; 90 s give-up ends the slow notice | Met | `safe-saves.spec.ts` "sent with no answer"; `client.test.ts` "… given up …" (fake timers) |
| SC-003 a 9 s save: nothing typed or filled in during it changes what is saved | Met | `safe-saves.spec.ts` "a slow save"; `ExpensesPage.test.tsx` "a save on its way" (typing and a quick-add answer) |
| SC-004 at 360 px: at most 1 toast, 0 px over the bar, no "saved" toast next to an error | Met | `safe-saves.spec.ts` "toasts at 360 px" |
| SC-005 a toast in use stays past 15 s, at phone and wide widths | Met | `Toast.test.tsx` "Toast and saves" |
| SC-006 axe on the locked expense form | 0 violations, light and dark, 360 px (axe-core 4.10.2, run once by hand: the repo's E2E has no axe) | screenshots `c018_locked_light.png`, `c018_bar_dark.png` from that run |
| SC-007 a late commit shows in the list within 35 s, no reload | Met | `safe-saves.spec.ts` "sent with no answer"; `queryClient.test.ts` (0/10/30 s) |

**Where the build differs from the plan, and why:**

- **Late answers:** a write that is given up at 90 s is aborted, so no late answer reaches the page at all. FR-006's "no direct effect" holds by construction. The 0/10/30 s refreshes cover a commit the server makes afterwards.
- **Toast placement (FR-014):**
  - A toast keeps its usual place at the bottom whenever that place does not reach the bar, for example once the form is scrolled up and its bar moves with the page (review of #295, tests with the bar at 20 and 300 px).
  - Only when the bar is down there does the toast go just above it, or wait out of sight if there is no room. "Top of the screen" is then the same space as "above the bar", so it is not a separate place.
  - The entry slide is now 6 px, under the 8 px gap, so a toast never slides over the bar.
  - Focus and pointer are tracked apart for "in use" (review of #295).
- **"Nhận số khác" (R9):** the card is drawn again while it is sent, so what was typed is kept per pair in `VerdictBlock`. The step shows the amount as sent (`60000` for `60k`).
- **Where the tests went:**
  - T012 (A5/A6 lines) is in `DashboardPage.test.tsx`, through the page.
  - The quick-add block (T022) and the amount step's lock (T023) are covered in `ExpensesPage.test.tsx` and `DashboardPage.test.tsx`.
  - T014 reuses the existing guards (`houseNow` in `ExpensesPage`, an `alive` ref in `DashboardPage`) instead of a new `useAlive`.
- **Lines for writes:** any write that is not GET reports `offline` or `outcome_unknown` from `request()`. Writes outside A1–A7 (sign-in, profile) keep today's words, through the generic `failure.network` / `failure.offline`.