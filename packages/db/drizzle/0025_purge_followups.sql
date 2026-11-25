-- Follow-ups to the data minimisation of removed practitioners (issue #120, after #118).
--
-- 1. directory.purge_suppressed_practitioners (migrations 0023, 0024), replaced with two changes:
--    - the last import's quarantined lines of a removed practitioner are found by a whole
--      `|`-separated field equal to their RPPS or national PP id, no longer by any substring;
--    - a row kept bare (held by its owner's claim or an agenda) loses every claim but its
--      owner's verified one (claims in progress or contesting it, rejected, withdrawn), with
--      their checks and documents, whose storage objects are queued in
--      directory.storage_deletions like the others. Returns their count as `claims`.
--    Same signature, SECURITY DEFINER and search path; the grants are restated.
-- 2. directory.landing_refresh_requests: the listing-count rebuilds the app could not run because
--    an import held its lock, one row per cache tag to expire after it; `jobs:tick
--    landing-counts` runs them once the lock is free. App role only (and read-only).
-- 3. directory.platform_audit_events.details: non-personal facts of an event, the counts of a
--    `practitioner.purge`.
--
-- Safe on a live database: one new, empty table, a nullable column without default (no rewrite)
-- and a function replaced in place. Each statement waits at most 5 seconds for a lock, then the
-- migration fails and can be run again. Forward-only.
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE TABLE "directory"."landing_refresh_requests" (
	"tag" text PRIMARY KEY NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "directory"."platform_audit_events" ADD COLUMN "details" jsonb;
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON directory.landing_refresh_requests TO apercura_app;
--> statement-breakpoint
REVOKE ALL ON directory.landing_refresh_requests FROM apercura_etl;
--> statement-breakpoint
GRANT SELECT ON directory.landing_refresh_requests TO apercura_readonly;
--> statement-breakpoint

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
	v_claims integer;
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
		RETURN jsonb_build_object(
			'deleted', 0, 'kept', 0, 'sites', 0, 'objects', 0, 'claims', 0, 'tags', '[]'::jsonb
		);
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
	-- A quarantined line is the raw `|`-separated line: it matches on a whole field equal to the
	-- RPPS ("Identifiant PP") or to the national PP id ("Identification nationale PP", 8 + RPPS),
	-- never on digits that merely contain it.
	DELETE FROM directory.stg_quarantine q USING directory.practitioners p
	WHERE p.id = ANY (v_changed) AND p.country = 'FR' AND p.id_scheme = 'RPPS'
		AND q.file IN ('personneActivite', 'savoirFaire', 'diplomes')
		AND string_to_array(q.sample, '|') && ARRAY[p.national_id, '8' || p.national_id];

	-- Storage objects of the rows going away: the database cannot delete them itself.
	WITH queued AS (
		INSERT INTO directory.storage_deletions (key)
		SELECT pr.photo_key FROM directory.practitioner_profiles pr
		WHERE pr.practitioner_id = ANY (v_targets) AND pr.photo_key IS NOT NULL
		UNION
		SELECT d.storage_key FROM directory.claim_documents d
		JOIN directory.claims c ON c.id = d.claim_id
		WHERE d.purged_at IS NULL AND (
			c.practitioner_id = ANY (v_deleted)
			OR (c.practitioner_id = ANY (v_kept) AND c.status <> 'verified')
		)
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
	-- Claims on a kept row other than its owner's (in progress, contesting, rejected, withdrawn):
	-- their checks and documents cascade, the objects are queued above.
	DELETE FROM directory.claims WHERE practitioner_id = ANY (v_kept) AND status <> 'verified';
	GET DIAGNOSTICS v_claims = ROW_COUNT;

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
		'claims', v_claims,
		'tags', to_jsonb(coalesce(v_tags, '{}'::text[]))
	);
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION directory.purge_suppressed_practitioners(integer[]) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION directory.purge_suppressed_practitioners(integer[])
	TO apercura_app, apercura_etl;
--> statement-breakpoint
RESET lock_timeout;
