# Data model: Telling the amount actually sent

Migration `db/migrations/010_partial_notices.sql` (adds only; no existing column changes meaning).

## payment_notices (existing table, extended)

| Column | Type | Rule |
|---|---|---|
| household_id, from_member_id, to_member_id | as today | one row per pair, primary key unchanged |
| amount | bigint | told and not yet recorded; `> 0` and `<= 1000000000000` (new check) |
| status | text | `sent` (waiting) or `declined` ("Chưa nhận được"), as today |
| note | text, new | `char_length(note) <= 120`, null when none |
| version | bigint, new | `NOT NULL DEFAULT nextval('notice_versions')`; set to `nextval` on every update |
| created_by, created_at | as today | `created_at` = when last told or added to |

Sequence `notice_versions` (new). Existing rows get a version from the default.

State changes (all under the household or row locks of research R2/R3):

- none → `sent`: telling (pair suggested, amount ≤ suggestion, version null).
- `sent` / `declined` → `sent`: telling again (replaces amount and note).
- `sent` → `sent` (amount + x): "Báo thêm" (total ≤ suggestion, ≤ 10^12).
- `sent` → `declined`: "Chưa nhận được" (amount and note kept).
- any → amount − r: confirming r, or a repayment by hand as told money of r; deleted at 0; state kept.
- any → none: taken back by the payer; amount reaches 0; a member name deleted (cascade, as today).
- none → `sent`: deleting a repayment with `notice_amount` when the pair has no notice (give-back).

## settlements (existing table, extended)

| Column | Type | Rule |
|---|---|---|
| notice_amount | bigint, new | null, or `> 0` and `<= amount`: how much of a notice this repayment recorded |

## Not stored

- Suggested transfers: computed from balances (`app/services/balances.py`), the ceiling for telling.
- The "còn thiếu" / "nhiều hơn" difference: computed on the page from the notice and the suggestion.
