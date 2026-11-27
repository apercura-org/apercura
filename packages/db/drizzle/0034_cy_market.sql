-- Custom migration (#174, Cyprus): the search's normalisers read Greek. Cyprus's places and
-- facilities are named in Greek ("Στρόβολος", "Φαρμακείο, Ερμού 51Γ, Λάρνακα"), and text_norm()
-- and name_norm() kept only Latin letters and digits: every Greek name normalised to the empty
-- string, so a place search matched every Cypriot place at once and no facility by its name.
-- Greek is now written in Latin letters first, as ELOT 743 transcribes it and the Cypriot
-- registers write place names (`Λεμεσός` -> `lemesos`, `Λευκωσία` -> `lefkosia`), so a place is
-- found whether it is typed in Greek or in Latin letters ("Lemesos", "Strovolos"). Text without
-- Greek letters normalises exactly as before, so no other market's names, search documents or
-- index entries change; the places' trigram index is rebuilt for the Greek names.

-- Greek in Latin letters, lowercase: accents and diaeresis dropped, `αυ`, `ευ`, `ηυ` as `af`,
-- `ef`, `if` before a voiceless consonant or at the end of a word and `av`, `ev`, `iv` otherwise,
-- `ου` as `ou`, `γγ`, `γξ`, `γχ` as `ng`, `nx`, `nch`, `μπ` as `b` at the start of a word, then
-- one letter for one (`θ`, `χ`, `ψ` as `th`, `ch`, `ps`). Text without a Greek letter is returned
-- as it is, so the other markets' names never pay for it.
CREATE OR REPLACE FUNCTION directory.greek_latin(value text)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
AS $$
	SELECT CASE WHEN value !~ '[Ά-ώ]' THEN value ELSE translate(
		replace(replace(replace(
		regexp_replace(
		replace(replace(replace(replace(
		regexp_replace(regexp_replace(
		replace(
			translate(lower(value), 'άέήίόύώϊϋΐΰς', 'αεηιουωιυιυσ'),
		'ου', 'ou'),
		'([αεη])υ([θκξπστφχψ]|$|[^α-ω])', '\1f\2', 'g'),
		'([αεη])υ', '\1v', 'g'),
		'γγ', 'ng'), 'γξ', 'nx'), 'γχ', 'nch'), 'γκ', 'gk'),
		'(^|[^α-ωa-z])μπ', '\1b', 'g'),
		'θ', 'th'), 'χ', 'ch'), 'ψ', 'ps'),
		'αβγδεζηικλμνξοπρστυφω', 'avgdeziiklmnxoprstyfo') END
$$;
--> statement-breakpoint

-- As in 0007, with Greek written in Latin letters first.
CREATE OR REPLACE FUNCTION directory.text_norm(value text)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
AS $$
	SELECT btrim(regexp_replace(lower(directory.f_unaccent(directory.greek_latin(value))),
		'[^a-z0-9]+', ' ', 'g'))
$$;
--> statement-breakpoint

-- As in 0003, with Greek written in Latin letters first.
CREATE OR REPLACE FUNCTION directory.name_norm(last_name text, first_name text)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
	SELECT btrim(regexp_replace(
		lower(directory.f_unaccent(directory.greek_latin(
			coalesce(last_name, '') || ' ' || coalesce(first_name, '')))),
		'[^a-z0-9]+', ' ', 'g'))
$$;
--> statement-breakpoint

-- As text_norm() (0007): executable by the roles that normalise text, not by PUBLIC.
REVOKE EXECUTE ON FUNCTION directory.greek_latin(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION directory.greek_latin(text) TO apercura_app, apercura_etl;
--> statement-breakpoint

REINDEX INDEX directory.places_name_trgm_idx;
