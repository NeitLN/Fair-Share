-- A receiving account per person (specs/016-vietqr, US1): the bank account they want to be paid on,
-- shown to a housemate who owes them right now as a VietQR code, and to other housemates only as the
-- bank and the last four digits (docs/ACCOUNTS.md P6). The app never moves money; this only saves
-- typing for the person who pays.
-- One row per account, replaced in place or deleted: no earlier versions are kept. The values arrive
-- already cleaned by the API (app/services/vietqr.py); the checks repeat the rules so nothing else can
-- slip in. The version is 12 random hex characters, new on every save, so an open payment panel knows
-- the account changed (research R8).
-- Like every table, row level security is on with no policies: only the API's own role reaches it.

CREATE TABLE receiving_accounts (
  user_id        bigint PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  bank_bin       text NOT NULL CHECK (bank_bin ~ '^[0-9]{6}$'),
  account_number text NOT NULL CHECK (account_number ~ '^[0-9]{6,19}$'),
  holder_name    text NOT NULL CHECK (
    holder_name ~ '^[A-Z0-9]+( [A-Z0-9]+)*$' AND char_length(holder_name) <= 50
  ),
  version        text NOT NULL CHECK (char_length(version) = 12),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE receiving_accounts ENABLE ROW LEVEL SECURITY;
