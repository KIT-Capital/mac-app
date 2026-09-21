ALTER TABLE "timepieces" ADD COLUMN "catalog_id" text;--> statement-breakpoint
ALTER TABLE "timepieces" ADD COLUMN "video_name" text;--> statement-breakpoint
ALTER TABLE "timepieces" ADD COLUMN "video_duration_seconds" integer;--> statement-breakpoint
ALTER TABLE "timepieces" ADD CONSTRAINT "timepieces_catalog_id_catalog_references_id_fk" FOREIGN KEY ("catalog_id") REFERENCES "public"."catalog_references"("id") ON DELETE set null ON UPDATE no action;