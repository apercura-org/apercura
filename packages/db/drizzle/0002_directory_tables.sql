-- geography columns are written unquoted by hand: drizzle-kit quotes custom types with parameters.
CREATE TABLE "directory"."activities" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "directory"."activities_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"practitioner_id" integer NOT NULL,
	"site_id" integer,
	"source" text NOT NULL,
	"source_key" text NOT NULL,
	"mode_code" text,
	"role_code" text,
	"sector_code" text,
	"genre_code" text,
	"skill_type_code" text,
	"skill_code" text,
	"registration_authority" text,
	"practice_kind" text NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"source_hash" text,
	"source_seen_at" timestamp with time zone,
	"removed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activities_practice_kind_check" CHECK ("directory"."activities"."practice_kind" in ('office', 'health_center', 'hospital', 'locum', 'non_clinical'))
);
--> statement-breakpoint
CREATE TABLE "directory"."etl_runs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "directory"."etl_runs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"source" text NOT NULL,
	"status" text NOT NULL,
	"scope" jsonb NOT NULL,
	"dry_run" boolean DEFAULT false NOT NULL,
	"approved_run_id" integer,
	"files" jsonb,
	"stats" jsonb,
	"guards" jsonb,
	"error" text,
	"peak_rss_bytes" bigint,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "directory"."geocode_cache" (
	"address_key" text PRIMARY KEY NOT NULL,
	"latitude" double precision,
	"longitude" double precision,
	"score" real,
	"result_type" text,
	"result_citycode" text,
	"precision" text,
	"provider" text NOT NULL,
	"geocoded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "directory"."invalidation_outbox" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "directory"."invalidation_outbox_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"tag" text NOT NULL,
	"run_id" integer,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "directory"."landing_pages" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "directory"."landing_pages_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"key" text NOT NULL,
	"listing_slug" text NOT NULL,
	"place_id" integer,
	"practitioner_count" integer NOT NULL,
	"payload" jsonb NOT NULL,
	"indexable" boolean NOT NULL,
	"content_hash" text NOT NULL,
	"content_updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "directory"."place_slug_aliases" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "directory"."place_slug_aliases_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"place_id" integer NOT NULL,
	"department_code" text,
	"slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "place_slug_aliases_uq" UNIQUE NULLS NOT DISTINCT("department_code","slug")
);
--> statement-breakpoint
CREATE TABLE "directory"."places" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "directory"."places_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"kind" text NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"department_code" text,
	"region_code" text,
	"parent_id" integer,
	"centroid" geography(Point, 4326),
	"population" integer,
	"postcodes" text[] DEFAULT '{}'::text[] NOT NULL,
	"successor_id" integer,
	"source_hash" text,
	"removed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "places_kind_check" CHECK ("directory"."places"."kind" in ('region', 'department', 'commune', 'arrondissement'))
);
--> statement-breakpoint
CREATE TABLE "directory"."practitioner_pages" (
	"practitioner_id" integer PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"listing_slug" text,
	"department_code" text,
	"payload" jsonb NOT NULL,
	"indexable" boolean NOT NULL,
	"content_hash" text NOT NULL,
	"content_updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "directory"."practitioner_profiles" (
	"practitioner_id" integer PRIMARY KEY NOT NULL,
	"photo_key" text,
	"headline" text,
	"bio" text,
	"languages" text[] DEFAULT '{}'::text[] NOT NULL,
	"billing_sector" text,
	"fees" jsonb,
	"optam" text,
	"payment_methods" text[] DEFAULT '{}'::text[] NOT NULL,
	"accessibility" jsonb,
	"website" text,
	"show_phone" boolean DEFAULT true NOT NULL,
	"expertises" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "directory"."practitioner_qualifications" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "directory"."practitioner_qualifications_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"practitioner_id" integer NOT NULL,
	"source" text NOT NULL,
	"type_code" text NOT NULL,
	"code" text NOT NULL,
	"label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "directory"."practitioner_slug_aliases" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "directory"."practitioner_slug_aliases_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"practitioner_id" integer NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "directory"."practitioners" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "directory"."practitioners_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"country" text DEFAULT 'FR' NOT NULL,
	"id_scheme" text DEFAULT 'RPPS' NOT NULL,
	"national_id" text NOT NULL,
	"national_pp_id" text,
	"civility_code" text,
	"title_code" text,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"first_name_source" text NOT NULL,
	"last_name_source" text NOT NULL,
	"profession_code" text NOT NULL,
	"category_code" text,
	"primary_specialty_code" text,
	"listing_slug" text,
	"primary_place_id" integer,
	"source_hash" text,
	"qualifications_hash" text,
	"source_seen_at" timestamp with time zone,
	"missing_runs" smallint DEFAULT 0 NOT NULL,
	"removed_at" timestamp with time zone,
	"billing_sector" text,
	"optam" text,
	"carte_vitale" boolean,
	"apcv" boolean,
	"ameli_matched_at" timestamp with time zone,
	"slug" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"claim_status" text DEFAULT 'unclaimed' NOT NULL,
	"owner_org_id" text,
	"indexable" boolean DEFAULT false NOT NULL,
	"next_free_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "practitioners_status_check" CHECK ("directory"."practitioners"."status" in ('active', 'removed', 'suppressed')),
	CONSTRAINT "practitioners_claim_status_check" CHECK ("directory"."practitioners"."claim_status" in ('unclaimed', 'pending', 'claimed'))
);
--> statement-breakpoint
CREATE TABLE "directory"."search_docs" (
	"practitioner_id" integer PRIMARY KEY NOT NULL,
	"name_norm" text NOT NULL,
	"listing_slug" text,
	"place_ids" integer[] DEFAULT '{}'::integer[] NOT NULL,
	"location" geography(Point, 4326),
	"payload" jsonb NOT NULL,
	"indexable" boolean NOT NULL,
	"content_hash" text NOT NULL,
	"content_updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "directory"."sites" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "directory"."sites_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"source" text NOT NULL,
	"source_key" text NOT NULL,
	"kind" text NOT NULL,
	"sector_code" text,
	"name" text,
	"legal_name" text,
	"trade_name" text,
	"address_line" text,
	"address_complement" text,
	"distribution" text,
	"postcode" text,
	"commune_code" text,
	"commune_label" text,
	"country_code" text,
	"place_id" integer,
	"location" geography(Point, 4326),
	"geo_precision" text,
	"geo_source" text,
	"address_hash" text,
	"phone" text,
	"phone2" text,
	"fax" text,
	"phone_kind" text,
	"email" text,
	"siret" text,
	"siren" text,
	"finess_et" text,
	"finess_ej" text,
	"finess_name" text,
	"finess_category_code" text,
	"slug" text,
	"source_hash" text,
	"source_seen_at" timestamp with time zone,
	"removed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sites_kind_check" CHECK ("directory"."sites"."kind" in ('office', 'health_center', 'hospital', 'locum', 'non_clinical')),
	CONSTRAINT "sites_geo_precision_check" CHECK ("directory"."sites"."geo_precision" in ('address', 'street', 'city'))
);
--> statement-breakpoint
CREATE TABLE "directory"."suppressions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "directory"."suppressions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"country" text DEFAULT 'FR' NOT NULL,
	"id_scheme" text DEFAULT 'RPPS' NOT NULL,
	"national_id" text NOT NULL,
	"reason" text NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "directory"."taxonomy_ameli_specialties" (
	"ameli_code" text NOT NULL,
	"listing_slug" text NOT NULL,
	CONSTRAINT "taxonomy_ameli_specialties_ameli_code_listing_slug_pk" PRIMARY KEY("ameli_code","listing_slug")
);
--> statement-breakpoint
CREATE TABLE "directory"."taxonomy_listing_slugs" (
	"profession_code" text NOT NULL,
	"specialty_code" text NOT NULL,
	"listing_slug" text NOT NULL,
	CONSTRAINT "taxonomy_listing_slugs_profession_code_specialty_code_pk" PRIMARY KEY("profession_code","specialty_code")
);
--> statement-breakpoint
CREATE TABLE "directory"."stg_ameli" (
	"line_no" integer NOT NULL,
	"last_name" text NOT NULL,
	"first_name" text NOT NULL,
	"specialty_code" text NOT NULL,
	"postcode" text,
	"city" text,
	"carte_vitale" text,
	"apcv" text,
	"billing_sector" text,
	"option_code" text
);
--> statement-breakpoint
CREATE TABLE "directory"."stg_ans_activities" (
	"line_no" integer NOT NULL,
	"rpps" text NOT NULL,
	"national_pp_id" text,
	"civility_code" text,
	"title_code" text,
	"last_name_source" text NOT NULL,
	"first_name_source" text NOT NULL,
	"last_name" text NOT NULL,
	"first_name" text NOT NULL,
	"slug" text NOT NULL,
	"profession_code" text NOT NULL,
	"category_code" text,
	"skill_type_code" text,
	"skill_code" text,
	"skill_label" text,
	"mode_code" text,
	"siret" text,
	"siren" text,
	"finess_et" text,
	"finess_ej" text,
	"structure_id" text,
	"legal_name" text,
	"trade_name" text,
	"site_name" text,
	"site_kind" text,
	"establishment_slug" text,
	"address_complement" text,
	"address_line" text,
	"distribution" text,
	"cedex_office" text,
	"postcode" text,
	"commune_code" text,
	"commune_label" text,
	"country_code" text,
	"phone" text,
	"phone2" text,
	"fax" text,
	"email" text,
	"registration_authority" text,
	"sector_code" text,
	"role_code" text,
	"genre_code" text,
	"activity_key" text,
	"practice_kind" text
);
--> statement-breakpoint
CREATE TABLE "directory"."stg_ans_qualifications" (
	"rpps" text NOT NULL,
	"source" text NOT NULL,
	"type_code" text NOT NULL,
	"code" text NOT NULL,
	"label" text
);
--> statement-breakpoint
CREATE TABLE "directory"."stg_finess" (
	"finess_et" text NOT NULL,
	"name" text,
	"slug" text,
	"category_code" text,
	"commune_code" text,
	"postcode" text,
	"latitude" text,
	"longitude" text,
	"phone" text
);
--> statement-breakpoint
CREATE TABLE "directory"."stg_quarantine" (
	"file" text NOT NULL,
	"line_no" integer NOT NULL,
	"reason" text NOT NULL,
	"sample" text
);
--> statement-breakpoint
ALTER TABLE "directory"."activities" ADD CONSTRAINT "activities_practitioner_id_practitioners_id_fk" FOREIGN KEY ("practitioner_id") REFERENCES "directory"."practitioners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "directory"."activities" ADD CONSTRAINT "activities_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "directory"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "directory"."landing_pages" ADD CONSTRAINT "landing_pages_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "directory"."places"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "directory"."place_slug_aliases" ADD CONSTRAINT "place_slug_aliases_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "directory"."places"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "directory"."places" ADD CONSTRAINT "places_parent_id_places_id_fk" FOREIGN KEY ("parent_id") REFERENCES "directory"."places"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "directory"."places" ADD CONSTRAINT "places_successor_id_places_id_fk" FOREIGN KEY ("successor_id") REFERENCES "directory"."places"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "directory"."practitioner_pages" ADD CONSTRAINT "practitioner_pages_practitioner_id_practitioners_id_fk" FOREIGN KEY ("practitioner_id") REFERENCES "directory"."practitioners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "directory"."practitioner_profiles" ADD CONSTRAINT "practitioner_profiles_practitioner_id_practitioners_id_fk" FOREIGN KEY ("practitioner_id") REFERENCES "directory"."practitioners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "directory"."practitioner_qualifications" ADD CONSTRAINT "practitioner_qualifications_practitioner_id_practitioners_id_fk" FOREIGN KEY ("practitioner_id") REFERENCES "directory"."practitioners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "directory"."practitioner_slug_aliases" ADD CONSTRAINT "practitioner_slug_aliases_practitioner_id_practitioners_id_fk" FOREIGN KEY ("practitioner_id") REFERENCES "directory"."practitioners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "directory"."practitioners" ADD CONSTRAINT "practitioners_primary_place_id_places_id_fk" FOREIGN KEY ("primary_place_id") REFERENCES "directory"."places"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "directory"."search_docs" ADD CONSTRAINT "search_docs_practitioner_id_practitioners_id_fk" FOREIGN KEY ("practitioner_id") REFERENCES "directory"."practitioners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "directory"."sites" ADD CONSTRAINT "sites_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "directory"."places"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "activities_source_key_uq" ON "directory"."activities" USING btree ("source","source_key");--> statement-breakpoint
CREATE INDEX "activities_practitioner_idx" ON "directory"."activities" USING btree ("practitioner_id");--> statement-breakpoint
CREATE INDEX "activities_site_idx" ON "directory"."activities" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "etl_runs_source_status_idx" ON "directory"."etl_runs" USING btree ("source","status","id");--> statement-breakpoint
CREATE UNIQUE INDEX "invalidation_outbox_tag_uq" ON "directory"."invalidation_outbox" USING btree ("tag");--> statement-breakpoint
CREATE UNIQUE INDEX "landing_pages_key_uq" ON "directory"."landing_pages" USING btree ("key");--> statement-breakpoint
CREATE INDEX "landing_pages_sitemap_idx" ON "directory"."landing_pages" USING btree ("id") WHERE "directory"."landing_pages"."indexable";--> statement-breakpoint
CREATE UNIQUE INDEX "places_kind_code_uq" ON "directory"."places" USING btree ("kind","code");--> statement-breakpoint
CREATE UNIQUE INDEX "places_top_slug_uq" ON "directory"."places" USING btree ("slug") WHERE "directory"."places"."kind" in ('region', 'department');--> statement-breakpoint
CREATE UNIQUE INDEX "places_local_slug_uq" ON "directory"."places" USING btree ("department_code","slug") WHERE "directory"."places"."kind" in ('commune', 'arrondissement');--> statement-breakpoint
CREATE INDEX "places_parent_idx" ON "directory"."places" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "places_postcodes_idx" ON "directory"."places" USING gin ("postcodes");--> statement-breakpoint
CREATE INDEX "places_centroid_idx" ON "directory"."places" USING gist ("centroid");--> statement-breakpoint
CREATE INDEX "practitioner_pages_sitemap_idx" ON "directory"."practitioner_pages" USING btree ("department_code","practitioner_id") WHERE "directory"."practitioner_pages"."indexable";--> statement-breakpoint
CREATE UNIQUE INDEX "practitioner_qualifications_uq" ON "directory"."practitioner_qualifications" USING btree ("practitioner_id","source","type_code","code");--> statement-breakpoint
CREATE UNIQUE INDEX "practitioner_slug_aliases_slug_uq" ON "directory"."practitioner_slug_aliases" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "practitioners_national_id_uq" ON "directory"."practitioners" USING btree ("country","id_scheme","national_id");--> statement-breakpoint
CREATE UNIQUE INDEX "practitioners_slug_uq" ON "directory"."practitioners" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "practitioners_primary_place_idx" ON "directory"."practitioners" USING btree ("primary_place_id");--> statement-breakpoint
CREATE INDEX "practitioners_listing_idx" ON "directory"."practitioners" USING btree ("listing_slug","primary_place_id") WHERE "directory"."practitioners"."indexable";--> statement-breakpoint
CREATE INDEX "search_docs_name_trgm_idx" ON "directory"."search_docs" USING gin ("name_norm" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "search_docs_location_idx" ON "directory"."search_docs" USING gist ("location");--> statement-breakpoint
CREATE INDEX "search_docs_place_ids_idx" ON "directory"."search_docs" USING gin ("place_ids");--> statement-breakpoint
CREATE UNIQUE INDEX "sites_source_key_uq" ON "directory"."sites" USING btree ("source","source_key");--> statement-breakpoint
CREATE UNIQUE INDEX "sites_slug_uq" ON "directory"."sites" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "sites_place_idx" ON "directory"."sites" USING btree ("place_id");--> statement-breakpoint
CREATE INDEX "sites_finess_et_idx" ON "directory"."sites" USING btree ("finess_et");--> statement-breakpoint
CREATE INDEX "sites_location_idx" ON "directory"."sites" USING gist ("location");--> statement-breakpoint
CREATE INDEX "sites_sitemap_idx" ON "directory"."sites" USING btree ("id") WHERE "directory"."sites"."slug" is not null and "directory"."sites"."removed_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "suppressions_national_id_uq" ON "directory"."suppressions" USING btree ("country","id_scheme","national_id");--> statement-breakpoint
CREATE INDEX "stg_ans_activities_rpps_idx" ON "directory"."stg_ans_activities" USING btree ("rpps");--> statement-breakpoint
CREATE INDEX "stg_ans_activities_structure_idx" ON "directory"."stg_ans_activities" USING btree ("structure_id");--> statement-breakpoint
CREATE INDEX "stg_ans_qualifications_rpps_idx" ON "directory"."stg_ans_qualifications" USING btree ("rpps");