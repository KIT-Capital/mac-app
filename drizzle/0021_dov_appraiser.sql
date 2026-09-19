-- Dov Tuzman is the appraiser; Rosario David is the admin (owner, 2026-09-19).
-- Migration 0020 seeded Dov as admin. Correct that row in place.
-- Guarded on the current role so a later promotion to super_admin is never demoted.
UPDATE "staff_accounts"
SET "role" = 'appraiser', "updated_at" = now()
WHERE "email" = 'dov@mechartcap.com'
  AND "role" = 'admin';
