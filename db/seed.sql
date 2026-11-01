-- Demo data for the local Compose stack only (SEED_DEMO_DATA=true in compose.yml; never on Render).
-- Runs after the migrations on every API start, but adds the demo household only to an empty
-- database, so restarting never duplicates it and never touches data you entered yourself.
--
-- One statement, so it is all or nothing: the household, its three members, a few expenses over
-- last month and this month (dates counted from today and never in the future, so the month filter
-- always has two months to show), and one settlement. Every expense's shares add up to its amount.

WITH demo AS (
  INSERT INTO households (name)
  SELECT 'Demo house'
  WHERE NOT EXISTS (SELECT 1 FROM households)
  RETURNING id
),
people AS (
  INSERT INTO members (household_id, name)
  SELECT demo.id, member.name
  FROM demo, (VALUES ('Tiến'), ('Minh'), ('Duy Anh')) AS member (name)
  RETURNING id, household_id, name
),
-- months_back 1 = last month, 0 = this month; day = day of that month (today at the latest)
bought (description, amount, payer, months_back, day, source, shares) AS (
  VALUES
    ('Rent, last month', 4500000, 'Minh', 1, 1, 'manual',
     '{"Tiến": 1500000, "Minh": 1500000, "Duy Anh": 1500000}'::jsonb),
    ('Weekend groceries', 360000, 'Duy Anh', 1, 12, 'manual',
     '{"Tiến": 120000, "Minh": 120000, "Duy Anh": 120000}'::jsonb),
    ('Electricity', 450000, 'Tiến', 0, 3, 'manual',
     '{"Tiến": 150000, "Minh": 150000, "Duy Anh": 150000}'::jsonb),
    ('Hotpot', 240000, 'Minh', 0, 8, 'ai',
     '{"Tiến": 80000, "Minh": 80000, "Duy Anh": 80000}'::jsonb),
    -- A custom split that leaves Minh out
    ('Instant noodles and eggs', 100000, 'Duy Anh', 0, 10, 'manual',
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
       'Part of the rent'
FROM people tien
JOIN people minh ON minh.name = 'Minh'
WHERE tien.name = 'Tiến';
