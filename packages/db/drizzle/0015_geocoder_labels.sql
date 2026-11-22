ALTER TABLE "directory"."geocode_cache" ADD COLUMN "result_label" text;--> statement-breakpoint
ALTER TABLE "directory"."geocode_cache" ADD COLUMN "result_housenumber" text;--> statement-breakpoint
ALTER TABLE "directory"."geocode_cache" ADD COLUMN "result_name" text;--> statement-breakpoint
ALTER TABLE "directory"."geocode_cache" ADD COLUMN "result_street" text;--> statement-breakpoint
ALTER TABLE "directory"."geocode_cache" ADD COLUMN "result_postcode" text;--> statement-breakpoint
ALTER TABLE "directory"."geocode_cache" ADD COLUMN "result_city" text;--> statement-breakpoint
ALTER TABLE "directory"."geocode_cache" ADD COLUMN "with_labels" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "directory"."sites" ADD COLUMN "geo_label" text;--> statement-breakpoint
ALTER TABLE "directory"."sites" ADD COLUMN "geo_address_line" text;--> statement-breakpoint

-- Page payload of every active practitioner (or of the given ids), as in
-- 0012, with the street line the geocoder labelled when there is one. Owner
-- content appears once the page is published, and a hidden field never
-- reaches the payload (so no page can leak it).
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
$$;
--> statement-breakpoint

-- Rebuilds search_docs for every active practitioner (or the given ids), as in
-- 0003, with the street line the geocoder labelled when there is one.
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
