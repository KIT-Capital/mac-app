ALTER TABLE "appraisal_attempts" ADD COLUMN "inspected_value_cents" integer;--> statement-breakpoint
ALTER TABLE "appraisal_attempts" ADD CONSTRAINT "appraisal_attempts_inspected_value_cents_check" CHECK ("appraisal_attempts"."inspected_value_cents" is null or "appraisal_attempts"."inspected_value_cents" >= 0);
