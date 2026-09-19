ALTER TABLE "appraisal_attempts" DROP CONSTRAINT "appraisal_attempts_response_note_check";--> statement-breakpoint
ALTER TABLE "appraisal_attempts" DROP CONSTRAINT "appraisal_attempts_decision_shape_check";--> statement-breakpoint
ALTER TABLE "appraisal_attempts" ADD COLUMN "evidence_sealed_at" timestamp with time zone;--> statement-breakpoint
UPDATE "appraisal_attempts"
SET "evidence_sealed_at" = coalesce("updated_at", now())
WHERE "evidence_sealed_at" is null;--> statement-breakpoint
CREATE INDEX "appraisal_attempts_finalized_by_staff_id_idx" ON "appraisal_attempts" USING btree ("finalized_by_staff_id");--> statement-breakpoint
CREATE INDEX "appraisal_attempts_finalized_agreement_id_idx" ON "appraisal_attempts" USING btree ("finalized_agreement_id");--> statement-breakpoint
ALTER TABLE "appraisal_attempts" ADD CONSTRAINT "appraisal_attempts_finalization_shape_check" CHECK (
        (
          "appraisal_attempts"."finalized_at" is null
          and "appraisal_attempts"."finalized_by_staff_id" is null
          and "appraisal_attempts"."finalized_agreement_id" is null
        )
        or (
          "appraisal_attempts"."status" = 'accepted'
          and "appraisal_attempts"."finalized_at" is not null
          and "appraisal_attempts"."finalized_by_staff_id" is not null
          and "appraisal_attempts"."finalized_agreement_id" is not null
        )
      );--> statement-breakpoint
ALTER TABLE "appraisal_attempts" ADD CONSTRAINT "appraisal_attempts_response_note_check" CHECK (
        (
          "appraisal_attempts"."status" = 'returned'
          and "appraisal_attempts"."response_note" is not null
          and length("appraisal_attempts"."response_note") between 1 and 1000
        )
        or (
          "appraisal_attempts"."status" <> 'returned'
          and "appraisal_attempts"."response_note" is null
        )
      );--> statement-breakpoint
ALTER TABLE "appraisal_attempts" ADD CONSTRAINT "appraisal_attempts_decision_shape_check" CHECK (
        (
          "appraisal_attempts"."status" in ('under_review', 'returned')
          and (
            (
              "appraisal_attempts"."decision_no" is null
              and "appraisal_attempts"."decided_by_staff_id" is null
              and "appraisal_attempts"."decided_at" is null
              and "appraisal_attempts"."value_cents" is null
              and "appraisal_attempts"."range_low_cents" is null
              and "appraisal_attempts"."range_high_cents" is null
            )
            or (
              "appraisal_attempts"."status" = 'under_review'
              and "appraisal_attempts"."decision_no" is not null
              and "appraisal_attempts"."decided_by_staff_id" is not null
              and "appraisal_attempts"."decided_at" is not null
              and (
                (
                  "appraisal_attempts"."value_cents" is not null
                  and "appraisal_attempts"."range_low_cents" is not null
                  and "appraisal_attempts"."range_high_cents" is not null
                  and "appraisal_attempts"."value_cents" >= 0
                  and "appraisal_attempts"."range_low_cents" >= 0
                  and "appraisal_attempts"."range_high_cents" >= "appraisal_attempts"."range_low_cents"
                )
                or (
                  "appraisal_attempts"."value_cents" is null
                  and "appraisal_attempts"."range_low_cents" is null
                  and "appraisal_attempts"."range_high_cents" is null
                )
              )
            )
          )
        )
        or (
          "appraisal_attempts"."status" = 'accepted'
          and "appraisal_attempts"."decision_no" is not null
          and "appraisal_attempts"."decided_by_staff_id" is not null
          and "appraisal_attempts"."decided_at" is not null
          and "appraisal_attempts"."value_cents" is not null
          and "appraisal_attempts"."range_low_cents" is not null
          and "appraisal_attempts"."range_high_cents" is not null
          and "appraisal_attempts"."value_cents" >= 0
          and "appraisal_attempts"."range_low_cents" >= 0
          and "appraisal_attempts"."range_high_cents" >= "appraisal_attempts"."range_low_cents"
        )
        or (
          "appraisal_attempts"."status" = 'refused'
          and "appraisal_attempts"."decision_no" is not null
          and "appraisal_attempts"."decided_by_staff_id" is not null
          and "appraisal_attempts"."decided_at" is not null
          and "appraisal_attempts"."value_cents" is null
          and "appraisal_attempts"."range_low_cents" is null
          and "appraisal_attempts"."range_high_cents" is null
        )
      );--> statement-breakpoint
