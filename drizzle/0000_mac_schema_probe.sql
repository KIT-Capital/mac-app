CREATE TABLE "mac_schema_probe" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

INSERT INTO "mac_schema_probe" ("id", "label") VALUES ('probe', 'ok');
