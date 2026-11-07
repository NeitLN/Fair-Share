-- A profile photo per account (specs/010-profile-page, US4). The image is the server's own 256 × 256
-- JPEG (app/services/images.py), never the uploaded file, so it carries no camera or location data.
-- One row per account, replaced in place or deleted: no earlier versions are kept. The version is the
-- first 12 hex characters of the image's SHA-256, so a page knows when to ask again. All photos
-- together stay under 50 MB: checked when one is written, under an advisory lock (research R4).
-- Like every table, row level security is on with no policies: only the API's own role reaches it.

CREATE TABLE user_photos (
  user_id    bigint PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  image      bytea NOT NULL CHECK (octet_length(image) <= 32768),
  version    text NOT NULL CHECK (char_length(version) = 12),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE user_photos ENABLE ROW LEVEL SECURITY;
