CREATE TABLE "appraisal_attempt_photos" (
	"attempt_id" text NOT NULL,
	"photo_object_id" text NOT NULL,
	"original_key" text NOT NULL,
	"original_checksum" text NOT NULL,
	"kind" text NOT NULL,
	CONSTRAINT "appraisal_attempt_photos_attempt_id_photo_object_id_pk" PRIMARY KEY("attempt_id","photo_object_id")
);
--> statement-breakpoint
CREATE TABLE "appraisal_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"timepiece_id" text NOT NULL,
	"customer_id" text NOT NULL,
	"attempt_no" integer NOT NULL,
	"decision_no" integer,
	"status" text DEFAULT 'under_review' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"response_note" text,
	"snapshot" jsonb NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_by_staff_id" text,
	"decided_at" timestamp with time zone,
	"value_cents" integer,
	"range_low_cents" integer,
	"range_high_cents" integer,
	"finalized_at" timestamp with time zone,
	"finalized_by_staff_id" text,
	"finalized_agreement_id" text,
	"reopened_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "appraisal_attempts_status_check" CHECK ("appraisal_attempts"."status" in ('under_review', 'returned', 'accepted', 'refused')),
	CONSTRAINT "appraisal_attempts_attempt_no_check" CHECK ("appraisal_attempts"."attempt_no" between 1 and 2147483647),
	CONSTRAINT "appraisal_attempts_decision_no_check" CHECK ("appraisal_attempts"."decision_no" is null or "appraisal_attempts"."decision_no" between 1 and 3),
	CONSTRAINT "appraisal_attempts_reopened_count_check" CHECK ("appraisal_attempts"."reopened_count" >= 0),
	CONSTRAINT "appraisal_attempts_note_check" CHECK (length("appraisal_attempts"."note") <= 256),
	CONSTRAINT "appraisal_attempts_response_note_check" CHECK ("appraisal_attempts"."response_note" is null or length("appraisal_attempts"."response_note") between 1 and 1000),
	CONSTRAINT "appraisal_attempts_decision_shape_check" CHECK (
        (
          "appraisal_attempts"."status" in ('under_review', 'returned')
          and (
            "appraisal_attempts"."decision_no" is null
            or (
              "appraisal_attempts"."status" = 'under_review'
              and "appraisal_attempts"."decided_by_staff_id" is not null
              and "appraisal_attempts"."decided_at" is not null
            )
          )
        )
        or (
          "appraisal_attempts"."status" = 'accepted'
          and "appraisal_attempts"."decision_no" is not null
          and "appraisal_attempts"."decided_by_staff_id" is not null
          and "appraisal_attempts"."decided_at" is not null
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
      )
);
--> statement-breakpoint
ALTER TABLE "appraisal_attempt_photos" ADD CONSTRAINT "appraisal_attempt_photos_attempt_id_appraisal_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."appraisal_attempts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appraisal_attempt_photos" ADD CONSTRAINT "appraisal_attempt_photos_photo_object_id_photo_objects_id_fk" FOREIGN KEY ("photo_object_id") REFERENCES "public"."photo_objects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appraisal_attempts" ADD CONSTRAINT "appraisal_attempts_timepiece_id_timepieces_id_fk" FOREIGN KEY ("timepiece_id") REFERENCES "public"."timepieces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appraisal_attempts" ADD CONSTRAINT "appraisal_attempts_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appraisal_attempts" ADD CONSTRAINT "appraisal_attempts_decided_by_staff_id_staff_accounts_id_fk" FOREIGN KEY ("decided_by_staff_id") REFERENCES "public"."staff_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appraisal_attempts" ADD CONSTRAINT "appraisal_attempts_finalized_by_staff_id_staff_accounts_id_fk" FOREIGN KEY ("finalized_by_staff_id") REFERENCES "public"."staff_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appraisal_attempts" ADD CONSTRAINT "appraisal_attempts_finalized_agreement_id_live_agreements_id_fk" FOREIGN KEY ("finalized_agreement_id") REFERENCES "public"."live_agreements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "appraisal_attempt_photos_attempt_kind_uidx" ON "appraisal_attempt_photos" USING btree ("attempt_id","kind");--> statement-breakpoint
CREATE INDEX "appraisal_attempt_photos_photo_object_id_idx" ON "appraisal_attempt_photos" USING btree ("photo_object_id");--> statement-breakpoint
CREATE UNIQUE INDEX "appraisal_attempts_timepiece_attempt_uidx" ON "appraisal_attempts" USING btree ("timepiece_id","attempt_no");--> statement-breakpoint
CREATE UNIQUE INDEX "appraisal_attempts_timepiece_decision_uidx" ON "appraisal_attempts" USING btree ("timepiece_id","decision_no") WHERE "appraisal_attempts"."decision_no" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "appraisal_attempts_open_timepiece_uidx" ON "appraisal_attempts" USING btree ("timepiece_id") WHERE "appraisal_attempts"."status" = 'under_review';--> statement-breakpoint
CREATE INDEX "appraisal_attempts_customer_id_idx" ON "appraisal_attempts" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "appraisal_attempts_decided_by_staff_id_idx" ON "appraisal_attempts" USING btree ("decided_by_staff_id");--> statement-breakpoint
-- The submitted evidence never changes. Decision/finalization columns may
-- evolve through the governed state machine, but the retail snapshot does not.
CREATE OR REPLACE FUNCTION "prevent_appraisal_snapshot_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."snapshot" IS DISTINCT FROM OLD."snapshot"
    OR NEW."submitted_at" IS DISTINCT FROM OLD."submitted_at"
    OR NEW."timepiece_id" IS DISTINCT FROM OLD."timepiece_id"
    OR NEW."customer_id" IS DISTINCT FROM OLD."customer_id"
    OR NEW."attempt_no" IS DISTINCT FROM OLD."attempt_no"
  THEN
    RAISE EXCEPTION 'APPRAISAL_SNAPSHOT_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "appraisal_attempts_snapshot_immutable"
BEFORE UPDATE ON "appraisal_attempts"
FOR EACH ROW EXECUTE FUNCTION "prevent_appraisal_snapshot_mutation"();--> statement-breakpoint
-- Exact photo evidence is append-only. Corrections create a new submission.
CREATE OR REPLACE FUNCTION "prevent_appraisal_photo_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'APPRAISAL_PHOTO_IMMUTABLE';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "appraisal_attempt_photos_immutable"
BEFORE UPDATE OR DELETE ON "appraisal_attempt_photos"
FOR EACH ROW EXECUTE FUNCTION "prevent_appraisal_photo_mutation"();--> statement-breakpoint
-- A stored object pinned by appraisal evidence can neither be abandoned nor
-- reclaimed by the pending-photo sweep.
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
$$;--> statement-breakpoint
CREATE TRIGGER "photo_objects_referenced_not_abandoned"
BEFORE UPDATE OF "status" ON "photo_objects"
FOR EACH ROW EXECUTE FUNCTION "prevent_referenced_photo_abandon"();