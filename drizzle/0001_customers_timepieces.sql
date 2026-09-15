CREATE TABLE "customers" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"role" text DEFAULT 'collector' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"member" boolean DEFAULT false NOT NULL,
	"avatar" text DEFAULT '' NOT NULL,
	"onboarding_complete" boolean DEFAULT false NOT NULL,
	"application_submitted" boolean DEFAULT false NOT NULL,
	"promo_code" text,
	"preferences" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"workos_subject" text,
	"last_active" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customers_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "timepieces" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"brand" text NOT NULL,
	"model" text NOT NULL,
	"reference" text,
	"serial" text,
	"status" text DEFAULT 'not_evaluated' NOT NULL,
	"financeable" boolean DEFAULT false NOT NULL,
	"condition" text DEFAULT '' NOT NULL,
	"box_papers" text DEFAULT '' NOT NULL,
	"case_metal" text DEFAULT '' NOT NULL,
	"case_type" text DEFAULT '' NOT NULL,
	"case_diameter" text DEFAULT '' NOT NULL,
	"dial_color" text DEFAULT '' NOT NULL,
	"buckle" text DEFAULT '' NOT NULL,
	"band" text DEFAULT 'strap' NOT NULL,
	"band_material" text DEFAULT '' NOT NULL,
	"complication" text DEFAULT '' NOT NULL,
	"evaluated_at" timestamp with time zone,
	"asset_code" text,
	"value_low_cents" integer,
	"value_high_cents" integer,
	"provenance" text,
	"custody" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "timepieces" ADD CONSTRAINT "timepieces_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "timepieces_customer_id_idx" ON "timepieces" USING btree ("customer_id");