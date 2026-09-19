DROP INDEX "photo_objects_timepiece_checksum_uidx";--> statement-breakpoint
ALTER TABLE "live_previews" ALTER COLUMN "preview_url" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "live_previews" ADD COLUMN "photo_object_id" text;--> statement-breakpoint
ALTER TABLE "photo_objects" ADD COLUMN "content_type" text;--> statement-breakpoint
ALTER TABLE "photo_objects" ADD COLUMN "preview_key" text;--> statement-breakpoint
ALTER TABLE "photo_objects" ADD COLUMN "preview_checksum" text;--> statement-breakpoint
ALTER TABLE "photo_objects" ADD COLUMN "preview_bytes" integer;--> statement-breakpoint
ALTER TABLE "photo_objects" ADD COLUMN "preview_content_type" text;--> statement-breakpoint
ALTER TABLE "photo_objects" ADD COLUMN "status" text DEFAULT 'stored' NOT NULL;--> statement-breakpoint
ALTER TABLE "live_previews" ADD CONSTRAINT "live_previews_photo_object_id_photo_objects_id_fk" FOREIGN KEY ("photo_object_id") REFERENCES "public"."photo_objects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "photo_objects_timepiece_checksum_uidx" ON "photo_objects" USING btree ("timepiece_id","original_checksum") WHERE "photo_objects"."status" <> 'abandoned';