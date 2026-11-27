-- Custom migration (#167, Slovenia): a Slovenian practice's address is written with its post
-- office (`Zadobrova 49 b`, `3211 Škofja vas`), which the insurer's lists give and which is
-- often not the name of the municipality the practice is listed in (Celje). The page's read model
-- carried the place's name only: the site object of a Slovenian page now also carries the post
-- office (`sites.commune_label`) as `locality`. Every other market's payload is left byte for byte
-- as it was, so no other page is rewritten. Replacing the function (same signature) takes no table
-- lock and keeps its grants.

-- Page payload of every active practitioner (or of the given ids, or of one market), as in 0024,
-- with the locality of Slovenia's sites.
CREATE OR REPLACE FUNCTION directory.practitioner_page_rows(
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
						)
						-- A Slovenian practice's post office (`3211 Škofja vas`): its address's town
						-- line, which is not its municipality. Added to Slovenia's pages only, so no other
						-- market's payload (or content hash) changes.
						|| CASE WHEN s.country_code = 'SI'
							THEN jsonb_build_object('locality', s.commune_label)
							ELSE '{}'::jsonb END
						END)
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
