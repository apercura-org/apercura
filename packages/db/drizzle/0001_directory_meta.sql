-- The "directory" and "care" schemas are created in 0000_schemas_and_extensions.
CREATE TABLE "directory"."meta" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
