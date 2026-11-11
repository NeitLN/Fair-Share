# Data model: Notices tell one story

There is no schema change. These are the existing rows (spec 014, migration 010) and how this feature uses them.

## payment_notices (existing)

| Column | Use here |
|---|---|
| household_id, from_member_id, to_member_id | the directed pair, unique per house |
| amount | told and not yet recorded. It can now grow when a repayment is deleted (FR-007). It stays at most 10¹² (FR-008) |
| status | `sent` or `declined`. Deleting a repayment re-sends a declined notice (FR-007) |
| version | from `notice_versions`. Every add-back takes a new one |
| note, created_by | untouched by an add-back |

## settlements.notice_amount (existing)

The part of a repayment taken from a notice. Deleting the repayment puts exactly this amount back.

## Derived on the client (not stored)

**Notice classification** (FR-001), per sent notice:

| Kind | Condition | Excess |
|---|---|---|
| `matched` | suggestion ≥ amount | 0 |
| `over` | 0 < suggestion < amount | amount − suggestion |
| `unmatched` | no suggestion for the directed pair | amount |

**Receiver warning state** (FR-005):

```text
idle --(press with an excess)--> warned{version, suggestion} --(Ghi)--> sending --> done | refused
  ^                                   |
  +--(Thôi, or version/suggestion changed)--+
```

**Race snapshot** (FR-020): taken at each notice press, holding the pair's notice `{ version, status, amount }` and the set of repayment ids. Compared with the fresh read after a 409.
