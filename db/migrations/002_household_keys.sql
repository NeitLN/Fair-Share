-- A secret key per household (#132): whoever holds it may read and change the household, and it
-- travels in the invite link (/households/12#k=…). There are no logins, and ids are sequential, so
-- without a key anyone could open /households/2.
--
-- 32 hex characters from a version 4 UUID: 122 random bits, from PostgreSQL's built-in
-- gen_random_uuid() (no extension needed, PostgreSQL 13+). The default is volatile, so PostgreSQL
-- gives every existing household its own key while adding the column. Nobody holds those keys: the
-- households made before this migration (test data) are left as they are and new ones are created.

ALTER TABLE households
  ADD COLUMN access_key text NOT NULL DEFAULT replace(gen_random_uuid()::text, '-', '')
  CHECK (char_length(access_key) >= 32);
