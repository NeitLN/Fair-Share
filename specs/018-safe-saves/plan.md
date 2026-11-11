# Implementation Plan: Safe saves

**Branch**: `spec/018-safe-saves` (build on `feat/018-safe-saves`) | **Date**: 2026-11-12 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/018-safe-saves/spec.md`

## Summary

Money writes stop hanging offline, stop being sent later on their own, and only claim what the client knows. Three outcomes are possible:

- not sent (the browser said offline);
- done or refused (a full answer came back);
- result unknown (the request was sent, but no full answer arrived or none arrived within 90 s).

What is being saved cannot change while its request is in flight. Toasts never cover the sticky save area, never say "saved" next to an error, and pause while in use.

Everything happens in the web client. Approach:

- One request layer decides the outcome, with a 90 s abort for writes.
- The query client sets `networkMode: 'always'` for mutations and reacts to every "result unknown" with refreshes at 0, 10 and 30 s.
- Each covered form gets a lock that keeps focus where it is.
- The toast provider gains tags (success, source, sticky), an in-use state, phone-width queueing and placement against the measured save area.

No API or schema change.

## Technical Context

- **Language and version:** TypeScript 5 (strict), React 19.
- **Primary dependencies:** TanStack Query v5 (^5.104), React Router. No new dependency.
- **Storage:** none. No server, schema or migration change.
- **Testing:**
  - Vitest and Testing Library, with fake timers for 3 s, 90 s and 10/30 s.
  - Playwright E2E with `context.setOffline`, `route.abort` and delayed `route.fulfill`, plus the axe check already in `e2e/`.
- **Target platform:** the web app on phones from 360 px and desktops (110% zoom from 1024 px).
- **Project type:** web application (`frontend/` React SPA, `app/` FastAPI untouched).
- **Performance goals:**
  - "Not done" within 3 s; in practice instant, because nothing is sent.
  - Give-up at 90 s (±2 s).
  - No extra network traffic except the two delayed refreshes after an unknown result.
- **Constraints:**
  - The 7 s toast duration and the toast area stay (DESIGN.md §5).
  - The 1024 px sticky layout breakpoint and the 600 px stacking breakpoint stay separate.
  - The spec 011 slow notice must end on give-up.
  - Focus rules from specs 011, 014 and 017 stay.
- **Scale/Scope:**
  - 7 covered actions (A1–A7).
  - About 12 frontend files, roughly 500 changed lines plus tests.
  - One new error place, inside "Nhận số khác".

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Result |
|---|---|---|
| I. Whole đồng, every number adds up | No amount logic changes. The feature only stops wrong or hidden outcomes; "result unknown" exists so a person does not record money twice by mistake | Pass |
| II. Access decided by the server | No access change. A 401 keeps today's sign-out | Pass |
| III. Schema grows by migrations; tests on PostgreSQL | No schema change; backend untouched | Pass (n/a) |
| IV. Reviewed PR, four green checks | One PR `feat/018-safe-saves`, reviewed by Minh, then live smoke | Pass |
| V. No secret in the repo | None involved | Pass |
| VI. Made for Vietnamese housemates on a phone | The whole feature targets the phone at the market: weak 4G, sticky bar, one toast. Every new line is in vi and en | Pass |
| VII. Quick add is a shortcut, never a dependency | Quick add is only blocked while a save is in flight, and keeps its text. Offline it fails at once with its own line | Pass |

**Post-design re-check:** still passes. The design adds no server call except the 10 s and 30 s refreshes after an unknown result, which are reads of data the person can already see.

## Project Structure

### Documentation (this feature)

```text
specs/018-safe-saves/
├── spec.md
├── plan.md              # this file
├── research.md          # decisions R1–R9
├── data-model.md        # client-side states: save attempt, toast
├── quickstart.md        # how to check it by hand and with E2E
├── contracts/
│   └── ui-contract.md   # outcomes, lines, error places, toast rules, lock rules
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
frontend/src/
├── api/
│   ├── client.ts            # write outcome: offline / unknown / 90 s abort (R1, R2)
│   └── queryClient.ts       # mutations networkMode 'always', retry 0; MutationCache onError → refresh 0/10/30 s (R3)
├── lib/
│   ├── toast.ts             # ToastInput gains kind, source, sticky; useSaveFeedback() (R6)
│   ├── saveOutcome.ts       # NEW: outcome of an error (offline | unknown | other) + line per action (R4)
│   └── useSaveLock.ts       # NEW: lock that keeps focus, guards handlers (R5)
├── components/
│   ├── Toast.tsx            # in-use, pause, phone queue, placement, sticky, focus recovery (R6, R7)
│   ├── ExpenseForm.tsx      # A1 lock, fill/undoFill/default guards, unknown line without "Chưa lưu được:" (R5, R8)
│   ├── AiComposer.tsx       # blocked while a save is in flight, keeps text, offline line (R5)
│   ├── SettlementForm.tsx   # A2 lock and lines
│   ├── NoticeAmountStep.tsx # lock, Huỷ/Escape ignored while busy (R5)
│   ├── VerdictBlock.tsx     # "Nhận số khác" stays open until success, error inside the step (R9)
│   ├── SettlementList.tsx   # A7 lines
│   └── ExpenseList.tsx / ExpenseTable.tsx  # A7 lines
├── pages/
│   ├── ExpensesPage.tsx     # onSuccess no longer awaits refresh (R3), toast tags, view-alive guard
│   └── DashboardPage.tsx    # same for notices, record, remove; A3–A5 lines
├── lib/usePaidTransfers.ts  # A5 confirm, A6 undo: unknown line, sticky toast
├── i18n/vi.tsx, en.tsx      # `save` block with the lines of the UI contract
└── index.css                # .form-actions edge (<1024 px), toast placement and 2-line clamp

frontend/e2e/safe-saves.spec.ts   # NEW: offline, dropped answer, lock, toasts at 360 px
docs/DESIGN.md                    # §5 toasts and sticky bar updated (FR-018)
```

**Structure Decision**: Web application, frontend only. Two small new modules (`saveOutcome.ts`, `useSaveLock.ts`) keep the rules in one place instead of seven copies.

## Delivery

One PR, `feat/018-safe-saves`, in four commits matching the user stories:

1. US1 (request layer and lines).
2. US2 (locks).
3. US3 (toasts).
4. US4 plus DESIGN.md.

US1 alone is shippable if review takes long.

## Complexity Tracking

No constitution violation. Two places are more complex than the rest:

| Item | Why needed | Simpler alternative rejected because |
|---|---|---|
| Toast queue and placement measured against the sticky save area | FR-013/014: phones must never cover Lưu or its error, whatever the summary height or keyboard | A fixed bottom padding (today's 80 px) is exactly the B02 bug |
| Refresh at 0, 10 and 30 s after an unknown result | FR-006 / SC-007: the server may commit after the first read | A single refresh can run before the commit and show nothing, leaving a stale list |
