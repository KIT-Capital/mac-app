CREATE TABLE "desk_audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_email" text NOT NULL,
	"actor_role" text NOT NULL,
	"action" text NOT NULL,
	"target_id" text,
	"client_address" text NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "desk_audit_log_actor_role_check" CHECK ("desk_audit_log"."actor_role" in ('staff', 'admin'))
);
--> statement-breakpoint
CREATE TABLE "staff_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"password_salt" text NOT NULL,
	"password_params" jsonb NOT NULL,
	"role" text NOT NULL,
	"must_rotate" boolean DEFAULT true NOT NULL,
	"password_set_at" timestamp with time zone DEFAULT now() NOT NULL,
	"disabled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_accounts_email_unique" UNIQUE("email"),
	CONSTRAINT "staff_accounts_role_check" CHECK ("staff_accounts"."role" in ('staff', 'admin'))
);
--> statement-breakpoint
CREATE INDEX "desk_audit_log_created_at_idx" ON "desk_audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "desk_audit_log_actor_email_idx" ON "desk_audit_log" USING btree ("actor_email");--> statement-breakpoint
CREATE INDEX "staff_accounts_disabled_at_idx" ON "staff_accounts" USING btree ("disabled_at");--> statement-breakpoint
CREATE FUNCTION prevent_desk_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	RAISE EXCEPTION 'DESK_AUDIT_IMMUTABLE';
END;
$$;--> statement-breakpoint
CREATE TRIGGER desk_audit_log_immutable
BEFORE UPDATE OR DELETE ON desk_audit_log
FOR EACH ROW
EXECUTE FUNCTION prevent_desk_audit_mutation();