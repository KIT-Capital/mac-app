ALTER TABLE "photo_objects" ADD CONSTRAINT "photo_objects_status_check" CHECK ("photo_objects"."status" in ('pending', 'stored', 'abandoned'));--> statement-breakpoint
-- A submission may be unsealed only inside its creation transaction. This
-- deferred trigger queries the final row image at commit, after evidence insert.
CREATE OR REPLACE FUNCTION "require_appraisal_evidence_sealed"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "appraisal_attempts"
    WHERE "id" = NEW."id"
      AND "evidence_sealed_at" is not null
  ) THEN
    RAISE EXCEPTION 'APPRAISAL_EVIDENCE_UNSEALED';
  END IF;
  RETURN NULL;
END;
$$;--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "appraisal_attempts_evidence_sealed"
AFTER INSERT OR UPDATE OF "evidence_sealed_at" ON "appraisal_attempts"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "require_appraisal_evidence_sealed"();--> statement-breakpoint
-- Once referenced, the source object remains stored and its provenance cannot
-- be rewritten. Thumbnail derivatives may still evolve independently.
DROP TRIGGER "photo_objects_referenced_not_abandoned" ON "photo_objects";--> statement-breakpoint
CREATE OR REPLACE FUNCTION "prevent_referenced_photo_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "appraisal_attempt_photos"
    WHERE "photo_object_id" = OLD."id"
  ) AND (
    NEW."status" <> 'stored'
    OR NEW."timepiece_id" IS DISTINCT FROM OLD."timepiece_id"
    OR NEW."customer_id" IS DISTINCT FROM OLD."customer_id"
    OR NEW."kind" IS DISTINCT FROM OLD."kind"
    OR NEW."original_key" IS DISTINCT FROM OLD."original_key"
    OR NEW."original_checksum" IS DISTINCT FROM OLD."original_checksum"
    OR NEW."original_bytes" IS DISTINCT FROM OLD."original_bytes"
    OR NEW."content_type" IS DISTINCT FROM OLD."content_type"
    OR NEW."preview_key" IS DISTINCT FROM OLD."preview_key"
    OR NEW."preview_checksum" IS DISTINCT FROM OLD."preview_checksum"
    OR NEW."preview_bytes" IS DISTINCT FROM OLD."preview_bytes"
    OR NEW."preview_content_type" IS DISTINCT FROM OLD."preview_content_type"
    OR NEW."uploaded_by" IS DISTINCT FROM OLD."uploaded_by"
    OR NEW."received_at" IS DISTINCT FROM OLD."received_at"
  ) THEN
    RAISE EXCEPTION 'PHOTO_REFERENCED';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "photo_objects_referenced_immutable"
BEFORE UPDATE ON "photo_objects"
FOR EACH ROW EXECUTE FUNCTION "prevent_referenced_photo_mutation"();