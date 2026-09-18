ALTER TABLE "collector_access_tokens" DROP CONSTRAINT "collector_access_tokens_payload_check";--> statement-breakpoint
ALTER TABLE "collector_access_tokens" ADD CONSTRAINT "collector_access_tokens_payload_check" CHECK ((
        ("collector_access_tokens"."purpose" = 'login' and "collector_access_tokens"."customer_id" is not null and "collector_access_tokens"."registration_payload" is null)
        or
        (
          "collector_access_tokens"."purpose" = 'register'
          and "collector_access_tokens"."customer_id" is null
          and (
            ("collector_access_tokens"."consumed_at" is null and "collector_access_tokens"."registration_payload" is not null)
            or
            ("collector_access_tokens"."consumed_at" is not null and "collector_access_tokens"."registration_payload" is null)
          )
        )
      ));