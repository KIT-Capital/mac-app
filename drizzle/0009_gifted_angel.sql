ALTER TABLE "access_rate_limits" ADD CONSTRAINT "access_rate_limits_hits_check" CHECK ("access_rate_limits"."hits" > 0);--> statement-breakpoint
ALTER TABLE "collector_access_tokens" ADD CONSTRAINT "collector_access_tokens_purpose_check" CHECK ("collector_access_tokens"."purpose" in ('login', 'register'));--> statement-breakpoint
ALTER TABLE "collector_access_tokens" ADD CONSTRAINT "collector_access_tokens_send_status_check" CHECK ("collector_access_tokens"."send_status" in ('pending', 'sent', 'send_failed'));--> statement-breakpoint
ALTER TABLE "collector_access_tokens" ADD CONSTRAINT "collector_access_tokens_payload_check" CHECK ((
        ("collector_access_tokens"."purpose" = 'login' and "collector_access_tokens"."customer_id" is not null and "collector_access_tokens"."registration_payload" is null)
        or
        ("collector_access_tokens"."purpose" = 'register' and "collector_access_tokens"."customer_id" is null and ("collector_access_tokens"."registration_payload" is not null or "collector_access_tokens"."consumed_at" is not null))
      ));