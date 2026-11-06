-- Recurring expenses (specs/007-recurring-expenses): rent or internet that a house pays every month.
-- An item is made from a new expense and remembers how to fill the form again; when its day comes the
-- app suggests it and a person saves it. Nothing here records money on its own.
--
-- An item is split equally between member_ids, so it keeps no shares. payer_id and member_ids are not
-- foreign keys: the expense saved from an item is checked like any expense, and a member who left is
-- simply left out of the filled form. Items are stopped (active = false), never deleted, so the
-- expenses recorded from them keep their link; they go with their house.

CREATE TABLE recurring_items (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  household_id bigint NOT NULL REFERENCES households (id) ON DELETE CASCADE,
  description  text NOT NULL CHECK (char_length(description) BETWEEN 1 AND 120),
  category     text NOT NULL DEFAULT 'other'
    CHECK (category IN ('food', 'groceries', 'utilities', 'rent', 'transport', 'household', 'other')),
  payer_id     bigint NOT NULL,
  member_ids   bigint[] NOT NULL CHECK (cardinality(member_ids) BETWEEN 1 AND 50),
  -- NULL: the amount changes every month (electricity) and is typed each time
  amount       bigint CHECK (amount IS NULL OR amount > 0),
  day          smallint NOT NULL CHECK (day BETWEEN 1 AND 31),
  active       boolean NOT NULL DEFAULT true,
  created_by   bigint REFERENCES users (id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  stopped_at   timestamptz
);

CREATE INDEX recurring_items_household ON recurring_items (household_id) WHERE active;

-- The expense recorded from an item. NULL for every expense before this file and for ordinary ones.
ALTER TABLE expenses
  ADD COLUMN recurring_item_id bigint REFERENCES recurring_items (id) ON DELETE SET NULL;

-- One expense per item per month of its date, for new expenses and for edits of the date alike, held
-- here so that two people saving at the same moment cannot both win. spent_at is a date: cast to a
-- timestamp without time zone, date_trunc is immutable and does not depend on the session's zone.
CREATE UNIQUE INDEX expenses_recurring_month_uidx
  ON expenses (recurring_item_id, (date_trunc('month', spent_at::timestamp without time zone)::date))
  WHERE recurring_item_id IS NOT NULL;

-- Same as the other tables (001_init.sql): Supabase's public REST API must not reach it.
ALTER TABLE recurring_items ENABLE ROW LEVEL SECURITY;
