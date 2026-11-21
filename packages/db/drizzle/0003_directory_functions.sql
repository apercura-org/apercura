-- Custom migration: SQL functions of the directory.
--
-- The read models (practitioner_pages, landing_pages, search_docs) are rebuilt
-- set-based by these functions: in bulk by the import, by id after an owner
-- edit. A row is written only when its content hash changes, which gives change
-- detection, cascades, an honest lastmod and idempotence at once. Every written
-- or deleted page enqueues its cache tag in invalidation_outbox.
--
-- Payloads must be deterministic: no timestamps that change on every run, and
-- every array ordered explicitly.

-- unaccent() is only STABLE, so it cannot be used in an index or a generated
-- column. This wrapper pins the dictionary and is safe to mark IMMUTABLE.
CREATE OR REPLACE FUNCTION directory.f_unaccent(value text)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, value) $$;
--> statement-breakpoint

-- Normalized name used for fuzzy search: unaccented, lowercase, single spaces.
CREATE OR REPLACE FUNCTION directory.name_norm(last_name text, first_name text)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
	SELECT btrim(regexp_replace(
		lower(directory.f_unaccent(coalesce(last_name, '') || ' ' || coalesce(first_name, ''))),
		'[^a-z0-9]+', ' ', 'g'))
$$;
--> statement-breakpoint

-- Key used to match names and cities across sources: uppercase ASCII letters
-- and digits separated by single spaces ("Marie-Odile" = "MARIE ODILE").
CREATE OR REPLACE FUNCTION directory.match_key(value text)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
AS $$
	SELECT btrim(regexp_replace(
		upper(directory.f_unaccent(replace(replace(replace(replace(value,
			'œ', 'oe'), 'Œ', 'OE'), 'æ', 'ae'), 'Æ', 'AE'))),
		'[^A-Z0-9]+', ' ', 'g'))
$$;
--> statement-breakpoint

-- Luhn check of an RPPS number (11 digits, check digit last). Used by the
-- import's staging checks as a second line of defense.
CREATE OR REPLACE FUNCTION directory.luhn_valid(value text)
RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
AS $$
	SELECT value ~ '^[0-9]{11}$' AND (
		SELECT sum(
			CASE WHEN (length(value) - i) % 2 = 1
				THEN (substr(value, i, 1)::int * 2) - CASE WHEN substr(value, i, 1)::int * 2 > 9 THEN 9 ELSE 0 END
				ELSE substr(value, i, 1)::int
			END
		) % 10 = 0
		FROM generate_series(1, length(value)) AS i
	)
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION directory.enqueue_tags(p_run_id integer, p_tags text[])
RETURNS integer
LANGUAGE sql
AS $$
	WITH inserted AS (
		INSERT INTO directory.invalidation_outbox (tag, run_id)
		SELECT DISTINCT tag, p_run_id FROM unnest(p_tags) AS tag WHERE tag IS NOT NULL
		ON CONFLICT (tag) DO NOTHING
		RETURNING 1
	)
	SELECT count(*)::integer FROM inserted
$$;
--> statement-breakpoint

