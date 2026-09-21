ALTER TABLE "tenants" ADD COLUMN "logo_url" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "primary_color" text DEFAULT '#0E2A44' NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "accent_color" text DEFAULT '#FCB040' NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "soft_color" text DEFAULT '#E8D5C0' NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "from_name" text DEFAULT 'Mechanical Art Capital' NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_logo_url_check" CHECK (char_length("tenants"."logo_url") <= 500);--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_from_name_check" CHECK (char_length(btrim("tenants"."from_name")) between 1 and 80);--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_name_length_check" CHECK (char_length(btrim("tenants"."name")) between 1 and 80);--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_palette_hex_check" CHECK ("tenants"."primary_color" ~ '^#[0-9A-Fa-f]{6}$' and "tenants"."accent_color" ~ '^#[0-9A-Fa-f]{6}$' and "tenants"."soft_color" ~ '^#[0-9A-Fa-f]{6}$');