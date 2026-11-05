# UI contract: Desktop look

No API. What stays fixed for the rest of the app:

- **Token names** do not change; only values change, plus one new token `--text-small`.
- **`VerdictBlock`** keeps its props and handlers. Its output becomes:
  - `section.verdict` (taro, `aria-labelledby` the sentence): sentence, total, the explanation fold,
    own pending notices, the refresh-error note;
  - `section.transfers-panel` (white, `aria-label` = the existing "Các lần trả gợi ý" list label is kept
    on the list itself): the transfer list, the action-error note, the reminder button and fallback.
  - The panel is absent when there are no cards and no reminder.
- **`ExpenseTable`** share row: `<td class="col-date"/>` + `<td colSpan={3 from 1280 px, else 2}>` list +
  `<td/>`; the description button has no negative margin, and the meta line under it is 8 px apart.
- **`lib/useWide.ts`** gains `useWideTable()` (min-width 1280 px) beside `useWide()`.
- **Breakpoints** unchanged (1024, 1280); new cap: content ≤ 1320 px from 1024 px up.
