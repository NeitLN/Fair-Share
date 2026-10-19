-- Schema v1: the data model of docs/ARCHITECTURE.md §4.
--
-- Applied once by app/migrate.py, inside one transaction: if any statement fails, nothing here is
-- kept. Never edit this file after it has been applied anywhere; add 002_*.sql instead.
--
-- Money is a whole number of đồng (bigint), never a float.
-- Member foreign keys have no ON DELETE action: deleting a member that an expense, a share or a
-- settlement still points to fails (the API answers 409).
-- Deleting a household: the API deletes its expenses first (their shares go with them), then the
-- household (members and settlements go with it). A single DELETE of the household is not enough:
-- PostgreSQL checks the members' keys before the nested expenses -> shares cascade has run.

-- The course starter's sample table; nothing reads it any more.
DROP TABLE IF EXISTS notes;

CREATE TABLE households (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name       text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE members (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  household_id bigint NOT NULL REFERENCES households (id) ON DELETE CASCADE,
  name         text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 40),
  created_at   timestamptz NOT NULL DEFAULT now(),
  -- Target of the composite keys below: a payer or a settlement party must be a member of the
  -- same household as the expense or settlement.
  UNIQUE (household_id, id)
);

-- "Minh" and "minh" are the same person: AI quick add matches names case-insensitively.
CREATE UNIQUE INDEX members_household_name_key ON members (household_id, lower(name));

CREATE TABLE expenses (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  household_id bigint NOT NULL REFERENCES households (id) ON DELETE CASCADE,
  description  text NOT NULL CHECK (char_length(description) BETWEEN 1 AND 120),
  amount       bigint NOT NULL CHECK (amount > 0),
  payer_id     bigint NOT NULL,
  spent_at     date NOT NULL DEFAULT current_date,
  source       text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'ai')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (household_id, payer_id) REFERENCES members (household_id, id)
);

-- The expenses list is newest first.
CREATE INDEX expenses_household_spent_idx ON expenses (household_id, spent_at DESC, id DESC);
CREATE INDEX expenses_payer_idx ON expenses (payer_id);

-- Shares always add up to the expense amount; the API enforces that (one insert per expense).
CREATE TABLE expense_shares (
  expense_id   bigint NOT NULL REFERENCES expenses (id) ON DELETE CASCADE,
  member_id    bigint NOT NULL REFERENCES members (id),
  share_amount bigint NOT NULL CHECK (share_amount >= 0),
  PRIMARY KEY (expense_id, member_id)
);

CREATE INDEX expense_shares_member_idx ON expense_shares (member_id);

CREATE TABLE settlements (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  household_id   bigint NOT NULL REFERENCES households (id) ON DELETE CASCADE,
  from_member_id bigint NOT NULL,
  to_member_id   bigint NOT NULL,
  amount         bigint NOT NULL CHECK (amount > 0),
  settled_at     date NOT NULL DEFAULT current_date,
  note           text CHECK (char_length(note) <= 200),
  created_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (from_member_id <> to_member_id),
  FOREIGN KEY (household_id, from_member_id) REFERENCES members (household_id, id),
  FOREIGN KEY (household_id, to_member_id) REFERENCES members (household_id, id)
);

CREATE INDEX settlements_household_idx ON settlements (household_id, settled_at DESC, id DESC);
CREATE INDEX settlements_to_member_idx ON settlements (to_member_id);

-- Supabase also publishes every table in `public` through its REST API with a public key. Row Level
-- Security with no policies closes that door. Our API connects as the tables' owner, which RLS does
-- not apply to, so nothing changes for it (or for the local PostgreSQL in Compose).
ALTER TABLE households ENABLE ROW LEVEL SECURITY;
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE settlements ENABLE ROW LEVEL SECURITY;
