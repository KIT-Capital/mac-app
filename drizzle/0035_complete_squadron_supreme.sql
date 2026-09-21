ALTER TABLE "live_agreements" ADD COLUMN "party_kind" text DEFAULT 'collector' NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_role_check" CHECK ("customers"."role" in ('collector', 'dealer'));--> statement-breakpoint
ALTER TABLE "live_agreements" ADD CONSTRAINT "live_agreements_party_kind_check" CHECK ("live_agreements"."party_kind" in ('collector', 'dealer'));