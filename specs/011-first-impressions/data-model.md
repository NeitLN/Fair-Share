# Data model: First impressions that hold up

No migration, no stored data. One field added to an existing public response; the rest is page state.

## `GET /api/version` gains `ai`

| Field | Type | Meaning |
|---|---|---|
| `ai` | `bool` | Whether the server has AI quick add configured (`GeminiClient.configured`); no probe, no secret |

## Page state (frontend only)

| Name | Where | Values and rules |
|---|---|---|
| slow request store | `lib/slowRequests.ts` | tokens begun by `request()`; a token is slow after 5 s; `slowCount`; `episodeAnnounced` and `hiddenSince` for the 10 s episode rule |
| AI availability | `lib/aiAvailability.ts` | `'unknown'` (default, error, missing field), `'on'`, `'off'`; one fetch per page load |
| `confirming` / `confirmedAmount` | `ExpenseForm` | parsed integer of the amount being confirmed / already confirmed; cleared on amount change (`confirming`), on successful save or reset (`confirmedAmount`) |
| `prefill` | `ExpenseForm` | `'pending'` (new expense, Chia đều), `'done'` (ran, or a share was typed), `'off'` (form started custom or was filled custom); saved in `lastFill.before` |
| `submittedOnce` | `ExpenseForm` | after the first failed submit, edits re-run the check |
| `serverError` | prop of `ExpenseForm` | `{ message, field }` from `lib/formError.ts`; `field` null for general failures |
| `stopping` / `stopErrors` | `ExpensesPage` | per recurring item id, reset when the house changes |
| `repeat` / `varying` | `ExpenseForm` | forced false whenever a new expense becomes Tự chia; saved in `lastFill.before` |

## Constants

| Name | Value | Rule |
|---|---|---|
| `LARGE_AMOUNT` | 50.000.000 | above it, confirm once (FR-011) |
| `MAX_AMOUNT` | 1.000.000.000.000 | above it, refused on the page (FR-013), same as the API |
| slow threshold | 5 s | FR-007 |
| episode gap | 10 s | FR-008 |
