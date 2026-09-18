CREATE TABLE "access_rate_limits" (
	"scope" text NOT NULL,
	"key_hash" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"hits" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "access_rate_limits_scope_key_hash_window_start_pk" PRIMARY KEY("scope","key_hash","window_start")
);
--> statement-breakpoint
CREATE TABLE "collector_access_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"customer_id" text,
	"registration_payload" jsonb,
	"purpose" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"send_status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collector_access_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "collector_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "collector_access_tokens" ADD CONSTRAINT "collector_access_tokens_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collector_sessions" ADD CONSTRAINT "collector_sessions_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "access_rate_limits_window_start_idx" ON "access_rate_limits" USING btree ("window_start");--> statement-breakpoint
CREATE INDEX "collector_access_tokens_customer_id_idx" ON "collector_access_tokens" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "collector_access_tokens_expires_at_idx" ON "collector_access_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "collector_sessions_customer_id_idx" ON "collector_sessions" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "collector_sessions_expires_at_idx" ON "collector_sessions" USING btree ("expires_at");