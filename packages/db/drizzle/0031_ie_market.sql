-- Custom migration (#171, Ireland): directory.place_lookup, what an import matches facilities to
-- places with when its lists name towns rather than codes. Ireland's registers of pharmacies
-- and nursing homes write a town and a county, never a code, and the HSE's layers give a point:
-- `etl:places --country ie` stores each county's and census town's boundary (Tailte Éireann,
-- the CSO's Built Up Areas, CC BY 4.0) and the other names a town goes by (the localities of
-- Tailte Éireann's gazetteer inside it, their Irish names, a few documented by hand), and
-- `etl:ie` reads them. Listings need no change: counties are departments and towns communes,
-- as in the other markets, and the provinces (regions) have no listing of their own.
--
-- Safe on a live database: one new, empty table and its indexes. The import writes it, the app
-- and the read-only role may read it. Forward-only.
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE TABLE "directory"."place_lookup" (
	"place_id" integer PRIMARY KEY NOT NULL,
	"country" text NOT NULL,
	"area" geometry(MultiPolygon, 4326),
	"aliases" text[] DEFAULT '{}'::text[] NOT NULL,
	"source_hash" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "directory"."place_lookup" ADD CONSTRAINT "place_lookup_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "directory"."places"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "place_lookup_country_idx" ON "directory"."place_lookup" USING btree ("country");--> statement-breakpoint
CREATE INDEX "place_lookup_area_idx" ON "directory"."place_lookup" USING gist ("area");
--> statement-breakpoint
REVOKE ALL ON directory.place_lookup FROM apercura_app;--> statement-breakpoint
GRANT SELECT ON directory.place_lookup TO apercura_app, apercura_readonly;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON directory.place_lookup TO apercura_etl;
--> statement-breakpoint
RESET lock_timeout;
