# Open data import

`packages/etl` builds the public directory from open data: France (this page,
first) and Austria ([below](#austria)). It is a Bun CLI that runs as a
scheduled task next to the app, with its own database role that cannot reach
patient data. Each market's import writes the shared `directory` schema with
its own `country` and never reads or writes another market's rows.

```sh
bun run etl:places                        # once, then yearly
bun run etl:fr                            # weekly (all of France)
bun run etl:fr --department 75            # one department
bun run etl:fr --dry-run                  # everything, then roll back
bun run etl:fr --approve=<run_id>         # accept what a blocked run reported
```

`bun packages/etl/src/cli.ts --help` lists every flag and environment variable.

## Sources

All sources are published under the Licence Ouverte 2.0.

| Source                                          | URL                                                                                               | Use                                                |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Annuaire Santé `Personne_activite`              | `https://www.data.gouv.fr/api/1/datasets/r/fffda7e9-0ea2-4c35-bba0-4496f3af935d`                  | practitioners, activities, structures              |
| Annuaire Santé `SavoirFaire`                    | `https://www.data.gouv.fr/api/1/datasets/r/fb55f15f-bd61-4402-b551-51ef387f2fab`                  | specialties, competences, capacities               |
| Annuaire Santé `Dipl_AutExerc`                  | `https://www.data.gouv.fr/api/1/datasets/r/41ae70ac-90c8-4c4e-8644-4ef1b100f045`                  | diplomas, authorizations                           |
| FINESS+ Structures                              | latest daily `json.gz` resource of `https://www.data.gouv.fr/api/1/datasets/finess-structures-1/` | establishment names, categories, WGS84 coordinates |
| Annuaire santé Ameli                            | `https://www.data.gouv.fr/api/1/datasets/r/432983b9-2e6f-473a-b35a-20403c300a5f`                  | billing sector, OPTAM, Carte Vitale                |
| Communes, arrondissements, departments, regions | `https://geo.api.gouv.fr`                                                                         | `directory.places`                                 |
| Géoplateforme geocoder                          | `POST https://data.geopf.fr/geocodage/search/csv`                                                 | site coordinates, during the import only           |

The URLs can be overridden with `ETL_ANS_URLS`, `ETL_AMELI_URL`,
`ETL_FINESS_DATASET_URL`, `ETL_GEO_API_URL` and `ETL_GEOCODER_URL`.

## Pipeline

1. **Download**, streaming, with `Accept-Encoding: gzip`, into a temporary
   directory (`ETL_WORK_DIR`). Size, sha256 and `Last-Modified` of every file
   are stored in `etl_runs.files`. When every file has the same sha256 as the
   last successful run with the same scope, the run stops (`skipped`); use
   `--force` to import anyway. A missing FINESS+ or Ameli file only skips that
   enrichment.
2. **File guards** on the three ANS files: final newline (truncation), strict
   UTF-8, size within ±10% of the last success.
3. **Parse** with `node:readline`, split on `|` (no quoting in these files) and
   map columns **by header name**: a missing expected column fails the run.
   Each in-scope line is validated (Zod: RPPS type and Luhn check, name,
   profession) and normalized (name casing with particles, E.164 phones,
   address line, practice kind from `@apercura/core/taxonomy`). Malformed lines
   go to `stg_quarantine` (count and samples in `etl_runs.stats.quarantine`);
   more than 0.1% fails the run. Unknown taxonomy codes are reported in
   `stats.taxonomy`, with the lines skipped by the scope (see
   [Professions](#professions)). The lines of a suppressed RPPS (GDPR
   objection, see [Removed practitioners](#removed-practitioners)) are dropped
   here, before staging or quarantine, and counted in
   `stats.suppressedLines` (per country and file).
4. **COPY** into the staging tables (`directory.stg_*`, ordinary tables
   truncated at each run), then `ANALYZE`.
5. **Staging guards**: rows within ±3% and distinct RPPS per profession within
   ±2% of the last success with the same profession list (the dropped lines of
   suppressed RPPS count, so a suppression never looks like a shrinking file), at least 98% of rows
   with a structure resolving to a commune, Luhn check of every staged RPPS (in
   SQL, as a second line of defense).
6. **Merge**, set-based, in **one transaction** so that the circuit breakers
   can roll everything back:
   - places of structures: published commune code, then the arrondissement of
     a whole Paris/Lyon/Marseille code by postcode, then the only commune of the
     postcode. The department is always read from `places`;
   - `sites` keyed by the ANS structure id, `practitioners` by RPPS (slug
     `{prenom-nom}-{rpps}` set once at creation), `activities` by a hash of
     (RPPS, structure, mode, role, sector, genre), qualifications replaced per
     practitioner when their hash changes. Every upsert is guarded by a row hash,
     so a rerun over the same files writes nothing;
   - absences: a practitioner missing from the file gets `missing_runs + 1`;
     after **two consecutive** runs an unclaimed one is `removed` (claimed ones
     are counted in `stats.absences.claimedNeedingReview` for an admin);
   - suppressions (GDPR objections): their lines never reach staging; a safety
     net deletes what is still stored about a suppressed RPPS (a suppression
     added by hand, or confirmed while the run loaded) and never counts against
     the circuit breakers; a row whose suppression was withdrawn is active
     again;
   - FINESS+ enrichment of sites with a FINESS number (open establishments
     only): official name, category, coordinates (`geo_source = finess`);
   - site names: accented letters the registry printed as capitals inside a
     word ("HElEne") regain their accents from the staged names and communes;
     then a word written without accents that is, accent-insensitively, a first
     or last name of a practitioner of that same structure takes that name's
     accents ("Cabinet du Dr Helene Aelion" for Hélène Aelion). A word two of
     these names spell differently is left as it is;
   - geocoding of sites without coordinates: `geocode_cache` first, then the
     Géoplateforme CSV endpoint in chunks of 50,000 lines (results are cached
     on a separate connection, so they survive a rollback). A result is kept
     when its score is ≥ 0.6 and it lands in the site's commune (or one of its
     arrondissements); otherwise the commune centroid is used with
     `geo_precision = city`. Dry runs and `--offline` runs use the cache and
     centroids only;
   - street names: the cache also keeps the BAN label of each result and its
     parts (`result_label`, `result_housenumber`, `result_name`,
     `result_street`, `result_postcode`, `result_city`). For every registry
     site whose match scores ≥ 0.8 in the site's own commune code, the label is
     stored in `sites.geo_label` and, when the BAN street is the registry's
     street (same words once accents, case, hyphens and common abbreviations
     are ignored), `sites.geo_address_line` gets the registry's number with the
     BAN's street name ("34 Avenue du Général Sarrail"). Pages print
     `geo_address_line` when set, else `address_line`, which always stays the
     registry text. Cache rows from before these columns
     (`with_labels = false`) are geocoded again once by the next online run;
     offline runs leave labels as they are;
   - planner statistics: autovacuum cannot see rows of a transaction still
     open, so on a fresh database the directory tables would have none. The
     run `ANALYZE`s the tables it wrote (which samples its own rows) after
     geocoding, again after the derived fields and Ameli matching, and the
     read models before the circuit breakers. The queries after the merge are
     joins and anti-joins, without a subquery per practitioner;
   - primary activity and place, switchboard phones (a number shared by 10+
     practitioners), orphan sites, `indexable`;
   - Ameli strict matching (below);
   - read models: `practitioner_pages`, `landing_pages`, `search_docs` are
     rebuilt by SQL functions that only write rows whose `content_hash`
     changed, and enqueue the matching cache tags in `invalidation_outbox`.
7. **Circuit breakers**, before `COMMIT`: if more than 1% of indexable pages
   would be unpublished or more than 10% of pages would change, the transaction
   is rolled back and the run is `blocked`, with the counts and a few example
   slugs in `etl_runs.guards` / `stats.blockedExamples`. After review, rerun with
   `--approve=<run_id>`: it is accepted only if the files have exactly the same
   sha256 as the blocked run. `--approve` also overrides the volume guards
   (size, rows, RPPS, communes), never the integrity ones (truncation, UTF-8,
   quarantine, Luhn).
8. **Revalidation**, after `COMMIT`: the outbox is sent to
   `POST {APP_URL}/api/revalidate` (HMAC-SHA256 over `{timestamp}.{body}` with
   `REVALIDATE_SECRET`, headers `x-apercura-timestamp` and
   `x-apercura-signature`, at most 100 tags per request, retried with backoff).
   Tags are deleted once acknowledged; if the app is unreachable they stay for
   the next run (`bun packages/etl/src/cli.ts etl:outbox` drains them on its
   own). Above 20,000 tags, coarse tags (`practitioner:*`, `listing:*`,
   `site:*`, `place:*`) are sent instead: page queries must tag themselves with
   both the precise and the coarse tag. With any change the drain also sends
   `sitemap` (queued with the others, so it waits with them when the app is
   unreachable), which the app expires at once: the sitemaps list the new pages
   on the next request ([public-site.md](./public-site.md#revalidation-after-an-import)).

A session advisory lock prevents two imports from running at the same time.
Every run, whatever its outcome, is recorded in `directory.etl_runs` (status
`succeeded`, `failed`, `blocked`, `skipped` or `dry_run`, stats per step,
durations, peak RSS).

### Professions

`ETL_PROFESSIONS` (or `--professions`) lists the TRE_G15 profession codes to
import. The default, `FR_DEFAULT_PROFESSIONS` in `@apercura/core/taxonomy`, is
`10,40,50,60`: physicians, dental surgeons, midwives and nurses. Every other
registered profession is mapped (slug and labels) but opt-in; `99` is never
imported.

- **Nurses (`60`) are imported for their self-employed practice only**: a
  `Personne_activite` line of a nurse is kept only when its practice mode is
  `L` (libéral). Hospital, care home or health center employees are left out
  (patients do not book them), so a nurse without any self-employed activity
  is not imported at all, and one who also works at a hospital is listed at
  their own practice only. This is `liberalOnly` on the profession entry,
  checked by `activityInScope`. Physicians, dental surgeons and midwives keep
  every activity, salaried ones included.
- **`69` (infirmier psychiatrique) is not imported by default.** It is a
  retired code: the psychiatric nursing diploma was merged into the single
  nursing state diploma in 1992, so nurses are registered as `60`. An
  operator can still add it (`ETL_PROFESSIONS=10,40,50,60,69`); it then lists
  under its own slug, self-employed activities only.
- `stats.taxonomy.outOfScopeLines` counts the skipped lines of mapped
  professions outside the list (by code), and `stats.taxonomy.notLiberalLines`
  the lines of nurses left out because they are not self-employed.

**Changing the list.** The volume guards (file size, staging rows, RPPS per
profession) only compare a run with the last success of the **same**
profession list, so the first run with a new profession is not blocked by the
volume it adds; the next runs compare with it. The circuit breakers count
existing pages that would change or be unpublished, never new ones, so adding
a profession (over 100,000 self-employed nurses for France) passes them.
Removing one unpublishes its pages, which trips the 1% breaker unless it is a
small share: approve it with `--approve=<run_id>` once reviewed. A directory
that imported nurses before the self-employed-only rule loses their salaried
activities on the next run, which can also trip the breakers.

### `--department`

The whole file is still parsed and staged (absence detection and the volume
guards need it), but only practitioners with at least one structure in the
department are merged, with all their activities. A practitioner is never
"missing" just because they are outside the department.

### Indexing rule

`indexable` = active, not suppressed, profession in the import scope, and at
least one activity of kind `office`, `health_center` or `hospital` at a site
attached to a commune. People without a fixed place keep a record (they can
claim it from `/pro`) but no public page.

Landing pages exist from 1 practitioner, are indexable from 3 and are only
deindexed below 2. Lyon and Marseille get a city page grouping their
arrondissements; the Paris city page is its department page.

### Ameli strict matching

The Ameli file has no RPPS. Rows are grouped by normalized last name, first
name, commune (from the postcode, arrondissement first) and specialty code;
groups whose rows disagree on sector, OPTAM or Carte Vitale are dropped. A
group is stored on a practitioner only if it matches exactly one practitioner
(same normalized names, an active site in the same commune, a compatible
listing slug from `FR_AMELI_SPECIALTY_SLUGS`) and every group that practitioner
matches is unique to them and carries the same values. Ambiguous means nothing
is stored. Fields: `billing_sector` (`0` not contracted, `1`, `2` sector 1 with
permanent extra fees, `3` sector 2), `optam` (`optam`, `optam_aco`),
`carte_vitale`, `apcv`, `ameli_matched_at`.

Only physicians have sectors and OPTAM. For dental surgeons, midwives and
nurses, Ameli writes `1` as "Secteur 1 ou conventionné": pages print it as
"Conventionné" (`hasBillingSectors` in `@apercura/core/taxonomy`). Nurses
have one Ameli specialty code, `24`, compatible with every nurse listing slug;
rows of professions that are not imported are dropped before staging.

## Removed practitioners

Once a removal is confirmed (a GDPR art. 21 objection checked by an
administrator, or the owner of a claimed page removing it), only the
`directory.suppressions` row stays: country, id scheme, national id, reason
(`objection` or `owner`), who recorded it and when (#116).
`directory.purge_suppressed_practitioners` (migrations 0023 to 0025) deletes the rest
in the app's transaction: places of practice (and the sites nobody else links
to), qualifications, Ameli fields, owner content and photo, former slugs, the
page and search entry, page statistics, error reports, removal and contact
requests, claims on the page, and the person's lines in the last run's staging
and quarantine tables (a quarantined line when one of its fields is their RPPS
or national PP id). The row itself is deleted unless the owner's claim (who
may restore the page from their space) or a practice's agenda
(`care.calendars`) still holds it: that bare row keeps only its owner's
verified claim, is never published, and the next purge after nothing holds it
deletes it. The app refuses a removal while a run holds the import's lock (the
administrator or owner retries after the run), and leaves the listing counts
it could not rebuild to `jobs:tick landing-counts`. Every run calls the function over
all suppressions, and the import never stores their lines again.

To **withdraw an objection** (the practitioner asks for the page back), an
administrator deletes the suppression, then the next run recreates the page
from the registry (a new row, without the former owner content):

```sql
DELETE FROM directory.suppressions
WHERE country = 'FR' AND id_scheme = 'RPPS' AND national_id = '<RPPS>';
```

An owner restores their own removal from the page editor; the registry page
comes back with the next run. To honour an objection received outside the
site, insert the suppression (`reason = 'objection'`, `created_by` = who
decided): the next run deletes the page and its data.

## Data ownership

The import owns the registry columns and never touches practitioner data:
`practitioner_profiles`, `practitioner_slug_aliases`, `suppressions`,
`practitioners.slug` (after creation), `claim_status`, `owner_org_id`,
`next_free_at`, and `activities.hidden`. This is enforced by the database: the
`apercura_etl` role has column-level `UPDATE` grants on `practitioners` and
`activities` and only `SELECT` on practitioner-owned tables.

## Database roles

Migration `0004_database_roles` creates three `NOLOGIN` roles idempotently:

| Role                | Access                                              |
| ------------------- | --------------------------------------------------- |
| `apercura_app`      | read/write on `directory` and `care` (web app)      |
| `apercura_etl`      | `directory` only, table by table; nothing on `care` |
| `apercura_readonly` | read-only on both schemas (support, audits)         |

Migration `0016_retention_and_closures` adds a fourth, `apercura_jobs`, with no
table privilege at all: it may only call `care.purge_audit_events()` (the
audit log retention of `jobs:tick`, `DATABASE_URL_JOBS`). The read-only role
does not read the address and browser of practitioner sessions.

Passwords are never set in migrations. Set them once per environment, with a
superuser or the database owner:

```sql
ALTER ROLE apercura_etl WITH LOGIN PASSWORD '<generated secret>';
ALTER ROLE apercura_app WITH LOGIN PASSWORD '<generated secret>';
ALTER ROLE apercura_jobs WITH LOGIN PASSWORD '<generated secret>';
```

then use `DATABASE_URL_ETL=postgres://apercura_etl:…@host/db` for the import.
On a managed database where the migration user cannot `CREATE ROLE`, create
the four roles beforehand (the migration then only applies the grants). New
directory tables are not visible to `apercura_etl` until a migration grants
them explicitly (there are no default privileges for that role on purpose).
The grants use the `MAINTAIN` privilege, so PostgreSQL 17 or later is required.

## Scheduled task (Clever Cloud)

The import runs inside the HDS perimeter, so database credentials never leave
it. It uses the same build as the web app.

1. Create a **Clever Task** application from the same repository (Node.js/Bun
   runtime) whose run command is `bun run etl:fr`, in the Paris zone, attached
   to the same PostgreSQL add-on. Give it only these environment variables:
   `DATABASE_URL_ETL` (role `apercura_etl`), `APP_URL`, `REVALIDATE_SECRET`,
   `ETL_PROFESSIONS` (default `10,40,50,60`) and optionally `ETL_WORK_DIR`.
   Size it for the measured peak memory below plus headroom; the task needs
   about 1.2 GB of temporary disk for the downloads.
2. Clever Tasks do not run `clevercloud/cron.json` themselves: the web app's
   `clevercloud/cron.json` restarts the task every Monday at 03:00 UTC
   through `clevercloud/cron/etl-weekly.sh` (Clever Tools, with a token
   restricted to that task and `ETL_TASK_APP_ID`). Step by step in
   [deploy-clever-cloud.md](./deploy-clever-cloud.md#6-import-task).
3. Alert when a run fails or is blocked (non-zero exit code: `1` failed, `2`
   blocked) and when the last `succeeded` row of `etl_runs` is older than nine
   days.

A blocked run is resolved by an operator: read `etl_runs.guards` and
`stats.blockedExamples`, then run `bun run etl:fr --approve=<run_id>` once.

Self-hosting: `docker/compose.selfhost.yml` runs the import on demand
(`docker compose … run --rm etl --department 75`) and weekly from its
`scheduler` service, with the `apercura_etl` role (see
[self-hosting.md](./self-hosting.md#first-import)). A single department imports
in a few minutes.

## Measured run (department 75, 21/11/2026)

Laptop, local PostGIS 17, files of 19–21/11/2026, role `apercura_etl`:

|                      | First run                                                                                                                   | Rerun (`--force`, same files)    |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| Duration             | 255 s (114 s download)                                                                                                      | 159 s (84 s download), 0 changes |
| Peak RSS (OS)        | 822 MB                                                                                                                      | 815 MB                           |
| Practitioners merged | 34,784 (doctors 29,521, dentists 4,016, midwives 1,247)                                                                     | —                                |
| Indexable            | 28,930                                                                                                                      | —                                |
| Sites                | 20,528: 15,868 geocoded at the address, 658 at the street, 2,418 from FINESS+, 1,580 at the commune centroid, 4 not located | —                                |
| Ameli matched        | 11,117                                                                                                                      | —                                |
| Cache tags           | 97,709 (sent as coarse tags)                                                                                                | 0                                |

The first online run after migration `0015_geocoder_labels` geocodes every
cached address again for its label and changes the street line of many pages,
so it is usually blocked by the 10% breaker: review it and approve it with
`--approve=<run_id>`.

These figures predate nurses in the default scope: expect a longer merge and
geocoding step on the first run with them (new sites), and more practitioners
per department.

An unchanged run stops after the download (`skipped`, 101 s, 121 MB). The
whole file is parsed and staged even with `--department`, so memory and
parsing time are about the same for a full-France run; the merge grows with
the number of practitioners.

## Local development and CI

```sh
POSTGRES_PORT=5433 docker compose -f docker/compose.yml up -d postgres
bun run db:migrate
bun run etl:fr --source-dir packages/etl/fixtures/fr --offline     # synthetic data
ETL_TEST_DATABASE_URL=postgres://… bun run --cwd packages/etl test  # destructive: use a throwaway DB
```

`packages/etl/fixtures/fr` holds **synthetic** files in the exact source
formats (same 56-column header, Luhn-valid RPPS in the unused `1999999…`
range, made-up names, ARCEP fiction phone numbers), generated by
`packages/etl/fixtures/generate.ts`. The place files are a small subset of the
public geo.api.gouv.fr data. Never commit real registry rows.

The CI `etl` job applies the migrations to a PostGIS service, runs
`etl:fr --dry-run` on the fixtures, then the integration test (an import
without nurses, then one with them that no guard blocks and that leaves their
salaried activities out, import twice with zero changes the second time,
truncated file, removal after two runs, circuit breaker and `--approve`, suppressed lines dropped before staging
and only the suppression left through two imports, the page back once it is withdrawn, owner data untouched, street
labels from a local mock of the geocoder). Dry runs
commit nothing but the places reference data, imported before the merge when
the table is empty.

## Austria

`etl:at` builds Austria's directory (`/at`) from the open data of three Länder
(issue #107, [ADR 0002](./adr/0002-multi-country.md#austria-at)). Everything
above about roles, ownership, the outbox and `--approve` applies; this section
says what differs.

```sh
bun run etl:places --country at           # once (etl:at does it on its first run), then yearly
bun run etl:at                            # weekly (Vienna, Styria, Salzburg)
bun run etl:at --sources wien,stmk        # some lists only
bun run etl:at --dry-run                  # everything, then roll back
bun run etl:at --approve=<run_id>         # accept what a blocked run reported
```

### Sources

Verified on 25 November 2026 on data.gv.at, each publisher's catalogue and its
terms of use. All are under **CC BY 4.0**; the attribution each publisher asks
for is printed word for word on the data sources page (`/at/daten`) and kept in
`austria.registries` (`packages/core/src/country/at.ts`).

| List (`--sources`)             | Distribution                                                                                                                                                                                      | Format, update                                                                                                      | Attribution                                                       |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Vienna (`wien`)                | `https://data.wien.gv.at/daten/geo?service=WFS&request=GetFeature&version=1.1.0&typeName=ogdwien:ARZTOGD&srsName=EPSG:4326&outputFormat=json`                                                     | GeoJSON, WGS 84, daily ("die Daten stammen von der Ärztekammer für Wien", geocoded to the address)                  | `Datenquelle: Stadt Wien – data.wien.gv.at`                       |
| Styria (`stmk`)                | `https://service.stmk.gv.at/ogd/OGD_Data_ABT17/geoinformation/Niedergelassene_Aerzte.zip`                                                                                                         | point shapefile in a ZIP, ETRS89 degrees; modified 31 October 2026, file of 21 November 2026                        | `Datenquelle: CC-BY-4.0: Land Steiermark - data.steiermark.gv.at` |
| Salzburg (`sbg`)               | `https://www.salzburg.gv.at/ogd/8bd69af0-d42a-4777-beb6-1e8e87145a23/Aerzte.json`                                                                                                                 | ArcGIS JSON, EPSG:31258; "nach Bedarf", modified 12 June 2026 (list of the Ärztekammer für Salzburg)                | `Datenquelle: Land Salzburg – data.salzburg.gv.at`                |
| Salzburg dentists (`sbg-zahn`) | `https://www.salzburg.gv.at/ogd/90dd469f-9c41-49c4-aa86-cdf02ebaa1e0/Zahnaerzte.json`                                                                                                             | ArcGIS JSON, EPSG:31258; "nach Bedarf", modified 12 June 2026 (list of the Zahnärztekammer)                         | `Datenquelle: Land Salzburg – data.salzburg.gv.at`                |
| Places                         | `https://www.statistik.gv.at/gs-open/GEODATA/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=GEODATA:STATISTIK_AUSTRIA_GEM_MP_20260101&outputFormat=application/json&srsName=EPSG:4326` | GeoJSON, the population-weighted centre of each Gemeinde ("Gemeinden – Schwerpunkte"), boundaries of 1 January 2026 | `Datenquelle: Statistik Austria - data.statistik.gv.at`           |

The URLs can be overridden with `ETL_AT_WIEN_URL`, `ETL_AT_STMK_URL`,
`ETL_AT_SBG_URL`, `ETL_AT_SBG_ZAHN_URL` and `ETL_AT_PLACES_URL` (next year's
boundaries: `…GEM_MP_20270101…`). Every other candidate (the other six Länder,
the chambers, the social insurance) and why it is not imported:
[`docs/data-requests/at.md`](./data-requests/at.md).

### Identifiers and deduplication

No Austrian list publishes a national number, so each list is its own
identifier scheme (`directory.practitioners.id_scheme`), with a letter in the
page URL (`/at/arzt/{vorname-nachname}-{letter}{number}`):

| Scheme    | URL  | Key                                                                                                                                                     |
| --------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AT-WIEN` | `w`  | The doctor number in the chamber's practice links (`https://praxisplan.at/{doctor}/{name}/ordination/{practice}`): one number, one name across the file |
| `AT-STMK` | `st` | `ARZTNR`, the doctor number of the Styrian list                                                                                                         |
| `AT-SBG`  | `sb` | Derived: FNV-1a of the normalized family name, first name and gender, folded to 9 digits (`atNameKey`)                                                  |
| `AT-SBGZ` | `sz` | Derived the same way from the dentist's name (the list has no gender)                                                                                   |

Within a list, every row of one key (several practices, several specialties)
is one practitioner with one site per practice and one activity per practice.
A Salzburg name change gives a new key, so a new page (the old one is removed
after two runs, as an absence); two different names that would derive one key
are counted in `stats.taxonomy.keyCollisions` and the second one is left out.
Two Salzburg doctors with the same names and gender would be merged into one
page: none in the list of June 2026 (1,276 distinct people for 1,523 rows).

Across lists there is no merge: a doctor who practises in Vienna and in Styria
has two pages, one per list. The lists share no identifier, and names alone
are not enough to say two rows are one person.

### Places and precision

The lists ship address-level coordinates, so **nothing is geocoded** and no
geocoder is called: Vienna's points are geocoded by the city from the chamber's
addresses, Styria's carry the address register code (`ADRCODE`), Salzburg's
the address code (`ADRCD`) and EPSG:31258 points that PostGIS transforms to
WGS 84. A site is stored with `geo_source = 'source'` and `geo_precision =
'address'`; a site without a point would take its Gemeinde's centre
(`centroid`, `city`): none in the files of November 2026.

Places (`directory.places`, `country = 'AT'`): the nine Bundesländer are
departments (`/at/allgemeinmedizin/steiermark`), each Gemeinde a commune of its
Bundesland (`/at/allgemeinmedizin/steiermark/graz`), the Gemeinde Wien (90001)
a commune whose 23 districts are arrondissements
(`/at/allgemeinmedizin/wien/alsergrund`); like Paris, Vienna's city page is its
Bundesland's. A practice is placed:

1. in Vienna, by the district its address starts with (`09., …` → 1090,
   Wien-Alsergrund);
2. elsewhere, in the only Gemeinde of its Bundesland named like its town
   (`Graz`);
3. else in the Gemeinde whose centre is nearest to the practice (a postal
   town that is not a Gemeinde, `Feldkirchen` → Feldkirchen bei Graz).

Checked on the Styrian list of November 2026: 3,623 practices by name, 460 by
the nearest centre, of which 8 land in a neighbouring Gemeinde of the one the
postcode would give (border cases). Less than 2% of practices without a place
blocks the run (`at.places`, approvable).

### Guards

Per list, before the merge (`AT_LIMITS` in `src/guards.ts`):

- the file is between 1 KB and 100 MB, parses (JSON, ZIP, shapefile) and
  matches its schema (`zod`); otherwise the list is **left out** of the run;
- at most 1% of its records quarantined, and at least a floor of rows (Vienna
  1,000, Styria 500, Salzburg 300, dentists 50): otherwise left out (never
  approvable: a broken file, not an unusual one);
- at most 5% more or fewer people and 15% more or fewer bytes than the last
  successful run that loaded the list: otherwise the run is **blocked**
  (approvable with `--approve`).

A list left out keeps all its rows: its people are neither updated nor counted
missing, and the command exits with code **3** (`stats.sourceErrors` says
why); the other lists are imported. After the merge, the circuit breakers and
the orphan check of France apply to Austria's own pages only
(`refresh_practitioner_pages(run, NULL, 'AT')`).

Records skipped on purpose (`stats.sources.{list}.skipped`): Styrian rows
without a street or postcode (18 in November 2026).

### Specialties

`FACH` labels are read by `atSpecialtyCodeOf` (`packages/core/src/taxonomy/at.ts`):
the Styrian `AM - `/`FA - ` prefixes are dropped, `u.` reads `und`, known
typos are corrected, and each label becomes a specialty code
(`innere-medizin-und-kardiologie`) mapped to a German listing slug
(`kardiologie`). A doctor with a specialty and general practice is listed as
the specialist. "Approbierte Ärztin/Approbierter Arzt" and "unbekannt" are
listed under `aerzte`, dentists under `zahnaerzte`. An unknown label is listed
under `aerzte` and reported (`stats.taxonomy.unknownSpecialties`, and a
"Taxonomy alert" line): add it to the taxonomy.

### Schedule and monitoring

The scheduler runs `etl:at $ETL_AT_SCHEDULE_ARGS` every Monday at 05:30 UTC,
after France's import (`docker/crontab`; one advisory lock for both). Alert on
exit codes 1 (failed), 2 (blocked) and 3 (a list left out), and on the import
age, per market and per list:

```sql
-- Days since each market's last successful import (alert above 9).
SELECT source AS market, max(finished_at) AS last_success,
	extract(day FROM now() - max(finished_at))::integer AS age_days
FROM directory.etl_runs
WHERE status IN ('succeeded', 'skipped') AND source IN ('fr', 'at')
GROUP BY source;

-- Days since each Austrian list was last loaded (alert above 9).
SELECT list, max(r.finished_at) AS last_loaded,
	extract(day FROM now() - max(r.finished_at))::integer AS age_days
FROM directory.etl_runs r
CROSS JOIN LATERAL jsonb_object_keys(r.stats -> 'sources') AS list
WHERE r.source = 'at' AND r.status = 'succeeded'
	AND NOT coalesce(r.stats -> 'sourceErrors' ? list, false)
GROUP BY list;
```

A `skipped` run (lists unchanged) counts as fresh for the market; a list whose
publisher stops updating it shows in the second query only once its file
changes again, so also watch `etl_runs.files.{list}.lastModified`.

### Measured run (files of 21–25 November 2026)

Laptop, local PostGIS 17 under emulation, first run on an empty database:

|               |                                                                             |
| ------------- | --------------------------------------------------------------------------- |
| Duration      | 13 s (places 0.4 s, read models 5 s), rerun with `--force`: 0 changes       |
| Practitioners | 10,377: Vienna 6,100, Styria 2,656, Salzburg 1,276 doctors and 345 dentists |
| Practices     | 12,384, all located at the address and placed                               |
| Listing pages | 2,175, of which 896 indexable (46 country-wide)                             |
| Quarantined   | 0                                                                           |

### Local development

```sh
bun run etl:at --source-dir packages/etl/fixtures/at --offline   # synthetic data
bun run --cwd packages/etl fixtures:at                           # regenerate the fixtures
```

`packages/etl/fixtures/at` holds **synthetic** files in the exact formats of
the four lists and of the Gemeinde layer (a few real Gemeinde codes and names
with approximate centres), generated by `packages/etl/fixtures/generate-at.ts`:
made-up names, streets that do not exist, phone numbers whose subscriber part
starts with 0 (never assigned in Austria), doctor numbers far above the real
lists'. Never commit real rows. `test/at-integration.test.ts` imports them
next to the French fixtures: France untouched, idempotence, places, read
models, a list left out, absences, objections, the breaker and `--approve`.
