ALTER TABLE "live_agreements" ADD CONSTRAINT "live_agreements_executed_on_check" CHECK ("live_agreements"."executed_on" is null or "live_agreements"."executed_on" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$');--> statement-breakpoint
ALTER TABLE "live_agreements" ADD CONSTRAINT "live_agreements_delivered_on_check" CHECK ("live_agreements"."delivered_on" is null or "live_agreements"."delivered_on" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$');--> statement-breakpoint
-- BEGIN EVIDENCE HARDENING
-- KTD10. A signature names the document it was shown by id and hash. Nothing
-- stopped that document being rewritten afterwards, which would leave the
-- signature pointing at terms its signer never saw. The row must stay
-- updatable — a render moves it from building to stored — so only the columns
-- that define which document it is are frozen, and only once someone signed.
CREATE OR REPLACE FUNCTION "prevent_signed_document_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."version" IS DISTINCT FROM OLD."version"
    OR NEW."snapshot_hash" IS DISTINCT FROM OLD."snapshot_hash"
    OR NEW."snapshot" IS DISTINCT FROM OLD."snapshot"
    OR NEW."live_agreement_id" IS DISTINCT FROM OLD."live_agreement_id"
    OR NEW."stage" IS DISTINCT FROM OLD."stage"
  THEN
    IF EXISTS (SELECT 1 FROM "agreement_signatures" WHERE "document_id" = OLD."id") THEN
      RAISE EXCEPTION 'DOCUMENT_SIGNED_IMMUTABLE';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "agreement_documents_signed_immutable"
BEFORE UPDATE ON "agreement_documents"
FOR EACH ROW EXECUTE FUNCTION "prevent_signed_document_mutation"();--> statement-breakpoint

-- A row trigger never sees TRUNCATE, so the append-only rule had a door in it
-- wide enough to empty the whole thread. ENABLE ALWAYS keeps both rules in
-- force under logical replication, where a row trigger would otherwise sleep.
CREATE TRIGGER "agreement_events_no_truncate"
BEFORE TRUNCATE ON "agreement_events"
FOR EACH STATEMENT EXECUTE FUNCTION "prevent_agreement_record_mutation"();--> statement-breakpoint
CREATE TRIGGER "agreement_signatures_no_truncate"
BEFORE TRUNCATE ON "agreement_signatures"
FOR EACH STATEMENT EXECUTE FUNCTION "prevent_agreement_record_mutation"();--> statement-breakpoint
ALTER TABLE "agreement_events" ENABLE ALWAYS TRIGGER "agreement_events_append_only";--> statement-breakpoint
ALTER TABLE "agreement_signatures" ENABLE ALWAYS TRIGGER "agreement_signatures_append_only";
-- END EVIDENCE HARDENING
