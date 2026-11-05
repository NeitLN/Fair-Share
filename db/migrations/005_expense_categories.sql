-- What an expense was for (specs/005-expense-categories): one of seven fixed categories. Stable
-- English codes; the page shows the name in its language. Every expense recorded before this file
-- becomes 'other' through the default, and a client that sends no category still saves.
--
-- A check, not a table: the list is fixed (no per-house categories), and the check keeps a bad value
-- out even if a request slips past the API, like `source` in 001 and `status` in 004.

ALTER TABLE expenses
  ADD COLUMN category text NOT NULL DEFAULT 'other'
  CHECK (category IN ('food', 'groceries', 'utilities', 'rent', 'transport', 'household', 'other'));
