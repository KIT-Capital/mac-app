CREATE TABLE "tenants" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"next_member_sequence" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_code_check" CHECK ("tenants"."code" ~ '^[A-Z]{2,8}$'),
	CONSTRAINT "tenants_next_member_sequence_check" CHECK ("tenants"."next_member_sequence" >= 1)
);
--> statement-breakpoint
ALTER TABLE "customers" DROP CONSTRAINT "customers_email_unique";--> statement-breakpoint
DROP INDEX "catalog_brands_slug_uidx";--> statement-breakpoint
ALTER TABLE "agreements" ADD COLUMN "tenant_id" text DEFAULT 'tenant-mac' NOT NULL;--> statement-breakpoint
ALTER TABLE "catalog_brands" ADD COLUMN "tenant_id" text DEFAULT 'tenant-mac' NOT NULL;--> statement-breakpoint
ALTER TABLE "catalog_references" ADD COLUMN "tenant_id" text DEFAULT 'tenant-mac' NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "tenant_id" text DEFAULT 'tenant-mac' NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "member_id" text;--> statement-breakpoint
ALTER TABLE "live_agreements" ADD COLUMN "tenant_id" text DEFAULT 'tenant-mac' NOT NULL;--> statement-breakpoint
ALTER TABLE "timepieces" ADD COLUMN "tenant_id" text DEFAULT 'tenant-mac' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "tenants_code_uidx" ON "tenants" USING btree ("code");--> statement-breakpoint
INSERT INTO "tenants" ("id", "code", "name") VALUES ('tenant-mac', 'MAC', 'Mechanical Art Capital');--> statement-breakpoint
ALTER TABLE "agreements" ADD CONSTRAINT "agreements_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_brands" ADD CONSTRAINT "catalog_brands_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_references" ADD CONSTRAINT "catalog_references_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_agreements" ADD CONSTRAINT "live_agreements_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timepieces" ADD CONSTRAINT "timepieces_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agreements_tenant_id_idx" ON "agreements" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "catalog_brands_tenant_id_idx" ON "catalog_brands" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_brands_tenant_slug_uidx" ON "catalog_brands" USING btree ("tenant_id","slug");--> statement-breakpoint
CREATE INDEX "catalog_references_tenant_id_idx" ON "catalog_references" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "customers_tenant_id_idx" ON "customers" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "customers_tenant_email_uidx" ON "customers" USING btree ("tenant_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "customers_tenant_member_id_uidx" ON "customers" USING btree ("tenant_id","member_id") WHERE "customers"."member_id" is not null;--> statement-breakpoint
CREATE INDEX "live_agreements_tenant_id_idx" ON "live_agreements" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "timepieces_tenant_id_idx" ON "timepieces" USING btree ("tenant_id");--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_member_id_check" CHECK ("customers"."member_id" is null or "customers"."member_id" ~ '^[A-Z]{2,8}[0-9]{5}-[0-9]{2}$');