# Data model: Overview and lists that read right

No migration. One read-only change to an existing response; everything else is presentation.

## `MyHousehold` (GET /api/households) gains two fields

| Field | Type | Meaning |
|---|---|---|
| `my_net` | `int` (đồng) | The caller's balance in that house: paid − owed + sent − received for the caller's member (`hu.member_id`). Positive: the house owes them; negative: they owe; 0: settled |
| `waiting` | `int` ≥ 0 | Things the caller can act on there: join requests waiting (only when the caller is the owner) + "Tôi đã chuyển" notices sent to the caller (`payment_notices.to_member_id = hu.member_id AND status = 'sent'`) |

- Computed in the same query as the list (research R4), so the figures always match the house's own Tổng quan.
- `pending` entries of the same response (requests the caller is still waiting on) get neither field.

## Derived on the client (no storage)

| Name | From | Used by |
|---|---|---|
| `alone` | `members.length === 1` | Tổng quan shows the invite card (US3) |
| `mine` | suggested transfers with `from_member_id === me` | the debtor's primary actions (US2) |
| notice state per entry of `mine` | `notices` for the same pair: none / `sent` / `declined` | which `DebtorAction` shows |
| clamped | `scrollHeight > clientHeight` of a description | whether "Xem đủ" shows (US5) |
| first language | saved choice, else `navigator.languages[0]` | `readLanguage()` (US6) |

## Unchanged

Balances, suggestions, notices and their rules (ACCOUNTS.md S3) are not changed. The gender notice version changes
from `2026-11-v1` to `2026-11-v2` (a constant, research R8); stored rows keep the version they were saved with.
