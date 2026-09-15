CREATE TABLE "photo_objects" (
	"id" text PRIMARY KEY NOT NULL,
	"timepiece_id" text NOT NULL,
	"customer_id" text NOT NULL,
	"kind" text NOT NULL,
	"original_key" text NOT NULL,
	"original_checksum" text NOT NULL,
	"original_bytes" integer NOT NULL,
	"thumbnail_key" text,
	"thumbnail_checksum" text,
	"uploaded_by" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "photo_objects" ADD CONSTRAINT "photo_objects_timepiece_id_timepieces_id_fk" FOREIGN KEY ("timepiece_id") REFERENCES "public"."timepieces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo_objects" ADD CONSTRAINT "photo_objects_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "photo_objects_timepiece_id_idx" ON "photo_objects" USING btree ("timepiece_id");--> statement-breakpoint
CREATE UNIQUE INDEX "photo_objects_timepiece_checksum_uidx" ON "photo_objects" USING btree ("timepiece_id","original_checksum");