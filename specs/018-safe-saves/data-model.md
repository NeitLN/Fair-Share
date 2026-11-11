# Data model: Safe saves

There is no server data, API or schema change. This file describes the two client-side states the feature adds.

## Save attempt

One activation of a covered control (A1–A7, see [contracts/ui-contract.md](contracts/ui-contract.md)).

| Field | Meaning |
|---|---|
| `action` | `A1`…`A7`, which picks the lines and the error place |
| `source` | the place it was started from: `expense-form`, `settlement-form`, `transfer-<from>-<to>`, `history`, `expense-list` |
| `householdId` | used to refresh the household after an unknown result (mutation `meta`) |
| `state` | see below |
| `sentValues` | for a form: the values at dispatch; they are restored on failure or an unknown result |

**States:**

```text
idle ──activate──► checking ──(field error / big-amount question)──► idle
                     │
                     ├──(browser offline)──► not_done          (nothing sent)
                     │
                     └──dispatch──► in_flight ──full 2xx answer──► succeeded
                                       │        ──full 4xx/5xx──► refused
                                       │        ──fetch/body fails──► unknown
                                       └──90 s, no full answer──► unknown (request aborted)
```

**Rules:**

- **Lock:** only `in_flight` locks the form (FR-007). `checking` locks nothing.
- **Unknown:** `unknown` schedules household refreshes at 0, 10 and 30 s. Its line stays until a new attempt from the same `source`, the step closes, or the page is left (FR-006).
- **Success:** `succeeded` ends when the write ends. The refresh that follows is not awaited (FR-010).
- **Toasts after a view is gone:** an attempt whose view is gone shows no toast and moves no focus. It still refreshes.

## Toast (extended)

| Field | New? | Meaning |
|---|---|---|
| `id`, `text`, `action`, `onGone` | existing | as today |
| `kind` | new | `success` (from a covered save) or `info` |
| `source` | new | as above; used by "started(source)" |
| `sticky` | new | no timer, has a close button, always in use (only the A6 unknown toast) |
| `inUse` | new, provider state | keyboard focus or pointer inside |
| `placement` | new, provider state | `bottom` (above the save area), `top`, or `hidden` (fits nowhere, timer paused) |

**Provider rules (in order of precedence):**

1. The toast never overlaps a sticky save area or its error summary. It is placed at `bottom`, `top` or `hidden` (FR-014).
2. While any save error is visible, every `success` toast is removed and none is shown or released (FR-012). If the removed toast had focus, focus goes to the target the error place gave.
3. `started(source)` removes `success` toasts from that source that are not in use.
4. Below 600 px: one visible, plus a one-slot wait queue (FR-013). From 600 px: up to three. A toast in use is never removed to make room.
5. The timer runs only while the toast is visible, not in use and not sticky. It restarts at 7 s (FR-015).
6. `onGone` runs exactly once per toast, however it leaves (shown, skipped in the queue, removed).
