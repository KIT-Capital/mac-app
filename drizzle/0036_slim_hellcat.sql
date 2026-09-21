CREATE TABLE "whatsapp_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text DEFAULT 'tenant-mac' NOT NULL,
	"customer_id" text,
	"direction" text NOT NULL,
	"phone" text NOT NULL,
	"body" text NOT NULL,
	"provider_sid" text,
	"kind" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "whatsapp_messages_direction_check" CHECK ("whatsapp_messages"."direction" in ('inbound', 'outbound'))
);
--> statement-breakpoint
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "whatsapp_messages_tenant_id_idx" ON "whatsapp_messages" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "whatsapp_messages_customer_id_idx" ON "whatsapp_messages" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "whatsapp_messages_created_at_idx" ON "whatsapp_messages" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_messages_provider_sid_uidx" ON "whatsapp_messages" USING btree ("provider_sid") WHERE "whatsapp_messages"."provider_sid" is not null;