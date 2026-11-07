-- A short status a person shows their housemates, e.g. "đang ăn kiêng 🥗" (specs/010-profile-page,
-- US3). It belongs to the account, so it shows in every household the person is in, and only through
-- a live owner or member link (a person who left, or is still waiting, shows none). Null = no status.
-- char_length counts code points, the same as the API's limit.

ALTER TABLE users ADD COLUMN status text CHECK (char_length(status) BETWEEN 1 AND 60);
