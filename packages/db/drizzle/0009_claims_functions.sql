-- Custom migration: claims, owner page content and GDPR tools (M4).
--
-- 1. Grants on the tables of 0008: the app reads and writes them, except the
--    platform audit log, which is append-only; the import has no access; the
--    read-only role reads everything but the secret hashes of claim checks.
-- 2. practitioner_page_rows() publishes the owner's content once the page is
--    published, without the fields the owner hid, and says when a page is
--    withheld while a removal request is checked.
-- 3. refresh_practitioner() rebuilds the read models of a few practitioners
--    after an owner edit, a claim decision or a removal request.

GRANT SELECT, INSERT, UPDATE, DELETE ON
	directory.claims,
	directory.claim_checks,
	directory.claim_documents,
	directory.removal_requests,
	directory.reports
TO apercura_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON directory.platform_audit_events TO apercura_app;
--> statement-breakpoint
REVOKE UPDATE, DELETE, TRUNCATE ON directory.platform_audit_events FROM apercura_app;
--> statement-breakpoint
GRANT USAGE, SELECT ON SEQUENCE
	directory.claim_checks_id_seq,
	directory.platform_audit_events_id_seq
TO apercura_app;
--> statement-breakpoint

REVOKE ALL ON
	directory.claims,
	directory.claim_checks,
	directory.claim_documents,
	directory.removal_requests,
	directory.reports,
	directory.platform_audit_events
FROM apercura_etl;
--> statement-breakpoint

GRANT SELECT ON
	directory.claims,
	directory.claim_documents,
	directory.removal_requests,
	directory.reports,
	directory.platform_audit_events
TO apercura_readonly;
--> statement-breakpoint
REVOKE ALL ON directory.claim_checks FROM apercura_readonly;
--> statement-breakpoint
GRANT SELECT (
	id, claim_id, method, status, attempts, expires_at, passed_at, detail, created_at, updated_at
) ON directory.claim_checks TO apercura_readonly;
--> statement-breakpoint

-- Page payload of every active practitioner (or of the given ids). Owner
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

-- The import's indexing rule for one practitioner, without its profession
-- filter (a page already in the directory is in scope): active, not
-- suppressed, not withheld, and at least one public activity at a place.
CREATE OR REPLACE FUNCTION directory.practitioner_indexable(p_id integer)
RETURNS boolean
LANGUAGE sql STABLE
AS $$
	SELECT coalesce((
		SELECT p.status = 'active'
			AND p.withheld_at IS NULL
			AND NOT EXISTS (
				SELECT 1 FROM directory.suppressions x
				WHERE x.country = p.country AND x.id_scheme = p.id_scheme AND x.national_id = p.national_id
			)
			AND EXISTS (
				SELECT 1 FROM directory.activities a
				JOIN directory.sites s ON s.id = a.site_id AND s.removed_at IS NULL AND s.place_id IS NOT NULL
				WHERE a.practitioner_id = p.id AND a.removed_at IS NULL AND NOT a.hidden
					AND a.practice_kind IN ('office', 'health_center', 'hospital')
			)
		FROM directory.practitioners p WHERE p.id = p_id
	), false)
$$;
--> statement-breakpoint

-- Rebuilds the read models of the given practitioners after an app-side
-- change (owner edit, claim decision, removal request): indexable flag,
-- practitioner page and search document. Landing page counts follow at the
-- next import; the listings themselves read `practitioners.indexable` live.
-- Returns the cache tags to revalidate.
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
		SELECT 'listing:' || p.listing_slug || ':' || coalesce(x.place_id::text, 'fr')
		FROM directory.practitioners p
		JOIN directory.activities a ON a.practitioner_id = p.id
		JOIN directory.sites s ON s.id = a.site_id
		JOIN directory.places pl ON pl.id = s.place_id
		CROSS JOIN LATERAL (
			SELECT pl.id AS place_id
			UNION ALL SELECT pl.parent_id WHERE pl.kind = 'arrondissement'
			UNION ALL SELECT d.id FROM directory.places d
				WHERE d.kind = 'department' AND d.code = pl.department_code
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

REVOKE EXECUTE ON FUNCTION directory.practitioner_indexable(integer) FROM PUBLIC;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION directory.refresh_practitioner(integer[]) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION
	directory.practitioner_page_rows(integer[]),
	directory.practitioner_indexable(integer),
	directory.refresh_practitioner(integer[])
TO apercura_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION directory.practitioner_page_rows(integer[]) TO apercura_etl;
