ALTER TABLE "staff_accounts" ADD CONSTRAINT "staff_accounts_email_lower_check" CHECK ("staff_accounts"."email" = lower("staff_accounts"."email"));--> statement-breakpoint
ALTER TABLE "staff_accounts" ADD CONSTRAINT "staff_accounts_name_check" CHECK (length("staff_accounts"."name") > 0);--> statement-breakpoint
ALTER TABLE "staff_accounts" ADD CONSTRAINT "staff_accounts_hash_check" CHECK (length("staff_accounts"."password_hash") > 0);--> statement-breakpoint
ALTER TABLE "staff_accounts" ADD CONSTRAINT "staff_accounts_salt_check" CHECK (length("staff_accounts"."password_salt") > 0);--> statement-breakpoint
ALTER TABLE "staff_accounts" ADD CONSTRAINT "staff_accounts_params_check" CHECK (
        ("staff_accounts"."password_params"->>'N')::integer = 131072
        and ("staff_accounts"."password_params"->>'r')::integer = 8
        and ("staff_accounts"."password_params"->>'p')::integer = 1
        and ("staff_accounts"."password_params"->>'keyLength')::integer = 64
      );