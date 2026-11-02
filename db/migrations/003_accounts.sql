-- Accounts (docs/ACCOUNTS.md): everyone signs in, and a household is reached through its members'
-- accounts instead of a shared key.
--
-- * users / sessions: email + password (argon2id hash) and the sessions a login opens. Only a
--   SHA-256 of each session token is stored, so a copy of this table cannot be used to sign in.
-- * household_users: who is in which household, as owner, member or pending (asked to join with an
--   invite code, not yet approved). A member or owner is linked to exactly one `members` row: the
--   name their expenses and shares use.
-- * invite_codes: the short codes that let someone ask to join (8 characters, Crockford base32).
-- * rate_limits: counters for login, registration and code attempts, kept here so a restart or a
--   second instance does not reset them.
--
-- Existing households keep their access_key for one purpose only: the first signed-in person who
-- opens a valid old invite link becomes the owner (POST /api/households/{id}/claim). Once a
-- household has an owner the key opens nothing.

CREATE TABLE users (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email         text NOT NULL CHECK (char_length(email) BETWEEN 3 AND 254),
  password_hash text NOT NULL,
  display_name  text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 40),
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- "Tien@x.vn" and "tien@x.vn" are one account
CREATE UNIQUE INDEX users_email_key ON users (lower(email));

CREATE TABLE sessions (
  token_hash   bytea PRIMARY KEY,
  user_id      bigint NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL
);

CREATE INDEX sessions_user_idx ON sessions (user_id);

CREATE TABLE household_users (
  household_id bigint NOT NULL REFERENCES households (id) ON DELETE CASCADE,
  user_id      bigint NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role         text NOT NULL CHECK (role IN ('owner', 'member', 'pending')),
  member_id    bigint,
  requested_at timestamptz NOT NULL DEFAULT now(),
  approved_at  timestamptz,
  PRIMARY KEY (household_id, user_id),
  -- The linked name belongs to the same household
  FOREIGN KEY (household_id, member_id) REFERENCES members (household_id, id),
  -- Approved people always have a name in the split; people waiting never do
  CHECK ((role = 'pending') = (member_id IS NULL))
);

-- One account per name, one owner per household
CREATE UNIQUE INDEX household_users_member_key ON household_users (household_id, member_id)
  WHERE member_id IS NOT NULL;
CREATE UNIQUE INDEX household_users_owner_key ON household_users (household_id)
  WHERE role = 'owner';
CREATE INDEX household_users_user_idx ON household_users (user_id);

CREATE TABLE invite_codes (
  code         text PRIMARY KEY CHECK (code ~ '^[0-9A-HJKMNP-TV-Z]{8}$'),
  household_id bigint NOT NULL REFERENCES households (id) ON DELETE CASCADE,
  created_by   bigint REFERENCES users (id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  revoked_at   timestamptz
);

-- At most one current code per household; a new one revokes the old one
CREATE UNIQUE INDEX invite_codes_current_key ON invite_codes (household_id)
  WHERE revoked_at IS NULL;

CREATE TABLE rate_limits (
  bucket       text NOT NULL,
  window_start timestamptz NOT NULL,
  hits         integer NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, window_start)
);

-- Who recorded an expense or a repayment. Empty for everything recorded before accounts.
ALTER TABLE expenses ADD COLUMN created_by bigint REFERENCES users (id) ON DELETE SET NULL;
ALTER TABLE settlements ADD COLUMN created_by bigint REFERENCES users (id) ON DELETE SET NULL;

-- Same as the other tables (001_init.sql): Supabase's public REST API must not reach these.
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE household_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE invite_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;
