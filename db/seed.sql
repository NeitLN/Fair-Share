-- Demo data for the local Compose stack only (SEED_DEMO_DATA=true in compose.yml; never on Render).
-- Runs after the migrations on every API start, but adds the demo household only to an empty
-- database, so restarting never duplicates it and never touches data you entered yourself.
--
-- One statement, so it is all or nothing: the household, its three members, a few expenses over
-- last month and this month (dates counted from today and never in the future, so the month filter
-- always has two months to show), and one settlement. Every expense's shares add up to its amount.
--
-- Each member has a demo account (docs/ACCOUNTS.md), Tiến as the owner: tien@demo.local,
-- minh@demo.local and duyanh@demo.local, all with the password "fairshare-demo". These are test
-- values for this local stack, written in the README; the hash below is argon2id of that password.

WITH demo AS (
  INSERT INTO households (name)
  SELECT 'Nhà trọ Bình Thạnh'
  WHERE NOT EXISTS (SELECT 1 FROM households)
  RETURNING id
),
people AS (
  INSERT INTO members (household_id, name)
  SELECT demo.id, member.name
  FROM demo, (VALUES ('Tiến'), ('Minh'), ('Duy Anh')) AS member (name)
  RETURNING id, household_id, name
),
demo_accounts (email, name) AS (
  VALUES ('tien@demo.local', 'Tiến'), ('minh@demo.local', 'Minh'), ('duyanh@demo.local', 'Duy Anh')
),
accounts AS (
  INSERT INTO users (email, password_hash, display_name)
  SELECT account.email,
         '$argon2id$v=19$m=65536,t=3,p=4$a1Kc3nZXbcTi+1qQRHwrLA$5HZKXRFLYEZCBXKEfvtl+zKTSysAz8bjdp9KguT+X2A',
         account.name
  FROM demo, demo_accounts account
  ON CONFLICT DO NOTHING
  RETURNING id, email
),
-- The accounts just made, and the ones left from an earlier demo household that was deleted (its
-- accounts stay): the new demo household is theirs too
known AS (
  SELECT id, email FROM accounts
  UNION
  SELECT u.id, u.email FROM users u JOIN demo_accounts a ON a.email = u.email
),
linked AS (
  INSERT INTO household_users (household_id, user_id, role, member_id, approved_at)
  SELECT person.household_id, known.id,
         CASE WHEN person.name = 'Tiến' THEN 'owner' ELSE 'member' END, person.id, now()
  FROM people person
  JOIN demo_accounts account ON account.name = person.name
  JOIN known ON known.email = account.email
),
-- months_back 1 = last month, 0 = this month; day = day of that month (today at the latest)
bought (description, amount, payer, months_back, day, source, shares) AS (
  VALUES
    ('Tiền nhà tháng trước', 4500000, 'Minh', 1, 1, 'manual',
     '{"Tiến": 1500000, "Minh": 1500000, "Duy Anh": 1500000}'::jsonb),
    ('Đi chợ cuối tuần', 360000, 'Duy Anh', 1, 12, 'manual',
     '{"Tiến": 120000, "Minh": 120000, "Duy Anh": 120000}'::jsonb),
    ('Tiền điện', 450000, 'Tiến', 0, 3, 'manual',
     '{"Tiến": 150000, "Minh": 150000, "Duy Anh": 150000}'::jsonb),
    ('Lẩu thứ sáu', 240000, 'Minh', 0, 8, 'ai',
     '{"Tiến": 80000, "Minh": 80000, "Duy Anh": 80000}'::jsonb),
    -- A custom split that leaves Minh out
    ('Mì gói và trứng', 100000, 'Duy Anh', 0, 10, 'manual',
     '{"Tiến": 40000, "Duy Anh": 60000}'::jsonb)
),
spent AS (
  INSERT INTO expenses (household_id, description, amount, payer_id, spent_at, source)
  SELECT payer.household_id, b.description, b.amount, payer.id,
         LEAST(current_date,
               (date_trunc('month', current_date) - make_interval(months => b.months_back))::date
                 + (b.day - 1)),
         b.source
  FROM bought b
  JOIN people payer ON payer.name = b.payer
  RETURNING id, description
),
shared AS (
  INSERT INTO expense_shares (expense_id, member_id, share_amount)
  SELECT spent.id, person.id, share.value::bigint
  FROM spent
  JOIN bought b ON b.description = spent.description
  CROSS JOIN LATERAL jsonb_each_text(b.shares) AS share
  JOIN people person ON person.name = share.key
)
-- Tiến paid Minh back part of last month's rent
INSERT INTO settlements (household_id, from_member_id, to_member_id, amount, settled_at, note)
SELECT tien.household_id, tien.id, minh.id, 1000000,
       LEAST(current_date, (date_trunc('month', current_date) - interval '1 month')::date + 14),
       'Trả trước một phần tiền nhà'
FROM people tien
JOIN people minh ON minh.name = 'Minh'
WHERE tien.name = 'Tiến';
