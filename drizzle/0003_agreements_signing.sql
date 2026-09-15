CREATE TABLE "agreement_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"agreement_id" text NOT NULL,
	"version_number" integer NOT NULL,
	"executable" boolean DEFAULT false NOT NULL,
	"snapshot" jsonb NOT NULL,
	"prepared_by" text NOT NULL,
	"prepared_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agreements" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"application_id" text NOT NULL,
	"timepiece_id" text NOT NULL,
	"agreement_code" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"current_version_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "allocations" (
	"id" text PRIMARY KEY NOT NULL,
	"timepiece_id" text NOT NULL,
	"agreement_id" text NOT NULL,
	"status" text DEFAULT 'live' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "applications" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"timepiece_id" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"term_months" integer NOT NULL,
	"delivery" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'submitted' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "archived_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"envelope_id" text NOT NULL,
	"object_key" text NOT NULL,
	"checksum" text NOT NULL,
	"bytes" integer NOT NULL,
	"archived_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signature_envelopes" (
	"id" text PRIMARY KEY NOT NULL,
	"agreement_id" text NOT NULL,
	"agreement_version_id" text NOT NULL,
	"provider" text DEFAULT 'mock' NOT NULL,
	"external_id" text NOT NULL,
	"status" text DEFAULT 'sent' NOT NULL,
	"collector_signed_at" timestamp with time zone,
	"mac_signed_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agreement_versions" ADD CONSTRAINT "agreement_versions_agreement_id_agreements_id_fk" FOREIGN KEY ("agreement_id") REFERENCES "public"."agreements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agreements" ADD CONSTRAINT "agreements_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agreements" ADD CONSTRAINT "agreements_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agreements" ADD CONSTRAINT "agreements_timepiece_id_timepieces_id_fk" FOREIGN KEY ("timepiece_id") REFERENCES "public"."timepieces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_timepiece_id_timepieces_id_fk" FOREIGN KEY ("timepiece_id") REFERENCES "public"."timepieces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_agreement_id_agreements_id_fk" FOREIGN KEY ("agreement_id") REFERENCES "public"."agreements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_timepiece_id_timepieces_id_fk" FOREIGN KEY ("timepiece_id") REFERENCES "public"."timepieces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archived_documents" ADD CONSTRAINT "archived_documents_envelope_id_signature_envelopes_id_fk" FOREIGN KEY ("envelope_id") REFERENCES "public"."signature_envelopes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signature_envelopes" ADD CONSTRAINT "signature_envelopes_agreement_id_agreements_id_fk" FOREIGN KEY ("agreement_id") REFERENCES "public"."agreements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signature_envelopes" ADD CONSTRAINT "signature_envelopes_agreement_version_id_agreement_versions_id_fk" FOREIGN KEY ("agreement_version_id") REFERENCES "public"."agreement_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agreement_versions_agreement_version_uidx" ON "agreement_versions" USING btree ("agreement_id","version_number");--> statement-breakpoint
CREATE INDEX "agreement_versions_agreement_id_idx" ON "agreement_versions" USING btree ("agreement_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agreements_application_id_uidx" ON "agreements" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "agreements_customer_id_idx" ON "agreements" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "allocations_timepiece_id_idx" ON "allocations" USING btree ("timepiece_id");--> statement-breakpoint
CREATE INDEX "applications_customer_id_idx" ON "applications" USING btree ("customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "archived_documents_envelope_id_uidx" ON "archived_documents" USING btree ("envelope_id");--> statement-breakpoint
CREATE UNIQUE INDEX "signature_envelopes_external_id_uidx" ON "signature_envelopes" USING btree ("external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "signature_envelopes_version_id_uidx" ON "signature_envelopes" USING btree ("agreement_version_id");