-- Page payload of every active practitioner (or of the given ids).
CREATE OR REPLACE FUNCTION directory.practitioner_page_rows(p_ids integer[] DEFAULT NULL)
RETURNS TABLE (
	practitioner_id integer,
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
						'practiceKind', a.practice_kind,
						'modeCode', a.mode_code,
						'roleCode', a.role_code,
						'sectorCode', a.sector_code,
						'isPrimary', a.is_primary,
						'site', CASE WHEN s.id IS NULL THEN NULL ELSE jsonb_build_object(
							'id', s.id,
							'kind', s.kind,
							'name', s.name,
							'addressLine', s.address_line,
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
			'profile', CASE WHEN pr.practitioner_id IS NULL THEN NULL ELSE jsonb_build_object(
				'photoKey', pr.photo_key,
				'headline', pr.headline,
				'bio', pr.bio,
				'languages', to_jsonb(pr.languages),
				'billingSector', pr.billing_sector,
				'fees', pr.fees,
				'optam', pr.optam,
				'paymentMethods', to_jsonb(pr.payment_methods),
				'accessibility', pr.accessibility,
				'website', pr.website,
				'showPhone', pr.show_phone,
				'expertises', to_jsonb(pr.expertises)
			) END
		),
		p.indexable
	FROM directory.practitioners p
	LEFT JOIN directory.places pp ON pp.id = p.primary_place_id
	LEFT JOIN directory.practitioner_profiles pr ON pr.practitioner_id = p.id
	WHERE p.status = 'active' AND (p_ids IS NULL OR p.id = ANY (p_ids))
$$;
--> statement-breakpoint

-- Rebuilds practitioner_pages (all rows, or the given ids) and returns counts.
-- `unpublished` counts pages that were indexable and no longer are (or are
-- gone); `updated` counts existing pages whose content changed. The import's
-- circuit breakers read both before committing.
CREATE OR REPLACE FUNCTION directory.refresh_practitioner_pages(
	p_run_id integer,
	p_ids integer[] DEFAULT NULL
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
	FROM directory.practitioner_page_rows(p_ids) r;
	ALTER TABLE refresh_pages ADD PRIMARY KEY (practitioner_id);

	SELECT count(*), count(*) FILTER (WHERE pg.indexable)
	INTO v_previous_total, v_previous_indexable
	FROM directory.practitioner_pages pg
	WHERE p_ids IS NULL OR pg.practitioner_id = ANY (p_ids);

	SELECT count(*) INTO v_unpublished
	FROM directory.practitioner_pages pg
	LEFT JOIN refresh_pages r ON r.practitioner_id = pg.practitioner_id
	WHERE pg.indexable
		AND (p_ids IS NULL OR pg.practitioner_id = ANY (p_ids))
		AND (r.practitioner_id IS NULL OR NOT r.indexable);

	DROP TABLE IF EXISTS pg_temp.refresh_changed;
	CREATE TEMP TABLE refresh_changed (practitioner_id integer, inserted boolean) ON COMMIT DROP;

	WITH upserted AS (
		INSERT INTO directory.practitioner_pages AS pg (
			practitioner_id, slug, listing_slug, department_code, payload, indexable,
			content_hash, content_updated_at
		)
		SELECT r.practitioner_id, r.slug, r.listing_slug, r.department_code, r.payload, r.indexable,
			r.content_hash, now()
		FROM refresh_pages r
		ON CONFLICT (practitioner_id) DO UPDATE SET
			slug = excluded.slug,
			listing_slug = excluded.listing_slug,
			department_code = excluded.department_code,
			payload = excluded.payload,
			indexable = excluded.indexable,
			content_hash = excluded.content_hash,
			content_updated_at = excluded.content_updated_at
		WHERE pg.content_hash IS DISTINCT FROM excluded.content_hash
		RETURNING pg.practitioner_id, (xmax = 0) AS inserted
	)
	INSERT INTO refresh_changed SELECT * FROM upserted;

	SELECT count(*) FILTER (WHERE inserted), count(*) FILTER (WHERE NOT inserted)
	INTO v_inserted, v_updated
	FROM refresh_changed;

	WITH deleted AS (
		DELETE FROM directory.practitioner_pages pg
		WHERE (p_ids IS NULL OR pg.practitioner_id = ANY (p_ids))
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

-- Rebuilds landing_pages: listing slug x (France | department | commune |
-- arrondissement). Lyon and Marseille get a city page that groups their
-- arrondissements; the Paris city page is its department page. A page exists
-- from 1 practitioner, is indexable from 3 and is only deindexed below 2 (no
-- flapping).
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
		SELECT DISTINCT p.id AS practitioner_id, p.listing_slug, s.place_id,
			p.billing_sector, (p.next_free_at IS NOT NULL) AS online
		FROM directory.practitioners p
		JOIN directory.activities a ON a.practitioner_id = p.id
			AND a.removed_at IS NULL AND NOT a.hidden
			AND a.practice_kind IN ('office', 'health_center', 'hospital')
		JOIN directory.sites s ON s.id = a.site_id AND s.removed_at IS NULL AND s.place_id IS NOT NULL
		WHERE p.indexable AND p.listing_slug IS NOT NULL
	),
	expanded AS (
		SELECT b.practitioner_id, b.listing_slug, b.place_id, b.billing_sector, b.online FROM base b
		UNION
		SELECT b.practitioner_id, b.listing_slug, pl.parent_id, b.billing_sector, b.online
		FROM base b
		JOIN directory.places pl ON pl.id = b.place_id AND pl.kind = 'arrondissement'
		JOIN directory.places parent ON parent.id = pl.parent_id AND parent.code <> '75056'
		UNION
		SELECT b.practitioner_id, b.listing_slug, d.id, b.billing_sector, b.online
		FROM base b
		JOIN directory.places pl ON pl.id = b.place_id
		JOIN directory.places d ON d.kind = 'department' AND d.code = pl.department_code
		UNION
		SELECT b.practitioner_id, b.listing_slug, NULL::integer, b.billing_sector, b.online FROM base b
	),
	per_sector AS (
		SELECT listing_slug, place_id, coalesce(billing_sector, 'unknown') AS sector,
			count(DISTINCT practitioner_id) AS n
		FROM expanded
		GROUP BY 1, 2, 3
	),
	sectors AS (
		SELECT listing_slug, place_id, jsonb_object_agg(sector, n) AS billing_sectors
		FROM per_sector
		GROUP BY 1, 2
	),
	totals AS (
		SELECT listing_slug, place_id, count(DISTINCT practitioner_id)::integer AS n,
			count(DISTINCT practitioner_id) FILTER (WHERE online)::integer AS online
		FROM expanded
		GROUP BY 1, 2
	)
	SELECT
		t.listing_slug || ':' || coalesce(t.place_id::text, 'fr') AS key,
		t.listing_slug,
		t.place_id,
		t.n AS practitioner_count,
		jsonb_build_object(
			'listingSlug', t.listing_slug,
			'placeId', t.place_id,
			'practitionerCount', t.n,
			'onlineBookingCount', t.online,
			'billingSectors', s.billing_sectors
		) AS payload,
		(t.n >= 3 OR (t.n >= 2 AND coalesce(old.indexable, false))) AS indexable
	FROM totals t
	JOIN sectors s ON s.listing_slug = t.listing_slug AND s.place_id IS NOT DISTINCT FROM t.place_id
	LEFT JOIN directory.landing_pages old
		ON old.key = t.listing_slug || ':' || coalesce(t.place_id::text, 'fr');

	DROP TABLE IF EXISTS pg_temp.refresh_landing_changed;
	CREATE TEMP TABLE refresh_landing_changed (key text, inserted boolean) ON COMMIT DROP;

	WITH upserted AS (
		INSERT INTO directory.landing_pages AS lp (
			key, listing_slug, place_id, practitioner_count, payload, indexable, content_hash,
			content_updated_at
		)
		SELECT r.key, r.listing_slug, r.place_id, r.practitioner_count, r.payload, r.indexable,
			md5(r.payload::text || '|' || r.indexable::text), now()
		FROM refresh_landing r
		ON CONFLICT (key) DO UPDATE SET
			practitioner_count = excluded.practitioner_count,
			payload = excluded.payload,
			indexable = excluded.indexable,
			content_hash = excluded.content_hash,
			content_updated_at = excluded.content_updated_at
		WHERE lp.content_hash IS DISTINCT FROM excluded.content_hash
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

-- Rebuilds search_docs for every active practitioner (or the given ids).
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
		s.name, s.address_line, s.postcode, s.location, s.place_id, pl.name AS place_name,
		pl.kind AS place_kind, pl.parent_id, d.id AS department_place_id
	FROM directory.activities a
	JOIN directory.practitioners p ON p.id = a.practitioner_id AND p.status = 'active'
	JOIN directory.sites s ON s.id = a.site_id AND s.removed_at IS NULL
	LEFT JOIN directory.places pl ON pl.id = s.place_id
	LEFT JOIN directory.places d ON d.kind = 'department' AND d.code = pl.department_code
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
			practitioner_id, name_norm, listing_slug, place_ids, location, payload, indexable,
			content_hash, content_updated_at
		)
		SELECT r.practitioner_id, r.name_norm, r.listing_slug, r.place_ids, r.location, r.payload,
			r.indexable,
			md5(r.payload::text || '|' || r.indexable::text || '|' || r.place_ids::text || '|'
				|| coalesce(r.location::text, '')),
			now()
		FROM refresh_search r
		ON CONFLICT (practitioner_id) DO UPDATE SET
			name_norm = excluded.name_norm,
			listing_slug = excluded.listing_slug,
			place_ids = excluded.place_ids,
			location = excluded.location,
			payload = excluded.payload,
			indexable = excluded.indexable,
			content_hash = excluded.content_hash,
			content_updated_at = excluded.content_updated_at
		WHERE sd.content_hash IS DISTINCT FROM excluded.content_hash
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
