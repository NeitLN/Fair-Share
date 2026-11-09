# Data model: Pay by VietQR

## New table `receiving_accounts` (migration `db/migrations/012_receiving_accounts.sql`)

One row per account at most; the person's own receiving account (FR-001).

| Column | Type | Rule |
|---|---|---|
| `user_id` | `bigint` PRIMARY KEY, references `users (id)` ON DELETE CASCADE | the account it belongs to |
| `bank_bin` | `text` NOT NULL | `CHECK (bank_bin ~ '^[0-9]{6}$')`; must be a supported BIN in the bank list when saved (checked by the API, FR-016) |
| `account_number` | `text` NOT NULL | `CHECK (account_number ~ '^[0-9]{6,19}$')`; a string, leading zeros kept (FR-002) |
| `holder_name` | `text` NOT NULL | `CHECK (holder_name ~ '^[A-Z0-9]+( [A-Z0-9]+)*$' AND char_length(holder_name) <= 50)`: already cleaned (FR-003) |
| `version` | `text` NOT NULL | `CHECK (char_length(version) = 12)`; 12 random hex characters, new on every save (R8) |
| `updated_at` | `timestamptz` NOT NULL DEFAULT `now()` | |

- Row level security on with no policies, like every table: only the API's own role reaches it.
- Removing the account deletes the row (FR-005); deleting a user deletes it by cascade.
- Never logged (FR-006): the routers log neither the body nor the row.

## Bank list (bundled data, not a table)

`app/data/vietqr_banks.json` = `frontend/src/data/vietqr-banks.json` (R3):

| Field | Meaning |
|---|---|
| `version` | date the list was taken, e.g. `2026-11-09` |
| `source` | URL of the NAPAS member list it was checked against |
| `banks[].bin` | six digits, unique |
| `banks[].name` | the name people know, e.g. `Vietcombank` |
| `banks[].transfer` | `true` when the bank takes VietQR account transfers; only these can be chosen or used |

## Derived, never stored

**Account hint** (in `Member`, FR-011): `{bank_name, last4}` when the member is a current owner or member, has an account, and its BIN is supported; otherwise `null`.

**Payment snapshot** (answer of the payment endpoint, FR-013), computed under the household lock:

| Field | When present | Meaning |
|---|---|---|
| `state` | always | `ready`, `partly_told`, `covered`, `declined`, `declined_acknowledged`, `too_large`, `no_account` |
| `suggested` | all but `no_account` | S, the current suggested amount from the asker to the member |
| `told` | `partly_told`, `covered`, `declined*` | T, the notice's amount |
| `amount` | `ready`, `partly_told`, `declined_acknowledged`, `too_large` | Q (R10) |
| `notice_version` | `partly_told`, `covered`, `declined*` | the notice's version (spec 014), for the acknowledgement |
| `account` | `ready`, `partly_told`, `declined_acknowledged`, `too_large` | `{bank_bin, bank_name, account_number, holder_name}` |
| `message` | with `account` | FR-014, at most 24 ASCII characters |
| `snapshot` | always | token of pair + S + notice version + account version (R8) |

### State rules (FR-015, in order)

```text
asker = member                        → 409 payment_not_suggested
no suggestion asker → member          → 409 payment_not_suggested
no account, or BIN unsupported        → no_account
S, notice?:
  none                → Q = S
  sent (waiting) T    → Q = S − T; Q ≤ 0 → covered
  declined T          → declined   (no details) unless ?acknowledge = notice version
                        → declined_acknowledged, Q = S
Q ≥ 500 000 000       → too_large (details, no code)
Q from a waiting notice → partly_told, else ready
```
