ALTER TABLE "live_agreements" DROP CONSTRAINT "live_agreements_executed_on_check";--> statement-breakpoint
ALTER TABLE "live_agreements" DROP CONSTRAINT "live_agreements_delivered_on_check";--> statement-breakpoint
ALTER TABLE "live_agreements" ADD CONSTRAINT "live_agreements_executed_on_check" CHECK ("live_agreements"."executed_on" is null or (
        "live_agreements"."executed_on" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
        and pg_input_is_valid("live_agreements"."executed_on", 'date')
      ));--> statement-breakpoint
ALTER TABLE "live_agreements" ADD CONSTRAINT "live_agreements_delivered_on_check" CHECK ("live_agreements"."delivered_on" is null or (
        "live_agreements"."delivered_on" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
        and pg_input_is_valid("live_agreements"."delivered_on", 'date')
      ));--> statement-breakpoint
-- BEGIN SIGNED DOCUMENT FREEZE
-- A signature can only be recorded against a document that is already stored,
-- so nothing legitimate edits that row afterwards. The previous rule froze only
-- the columns naming which document it is, leaving the object key, checksum and
-- byte count open — and those are exactly what the download path trusts. A
-- signed document is now immutable in full, while an unsigned one still moves
-- freely from building to stored.
CREATE OR REPLACE FUNCTION "prevent_signed_document_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "agreement_signatures" WHERE "document_id" = OLD."id") THEN
    RAISE EXCEPTION 'DOCUMENT_SIGNED_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint

-- A truncate trigger is skipped under logical replication just as a row trigger
-- is, so the door these were added to shut was still ajar in the one
-- environment they exist to protect.
ALTER TABLE "agreement_events" ENABLE ALWAYS TRIGGER "agreement_events_no_truncate";--> statement-breakpoint
ALTER TABLE "agreement_signatures" ENABLE ALWAYS TRIGGER "agreement_signatures_no_truncate";
-- END SIGNED DOCUMENT FREEZE
