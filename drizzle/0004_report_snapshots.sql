CREATE TABLE "report_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"agreement_id" text,
	"as_of" timestamp with time zone NOT NULL,
	"payload" jsonb NOT NULL,
	"archive_checksum" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "report_snapshots" ADD CONSTRAINT "report_snapshots_agreement_id_agreements_id_fk" FOREIGN KEY ("agreement_id") REFERENCES "public"."agreements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "report_snapshots_agreement_id_idx" ON "report_snapshots" USING btree ("agreement_id");