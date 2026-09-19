-- Desk roles: admin | appraiser | super_admin (retired: staff → admin).
-- Master super admin row, nullable password until first sign-in, seeded desk people.
-- Plan: docs/plans/2026-09-19-roles-identity-repo-parties-plan.md
ALTER TABLE "desk_audit_log" DROP CONSTRAINT "desk_audit_log_actor_role_check";--> statement-breakpoint
ALTER TABLE "staff_accounts" DROP CONSTRAINT "staff_accounts_role_check";--> statement-breakpoint
UPDATE "staff_accounts" SET "role" = 'admin', "updated_at" = now() WHERE "role" = 'staff';--> statement-breakpoint
ALTER TABLE "staff_accounts" ALTER COLUMN "password_hash" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "staff_accounts" ALTER COLUMN "password_salt" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "staff_accounts" ALTER COLUMN "password_params" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "staff_accounts" ALTER COLUMN "password_set_at" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "staff_accounts" ALTER COLUMN "password_set_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "staff_accounts" ADD COLUMN "is_master" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "staff_accounts_master_uidx" ON "staff_accounts" USING btree ("is_master") WHERE "staff_accounts"."is_master" = true;--> statement-breakpoint
ALTER TABLE "desk_audit_log" ADD CONSTRAINT "desk_audit_log_actor_role_check" CHECK ("desk_audit_log"."actor_role" in ('staff', 'admin', 'appraiser', 'super_admin'));--> statement-breakpoint
ALTER TABLE "staff_accounts" ADD CONSTRAINT "staff_accounts_password_set_check" CHECK (
      ("staff_accounts"."password_hash" is null and "staff_accounts"."password_salt" is null and "staff_accounts"."password_params" is null and "staff_accounts"."password_set_at" is null)
      or ("staff_accounts"."password_hash" is not null and "staff_accounts"."password_salt" is not null and "staff_accounts"."password_params" is not null and "staff_accounts"."password_set_at" is not null)
    );--> statement-breakpoint
ALTER TABLE "staff_accounts" ADD CONSTRAINT "staff_accounts_master_role_check" CHECK ("staff_accounts"."is_master" = false or "staff_accounts"."role" = 'super_admin');--> statement-breakpoint
ALTER TABLE "staff_accounts" ADD CONSTRAINT "staff_accounts_role_check" CHECK ("staff_accounts"."role" in ('admin', 'appraiser', 'super_admin'));--> statement-breakpoint
-- Retail and desk identities never share an email. Refuse to seed a desk row
-- for an email that already owns a retail (customers) account; the owner resolves it first.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "customers"
    WHERE "email" IN ('rc@mechartcap.com', 'dov@mechartcap.com', 'rosario@mechartcap.com')
  ) THEN
    RAISE EXCEPTION 'SEEDED_DESK_EMAIL_HAS_RETAIL_ACCOUNT';
  END IF;
END $$;--> statement-breakpoint
-- Seeded desk people (lib/roles.mjs SEEDED_DESK_ACCOUNTS). Names and emails only; no password.
-- An existing row keeps its password and gets the seeded role. Nothing else is touched.
INSERT INTO "staff_accounts" ("id", "name", "email", "role", "is_master", "must_rotate")
VALUES
  ('seed-desk-rc', 'Ricardo Cidale', 'rc@mechartcap.com', 'super_admin', true, true),
  ('seed-desk-dov', 'Dov Tuzman', 'dov@mechartcap.com', 'admin', false, true),
  ('seed-desk-rosario', 'Rosario David', 'rosario@mechartcap.com', 'admin', false, true)
ON CONFLICT ("email") DO UPDATE SET
  "role" = EXCLUDED."role",
  "is_master" = EXCLUDED."is_master",
  -- A row promoted to master must be able to sign in: clear any prior disable.
  "disabled_at" = CASE WHEN EXCLUDED."is_master" THEN NULL ELSE "staff_accounts"."disabled_at" END,
  "session_valid_after" = CASE WHEN EXCLUDED."is_master" THEN now() ELSE "staff_accounts"."session_valid_after" END,
  "updated_at" = now();
