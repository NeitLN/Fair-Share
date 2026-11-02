-- "Tôi đã chuyển" (docs/ACCOUNTS.md, S3): the person who owes tells the person they paid that the
-- money is on its way. A notice changes no balance; only the receiver records the repayment
-- (S2), and recording it removes the notice. The receiver can answer "Chưa nhận được", which keeps
-- the row as 'declined' so the payer sees it.
--
-- One notice per pair in a household: telling again replaces it, with the amount suggested then.

CREATE TABLE payment_notices (
  household_id   bigint NOT NULL REFERENCES households (id) ON DELETE CASCADE,
  from_member_id bigint NOT NULL,
  to_member_id   bigint NOT NULL,
  amount         bigint NOT NULL CHECK (amount > 0),
  status         text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'declined')),
  created_by     bigint REFERENCES users (id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (household_id, from_member_id, to_member_id),
  -- Both names belong to the household, and go with it when a name is removed
  FOREIGN KEY (household_id, from_member_id) REFERENCES members (household_id, id) ON DELETE CASCADE,
  FOREIGN KEY (household_id, to_member_id) REFERENCES members (household_id, id) ON DELETE CASCADE,
  CHECK (from_member_id <> to_member_id)
);

-- Same as the other tables (001_init.sql): Supabase's public REST API must not reach it.
ALTER TABLE payment_notices ENABLE ROW LEVEL SECURITY;
