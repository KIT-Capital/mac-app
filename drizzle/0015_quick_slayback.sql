CREATE TABLE "agreement_shells" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"term_months" integer NOT NULL,
	"rate_bps" integer NOT NULL,
	"ltv_bps" integer NOT NULL,
	"setup_fee_bps" integer NOT NULL,
	"early_repurchase_amount_bps" integer NOT NULL,
	"broker_fee_bps" integer NOT NULL,
	"min_months" integer NOT NULL,
	"early_start_month" integer NOT NULL,
	"early_until_month" integer NOT NULL,
	"status" text NOT NULL,
	"created_on" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agreement_shells_status_check" CHECK ("agreement_shells"."status" in ('open', 'assigned', 'closed')),
	CONSTRAINT "agreement_shells_ltv_check" CHECK ("agreement_shells"."ltv_bps" > 0 and "agreement_shells"."ltv_bps" <= 6000),
	CONSTRAINT "agreement_shells_money_check" CHECK (
      "agreement_shells"."rate_bps" >= 1850
      and "agreement_shells"."setup_fee_bps" >= 100
      and "agreement_shells"."early_repurchase_amount_bps" >= 350
      and "agreement_shells"."broker_fee_bps" >= 350
    ),
	CONSTRAINT "agreement_shells_terms_check" CHECK (
      "agreement_shells"."term_months" > 0
      and "agreement_shells"."min_months" > 0
      and "agreement_shells"."early_start_month" > 0
      and "agreement_shells"."early_until_month" > 0
    )
);
--> statement-breakpoint
CREATE TABLE "catalog_references" (
	"id" text PRIMARY KEY NOT NULL,
	"brand" text NOT NULL,
	"model" text NOT NULL,
	"reference" text DEFAULT '' NOT NULL,
	"case_metal" text DEFAULT '' NOT NULL,
	"case_diameter" text DEFAULT '' NOT NULL,
	"typical_low_cents" integer NOT NULL,
	"typical_high_cents" integer NOT NULL,
	"financeable" boolean DEFAULT false NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_references_values_check" CHECK (
      "catalog_references"."typical_low_cents" >= 0
      and "catalog_references"."typical_high_cents" >= "catalog_references"."typical_low_cents"
    )
);
--> statement-breakpoint
CREATE TABLE "desk_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"max_ltv_bps" integer NOT NULL,
	"starting_rate_bps" integer NOT NULL,
	"setup_fee_bps" integer NOT NULL,
	"early_repurchase_amount_bps" integer NOT NULL,
	"broker_fee_bps" integer NOT NULL,
	"min_months" integer NOT NULL,
	"early_start_month" integer NOT NULL,
	"early_until_month" integer NOT NULL,
	"typical_term" integer NOT NULL,
	"membership_monthly_cents" integer NOT NULL,
	"vault_location" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "desk_settings_singleton_check" CHECK ("desk_settings"."id" = 'default'),
	CONSTRAINT "desk_settings_max_ltv_check" CHECK ("desk_settings"."max_ltv_bps" > 0 and "desk_settings"."max_ltv_bps" <= 6000),
	CONSTRAINT "desk_settings_money_check" CHECK (
      "desk_settings"."starting_rate_bps" >= 1850
      and "desk_settings"."setup_fee_bps" >= 100
      and "desk_settings"."early_repurchase_amount_bps" >= 350
      and "desk_settings"."broker_fee_bps" >= 350
      and "desk_settings"."membership_monthly_cents" >= 0
    ),
	CONSTRAINT "desk_settings_terms_check" CHECK (
      "desk_settings"."min_months" > 0
      and "desk_settings"."early_start_month" > 0
      and "desk_settings"."early_until_month" > 0
      and "desk_settings"."typical_term" > 0
    )
);
--> statement-breakpoint
CREATE UNIQUE INDEX "agreement_shells_open_uidx" ON "agreement_shells" USING btree ("status") WHERE "agreement_shells"."status" = 'open';