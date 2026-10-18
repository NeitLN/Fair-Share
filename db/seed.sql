-- Demo data for the local Compose stack only (SEED_DEMO_DATA=true in compose.yml; never on Render).
-- Runs after the migrations on every API start, but adds the demo household only to an empty
-- database, so restarting never duplicates it and never touches data you entered yourself.
-- Expenses and settlements are added here once their API exists (T-15, T-16).

WITH demo AS (
  INSERT INTO households (name)
  SELECT 'Nhà trọ demo'
  WHERE NOT EXISTS (SELECT 1 FROM households)
  RETURNING id
)
INSERT INTO members (household_id, name)
SELECT demo.id, member.name
FROM demo, (VALUES ('Tiến'), ('Minh'), ('Duy Anh')) AS member (name);
