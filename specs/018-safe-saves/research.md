# Research: Safe saves

All points were open after the spec. Each one is decided below.

## R1. Telling "not sent" from "result unknown"

**Decision:**

- In `request()`, a write (any method other than GET) checks `navigator.onLine` before `fetch`. If it is `false`, it throws `ApiError(0, 'offline')` without sending.
- Any `fetch` rejection, or a failure while reading the body of a write, throws `ApiError(0, 'outcome_unknown')`.
- Reads keep `network_error` and their "Thử lại" button.

**Rationale:**

- `navigator.onLine === false` is reliable in one direction only: the browser will not send. So "not saved" is true in that case.
- `true` proves nothing (captive Wi-Fi, DNS, a server that is down). So any failure after sending must be "unknown" (spec FR-003/004, Assumptions).

**Alternatives considered:**

- Treat every network error as "not saved" (today). This is false when the server committed.
- Probe `/health` before writing. This adds a cold-start wait and still cannot prove the write itself.

## R2. The 90 s give-up

**Decision:**

- Writes get an `AbortController` with a 90 000 ms timer. The timer starts at `fetch` and is cleared only after the body has been read.
- An abort throws `outcome_unknown`.
- `endRequest(token)` stays in `finally`, so the slow notice of spec 011 ends at the give-up (FR-005, spec 011 FR-009).
- The timer value is exported (`WRITE_GIVE_UP_MS`) so tests use fake timers.

**Rationale:**

- Aborting means no late answer reaches the page. FR-006's "no direct effect" then holds by construction.
- The server may still commit. This is covered by the 0/10/30 s refreshes in R3.

**Alternatives considered:**

- Race a timer without aborting. The late answer would still resolve the mutation and fire `onSuccess` (toast, form reset), which breaks FR-006.
- A timeout on reads too. This is not asked for, and spec 011 deliberately has none.

## R3. No pause, no auto-retry, and refreshes after "unknown"

**Decision:**

- In `queryClient.ts`, set `defaultOptions.mutations = { networkMode: 'always', retry: 0 }`.
- Add a `MutationCache({ onError })`. When the error code is `outcome_unknown` and the mutation has `meta.householdId`, it invalidates `keys.household(id)` at 0, 10 000 and 30 000 ms.
- Every covered mutation declares `meta: { householdId }`.
- In `ExpensesPage` and `DashboardPage`, `onSuccess` calls `void refresh()` instead of returning it. The mutation then ends when the write ends (FR-010).

**Rationale:**

- TanStack v5's default `networkMode: 'online'` is exactly the B01/E02 pause-then-resume. `'always'` runs the function at once, and R1 then decides the outcome.
- Putting the refresh in one place covers A1–A7 without seven copies.
- `invalidateQueries` refetches only active queries; inactive ones are marked stale. So after the person navigates away, nothing extra loads until they come back, and then it is fresh.

**Alternatives considered:**

- `onlineManager.setOnline(true)` globally. This also changes queries.
- Per-mutation `networkMode`. This is easy to forget on the next mutation.

## R4. One place for the outcome lines

**Decision:**

- A new `lib/saveOutcome.ts` exports `outcomeOf(error): 'offline' | 'unknown' | 'other'` and `outcomeLine(action, outcome, t)` for the actions A1–A7 (see contracts/ui-contract.md).
- Callers keep their existing error places. Only the text changes.
- `ExpenseForm` stops wrapping an unknown line in `notSaved()` (FR-016a).
- `usePaidTransfers` stops prefixing "Couldn't undo." on unknown.

**Rationale:** the spec's FR-016 table becomes one lookup, and the vi/en lines sit together in a `save` block in the i18n files.

## R5. Locking without losing focus

**Decision:**

- A new `useSaveLock(pending)` returns `locked` and a `guard(fn)` wrapper.
- While locked:
  - text, number and date inputs get `readOnly` and `aria-readonly`;
  - radio and checkbox groups and pickers get `aria-disabled` plus guarded `onChange`/`onClick`;
  - the `<form>` gets `aria-busy="true"` and a `.is-locked` class for the look.