-- Replace the U3 functions with production-only immutable evidence. Tests use
-- transaction rollback; there is no runtime-role cleanup bypass.
DROP TRIGGER "appraisal_attempts_snapshot_immutable" ON "appraisal_attempts";--> statement-breakpoint
CREATE OR REPLACE FUNCTION "prevent_appraisal_snapshot_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'APPRAISAL_ATTEMPT_IMMUTABLE';
  END IF;
  IF NEW."snapshot" IS DISTINCT FROM OLD."snapshot"
    OR NEW."note" IS DISTINCT FROM OLD."note"
    OR NEW."submitted_at" IS DISTINCT FROM OLD."submitted_at"
    OR NEW."timepiece_id" IS DISTINCT FROM OLD."timepiece_id"
    OR NEW."customer_id" IS DISTINCT FROM OLD."customer_id"
    OR NEW."attempt_no" IS DISTINCT FROM OLD."attempt_no"
    OR (
      OLD."evidence_sealed_at" is not null
      AND NEW."evidence_sealed_at" IS DISTINCT FROM OLD."evidence_sealed_at"
    )
  THEN
    RAISE EXCEPTION 'APPRAISAL_SNAPSHOT_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "appraisal_attempts_snapshot_immutable"
BEFORE UPDATE OR DELETE ON "appraisal_attempts"
FOR EACH ROW EXECUTE FUNCTION "prevent_appraisal_snapshot_mutation"();--> statement-breakpoint
CREATE OR REPLACE FUNCTION "prevent_appraisal_photo_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'APPRAISAL_PHOTO_IMMUTABLE';
END;
$$;--> statement-breakpoint
-- Evidence membership is complete when evidence_sealed_at is set. Initial
-- inserts lock and validate the source row so abandon-versus-submit cannot cross.
CREATE OR REPLACE FUNCTION "validate_appraisal_photo_evidence"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  attempt_row "appraisal_attempts"%ROWTYPE;
  photo_row "photo_objects"%ROWTYPE;
BEGIN
  SELECT * INTO attempt_row
  FROM "appraisal_attempts"
  WHERE "id" = NEW."attempt_id"
  FOR UPDATE;
  IF NOT FOUND OR attempt_row."evidence_sealed_at" is not null THEN
    RAISE EXCEPTION 'APPRAISAL_PHOTO_IMMUTABLE';
  END IF;

  SELECT * INTO photo_row
  FROM "photo_objects"
  WHERE "id" = NEW."photo_object_id"
  FOR UPDATE;
  IF NOT FOUND
    OR photo_row."status" <> 'stored'
    OR photo_row."timepiece_id" <> attempt_row."timepiece_id"
    OR photo_row."customer_id" <> attempt_row."customer_id"
    OR photo_row."kind" <> NEW."kind"
    OR photo_row."original_key" <> NEW."original_key"
    OR photo_row."original_checksum" <> NEW."original_checksum"
  THEN
    RAISE EXCEPTION 'PHOTO_EVIDENCE_INVALID';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "appraisal_attempt_photos_validate_insert"
BEFORE INSERT ON "appraisal_attempt_photos"
FOR EACH ROW EXECUTE FUNCTION "validate_appraisal_photo_evidence"();--> statement-breakpoint
CREATE OR REPLACE FUNCTION "prevent_referenced_photo_abandon"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."status" = 'abandoned'
    AND OLD."status" IS DISTINCT FROM 'abandoned'
    AND EXISTS (
      SELECT 1
      FROM "appraisal_attempt_photos"
      WHERE "photo_object_id" = OLD."id"
    )
  THEN
    RAISE EXCEPTION 'PHOTO_REFERENCED';
  END IF;
  RETURN NEW;
END;
$$;