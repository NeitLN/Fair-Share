# API contract: First impressions that hold up

## `GET /api/version` (changed)

```json
{ "app": "fair-share", "version": "1.2.2", "env": "production", "commit": "e1ebaa1…", "ai": true }
```

- `ai`: `true` when the server has an AI key configured (the same condition quick add uses), `false` otherwise.
  It never contains the key, the model name or the result of calling the AI service.
- `Cache-Control: no-store`, so a full browser reload always asks again.
- Still public and database-free, as today.

Nothing else changes in the API. The expense, repayment and recurring routes keep their current answers; the page
maps them to fields as described in [ui-contract.md](ui-contract.md).
