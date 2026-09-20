CREATE TABLE "agreement_events" (
	"id" text PRIMARY KEY NOT NULL,
	"agreement_id" text NOT NULL,
	"actor_kind" text NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"amount_cents" integer,
	"version" integer NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"internal" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agreement_events_actor_kind_check" CHECK ("agreement_events"."actor_kind" in ('retail', 'desk', 'system')),
	CONSTRAINT "agreement_events_note_check" CHECK (length("agreement_events"."note") <= 1000),
	CONSTRAINT "agreement_events_version_check" CHECK ("agreement_events"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "agreement_signatures" (
	"id" text PRIMARY KEY NOT NULL,
	"agreement_id" text NOT NULL,
	"version" integer NOT NULL,
	"party" text NOT NULL,
	"signer_id" text,
	"typed_name" text NOT NULL,
	"document_id" text NOT NULL,
	"snapshot_hash" text NOT NULL,
	"client_address" text,
	"book" text DEFAULT 'live' NOT NULL,
	"signed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agreement_signatures_party_check" CHECK ("agreement_signatures"."party" in ('collector', 'mac')),
	CONSTRAINT "agreement_signatures_book_check" CHECK ("agreement_signatures"."book" in ('live', 'browser')),
	CONSTRAINT "agreement_signatures_version_check" CHECK ("agreement_signatures"."version" >= 1)
);
--> statement-breakpoint
DROP INDEX "live_agreement_members_live_timepiece_uidx";--> statement-breakpoint
DROP INDEX "agreement_documents_live_version_uidx";--> statement-breakpoint
ALTER TABLE "agreement_documents" ADD COLUMN "stage" text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE "desk_settings" ADD COLUMN "min_sale_amount_cents" integer DEFAULT 100000 NOT NULL;--> statement-breakpoint
ALTER TABLE "live_agreements" ADD COLUMN "executed_on" text;--> statement-breakpoint
ALTER TABLE "live_agreements" ADD COLUMN "delivered_on" text;--> statement-breakpoint
ALTER TABLE "live_agreements" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "live_agreements" ADD COLUMN "last_action_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "live_agreements" ADD COLUMN "close_reason" text;--> statement-breakpoint
ALTER TABLE "live_agreements" ADD COLUMN "customer_success" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "live_agreements" ADD COLUMN "payment_reference" text;--> statement-breakpoint
ALTER TABLE "live_agreements" ADD COLUMN "piece_caps" jsonb;--> statement-breakpoint
ALTER TABLE "agreement_events" ADD CONSTRAINT "agreement_events_agreement_id_live_agreements_id_fk" FOREIGN KEY ("agreement_id") REFERENCES "public"."live_agreements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agreement_signatures" ADD CONSTRAINT "agreement_signatures_agreement_id_live_agreements_id_fk" FOREIGN KEY ("agreement_id") REFERENCES "public"."live_agreements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agreement_documents_id_agreement_uidx" ON "agreement_documents" USING btree ("id","live_agreement_id");--> statement-breakpoint
ALTER TABLE "agreement_signatures" ADD CONSTRAINT "agreement_signatures_document_fk" FOREIGN KEY ("document_id","agreement_id") REFERENCES "public"."agreement_documents"("id","live_agreement_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agreement_events_agreement_id_idx" ON "agreement_events" USING btree ("agreement_id");--> statement-breakpoint
CREATE INDEX "agreement_events_created_at_idx" ON "agreement_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "agreement_signatures_agreement_id_idx" ON "agreement_signatures" USING btree ("agreement_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agreement_signatures_agreement_version_party_uidx" ON "agreement_signatures" USING btree ("agreement_id","version","party");--> statement-breakpoint
CREATE UNIQUE INDEX "agreement_documents_stage_uidx" ON "agreement_documents" USING btree ("live_agreement_id","version","stage") WHERE "agreement_documents"."stage" <> 'legacy' and "agreement_documents"."status" <> 'failed';--> statement-breakpoint
CREATE UNIQUE INDEX "live_agreement_members_held_timepiece_uidx" ON "live_agreement_members" USING btree ("timepiece_id") WHERE "live_agreement_members"."status" in ('reserved', 'live');--> statement-breakpoint
CREATE INDEX "live_agreements_status_idx" ON "live_agreements" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "agreement_documents_live_version_uidx" ON "agreement_documents" USING btree ("live_agreement_id","version") WHERE "agreement_documents"."stage" = 'legacy';--> statement-breakpoint
-- BEGIN KTD21 BACKFILL
-- KTD21 backfill. Before the request model a repo carried `draft |
-- pending_signature | signed` and sat on the book from the day it was created.
-- This is `legacyAgreementToRequest()` in SQL; `repo-request-backfill.test.ts`
-- runs both over the same fixtures and fails if they ever disagree. It runs
-- before the new CHECK constraints so those constraints prove its output.

-- A row's last action is its last update. The column default would have stamped
-- every historical row with the migration's own clock and expired live work.
UPDATE "live_agreements" SET "last_action_at" = "updated_at";--> statement-breakpoint

-- `signed` is dated by the day it was signed; everything else by its creation
-- day. A date nobody can read leaves the row with none.
UPDATE "live_agreements" SET "executed_on" = CASE
  WHEN "status" = 'signed' THEN coalesce(
    substring(coalesce("signed_on", '') from '^\d{4}-\d{2}-\d{2}'),
    substring("created_on" from '^\d{4}-\d{2}-\d{2}')
  )
  ELSE substring("created_on" from '^\d{4}-\d{2}-\d{2}')
END
WHERE "status" in ('pending_signature', 'signed');--> statement-breakpoint

-- A signed row stays signed even if it never recorded the day, and every
-- immutability check now reads that date, so give it the one it went on for.
UPDATE "live_agreements" SET "signed_on" = "executed_on"
WHERE "status" = 'signed'
  AND "executed_on" is not null
  AND substring(coalesce("signed_on", '') from '^\d{4}-\d{2}-\d{2}') is null;--> statement-breakpoint

-- Record the conversion in the thread before the statuses move, while the row
-- still knows what it was. Desk-only: no retail reader owns this sentence.
INSERT INTO "agreement_events" (
  "id", "agreement_id", "actor_kind", "action", "from_status", "to_status",
  "amount_cents", "version", "note", "internal"
)
SELECT
  'legacy:' || "id",
  "id",
  'system',
  'legacy_backfill',
  "status",
  CASE WHEN "status" = 'draft' OR "executed_on" is null THEN 'closed' ELSE 'executed' END,
  "amount_cents",
  1,
  '',
  true
FROM "live_agreements"
WHERE "status" in ('draft', 'pending_signature', 'signed');--> statement-breakpoint

UPDATE "live_agreements" SET "status" = 'executed', "version" = 1
WHERE "status" in ('pending_signature', 'signed') AND "executed_on" is not null;--> statement-breakpoint

-- A draft was never sent, and a repo with no readable date cannot claim the
-- book. Neither belongs to anybody now, so both close.
UPDATE "live_agreements"
SET "status" = 'closed', "close_reason" = 'withdrawn', "executed_on" = null, "version" = 1
WHERE "status" in ('draft', 'pending_signature', 'signed');--> statement-breakpoint

-- A closed request holds nothing. Executed rows keep the membership they have:
-- a piece released to a renewal successor must not be pulled back onto its
-- predecessor, which the held-piece index would refuse anyway.
UPDATE "live_agreement_members" SET "status" = 'released'
WHERE "status" <> 'released'
  AND "agreement_id" in (SELECT "id" FROM "live_agreements" WHERE "status" = 'closed');--> statement-breakpoint
-- END KTD21 BACKFILL

ALTER TABLE "agreement_documents" ADD CONSTRAINT "agreement_documents_stage_check" CHECK ("agreement_documents"."stage" in ('proposal', 'collector_signed', 'executed', 'legacy'));--> statement-breakpoint
ALTER TABLE "desk_settings" ADD CONSTRAINT "desk_settings_min_sale_check" CHECK ("desk_settings"."min_sale_amount_cents" > 0 and "desk_settings"."min_sale_amount_cents" <= 2147483647);--> statement-breakpoint
ALTER TABLE "live_agreement_members" ADD CONSTRAINT "live_agreement_members_status_check" CHECK ("live_agreement_members"."status" in ('reserved', 'live', 'released'));--> statement-breakpoint
ALTER TABLE "live_agreements" ADD CONSTRAINT "live_agreements_status_check" CHECK ("live_agreements"."status" in (
        'submitted', 'returned', 'collector_signed', 'inspecting', 'executed', 'closed',
        'draft', 'pending_signature', 'signed'
      ));--> statement-breakpoint
ALTER TABLE "live_agreements" ADD CONSTRAINT "live_agreements_executed_shape_check" CHECK (("live_agreements"."status" = 'executed') = ("live_agreements"."executed_on" is not null));--> statement-breakpoint
ALTER TABLE "live_agreements" ADD CONSTRAINT "live_agreements_closed_shape_check" CHECK (("live_agreements"."status" = 'closed') = ("live_agreements"."close_reason" is not null));--> statement-breakpoint
ALTER TABLE "live_agreements" ADD CONSTRAINT "live_agreements_close_reason_check" CHECK ("live_agreements"."close_reason" is null or "live_agreements"."close_reason" in (
        'declined_by_desk', 'declined_by_collector', 'withdrawn', 'expired'
      ));--> statement-breakpoint
ALTER TABLE "live_agreements" ADD CONSTRAINT "live_agreements_version_check" CHECK ("live_agreements"."version" >= 1);--> statement-breakpoint
-- KTD25. The request thread and its signatures are evidence, not state: a
-- correction is a new row, never an edit. Rejecting the write in the database
-- means no code path, migration, or console session can quietly rewrite what a
-- signer was shown or when a decision was made.
CREATE OR REPLACE FUNCTION "prevent_agreement_record_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'AGREEMENT_RECORD_IMMUTABLE';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "agreement_events_append_only"
BEFORE UPDATE OR DELETE ON "agreement_events"
FOR EACH ROW EXECUTE FUNCTION "prevent_agreement_record_mutation"();--> statement-breakpoint
CREATE TRIGGER "agreement_signatures_append_only"
BEFORE UPDATE OR DELETE ON "agreement_signatures"
FOR EACH ROW EXECUTE FUNCTION "prevent_agreement_record_mutation"();--> statement-breakpoint
-- A signature names the version the signer was shown. Binding it to a document
-- of a different version would let a later proposal inherit an older consent.
CREATE OR REPLACE FUNCTION "validate_agreement_signature_document"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  doc record;
BEGIN
  SELECT "version", "snapshot_hash", "status" INTO doc
  FROM "agreement_documents"
  WHERE "id" = NEW."document_id";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DOCUMENT_NOT_FOUND';
  END IF;
  IF doc."version" <> NEW."version" THEN
    RAISE EXCEPTION 'SIGNATURE_VERSION_MISMATCH';
  END IF;
  IF doc."snapshot_hash" <> NEW."snapshot_hash" THEN
    RAISE EXCEPTION 'SIGNATURE_DOCUMENT_MISMATCH';
  END IF;
  IF doc."status" <> 'stored' THEN
    RAISE EXCEPTION 'DOCUMENT_NOT_READY';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "agreement_signatures_validate_document"
BEFORE INSERT ON "agreement_signatures"
FOR EACH ROW EXECUTE FUNCTION "validate_agreement_signature_document"();
