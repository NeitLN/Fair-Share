-- An optional gender a person may share with their housemates (specs/010-profile-page, US5). Never
-- asked for: null is "Không nêu", the default for every account. A stated gender is kept together with
-- the version of the notice the person saw and when they chose it, the record of what they agreed to;
-- choosing "Không nêu" sets all three back to null, so nothing of it is kept.

ALTER TABLE users
  ADD COLUMN gender text CHECK (gender IN ('male', 'female', 'other')),
  ADD COLUMN gender_notice text,
  ADD COLUMN gender_set_at timestamptz,
  ADD CONSTRAINT users_gender_with_notice CHECK (
    (gender IS NULL) = (gender_notice IS NULL) AND (gender IS NULL) = (gender_set_at IS NULL)
  );
