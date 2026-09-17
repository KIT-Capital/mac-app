CREATE TABLE "live_agreement_ends" (
	"agreement_id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"ended_on" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "live_agreement_members" (
	"id" text PRIMARY KEY NOT NULL,
	"agreement_id" text NOT NULL,
	"timepiece_id" text NOT NULL,
	"status" text DEFAULT 'live' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "live_agreements" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"term_months" integer NOT NULL,
	"delivery" text DEFAULT '' NOT NULL,
	"owner_name" text NOT NULL,
	"email" text NOT NULL,
	"status" text DEFAULT 'pending_signature' NOT NULL,
	"agreement_code" text,
	"created_on" text NOT NULL,
	"signed_on" text,
	"scale" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "live_previews" (
	"id" text PRIMARY KEY NOT NULL,
	"timepiece_id" text NOT NULL,
	"kind" text DEFAULT 'legacy_preview' NOT NULL,
	"preview_url" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "live_agreement_ends" ADD CONSTRAINT "live_agreement_ends_agreement_id_live_agreements_id_fk" FOREIGN KEY ("agreement_id") REFERENCES "public"."live_agreements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_agreement_members" ADD CONSTRAINT "live_agreement_members_agreement_id_live_agreements_id_fk" FOREIGN KEY ("agreement_id") REFERENCES "public"."live_agreements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_agreement_members" ADD CONSTRAINT "live_agreement_members_timepiece_id_timepieces_id_fk" FOREIGN KEY ("timepiece_id") REFERENCES "public"."timepieces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_agreements" ADD CONSTRAINT "live_agreements_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_previews" ADD CONSTRAINT "live_previews_timepiece_id_timepieces_id_fk" FOREIGN KEY ("timepiece_id") REFERENCES "public"."timepieces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "live_agreement_members_agreement_id_idx" ON "live_agreement_members" USING btree ("agreement_id");--> statement-breakpoint
CREATE UNIQUE INDEX "live_agreement_members_agreement_timepiece_uidx" ON "live_agreement_members" USING btree ("agreement_id","timepiece_id");--> statement-breakpoint
CREATE UNIQUE INDEX "live_agreement_members_live_timepiece_uidx" ON "live_agreement_members" USING btree ("timepiece_id") WHERE "live_agreement_members"."status" = 'live';--> statement-breakpoint
CREATE INDEX "live_agreements_customer_id_idx" ON "live_agreements" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "live_previews_timepiece_id_idx" ON "live_previews" USING btree ("timepiece_id");