ALTER TABLE "agreement_shells" DROP CONSTRAINT "agreement_shells_money_check";--> statement-breakpoint
ALTER TABLE "agreement_shells" DROP CONSTRAINT "agreement_shells_terms_check";--> statement-breakpoint
ALTER TABLE "catalog_references" DROP CONSTRAINT "catalog_references_values_check";--> statement-breakpoint
ALTER TABLE "desk_settings" DROP CONSTRAINT "desk_settings_money_check";--> statement-breakpoint
ALTER TABLE "desk_settings" DROP CONSTRAINT "desk_settings_terms_check";--> statement-breakpoint
ALTER TABLE "agreement_shells" ADD CONSTRAINT "agreement_shells_money_check" CHECK (
      "agreement_shells"."rate_bps" >= 1850
      and "agreement_shells"."rate_bps" <= 10000
      and "agreement_shells"."setup_fee_bps" >= 100
      and "agreement_shells"."setup_fee_bps" <= 10000
      and "agreement_shells"."early_repurchase_amount_bps" >= 350
      and "agreement_shells"."early_repurchase_amount_bps" <= 10000
      and "agreement_shells"."broker_fee_bps" >= 350
      and "agreement_shells"."broker_fee_bps" <= 10000
    );--> statement-breakpoint
ALTER TABLE "agreement_shells" ADD CONSTRAINT "agreement_shells_terms_check" CHECK (
      "agreement_shells"."term_months" > 0
      and "agreement_shells"."min_months" > 0
      and "agreement_shells"."early_start_month" > 0
      and "agreement_shells"."early_until_month" > 0
      and "agreement_shells"."min_months" <= "agreement_shells"."term_months"
      and "agreement_shells"."early_start_month" <= "agreement_shells"."early_until_month"
      and "agreement_shells"."early_until_month" <= "agreement_shells"."term_months"
    );--> statement-breakpoint
ALTER TABLE "catalog_references" ADD CONSTRAINT "catalog_references_values_check" CHECK (
      "catalog_references"."typical_low_cents" >= 0
      and "catalog_references"."typical_high_cents" >= "catalog_references"."typical_low_cents"
      and "catalog_references"."typical_high_cents" <= 2147483647
    );--> statement-breakpoint
ALTER TABLE "desk_settings" ADD CONSTRAINT "desk_settings_money_check" CHECK (
      "desk_settings"."starting_rate_bps" >= 1850
      and "desk_settings"."starting_rate_bps" <= 10000
      and "desk_settings"."setup_fee_bps" >= 100
      and "desk_settings"."setup_fee_bps" <= 10000
      and "desk_settings"."early_repurchase_amount_bps" >= 350
      and "desk_settings"."early_repurchase_amount_bps" <= 10000
      and "desk_settings"."broker_fee_bps" >= 350
      and "desk_settings"."broker_fee_bps" <= 10000
      and "desk_settings"."membership_monthly_cents" between 0 and 2147483647
    );--> statement-breakpoint
ALTER TABLE "desk_settings" ADD CONSTRAINT "desk_settings_terms_check" CHECK (
      "desk_settings"."min_months" > 0
      and "desk_settings"."early_start_month" > 0
      and "desk_settings"."early_until_month" > 0
      and "desk_settings"."typical_term" > 0
      and "desk_settings"."min_months" <= "desk_settings"."typical_term"
      and "desk_settings"."early_start_month" <= "desk_settings"."early_until_month"
      and "desk_settings"."early_until_month" <= "desk_settings"."typical_term"
    );