CREATE TABLE "agreement_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"live_agreement_id" text NOT NULL,
	"customer_id" text NOT NULL,
	"version" integer NOT NULL,
	"supersedes_document_id" text,
	"template_version" text NOT NULL,
	"status" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"snapshot_hash" text NOT NULL,
	"object_key" text,
	"checksum" text,
	"bytes" integer,
	"failure_code" text,
	"created_by_kind" text NOT NULL,
	"created_by_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"stored_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "agreement_document_sends" (
	"id" text PRIMARY KEY NOT NULL,
	"document_id" text NOT NULL,
	"actor_kind" text NOT NULL,
	"actor_id" text NOT NULL,
	"recipient_email" text NOT NULL,
	"recipient_kind" text NOT NULL,
	"confirmed_at" timestamp with time zone,
	"provider_message_id" text,
	"result" text NOT NULL,
	"failure_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agreement_documents" ADD CONSTRAINT "agreement_documents_live_agreement_id_live_agreements_id_fk" FOREIGN KEY ("live_agreement_id") REFERENCES "public"."live_agreements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agreement_documents" ADD CONSTRAINT "agreement_documents_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agreement_documents" ADD CONSTRAINT "agreement_documents_supersedes_document_id_agreement_documents_id_fk" FOREIGN KEY ("supersedes_document_id") REFERENCES "public"."agreement_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agreement_document_sends" ADD CONSTRAINT "agreement_document_sends_document_id_agreement_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."agreement_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agreement_documents_live_version_uidx" ON "agreement_documents" USING btree ("live_agreement_id","version");--> statement-breakpoint
CREATE INDEX "agreement_documents_customer_id_idx" ON "agreement_documents" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "agreement_documents_live_agreement_id_idx" ON "agreement_documents" USING btree ("live_agreement_id");--> statement-breakpoint
CREATE INDEX "agreement_document_sends_document_id_idx" ON "agreement_document_sends" USING btree ("document_id");
