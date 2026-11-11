-- No double save (specs/020-no-double-save).
--
-- The page gives each thing a person means to record once (a draft) an identity, and sends it with
-- every press. When an answer is lost and the person presses again, the server finds the expense or
-- repayment that draft already made instead of recording it a second time.
--
-- * draft_id: the draft's identity, a UUID made by the page. NULL for older rows and for requests
--   from a page that sends none.
-- * draft_fingerprint: the normalized content of the request that made the row (app/services/
--   drafts.py), never the row's current values: a pure retry still matches after an edit. A repeat
--   with other content is refused (409 draft_already_saved). Never sent to the page.
--
-- One identity per house and author while the row exists: the index covers live rows only, so a
-- deleted row takes its identity with it and pressing again records anew (FR-005).

ALTER TABLE expenses
  ADD COLUMN draft_id uuid,
  ADD COLUMN draft_fingerprint text;

ALTER TABLE settlements
  ADD COLUMN draft_id uuid,
  ADD COLUMN draft_fingerprint text;

CREATE UNIQUE INDEX expenses_draft ON expenses (household_id, created_by, draft_id)
  WHERE draft_id IS NOT NULL;

CREATE UNIQUE INDEX settlements_draft ON settlements (household_id, created_by, draft_id)
  WHERE draft_id IS NOT NULL;
