-- Custom migration: support for the public site (M3).
--
-- 1. landing_pages payloads gain the Carte Vitale split and a hash of their
--    member list, so a listing page is rewritten (and its cache tag
--    invalidated) when practitioners join or leave it, even when the counts
--    stay the same.
-- 2. text_norm() and a trigram index on place names for the "Où ?" search.
-- 3. Grants on the new rate_limits table (the app role only).

-- Normalized text for fuzzy matching: unaccented, lowercase, single spaces.
CREATE OR REPLACE FUNCTION directory.text_norm(value text)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
AS $$
	SELECT btrim(regexp_replace(lower(directory.f_unaccent(value)), '[^a-z0-9]+', ' ', 'g'))
$$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS places_name_trgm_idx ON directory.places
	USING gin (directory.text_norm(name) gin_trgm_ops)
	WHERE kind IN ('commune', 'arrondissement', 'department') AND removed_at IS NULL;
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
			p.billing_sector, p.carte_vitale, (p.next_free_at IS NOT NULL) AS online
		FROM directory.practitioners p
		JOIN directory.activities a ON a.practitioner_id = p.id
			AND a.removed_at IS NULL AND NOT a.hidden
			AND a.practice_kind IN ('office', 'health_center', 'hospital')
		JOIN directory.sites s ON s.id = a.site_id AND s.removed_at IS NULL AND s.place_id IS NOT NULL
		WHERE p.indexable AND p.listing_slug IS NOT NULL
	),
	expanded AS (
		SELECT b.practitioner_id, b.listing_slug, b.place_id, b.billing_sector, b.carte_vitale, b.online
		FROM base b
		UNION
		SELECT b.practitioner_id, b.listing_slug, pl.parent_id, b.billing_sector, b.carte_vitale, b.online
		FROM base b
		JOIN directory.places pl ON pl.id = b.place_id AND pl.kind = 'arrondissement'
		JOIN directory.places parent ON parent.id = pl.parent_id AND parent.code <> '75056'
		UNION
		SELECT b.practitioner_id, b.listing_slug, d.id, b.billing_sector, b.carte_vitale, b.online
		FROM base b
		JOIN directory.places pl ON pl.id = b.place_id
		JOIN directory.places d ON d.kind = 'department' AND d.code = pl.department_code
		UNION
		SELECT b.practitioner_id, b.listing_slug, NULL::integer, b.billing_sector, b.carte_vitale, b.online
		FROM base b
	),
	members AS (
		SELECT DISTINCT practitioner_id, listing_slug, place_id, billing_sector, carte_vitale, online
		FROM expanded
	),
	per_sector AS (
		SELECT listing_slug, place_id, coalesce(billing_sector, 'unknown') AS sector,
			count(DISTINCT practitioner_id) AS n
		FROM members
		GROUP BY 1, 2, 3
	),
	sectors AS (
		SELECT listing_slug, place_id, jsonb_object_agg(sector, n ORDER BY sector) AS billing_sectors
		FROM per_sector
		GROUP BY 1, 2
	),
	totals AS (
		SELECT listing_slug, place_id, count(DISTINCT practitioner_id)::integer AS n,
			count(DISTINCT practitioner_id) FILTER (WHERE online)::integer AS online,
			count(DISTINCT practitioner_id) FILTER (WHERE carte_vitale)::integer AS carte_vitale_yes,
			count(DISTINCT practitioner_id) FILTER (WHERE carte_vitale = false)::integer AS carte_vitale_no,
			md5(string_agg(DISTINCT practitioner_id::text, ',' ORDER BY practitioner_id::text))
				AS members_hash
		FROM members
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

-- The app counts requests; nobody else needs this table.
GRANT SELECT, INSERT, UPDATE, DELETE ON directory.rate_limits TO apercura_app;
--> statement-breakpoint
GRANT SELECT ON directory.rate_limits TO apercura_readonly;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION directory.text_norm(text) TO apercura_app, apercura_etl;
