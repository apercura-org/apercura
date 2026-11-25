ALTER TABLE "directory"."place_slug_aliases" DROP CONSTRAINT "place_slug_aliases_uq";--> statement-breakpoint
DROP INDEX "directory"."places_kind_code_uq";--> statement-breakpoint
DROP INDEX "directory"."places_top_slug_uq";--> statement-breakpoint
DROP INDEX "directory"."places_local_slug_uq";--> statement-breakpoint
ALTER TABLE "directory"."landing_pages" ADD COLUMN "country" text DEFAULT 'FR' NOT NULL;--> statement-breakpoint
ALTER TABLE "directory"."place_slug_aliases" ADD COLUMN "country" text DEFAULT 'FR' NOT NULL;--> statement-breakpoint
ALTER TABLE "directory"."places" ADD COLUMN "country" text DEFAULT 'FR' NOT NULL;--> statement-breakpoint
ALTER TABLE "directory"."practitioner_pages" ADD COLUMN "country" text DEFAULT 'FR' NOT NULL;--> statement-breakpoint
ALTER TABLE "directory"."search_docs" ADD COLUMN "country" text DEFAULT 'FR' NOT NULL;--> statement-breakpoint
CREATE INDEX "landing_pages_country_idx" ON "directory"."landing_pages" USING btree ("country","id") WHERE "directory"."landing_pages"."indexable";--> statement-breakpoint
CREATE INDEX "practitioner_pages_country_idx" ON "directory"."practitioner_pages" USING btree ("country","practitioner_id") WHERE "directory"."practitioner_pages"."indexable";--> statement-breakpoint
CREATE UNIQUE INDEX "places_kind_code_uq" ON "directory"."places" USING btree ("country","kind","code");--> statement-breakpoint
CREATE UNIQUE INDEX "places_top_slug_uq" ON "directory"."places" USING btree ("country","slug") WHERE "directory"."places"."kind" in ('region', 'department');--> statement-breakpoint
CREATE UNIQUE INDEX "places_local_slug_uq" ON "directory"."places" USING btree ("country","department_code","slug") WHERE "directory"."places"."kind" in ('commune', 'arrondissement');--> statement-breakpoint
ALTER TABLE "directory"."place_slug_aliases" ADD CONSTRAINT "place_slug_aliases_uq" UNIQUE NULLS NOT DISTINCT("country","department_code","slug");
--> statement-breakpoint

