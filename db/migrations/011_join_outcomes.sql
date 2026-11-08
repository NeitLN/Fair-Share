-- What an invited person keeps when their request to join ends without them in the house
-- (specs/015-invite-preview, docs/ACCOUNTS.md D4): the owner said no, or the house was deleted while
-- they waited. Only that person reads it, and dismisses it ("Đã hiểu").
--
-- household_id has no foreign key on purpose: the outcome stays after the house is deleted. The two
-- names are kept as they were when it happened. A new request to the same house removes it, and
-- one older than 30 days is not shown and is removed when read.

CREATE TABLE join_outcomes (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id        bigint NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  household_id   bigint NOT NULL,
  household_name text NOT NULL CHECK (char_length(household_name) <= 60),
  owner_name     text NOT NULL CHECK (char_length(owner_name) <= 40),
  kind           text NOT NULL CHECK (kind IN ('refused', 'house_deleted')),
  happened_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX join_outcomes_user_idx ON join_outcomes (user_id, happened_at);

-- Same as the other tables (001_init.sql): Supabase's public REST API must not reach it.
ALTER TABLE join_outcomes ENABLE ROW LEVEL SECURITY;