- No native `disabled` is used on a control that may hold focus. A disabled focused control blurs to `<body>` (FR-011, the #248 lesson).
- `ExpenseForm.fill()`, `undoFill()` and the default-payer effect return early while locked.
- `AiComposer` gets a `blocked` prop: "Điền giúp" is `aria-disabled` and pressing it does nothing.
  - An answer that arrives while a save is in flight is not passed to `fill()`, and the composer keeps its text (FR-008).
  - Offline, quick add shows "Đang mất mạng, chưa đọc được câu này." at once.
- `NoticeAmountStep` ignores Escape and its Huỷ while `busy`, and accepts them again after a failure.

**Rationale:** `readOnly` and `aria-disabled` keep focus and Tab order, while the guards make every write route a no-op.

**Alternatives considered:**

- `<fieldset disabled>`: blurs focus to the body.
- `inert`: removes focus and hides the form from assistive technology.

## R6. Toast tags and what removes what

**Decision:**

- `ToastInput` gains three fields:
  - `kind?: 'success' | 'info'`;
  - `source?: string` (for example `expense-form`, `transfer-1-2`, `history`);
  - `sticky?: boolean`.
- A new `useSaveFeedback()` from `lib/toast` gives:
  - `started(source)`: removes success toasts from `source` that are not in use (FR-012 first half);
  - `errorShown(active: boolean, focusTarget?)`: while any caller reports `true`, the provider removes every success toast (in use or not), refuses to show or release success toasts, and moves focus if the removed toast had it (FR-012 second half).
- Error places call `errorShown` through a small `useVisibleSaveError(message, focusTarget)` hook.

**Rationale:** the provider is the only place that knows what is on screen, so the rules live there. Callers only describe their state.

## R7. In use, pausing, phone queue, placement

**Decision:**

- **In use:** each toast tracks `focusin`/`focusout` and `pointerenter`/`pointerleave`. While in use, its timer is cleared. When both leave, it restarts at the full `TOAST_MS`.
- **Sticky toasts:** never get a timer, show a close button, and count as in use (FR-015).
- **Width:** the provider reads `matchMedia('(max-width: 599.98px)')`.
  - **Phone:** at most one visible. A newcomer replaces a visible toast that is not in use. Otherwise it waits in a one-slot queue; a newer waiter replaces an older one, whose `onGone` runs once.
  - **From 600 px:** stack up to `MAX_TOASTS`, evicting the oldest not in use. Newcomers wait if all are in use.
- **Placement below 1024 px:**
  - A `ResizeObserver` on the visible sticky `.form-actions`, plus `visualViewport` resize, sets `--toast-bottom` to the area's height plus 8 px.
  - If the toast's height does not fit between the top of the save area and the top of the visual viewport, the region switches to `.toasts--top`.
  - If it fits in neither place, the toast is hidden with its timer paused. If it had focus, focus moves to the form's submit control.
- **Text:** clamped to 2 lines below 1024 px, with the full text in `aria-label`.

**Rationale:** this implements FR-013 to FR-015 with platform APIs only. Measuring is the only way to cover the variable error summary and the on-screen keyboard.

## R8. Views that are gone

**Decision:** success handlers that show a toast or move focus check a `useAlive()` ref (the pattern already used in `usePaidTransfers` and `stops`). The refresh is not guarded, so the original household's data still refreshes.

**Rationale:** this covers navigation, household switches, and an answer after give-up, if any arrives.

## R9. "Nhận số khác" keeps its step

**Decision:**

- `VerdictBlock` calls `onPaid` and awaits a result: `null` on success, or an error line.
- It closes the step only on `null`, and passes the line as `serverProblem` into `NoticeAmountStep`, the same way `tellPart` does for the debtor.
- `DashboardPage`'s `paid` handler returns that promise for the partial case.

**Rationale:** FR-009 and the one new error place in FR-016, reusing the shape the debtor's steps already have.

## Verification of claims from the spec review

These code facts were checked at `83fa2eb`:

- `queryClient.ts` has no mutation options.
- `request()` maps every `fetch` rejection to `network_error`.
- `onSuccess` returns `refresh()` in `ExpensesPage.tsx` (create, update) and `DashboardPage.tsx` (notice, record, remove).
- `VerdictBlock.tsx` closes the "Nhận số khác" step before `onPaid`.
- `Toast.tsx` sets a 7 s timer per toast with no pause, and evicts the oldest at `MAX_TOASTS` 3.
- The toast region uses a fixed 80 px padding when a form is on the page (`index.css` near 2774).