-- Custom part (#107, Austria): the read models carry their market. A practitioner page,
-- a listing page and a search document belong to the country of their practitioners;
-- places are joined on (country, code), never on a code alone (an Austrian Gemeinde code
-- can equal a French INSEE code). Replacing the functions takes no table lock.

-- Page payload of every active practitioner (or of the given ids, or of one market), as in
-- 0015, with the market's country.
DROP FUNCTION directory.practitioner_page_rows(integer[]);
--> statement-breakpoint
CREATE FUNCTION directory.practitioner_page_rows(
	p_ids integer[] DEFAULT NULL,
	p_country text DEFAULT NULL
)
RETURNS TABLE (
	practitioner_id integer,
	country text,
	slug text,
	listing_slug text,
	department_code text,
	payload jsonb,
	indexable boolean
)
LANGUAGE sql STABLE
AS $$
	SELECT
		p.id,
		p.country,
		p.slug,
		p.listing_slug,
		pp.department_code,
		jsonb_build_object(
			'id', p.id,
			'country', p.country,
			'idScheme', p.id_scheme,
			'nationalId', p.national_id,
			'slug', p.slug,
			'civilityCode', p.civility_code,
			'titleCode', p.title_code,
			'firstName', p.first_name,
			'lastName', p.last_name,
			'professionCode', p.profession_code,
			'primarySpecialtyCode', p.primary_specialty_code,
			'listingSlug', p.listing_slug,
			'primaryPlaceId', p.primary_place_id,
			'claimStatus', p.claim_status,
			'withheld', p.withheld_at IS NOT NULL,
			'qualifications', coalesce((
				SELECT jsonb_agg(jsonb_build_object(
						'source', q.source, 'typeCode', q.type_code, 'code', q.code, 'label', q.label)
					ORDER BY q.source, q.type_code, q.code)
				FROM directory.practitioner_qualifications q
				WHERE q.practitioner_id = p.id
			), '[]'::jsonb),
			'activities', coalesce((
				SELECT jsonb_agg(jsonb_build_object(
						'id', a.id,
						'source', a.source,
						'practiceKind', a.practice_kind,
						'modeCode', a.mode_code,
						'roleCode', a.role_code,
						'sectorCode', a.sector_code,
						'isPrimary', a.is_primary,
						'site', CASE WHEN s.id IS NULL THEN NULL ELSE jsonb_build_object(
							'id', s.id,
							'kind', s.kind,
							'name', s.name,
							'addressLine', coalesce(s.geo_address_line, s.address_line),
							'addressComplement', s.address_complement,
							'postcode', s.postcode,
							'placeId', s.place_id,
							'placeName', sp.name,
							'placeSlug', sp.slug,
							'departmentCode', sp.department_code,
							'latitude', round(ST_Y(s.location::geometry)::numeric, 6),
							'longitude', round(ST_X(s.location::geometry)::numeric, 6),
							'geoPrecision', s.geo_precision,
							'phone', s.phone,
							'phoneKind', s.phone_kind,
							'finessEt', s.finess_et,
							'establishmentName', s.finess_name,
							'establishmentSlug', s.slug
						) END)
					ORDER BY a.is_primary DESC, a.id)
				FROM directory.activities a
				LEFT JOIN directory.sites s ON s.id = a.site_id AND s.removed_at IS NULL
				LEFT JOIN directory.places sp ON sp.id = s.place_id
				WHERE a.practitioner_id = p.id AND a.removed_at IS NULL AND NOT a.hidden
			), '[]'::jsonb),
			'ameli', CASE WHEN p.ameli_matched_at IS NULL THEN NULL ELSE jsonb_build_object(
				'billingSector', p.billing_sector,
				'optam', p.optam,
				'carteVitale', p.carte_vitale,
				'apcv', p.apcv
			) END,
			'profile', CASE WHEN pr.practitioner_id IS NULL OR pr.published_at IS NULL THEN NULL
				ELSE jsonb_build_object(
					'photoKey', CASE WHEN 'photo' = ANY (pr.hidden_fields) THEN NULL ELSE pr.photo_key END,
					'headline', CASE WHEN 'headline' = ANY (pr.hidden_fields) THEN NULL ELSE pr.headline END,
					'bio', CASE WHEN 'bio' = ANY (pr.hidden_fields) THEN NULL ELSE pr.bio END,
					'languages', CASE WHEN 'languages' = ANY (pr.hidden_fields) THEN '[]'::jsonb
						ELSE to_jsonb(pr.languages) END,
					'billingSector', pr.billing_sector,
					'optam', pr.optam,
					'carteVitale', pr.carte_vitale,
					'fees', pr.fees,
					'paymentMethods', to_jsonb(pr.payment_methods),
					'accessibility', CASE WHEN 'accessibility' = ANY (pr.hidden_fields) THEN NULL
						ELSE pr.accessibility END,
					'website', CASE WHEN 'website' = ANY (pr.hidden_fields) THEN NULL ELSE pr.website END,
					'showPhone', pr.show_phone,
					'expertises', to_jsonb(pr.expertises)
				) END
		),
		p.indexable AND p.withheld_at IS NULL
	FROM directory.practitioners p
	LEFT JOIN directory.places pp ON pp.id = p.primary_place_id
	LEFT JOIN directory.practitioner_profiles pr ON pr.practitioner_id = p.id
	WHERE p.status = 'active' AND (p_ids IS NULL OR p.id = ANY (p_ids))
		AND (p_country IS NULL OR p.country = p_country)
$$;
--> statement-breakpoint

-- Rebuilds practitioner_pages as in 0003, for every market or one (`p_country`): an
-- import refreshes and counts its own market's pages, so its circuit breakers compare
-- like with like.
DROP FUNCTION directory.refresh_practitioner_pages(integer, integer[]);
--> statement-breakpoint
CREATE FUNCTION directory.refresh_practitioner_pages(
	p_run_id integer,
	p_ids integer[] DEFAULT NULL,
	p_country text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
	v_previous_total integer;
	v_previous_indexable integer;
	v_unpublished integer;
	v_inserted integer;
	v_updated integer;
	v_deleted integer;
	v_tags integer;
BEGIN
	DROP TABLE IF EXISTS pg_temp.refresh_pages;
	CREATE TEMP TABLE refresh_pages ON COMMIT DROP AS
	SELECT r.*, md5(r.payload::text || '|' || r.indexable::text) AS content_hash
	FROM directory.practitioner_page_rows(p_ids, p_country) r;
	ALTER TABLE refresh_pages ADD PRIMARY KEY (practitioner_id);

	SELECT count(*), count(*) FILTER (WHERE pg.indexable)
	INTO v_previous_total, v_previous_indexable
	FROM directory.practitioner_pages pg
	WHERE (p_ids IS NULL OR pg.practitioner_id = ANY (p_ids))
		AND (p_country IS NULL OR pg.country = p_country);

	SELECT count(*) INTO v_unpublished
	FROM directory.practitioner_pages pg
	LEFT JOIN refresh_pages r ON r.practitioner_id = pg.practitioner_id
	WHERE pg.indexable
		AND (p_ids IS NULL OR pg.practitioner_id = ANY (p_ids))
		AND (p_country IS NULL OR pg.country = p_country)
		AND (r.practitioner_id IS NULL OR NOT r.indexable);

	DROP TABLE IF EXISTS pg_temp.refresh_changed;
	CREATE TEMP TABLE refresh_changed (practitioner_id integer, inserted boolean) ON COMMIT DROP;

	WITH upserted AS (
		INSERT INTO directory.practitioner_pages AS pg (
			practitioner_id, country, slug, listing_slug, department_code, payload, indexable,
			content_hash, content_updated_at
		)
		SELECT r.practitioner_id, r.country, r.slug, r.listing_slug, r.department_code, r.payload,
			r.indexable, r.content_hash, now()
		FROM refresh_pages r
		ON CONFLICT (practitioner_id) DO UPDATE SET
			country = excluded.country,
			slug = excluded.slug,
			listing_slug = excluded.listing_slug,
			department_code = excluded.department_code,
			payload = excluded.payload,
			indexable = excluded.indexable,
			content_hash = excluded.content_hash,
			content_updated_at = excluded.content_updated_at
		WHERE pg.content_hash IS DISTINCT FROM excluded.content_hash
			OR pg.country IS DISTINCT FROM excluded.country
		RETURNING pg.practitioner_id, (xmax = 0) AS inserted
	)
	INSERT INTO refresh_changed SELECT * FROM upserted;

	SELECT count(*) FILTER (WHERE inserted), count(*) FILTER (WHERE NOT inserted)
	INTO v_inserted, v_updated
	FROM refresh_changed;

	WITH deleted AS (
		DELETE FROM directory.practitioner_pages pg
		WHERE (p_ids IS NULL OR pg.practitioner_id = ANY (p_ids))
			AND (p_country IS NULL OR pg.country = p_country)
			AND NOT EXISTS (SELECT 1 FROM refresh_pages r WHERE r.practitioner_id = pg.practitioner_id)
		RETURNING pg.practitioner_id
	)
	INSERT INTO refresh_changed SELECT practitioner_id, false FROM deleted;
	GET DIAGNOSTICS v_deleted = ROW_COUNT;

	SELECT directory.enqueue_tags(p_run_id, array_agg('practitioner:' || practitioner_id))
	INTO v_tags
	FROM refresh_changed;

	RETURN jsonb_build_object(
		'total', (SELECT count(*) FROM refresh_pages),
		'indexable', (SELECT count(*) FROM refresh_pages WHERE indexable),
		'previousTotal', v_previous_total,
		'previousIndexable', v_previous_indexable,
		'inserted', v_inserted,
		'updated', v_updated,
		'deleted', v_deleted,
		'unpublished', v_unpublished,
		'tags', coalesce(v_tags, 0)
	);
END
$$;
--> statement-breakpoint

-- Rebuilds landing_pages as in 0020, for every market: listing slug x (country |
-- department | commune | arrondissement). A country-wide page has no place and the key
-- `{slug}:{country}` (`cardiologue:fr`, `kardiologie:at`). A city whose page is its
-- department's (Paris 75056, Wien 90001) gets no page of its own. Departments are found
-- on (country, code).
CREATE OR REPLACE FUNCTION directory.refresh_landing_pages(p_run_id integer)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
	v_inserted integer;
	v_updated integer;
	v_deleted integer;
	v_tags integer;
BEGIN
	DROP TABLE IF EXISTS pg_temp.refresh_landing;
	CREATE TEMP TABLE refresh_landing ON COMMIT DROP AS
	WITH base AS (
		SELECT DISTINCT p.id AS practitioner_id, p.country, p.listing_slug, s.place_id,
			p.billing_sector, p.carte_vitale, (p.next_free_at IS NOT NULL) AS online
		FROM directory.practitioners p
		JOIN directory.activities a ON a.practitioner_id = p.id
			AND a.removed_at IS NULL AND NOT a.hidden
			AND a.practice_kind IN ('office', 'health_center', 'hospital')
		JOIN directory.sites s ON s.id = a.site_id AND s.removed_at IS NULL AND s.place_id IS NOT NULL
		WHERE p.indexable AND p.listing_slug IS NOT NULL
	),
	expanded AS (
		SELECT b.practitioner_id, b.country, b.listing_slug, b.place_id, b.billing_sector,
			b.carte_vitale, b.online
		FROM base b
		UNION
		SELECT b.practitioner_id, b.country, b.listing_slug, pl.parent_id, b.billing_sector,
			b.carte_vitale, b.online
		FROM base b
		JOIN directory.places pl ON pl.id = b.place_id AND pl.kind = 'arrondissement'
		JOIN directory.places parent ON parent.id = pl.parent_id
			AND NOT (parent.country = 'FR' AND parent.code = '75056')
			AND NOT (parent.country = 'AT' AND parent.code = '90001')
		UNION
		SELECT b.practitioner_id, b.country, b.listing_slug, d.id, b.billing_sector,
			b.carte_vitale, b.online
		FROM base b
		JOIN directory.places pl ON pl.id = b.place_id
		JOIN directory.places d ON d.country = pl.country AND d.kind = 'department'
			AND d.code = pl.department_code
		UNION
		SELECT b.practitioner_id, b.country, b.listing_slug, NULL::integer, b.billing_sector,
			b.carte_vitale, b.online
		FROM base b
	),
	members AS (
		SELECT DISTINCT practitioner_id, country, listing_slug, place_id, billing_sector,
			carte_vitale, online
		FROM expanded
	),
	per_sector AS (
		SELECT country, listing_slug, place_id, coalesce(billing_sector, 'unknown') AS sector,
			count(DISTINCT practitioner_id) AS n
		FROM members
		GROUP BY 1, 2, 3, 4
	),
	sectors AS (
		SELECT country, listing_slug, place_id,
			jsonb_object_agg(sector, n ORDER BY sector) AS billing_sectors
		FROM per_sector
		GROUP BY 1, 2, 3
	),
	totals AS (
		SELECT country, listing_slug, place_id, count(DISTINCT practitioner_id)::integer AS n,
			count(DISTINCT practitioner_id) FILTER (WHERE online)::integer AS online,
			count(DISTINCT practitioner_id) FILTER (WHERE carte_vitale)::integer AS carte_vitale_yes,
			count(DISTINCT practitioner_id) FILTER (WHERE carte_vitale = false)::integer AS carte_vitale_no,
			md5(string_agg(DISTINCT practitioner_id::text, ',' ORDER BY practitioner_id::text))
				AS members_hash
		FROM members
		GROUP BY 1, 2, 3
	)
	SELECT
		t.listing_slug || ':' || coalesce(t.place_id::text, lower(t.country)) AS key,
		t.country,
		t.listing_slug,
		t.place_id,
		t.n AS practitioner_count,
		jsonb_build_object(
			'listingSlug', t.listing_slug,
			'placeId', t.place_id,
			'practitionerCount', t.n,
			'onlineBookingCount', t.online,
			'billingSectors', s.billing_sectors,
			'carteVitale', jsonb_build_object(
				'yes', t.carte_vitale_yes,
				'no', t.carte_vitale_no,
				'unknown', t.n - t.carte_vitale_yes - t.carte_vitale_no
			),
			'membersHash', t.members_hash
		) AS payload,
		(t.n >= 3 OR (t.n >= 2 AND coalesce(old.indexable, false))) AS indexable
	FROM totals t
	-- Country pages have no place: compared as 0 (place ids start at 1), so the join
	-- hashes on every column instead of filtering every pair of a slug (#90).
	JOIN sectors s ON s.country = t.country AND s.listing_slug = t.listing_slug
		AND coalesce(s.place_id, 0) = coalesce(t.place_id, 0)
	LEFT JOIN directory.landing_pages old
		ON old.key = t.listing_slug || ':' || coalesce(t.place_id::text, lower(t.country));

	DROP TABLE IF EXISTS pg_temp.refresh_landing_changed;
	CREATE TEMP TABLE refresh_landing_changed (key text, inserted boolean) ON COMMIT DROP;

	WITH upserted AS (
		INSERT INTO directory.landing_pages AS lp (
			key, country, listing_slug, place_id, practitioner_count, payload, indexable,
			content_hash, content_updated_at
		)
		SELECT r.key, r.country, r.listing_slug, r.place_id, r.practitioner_count, r.payload,
			r.indexable, md5(r.payload::text || '|' || r.indexable::text), now()
		FROM refresh_landing r
		ON CONFLICT (key) DO UPDATE SET
			country = excluded.country,
			practitioner_count = excluded.practitioner_count,
			payload = excluded.payload,
			indexable = excluded.indexable,
			content_hash = excluded.content_hash,
			content_updated_at = excluded.content_updated_at
		WHERE lp.content_hash IS DISTINCT FROM excluded.content_hash
			OR lp.country IS DISTINCT FROM excluded.country
		RETURNING lp.key, (xmax = 0) AS inserted
	)
	INSERT INTO refresh_landing_changed SELECT * FROM upserted;

	SELECT count(*) FILTER (WHERE inserted), count(*) FILTER (WHERE NOT inserted)
	INTO v_inserted, v_updated
	FROM refresh_landing_changed;

	WITH deleted AS (
		DELETE FROM directory.landing_pages lp
		WHERE NOT EXISTS (SELECT 1 FROM refresh_landing r WHERE r.key = lp.key)
		RETURNING lp.key
	)
	INSERT INTO refresh_landing_changed SELECT key, false FROM deleted;
	GET DIAGNOSTICS v_deleted = ROW_COUNT;

	SELECT directory.enqueue_tags(p_run_id, array_agg('listing:' || key)) INTO v_tags
	FROM refresh_landing_changed;

	RETURN jsonb_build_object(
		'total', (SELECT count(*) FROM refresh_landing),
		'indexable', (SELECT count(*) FROM refresh_landing WHERE indexable),
		'inserted', v_inserted,
		'updated', v_updated,
		'deleted', v_deleted,
		'tags', coalesce(v_tags, 0)
	);
END
$$;
--> statement-breakpoint

-- Rebuilds search_docs as in 0015, with the practitioner's country (a search never mixes
-- markets) and departments found on (country, code).
CREATE OR REPLACE FUNCTION directory.refresh_search_docs(p_ids integer[] DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
	v_written integer;
	v_deleted integer;
BEGIN
	DROP TABLE IF EXISTS pg_temp.refresh_search_sites;
	CREATE TEMP TABLE refresh_search_sites ON COMMIT DROP AS
	SELECT a.practitioner_id, a.id AS activity_id, a.is_primary, a.practice_kind, s.id AS site_id,
		s.name, coalesce(s.geo_address_line, s.address_line) AS address_line, s.postcode, s.location,
		s.place_id, pl.name AS place_name,
		pl.kind AS place_kind, pl.parent_id, d.id AS department_place_id
	FROM directory.activities a
	JOIN directory.practitioners p ON p.id = a.practitioner_id AND p.status = 'active'
	JOIN directory.sites s ON s.id = a.site_id AND s.removed_at IS NULL
	LEFT JOIN directory.places pl ON pl.id = s.place_id
	LEFT JOIN directory.places d ON d.country = pl.country AND d.kind = 'department'
		AND d.code = pl.department_code
	WHERE a.removed_at IS NULL AND NOT a.hidden
		AND (p_ids IS NULL OR a.practitioner_id = ANY (p_ids));

	DROP TABLE IF EXISTS pg_temp.refresh_search;
	CREATE TEMP TABLE refresh_search ON COMMIT DROP AS
	WITH place_sets AS (
		SELECT practitioner_id, array_agg(DISTINCT x ORDER BY x) AS place_ids
		FROM (
			SELECT practitioner_id, place_id AS x FROM refresh_search_sites
			UNION ALL
			SELECT practitioner_id, parent_id FROM refresh_search_sites WHERE place_kind = 'arrondissement'
			UNION ALL
			SELECT practitioner_id, department_place_id FROM refresh_search_sites
		) places
		WHERE x IS NOT NULL
		GROUP BY practitioner_id
	),
	primary_site AS (
		SELECT DISTINCT ON (practitioner_id) *
		FROM refresh_search_sites
		ORDER BY practitioner_id, is_primary DESC, activity_id
	)
	SELECT
		p.id AS practitioner_id,
		p.country,
		directory.name_norm(p.last_name, p.first_name) AS name_norm,
		p.listing_slug,
		coalesce(ps.place_ids, '{}'::integer[]) AS place_ids,
		site.location,
		jsonb_build_object(
			'slug', p.slug,
			'titleCode', p.title_code,
			'civilityCode', p.civility_code,
			'firstName', p.first_name,
			'lastName', p.last_name,
			'professionCode', p.profession_code,
			'listingSlug', p.listing_slug,
			'site', CASE WHEN site.site_id IS NULL THEN NULL ELSE jsonb_build_object(
				'id', site.site_id,
				'name', site.name,
				'addressLine', site.address_line,
				'postcode', site.postcode,
				'placeName', site.place_name,
				'practiceKind', site.practice_kind
			) END
		) AS payload,
		p.indexable
	FROM directory.practitioners p
	LEFT JOIN place_sets ps ON ps.practitioner_id = p.id
	LEFT JOIN primary_site site ON site.practitioner_id = p.id
	WHERE p.status = 'active' AND (p_ids IS NULL OR p.id = ANY (p_ids));

	WITH upserted AS (
		INSERT INTO directory.search_docs AS sd (
			practitioner_id, country, name_norm, listing_slug, place_ids, location, payload,
			indexable, content_hash, content_updated_at
		)
		SELECT r.practitioner_id, r.country, r.name_norm, r.listing_slug, r.place_ids, r.location,
			r.payload, r.indexable,
			md5(r.payload::text || '|' || r.indexable::text || '|' || r.place_ids::text || '|'
				|| coalesce(r.location::text, '')),
			now()
		FROM refresh_search r
		ON CONFLICT (practitioner_id) DO UPDATE SET
			country = excluded.country,
			name_norm = excluded.name_norm,
			listing_slug = excluded.listing_slug,
			place_ids = excluded.place_ids,
			location = excluded.location,
			payload = excluded.payload,
			indexable = excluded.indexable,
			content_hash = excluded.content_hash,
			content_updated_at = excluded.content_updated_at
		WHERE sd.content_hash IS DISTINCT FROM excluded.content_hash
			OR sd.country IS DISTINCT FROM excluded.country
		RETURNING 1
	)
	SELECT count(*) INTO v_written FROM upserted;

	DELETE FROM directory.search_docs sd
	WHERE (p_ids IS NULL OR sd.practitioner_id = ANY (p_ids))
		AND NOT EXISTS (SELECT 1 FROM refresh_search r WHERE r.practitioner_id = sd.practitioner_id);
	GET DIAGNOSTICS v_deleted = ROW_COUNT;

	RETURN jsonb_build_object(
		'total', (SELECT count(*) FROM refresh_search),
		'written', v_written,
		'deleted', v_deleted
	);
END
$$;
--> statement-breakpoint

-- As in 0012, with the country-wide listing key of the practitioner's market and
-- departments found on (country, code).
CREATE OR REPLACE FUNCTION directory.refresh_practitioner(p_ids integer[])
RETURNS text[]
LANGUAGE plpgsql
AS $$
DECLARE
	v_tags text[];
BEGIN
	UPDATE directory.practitioners p
	SET indexable = directory.practitioner_indexable(p.id), updated_at = now()
	WHERE p.id = ANY (p_ids) AND p.indexable IS DISTINCT FROM directory.practitioner_indexable(p.id);

	PERFORM directory.refresh_practitioner_pages(NULL, p_ids);
	PERFORM directory.refresh_search_docs(p_ids);

	-- The app revalidates these itself: drop what refresh_practitioner_pages
	-- queued for the import's drain.
	DELETE FROM directory.invalidation_outbox
	WHERE run_id IS NULL AND tag = ANY (SELECT 'practitioner:' || unnest(p_ids));

	SELECT array_agg(DISTINCT tag ORDER BY tag) INTO v_tags
	FROM (
		SELECT 'practitioner:' || unnest(p_ids) AS tag
		UNION ALL
		-- Listing pages and establishment pages that list these practitioners.
		SELECT 'listing:' || p.listing_slug || ':' || coalesce(x.place_id::text, lower(p.country))
		FROM directory.practitioners p
		JOIN directory.activities a ON a.practitioner_id = p.id
		JOIN directory.sites s ON s.id = a.site_id
		JOIN directory.places pl ON pl.id = s.place_id
		CROSS JOIN LATERAL (
			SELECT pl.id AS place_id
			UNION ALL SELECT pl.parent_id WHERE pl.kind = 'arrondissement'
			UNION ALL SELECT d.id FROM directory.places d
				WHERE d.country = pl.country AND d.kind = 'department' AND d.code = pl.department_code
			UNION ALL SELECT NULL::integer
		) x
		WHERE p.id = ANY (p_ids) AND p.listing_slug IS NOT NULL
		UNION ALL
		SELECT 'site:' || a.site_id
		FROM directory.activities a
		WHERE a.practitioner_id = ANY (p_ids) AND a.site_id IS NOT NULL
	) tags
	WHERE tag IS NOT NULL;

	RETURN coalesce(v_tags, '{}'::text[]);
END
$$;
--> statement-breakpoint

GRANT EXECUTE ON FUNCTION directory.practitioner_page_rows(integer[], text) TO apercura_app, apercura_etl;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION directory.refresh_practitioner_pages(integer, integer[], text) TO apercura_app, apercura_etl;

--> statement-breakpoint

-- As in 0023, with the country-wide listing tag of the practitioner's market and departments
-- found on (country, code), so an Austrian removal expires Austria's pages. Replacing it keeps
-- its SECURITY DEFINER and its grants.
CREATE OR REPLACE FUNCTION directory.purge_suppressed_practitioners(p_ids integer[] DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
	v_targets integer[];
	v_kept integer[];
	v_deleted integer[];
	v_changed integer[];
	v_sites integer[];
	v_tags text[];
	v_objects integer;
	v_sites_deleted integer;
BEGIN
	-- Suppressed practitioners still in the directory, locked in id order.
	SELECT coalesce(array_agg(p.id ORDER BY p.id), '{}') INTO v_targets
	FROM (
		SELECT p.id FROM directory.practitioners p
		JOIN directory.suppressions s
			ON s.country = p.country AND s.id_scheme = p.id_scheme AND s.national_id = p.national_id
		WHERE p_ids IS NULL OR p.id = ANY (p_ids)
		ORDER BY p.id
		FOR UPDATE OF p
	) p;
	IF cardinality(v_targets) = 0 THEN
		RETURN jsonb_build_object('deleted', 0, 'kept', 0, 'sites', 0, 'objects', 0, 'tags', '[]'::jsonb);
	END IF;

	-- Held by an agenda (booking retention) or by its owner's claim (restorable from their space).
	SELECT coalesce(array_agg(p.id), '{}') INTO v_kept
	FROM directory.practitioners p
	WHERE p.id = ANY (v_targets) AND (
		(p.claim_status = 'claimed' AND p.owner_org_id IS NOT NULL)
		OR EXISTS (SELECT 1 FROM care.calendars c WHERE c.practitioner_id = p.id)
	);
	SELECT coalesce(array_agg(id), '{}') INTO v_deleted
	FROM unnest(v_targets) AS id WHERE NOT (id = ANY (v_kept));
	-- Rows with something left to delete: the deleted ones, and kept ones not yet minimised.
	SELECT coalesce(array_agg(p.id), '{}') INTO v_changed
	FROM directory.practitioners p
	WHERE p.id = ANY (v_targets) AND (
		p.id = ANY (v_deleted)
		OR p.status <> 'suppressed' OR p.indexable OR p.withheld_at IS NOT NULL
		OR p.ameli_matched_at IS NOT NULL OR p.next_free_at IS NOT NULL
		OR EXISTS (SELECT 1 FROM directory.practitioner_pages x WHERE x.practitioner_id = p.id)
		OR EXISTS (SELECT 1 FROM directory.search_docs x WHERE x.practitioner_id = p.id)
		OR EXISTS (SELECT 1 FROM directory.practitioner_profiles x WHERE x.practitioner_id = p.id)
		OR EXISTS (SELECT 1 FROM directory.practitioner_qualifications x WHERE x.practitioner_id = p.id)
		OR EXISTS (SELECT 1 FROM directory.practitioner_slug_aliases x WHERE x.practitioner_id = p.id)
		OR EXISTS (SELECT 1 FROM directory.page_view_days x WHERE x.practitioner_id = p.id)
		OR EXISTS (SELECT 1 FROM directory.practitioner_contact_requests x WHERE x.practitioner_id = p.id)
		OR EXISTS (SELECT 1 FROM directory.reports x WHERE x.practitioner_id = p.id)
		OR EXISTS (SELECT 1 FROM directory.removal_requests x WHERE x.practitioner_id = p.id)
		OR EXISTS (
			SELECT 1 FROM directory.activities a
			WHERE a.practitioner_id = p.id AND (a.site_id IS NULL OR NOT EXISTS (
				SELECT 1 FROM care.calendars c WHERE c.practitioner_id = p.id AND c.site_id = a.site_id
			))
		)
	);

	-- Cache tags while the links still exist (same tags as directory.refresh_practitioner).
	SELECT array_agg(DISTINCT tag ORDER BY tag) INTO v_tags
	FROM (
		SELECT 'practitioner:' || id AS tag FROM unnest(v_changed) AS id
		UNION ALL
		SELECT 'listing:' || p.listing_slug || ':' || coalesce(x.place_id::text, lower(p.country))
		FROM directory.practitioners p
		JOIN directory.activities a ON a.practitioner_id = p.id
		JOIN directory.sites s ON s.id = a.site_id
		JOIN directory.places pl ON pl.id = s.place_id
		CROSS JOIN LATERAL (
			SELECT pl.id AS place_id
			UNION ALL SELECT pl.parent_id WHERE pl.kind = 'arrondissement'
			UNION ALL SELECT d.id FROM directory.places d
				WHERE d.country = pl.country AND d.kind = 'department' AND d.code = pl.department_code
			UNION ALL SELECT NULL::integer
		) x
		WHERE p.id = ANY (v_changed) AND p.listing_slug IS NOT NULL
		UNION ALL
		SELECT 'site:' || a.site_id
		FROM directory.activities a
		WHERE a.practitioner_id = ANY (v_changed) AND a.site_id IS NOT NULL
	) tags
	WHERE tag IS NOT NULL;

	-- Their lines in the last import's staging tables (French registry files), which stay there
	-- until the next import truncates them.
	DELETE FROM directory.stg_ans_activities g USING directory.practitioners p
	WHERE p.id = ANY (v_changed) AND p.country = 'FR' AND p.id_scheme = 'RPPS'
		AND g.rpps = p.national_id;
	DELETE FROM directory.stg_ans_qualifications g USING directory.practitioners p
	WHERE p.id = ANY (v_changed) AND p.country = 'FR' AND p.id_scheme = 'RPPS'
		AND g.rpps = p.national_id;
	DELETE FROM directory.stg_quarantine q USING directory.practitioners p
	WHERE p.id = ANY (v_changed) AND p.country = 'FR' AND p.id_scheme = 'RPPS'
		AND q.file IN ('personneActivite', 'savoirFaire', 'diplomes')
		AND strpos(q.sample, p.national_id) > 0;

	-- Storage objects of the rows going away: the database cannot delete them itself.
	WITH queued AS (
		INSERT INTO directory.storage_deletions (key)
		SELECT pr.photo_key FROM directory.practitioner_profiles pr
		WHERE pr.practitioner_id = ANY (v_targets) AND pr.photo_key IS NOT NULL
		UNION
		SELECT d.storage_key FROM directory.claim_documents d
		JOIN directory.claims c ON c.id = d.claim_id
		WHERE c.practitioner_id = ANY (v_deleted) AND d.purged_at IS NULL
		ON CONFLICT (key) DO NOTHING
		RETURNING 1
	)
	SELECT count(*)::integer INTO v_objects FROM queued;

	-- Places of practice: every link, except those of a kept row's agenda.
	SELECT coalesce(array_agg(DISTINCT a.site_id), '{}') INTO v_sites
	FROM directory.activities a
	WHERE a.practitioner_id = ANY (v_targets) AND a.site_id IS NOT NULL;
	DELETE FROM directory.activities a
	WHERE a.practitioner_id = ANY (v_targets)
		AND (a.site_id IS NULL OR NOT EXISTS (
			SELECT 1 FROM care.calendars c
			WHERE c.practitioner_id = a.practitioner_id AND c.site_id = a.site_id
		));

	DELETE FROM directory.practitioner_qualifications WHERE practitioner_id = ANY (v_targets);
	DELETE FROM directory.practitioner_profiles WHERE practitioner_id = ANY (v_targets);
	DELETE FROM directory.practitioner_slug_aliases WHERE practitioner_id = ANY (v_targets);
	DELETE FROM directory.practitioner_pages WHERE practitioner_id = ANY (v_targets);
	DELETE FROM directory.search_docs WHERE practitioner_id = ANY (v_targets);
	DELETE FROM directory.page_view_days WHERE practitioner_id = ANY (v_targets);
	DELETE FROM directory.practitioner_contact_requests WHERE practitioner_id = ANY (v_targets);
	DELETE FROM directory.reports WHERE practitioner_id = ANY (v_targets);
	DELETE FROM directory.removal_requests WHERE practitioner_id = ANY (v_targets);

	-- Kept rows: never published, nothing derived from the registry or Ameli left on them.
	UPDATE directory.practitioners p SET
		status = 'suppressed', indexable = false, withheld_at = NULL, next_free_at = NULL,
		primary_place_id = NULL, billing_sector = NULL, optam = NULL, carte_vitale = NULL,
		apcv = NULL, ameli_matched_at = NULL, qualifications_hash = NULL, source_hash = NULL,
		missing_runs = 0, updated_at = now()
	WHERE p.id = ANY (v_kept) AND p.id = ANY (v_changed);

	-- Everything else: the row, with the claims on it (their checks and documents cascade).
	DELETE FROM directory.practitioners WHERE id = ANY (v_deleted);

	-- Sites nobody links to any more and no agenda uses.
	DELETE FROM directory.sites s
	WHERE s.id = ANY (v_sites)
		AND NOT EXISTS (SELECT 1 FROM directory.activities a WHERE a.site_id = s.id)
		AND NOT EXISTS (SELECT 1 FROM care.calendars c WHERE c.site_id = s.id);
	GET DIAGNOSTICS v_sites_deleted = ROW_COUNT;

	RETURN jsonb_build_object(
		'deleted', cardinality(v_deleted),
		'kept', cardinality(v_kept),
		'sites', v_sites_deleted,
		'objects', v_objects,
		'tags', to_jsonb(coalesce(v_tags, '{}'::text[]))
	);
END
$$;
