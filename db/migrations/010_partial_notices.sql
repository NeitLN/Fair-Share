-- Telling the amount actually sent (specs/014-partial-transfer-notices, docs/ACCOUNTS.md S2 and S3).
--
-- A notice is now money the payer told the receiver about that the receiver has not recorded yet.
-- Recording that money (confirming all or part of it, or typing a repayment in by hand and saying
-- it is the told money) takes the same amount out of the notice, so it can never be recorded twice.
--
-- * note: what the payer wrote with it ("chuyển trước một nửa"), seen by the whole household.
-- * version: changes with every change of the notice, from one sequence, so a notice taken back and
--   told again never repeats a number an old screen still holds. Every action names the version it
--   saw; another one is refused (409 notice_changed) without changing anything.
-- * settlements.notice_amount: how much of a notice a repayment recorded. Deleting the repayment
--   gives that amount back as a waiting notice when the pair has none at that moment.

CREATE SEQUENCE notice_versions;

ALTER TABLE payment_notices
  ADD COLUMN note text CHECK (char_length(note) <= 120),
  ADD COLUMN version bigint NOT NULL DEFAULT nextval('notice_versions'),
  -- One version names one notice: the routes find a locked notice by its version alone
  ADD CONSTRAINT payment_notices_version_key UNIQUE (version),
  -- The app's limit for any amount (app/schemas.py MAX_AMOUNT)
  ADD CONSTRAINT payment_notices_amount_max CHECK (amount <= 1000000000000);

ALTER TABLE settlements
  ADD COLUMN notice_amount bigint CHECK (notice_amount > 0 AND notice_amount <= amount);
