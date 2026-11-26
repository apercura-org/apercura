# Open data import

`packages/etl` builds the public directory from open data: France (this page,
first), Austria ([below](#austria)), the United Kingdom
([below](#united-kingdom)), Czechia ([below](#czechia)) and Italy
([below](#italy)). It is a Bun CLI that runs as a
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
WHERE status IN ('succeeded', 'skipped') AND source IN ('fr', 'at', 'gb')
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

## United Kingdom

`etl:gb` builds the UK's directory (`/gb`) from the NHS organisation data of
the four nations (issue #125, [ADR 0002](./adr/0002-multi-country.md#united-kingdom-gb)).
Everything above about roles, ownership, the outbox and `--approve` applies, and
the per-list behaviour is Austria's; this section says what differs.

```sh
bun run etl:places --country gb           # once (etl:gb does it on its first run), then yearly
bun run etl:gb                            # weekly (England, Wales, Scotland, Northern Ireland)
bun run etl:gb --sources ods-gp,ods-branches   # some lists only
bun run etl:gb --dry-run                  # everything, then roll back
bun run etl:gb --approve=<run_id>         # accept what a blocked run reported
```

The UK pages list **practices, not people**: GP practices, dental practices and
pharmacies. The Open Government Licence (OGL v3.0) under which every source is
published "does not cover personal data", and the registers of individual
clinicians (GMC, GDC, NMC) are not open data
([`docs/data-requests/gb.md`](./data-requests/gb.md)).

### Sources

Verified on 25 November 2026 on each publisher's portal (ODS Data Search and
Export, opendata.nhs.scot, OpenDataNI, the OS Downloads API, the ONS Open
Geography portal). All are under the **Open Government Licence v3.0**; the
attribution statement of each is printed word for word on the data sources page
(`/gb/data`) and kept in `unitedKingdom.registries`
(`packages/core/src/country/gb.ts`).

| List (`--sources`)                       | Distribution                                                                                                                                                                       | Format, update                                                                                                                                                                |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| England and Wales GP (`ods-gp`)          | `https://www.odsdatasearchandexport.nhs.uk/api/getReport?report=epraccur`                                                                                                          | headerless CSV, 27 columns; "refreshed at 2am each night"; GP practices are the active rows with role `RO76` in column 26                                                     |
| Branch surgeries (`ods-branches`)        | `…getReport?report=ebranchs`                                                                                                                                                       | same layout; the parent practice's code in column 15; open branches only (no close date)                                                                                      |
| England and Wales dental (`ods-dent`)    | `…getReport?report=egdpprac`                                                                                                                                                       | same layout; NHS Dental Services sends ODS monthly extracts                                                                                                                   |
| England and Wales pharmacy (`ods-pharm`) | `…getReport?report=edispensary`                                                                                                                                                    | same layout; primary role `RO182` (pharmacy), `RO94` (appliance contractor) left out                                                                                          |
| Scotland GP (`phs-gp`)                   | latest CSV of `https://www.opendata.nhs.scot/api/3/action/package_show?id=gp-practice-contact-details-and-list-sizes`                                                              | CSV with a header, quarterly ("GP Practices and List sizes October 2026")                                                                                                     |
| Scotland dental (`phs-dent`)             | latest CSV of `…package_show?id=dental-practices-and-patient-registrations` named "Dental Practices …"                                                                             | CSV with a header, quarterly ("Dental Practices March 2026"); `CA` is the council area (ONS `S12` code)                                                                       |
| Scotland pharmacy (`phs-pharm`)          | latest CSV of `…package_show?id=dispenser-location-contact-details`                                                                                                                | CSV with a header, monthly ("Dispenser Details - August 2026"); `NA` for an empty line                                                                                        |
| Northern Ireland GP (`bso-gp`)           | latest CSV of `https://admin.opendatani.gov.uk/api/3/action/package_show?id=gp-practice-list-sizes` named "… Reference File …"                                                     | CSV with a header, quarterly ("GP Practice Reference File - July 2026"); `PracticeName` is the partners' names, never used                                                    |
| Northern Ireland dental (`bso-dent`)     | latest CSV of `…package_show?id=general-dental-services-statistics` named "… Surgery List …"                                                                                       | CSV with a header, quarterly ("Dental Surgery List September 2026"), Windows-1252 in places; the "Dentist Contractor List" of the same dataset names dentists and is not read |
| Postcodes                                | `https://api.os.uk/downloads/v1/products/CodePointOpen/downloads?area=GB&format=CSV&redirect`                                                                                      | Code-Point Open ZIP (14 MB), one headerless CSV per postcode area, British National Grid, quarterly                                                                           |
| Towns                                    | `https://api.os.uk/downloads/v1/products/OpenNames/downloads?area=GB&format=CSV&redirect`                                                                                          | OS Open Names ZIP (100 MB), places import only: the cities, towns and villages (`populatedPlace`), quarterly                                                                  |
| Local authorities                        | ONS feature services `WD26_LAD26_CTYUA26_RGN26_CTRY26_UK_LU` (lookup) and `LAD_DEC_2026_UK_BFC` (boundaries, GeoJSON)                                                              | places import only; yearly vintages (`LAD26CD`, next year `LAD27CD`: the reader takes any vintage)                                                                            |
| Northern Ireland towns                   | `https://admin.opendatani.gov.uk/dataset/d27903f1-15e6-4c07-8564-ddc655e9c549/resource/411c6ea5-c079-43aa-bd62-438423d070cc/download/osni_open_data_-_gazetteer_-_place_names.csv` | OSNI gazetteer, 336 towns and villages, Irish Grid, published 2015; places import only                                                                                        |

A CKAN dataset publishes a new file per period, and its portal uploads several
periods the same day: the import takes the CSV resource whose **name** gives the
latest month (`periodOfName`), then the most recently created. The URLs can be
overridden with `ETL_GB_{SOURCE}_URL` (`ETL_GB_ODS_GP_URL`, `ETL_GB_PHS_DENT_URL`…),
`ETL_GB_POSTCODES_URL`, `ETL_GB_LAD_LOOKUP_URL`, `ETL_GB_LAD_BOUNDARIES_URL`,
`ETL_GB_TOWNS_URL` and `ETL_GB_NI_TOWNS_URL` (next year's ONS vintage:
`…WD27_LAD27…`, `…LAD_DEC_2027…`).

Not imported, and why: Public Health Scotland's "General Practitioner Contact
Details" (individual GPs with their GMC number) and the BSO's "Dentist
Contractor List" name people; the NHS Service Search API needs onboarding and a
connection agreement; Northern Irish postcode coordinates are licensed by Land &
Property Services. All in [`docs/data-requests/gb.md`](./data-requests/gb.md).

### Identifiers

Each list is its own identifier scheme (a list that fails keeps its rows), and
the page URL ends with its key (`/gb/practice/{name}-{key}`):

| Scheme         | URL key   | Key                                                                                          |
| -------------- | --------- | -------------------------------------------------------------------------------------------- |
| `GB-ODS-GP`    | `a81001`  | ODS code of the GP practice, a letter and 5 digits (never `V`)                               |
| `GB-ODS-DENT`  | `v00003`  | ODS code of the dental practice, `V` and 5 or 6 digits                                       |
| `GB-ODS-PHARM` | `fm474`   | ODS code of the pharmacy, `F` and 4 characters                                               |
| `GB-PHS-GP`    | `sg10002` | Public Health Scotland's practice code                                                       |
| `GB-PHS-DENT`  | `sd2`     | Public Health Scotland's dental practice code                                                |
| `GB-PHS-PHARM` | `sp1030`  | Public Health Scotland's dispenser code                                                      |
| `GB-BSO-GP`    | `ng1`     | the BSO's practice number                                                                    |
| `GB-BSO-DENT`  | `nd…`     | derived: 10 hex digits of the SHA-256 of the normalized address and postcode (`niDentalKey`) |

A branch surgery is a site of its GP practice (one activity per site), not a
practice of its own; a branch whose parent is not an imported practice is left
out (`stats.batch.orphanBranches`). A Northern Irish dental surgery that moves
gets a new key, so a new page; the old one is removed after two runs.

### Minimisation and what is left out

- **Practices named after a person** (`DR A EXAMPLE & PARTNERS`, `MR B SAMPLE`,
  `Drs Demo, Test & Mock`: a personal title, a partners formula, initials and a
  surname alone, or a list of names without any organisation word,
  `namesAPerson` in `sources/gb/names.ts`) are shown under the first address
  line that names premises (`Falls Road Surgery`), else their street, else their
  town. The published name is **never stored**, not even as the "source" name;
  `stats.sources.{list}.minimised` counts them. Nearly every Northern Irish GP
  practice is published under its partners' names: its own name is its first
  address line.
- Quarantined lines keep their **code only** (never a name).
- Left out (`stats.sources.{list}.skipped`): inactive and closed practices,
  prescribing cost centres that are not GP practices, appliance contractors,
  services inside prisons and immigration removal centres (`HMP`, `HMYOI`…), and
  the practices of the Isle of Man, Guernsey and Jersey (`IM`, `GY`, `JE`
  postcodes: the ODS lists include them, the UK does not).
- GDPR objections: the lines of a suppressed key are dropped while parsing, and
  the purge of #116/#118 runs in the merge, as in France and Austria.

Names and addresses are printed in British English case (`titleCaseGb`:
`Stockton-on-Tees`, `St John's`, `McCann`, `NHS`), the legacy abbreviations
spelled out (`MEDICAL CTR` → `Medical Centre`); phone numbers are stored in
E.164 and printed the UK way (`formatPhoneGb`: `020 7946 0000`, `01642 672351`).

### Places and precision

Places (`directory.places`, `country = 'GB'`), imported once:

- **regions**: England's nine regions and the three other nations
  (`GB_REGIONS`, ONS codes); the UK's listings exist per region too (migration
  `0026_gb_market`): `/gb/gp-practices/north-east`, `/gb/gp-practices/wales`;
- **departments**: the 361 local authority districts (`E06000004`), their region
  from the ONS lookup and their centre from the ONS boundaries;
- **communes**: the cities, towns and villages of OS Open Names, and the OSNI
  gazetteer's towns, each in the authority whose boundary holds it (else the
  nearest within 3 km: a harbour on a simplified coastline); of two homonyms in
  one authority, the larger is kept. No arrondissements.

A site is located by its postcode (Code-Point Open, British National Grid
transformed by PostGIS): `geo_source = 'postcode'`, `geo_precision = 'street'`
(a postcode is the mean of about 15 addresses: never shown as if at the door).
It is placed (`stageGb` in `src/merge-gb.ts`):

1. in a local authority: the list's own (Scottish council areas), else the
   postcode's, else the Northern Irish district the dental list names, else the
   district the dental list's surgeries of the same postcode district all name
   (`BT20` → Ards and North Down);
2. in the town of that authority named like the address's post town, else like
   one of its locality lines; without an authority (Northern Ireland, a postcode
   too new for Code-Point Open), the only town of the nation with that name;
3. else in the authority's town nearest to the postcode, within 3 km;
4. else in the authority itself (London's boroughs list their practices there).

Northern Irish postcodes cannot be located with open data: a practice there
takes its town's centre (`geo_source = 'centroid'`, `geo_precision = 'city'`, no
map pin). The town is not printed twice: an address line ending with the town
the site is listed in loses it.

### Guards

Per list, before the merge (`GB_LIMITS` in `src/guards.ts`), as Austria's:

- the file is between 1 KB and 100 MB and parses (27 columns for ODS, the
  expected header columns elsewhere); otherwise the list is **left out**;
- at most 1% of its lines quarantined, and at least a floor of rows, about 5%
  of the November 2026 files (ODS GP 300, branches 100, ODS dental and
  pharmacies 500, Scotland 40, 50 and 60, Northern Ireland 15 and 15): otherwise
  left out (never approvable). The floor catches an empty or broken file on a
  first run; afterwards the 5% change below blocks a truncated one;
- at most 5% more or fewer practices and 15% more or fewer bytes than the last
  successful run that loaded the list: otherwise **blocked** (approvable).

After staging: less than 98% of the sites placed in a local authority
(`gb.places`) or less than 97% of the sites of Great Britain located by postcode
(`gb.postcodes`) blocks the run (approvable). After the merge, the circuit
breakers and the orphan check apply to the UK's own pages only. A list left out
keeps its rows, and the command exits with code **3**.

### Schedule and monitoring

The scheduler runs `etl:gb $ETL_GB_SCHEDULE_ARGS` every Monday at 06:30 UTC,
after Austria's import (`docker/crontab`; one advisory lock for every import).
Alert on exit codes 1, 2 and 3 and on the import age, per market (the market
query of [Austria's monitoring](#schedule-and-monitoring) covers `gb`) and per list:

```sql
-- Days since each UK list was last loaded (alert above 9), and its practices then.
SELECT list, max(r.finished_at) AS last_loaded,
	extract(day FROM now() - max(r.finished_at))::integer AS age_days,
	(array_agg((r.stats -> 'sources' -> list ->> 'people')::integer ORDER BY r.id DESC))[1] AS practices
FROM directory.etl_runs r
CROSS JOIN LATERAL jsonb_object_keys(r.stats -> 'sources') AS list
WHERE r.source = 'gb' AND r.status = 'succeeded'
	AND NOT coalesce(r.stats -> 'sourceErrors' ? list, false)
GROUP BY list;

-- The UK's last runs: status, lists left out, placement and totals.
SELECT id, status, finished_at, stats -> 'sourceErrors' AS left_out,
	stats -> 'staged' AS staged, stats -> 'totals' AS totals
FROM directory.etl_runs WHERE source = 'gb' ORDER BY id DESC LIMIT 5;
```

The Scottish and Northern Irish lists are quarterly: their file changes four
times a year, so watch `etl_runs.files.{list}.resource` (the resource name, with
its period) as well.

### Measured run (files of 25 November 2026)

Laptop, local PostGIS 17 under emulation, dry run on a fresh database with the real
files (the run quoted in the pull request):

|             |                                                                                                                                                                                       |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Duration    | 167 s in all: places 144 s (OS Open Names, once), postcodes 13–37 s, merge and read models about 20 s; a weekly run takes about 35 s                                                  |
| Memory      | peak RSS 1.1 GB on the first run (the places), about 300 MB on a weekly run                                                                                                           |
| Practices   | 31,240: ODS GP 6,558, ODS dental 9,712, ODS pharmacies 11,109, PHS GP 879, PHS dental 986, PHS pharmacies 1,345, BSO GP 304, BSO dental 347                                           |
| Left out    | 93 secure settings (prisons, removal centres), 42 practices of the Crown Dependencies, 116 appliance contractors, 60 branch surgeries of a practice that is not an active GP practice |
| Minimised   | 891 practices named after a person, shown under their premises or street (ODS 161 GP, 214 dental, 77 pharmacies; PHS 78, 16, 47; BSO GP 298)                                          |
| Sites       | 33,733 (2,493 branch surgeries), 33,027 located by postcode, 685 at their town's centre (Northern Ireland), 33,712 placed (99.9%), 28,680 in a town                                   |
| Indexable   | 31,219 practices (7,727 GP practices, 11,039 dental practices, 12,453 pharmacies); 3,380 indexable listing pages of 7,152                                                             |
| Places      | 12 regions, 361 local authorities, 16,854 towns                                                                                                                                       |
| Quarantined | 1 line (a Scottish dispenser without a valid postcode)                                                                                                                                |

### Local development

```sh
bun run etl:gb --source-dir packages/etl/fixtures/gb --offline   # synthetic data
bun run --cwd packages/etl fixtures:gb                           # regenerate the fixtures
```

`packages/etl/fixtures/gb` holds **synthetic** files in the exact formats of the
nine lists, of Code-Point Open (one CSV of the archive), OS Open Names (one CSV),
the OSNI gazetteer and the ONS lookup and boundaries (real authority codes and
town names with approximate points and square boundaries), generated by
`packages/etl/fixtures/generate-gb.ts`: made-up practices and "persons", streets
that do not exist, postcodes ending in `Z` letters, codes in ranges the real
lists do not use, phone numbers in Ofcom's drama ranges, and fillers above the
row floors. Never commit real rows. `test/gb-integration.test.ts` imports them
next to the French and Austrian fixtures: the other markets untouched both ways,
no person's name stored, placement (postcode, town, nearest town, local
authority, Northern Ireland by town), region listings, idempotence, a dry run, a
list left out (and branch surgeries kept when only their report fails),
absences, objections, the breaker and `--approve`.

## Czechia

`etl:cz` builds Czechia's directory (`/cz`) from the National Register of
Healthcare Providers (issue #131, [ADR 0002](./adr/0002-multi-country.md#czechia-cz)).
Everything above about roles, ownership, the outbox and `--approve` applies; this
section says what differs.

```sh
bun run etl:places --country cz   # once (etl:cz does it on its first run), then yearly
bun run etl:cz                    # weekly (the register publishes monthly: an unchanged export is skipped)
bun run etl:cz --dry-run          # everything, then roll back
bun run etl:cz --approve=<run_id> # accept what a blocked run reported
```

A Czech page is a **facility** (zdravotnické zařízení) at its place of care, the
register's own unit: a general practitioner's or a specialist's practice, a
dental practice, a pharmacy, a home care agency. A facility of a sole trader is
published under the person's name (`MUDr. Jana Ukázková`): the page keeps the
name as the register publishes it (the Czech DPA allowed basic profiles in 2013;
see the ADR), and an objection removes it.

### Sources

Verified on 26 November 2026 on each publisher's page. Both are under
**CC BY 4.0**; their attribution is printed on the data sources page (`/cz/data`)
and kept in `czechia.registries` (`packages/core/src/country/cz.ts`).

| Source                                                                    | Distribution                                                                                                                                                              | Format, update                                                                                                                                            |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NRPZS: Místa poskytování zdravotních služeb (ÚZIS ČR, Ministry of Health) | `https://datanzis.uzis.gov.cz/data/NR-01-NRPZS/NR-01-06/Otevrena-data-NR-01-06-nrpzs-mista-poskytovani-zdravotnich-sluzeb.csv` (catalogue page: nzip.cz, dataset 1823)    | CSV with a header, 49 quoted columns, UTF-8, about 27 MB and 41,000 lines; "Aktualizace měsíční" (monthly, the file of November 2026 is dated 1 November) |
| RÚIAN, state file of the basic data set (ČÚZK)                            | `https://vdp.cuzk.gov.cz/vymenny_format/soucasna/{YYYYMMDD}_ST_UZSZ.xml.zip`, the last day of the previous month (then the month before, while the 1st's file is not out) | VFR 3.1 XML (GML 3.2) in a ZIP, 4.7 MB (51 MB inflated), monthly; definition points in EPSG:5514; places import only                                      |

`ETL_CZ_URL` and `ETL_CZ_PLACES_URL` override them. The NRPZS also has a search
application (nrpzs.uzis.cz); the bulk export is enough and is the one read.

### Identifiers

One scheme, `CZ-NRPZS`: the facility number `ZZ_ID` ("Jednoznačný identifikátor
zdravotnického zařízení"), and the page URL ends with it
(`/cz/zarizeni/mudr-jana-ukazkova-900001`). The site is the place of care
(`ZZ_misto_poskytovani_ID`), the activity `{ZZ_ID}@{place}`. The facility code
`ZZ_kod` is not used: it begins with the provider's company number (IČO).

### Minimisation and what is left out

- Read from a line: the facility number, name, kind and fields of care, the place
  of care (number, municipality, district, region, postcode, street and number,
  point) and the provider's phone number and legal type. **Never read into a
  row, so never stored**: the provider's IČO (and `ZZ_kod`), seat (a sole
  trader's home address), professional representative, e-mail, fax, data box,
  web address, date of activity, founder and legal form. The file holds no
  birth number.
- The provider's phone number is stored as the place's only when at most three
  lines of the file carry it (`MAX_PHONE_ROWS`): a chain prints its head office's
  number on every pharmacy (`stats.sources.nrpzs.counters.sharedPhones`).
- `stats.sources.nrpzs.counters.naturalPersons` counts the facilities of sole
  traders; quarantined lines keep their facility number only (never a name).
- Kinds imported (`CZ_FACILITY_KINDS` in `packages/core/src/taxonomy/cz.ts`):
  320 general practitioners, 321 paediatricians, 322 dentists, 323
  gynaecologists, 324 specialists (listed under their primary field of care,
  `primaryCzSpecialty`), 340 clinical psychologists, 341 speech therapists, 350
  home care, 351 physiotherapists, 353 midwives, 510 pharmacies. Every other kind
  is left out and counted by kind in `stats.sources.nrpzs.skipped`: hospitals and
  their wards, spas, laboratories and dental laboratories, opticians, ambulance
  and transport services, blood and plasma centres, social care homes, the
  outpatient centres of several fields (`301`, `302`), other non-physician
  facilities (`359`: mostly dental hygienists) and the rest. The register itself
  leaves out the facilities of the Ministries of the Interior and of Justice
  (prisons).
- Every field of care of a facility is stored as a qualification (`source =
'obor'`, the label as published).
- GDPR objections: the lines of a suppressed facility number are dropped while
  parsing (`stats.suppressedLines.nrpzs`), and the purge of #116/#118 runs in the
  merge, as in the other markets.

### Places and precision

Places (`directory.places`, `country = 'CZ'`), from RÚIAN, imported once:

- **regions**: the 14 kraje, coded by NUTS 3 (`CZ010`); no listing pages, they
  group the districts on the directory page (as France's regions);
- **departments**: the 76 okresy, coded by LAU 1 (`CZ0642`), and Prague, which has
  no district in RÚIAN, as `CZ0100` "Praha" (the code the register uses);
- **communes**: the 6,258 obce (RÚIAN code), centre = the definition point
  transformed to WGS 84 by PostGIS; a slug unique within the district (`pohled`,
  `pohled-573591`);
- **arrondissements**: Prague's 22 správní obvody (`Praha 1`…`Praha 22`, slug
  `praha-1`), whose city page, like Paris's, is the department's (migration
  `0027_cz_market` skips the municipality of Prague, 554782, as the parent of its
  districts).

A site takes the register's point (`ZZ_GPS`, `POINT(lat lng)`, latitude first;
`geo_source = 'source'`, `geo_precision = 'address'`). It is placed (`stageCz` in
`src/merge-cz.ts`):

1. in Prague, in the district the register names (`Praha 8`);
2. elsewhere, in the only municipality of the district with the register's
   municipality name, else the nearer of two that share it;
3. else in the nearest Prague district, or the nearest municipality of the
   district within 20 km;
4. else in the district itself.

A line without a point (0.2%) takes its municipality's centre (`geo_source =
'centroid'`, `geo_precision = 'city'`, no map pin).

### Guards

Before the merge (`CZ_LIMITS` in `src/guards.ts`):

- the file is between 10 KB and 300 MB and has the register's 49 columns;
  otherwise the run **fails** (one list: nothing is left out, the pages stay);
- at most 1% of its lines quarantined, at least 1,000 data lines and 300
  facilities imported (never approvable);
- at most 5% more or fewer facilities and 15% more or fewer bytes than the last
  successful run: otherwise **blocked** (approvable).

After staging: less than 98% of the sites placed in a municipality or a Prague
district (`cz.places`) or less than 97% located at the register's point
(`cz.points`) blocks the run (approvable). After the merge, the circuit breakers
and the orphan check apply to Czechia's own pages only.

### Schedule and monitoring

The scheduler runs `etl:cz $ETL_CZ_SCHEDULE_ARGS` every Monday at 07:30 UTC,
after the UK's import (`docker/crontab`; one advisory lock for every import).
Alert on exit codes 1 and 2 and on the import age (the market query of
[Austria's monitoring](#schedule-and-monitoring) covers `cz`): the export is
monthly, so a run is `skipped` most weeks and the age of the last `succeeded`
run can reach five weeks; alert above 40 days.

```sql
-- Czechia's last runs: status, file date, placement, minimisation and totals.
SELECT id, status, finished_at, files -> 'nrpzs' ->> 'lastModified' AS published,
	stats -> 'staged' AS staged, stats -> 'sources' -> 'nrpzs' -> 'counters' AS counters,
	stats -> 'totals' AS totals
FROM directory.etl_runs WHERE source = 'cz' ORDER BY id DESC LIMIT 5;

-- Days since the export last changed and was imported (alert above 40).
SELECT max(finished_at) AS last_import, extract(day FROM now() - max(finished_at))::integer AS age_days
FROM directory.etl_runs WHERE source = 'cz' AND status = 'succeeded';
```

### Measured run (files of 1 November 2026)

Laptop, local PostGIS 17 under emulation, fresh database, real downloads (the run
quoted in the pull request):

|              |                                                                                                                                                                                                                     |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Duration     | places 6 s (download included), peak RSS 0.3 GB; dry run 44 s (download 27 s), peak RSS 1.2 GB; a forced rerun of the same file 20 s, 1.0 GB; an unchanged week 0.1 s                                               |
| Lines        | 41,136: 33,173 facilities imported, 7,963 of kinds left out, 0 quarantined                                                                                                                                          |
| Facilities   | GP 5,324 · paediatricians 1,973 · dentists 5,616 · gynaecologists 1,627 · specialists 10,785 · pharmacies 2,527 · home care 949 · physiotherapists 2,767 · psychologists 702 · speech therapists 611 · midwives 292 |
| Sole traders | 13,373 facilities of a natural person                                                                                                                                                                               |
| Phones       | 15,221 sites with a number; 2,944 head-office numbers left out (shared by more than three lines)                                                                                                                    |
| Sites        | 33,173: 33,101 at the register's point (99.8%), 72 at their municipality's centre; 27,598 in a municipality, 5,571 in a Prague district, 4 in their district only                                                   |
| Indexable    | 33,173 facility pages; 4,318 indexable listing pages of 13,330                                                                                                                                                      |
| Places       | 14 regions, 77 districts (76 and Prague), 6,258 municipalities, 22 Prague districts                                                                                                                                 |

### Local development

```sh
bun run etl:cz --source-dir packages/etl/fixtures/cz --offline   # synthetic data
bun run --cwd packages/etl fixtures:cz                           # regenerate the fixtures
```

`packages/etl/fixtures/cz` holds a **synthetic** export in the register's exact
format (`nrpzs.csv`) and a small RÚIAN state file (`ruian-st-uzsz.xml`: the 14
regions, five districts, twelve municipalities and Prague's 22 districts, with
their real codes and definition points), generated by
`packages/etl/fixtures/generate-cz.ts`: made-up facilities and sole traders
(facility numbers from 900001, company numbers from 99), made-up streets, seats,
representatives and e-mails (to check they are never stored), a chain sharing a
head-office number, and lines of kinds left out above the line floor. Never commit
real rows. The anchors the end-to-end tests use: `900001` MUDr. Jana Ukázková
(GP, Praha 2), `900002` a pharmacy in Brno, `900003` a cardiologist's practice in
Ostrava, `900004` a dental practice without a street (Chocerady 15), `900005` a
physiotherapist objected to in the integration test. `test/cz-integration.test.ts`
imports them next to the French, Austrian and UK fixtures: the other markets
untouched both ways, nothing of the provider stored, placement (Prague districts,
municipality, nearest, centre), read models with Prague's city page skipped,
idempotence, a dry run, an unreadable export, absences, objections, the breaker
and `--approve`.

## Spain

`etl:es` builds Spain's directory (`/es`) from the General Register of health
centres, services and establishments (REGCESS, Ministerio de Sanidad; issue #148,
[ADR 0002](./adr/0002-multi-country.md#spain-es)). Everything above about roles,
ownership, the outbox and `--approve` applies; this section says what differs.

```sh
bun run etl:places --country es   # once (etl:es does it on its first run), then yearly
bun run etl:es                    # weekly (the register publishes monthly: unchanged extracts are skipped)
bun run etl:es --dry-run          # everything, then roll back
bun run etl:es --approve=<run_id> # accept what a blocked run reported
```

A Spanish page is a **centre** (centro or establecimiento sanitario), the
register's own unit: a hospital, a health centre or local surgery of the public
network, a doctor's practice, another health professional's practice, a
polyclinic, a dental clinic, a pharmacy. Many practices and most pharmacies are
registered under the professional's name (`DRA. ANA EJEMPLAR FICTICIA`, a
titular pharmacist): the page keeps the name as the register publishes it,
cased, as the data of a sole trader or liberal professional in that capacity
(LOPDGDD, art. 19.3), with the article 14 information on the privacy page, and an
objection removes it.

### Sources

Verified on 26 November 2026 on each publisher's page.

| Source                                                                                                          | Distribution                                                                                                                                                  | Format, update                                                                                                                                                                                     |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| REGCESS, monthly extracts (Ministerio de Sanidad)                                                               | `https://regcesslm.sanidad.gob.es/recesAdminWeb/lm/GetExcelListadoMensual?tipoListado={C1,C2,E}` (linked from the register's download page, regcess.mscbs.es) | XLSX, one worksheet, shared strings: `centros_C1.xlsx` 0.2 MB (929 hospitals), `centros_C2.xlsx` 18 MB (119,577 centres), `centros_E.xlsx` 5.6 MB (40,541 establishments); monthly, no date header |
| IGN, OGC API Features: `administrativeunit` (Líneas Límite Municipales) and `nuc` (IGR Poblaciones, INE nuclei) | `https://api-features.ign.es/collections/{administrativeunit,nuc}/items?f=json&limit=10000&skipGeometry=true`, following the `next` links                     | GeoJSON without geometry: 8,294 units (4 MB) and 37,497 population centres (26 MB, 4 pages); places import only                                                                                    |

The register's server answers a descriptive client (`apercura-etl …`, the import's
user agent); the old host regcess.mscbs.es refuses a bare browser user agent.
`ETL_ES_C1_URL`, `ETL_ES_C2_URL`, `ETL_ES_E_URL` and `ETL_ES_PLACES_URL` (the
API's base) override them. The services within centres (`C3`) are not read.

**Licences.** The Ministry's legal notice (sanidad.gob.es/avisoLegal, Ley
37/2007 on the reuse of public sector information) authorises reuse, commercial
or not, on three conditions: cite the source, give the date of the last update,
and not distort the data. Pages and the data sources page print "Fuente:
Ministerio de Sanidad, REGCESS, actualizado {date}" (the date of the import that
read the extracts). The IGN's data are under CC BY 4.0 (Orden FOM/2807/2015,
Condiciones_licenciaUso_IGN.pdf), attributed as a derived work: "Obra derivada de
Líneas Límite Municipales e IGR Poblaciones 2025 CC-BY 4.0 ign.es". Both are in
`spain.registries` (`packages/core/src/country/es.ts`). OpenStreetMap is not
used (ODbL share-alike).

### Identifiers

One scheme, `ES-REGCESS`: the normalised centre code `CCN` (ten digits, the
community's INE code first, `1328900001`), and the page URL ends with it
(`/es/centro/clinica-dental-ejemplo-centro-1328900001`). A centre has one site,
its address, keyed by the same code (`source` per extract: `es-regcess-c1`,
`es-regcess-c2`, `es-regcess-e`), and one activity `{CCN}@{CCN}`. The regional
code (`Código Autonómico`) is not used.

### Minimisation and what is left out

- Read from a row: the centre code, type, name, community, province and INE
  municipality codes, municipality name, type of way, street, number, postcode,
  phone, dependency group (public or private) and care units. **Never read into a
  row, so never stored**: e-mail, fax, web address, regional code, health area,
  functional dependency, authorisation dates, structural changes and beds. No
  per-person register (REPS, the colegios' lists) is read.
- A phone is stored as the centre's only when at most three rows of its extract
  carry it (`MAX_PHONE_ROWS`): a chain or a regional switchboard prints one
  number on many centres (`stats.sources.<extract>.counters.sharedPhones`);
  `000000000` stands for no number.
- Names and streets are in capitals without most accents: `titleCaseEs`
  (`src/sources/es/names.ts`) cases them (`Centro de Salud de Albatera`, `Calle
  Alcala, 10`, `S.L.`, `Dra.`); no accent is added.
- Types imported (`ES_CENTRE_TYPES` in `packages/core/src/taxonomy/es.ts`): C11
  to C14 hospitals, C231 health centres and C232 local surgeries (one listing,
  `centros-de-salud`), C21 doctors' practices and C22 other health professionals'
  practices (listed under their primary care unit, `primaryEsSpecialty`), C24
  polyclinics, C251 dental clinics, E1 pharmacies. Every other type is left out
  and counted by type in `stats.sources.<extract>.skipped`: other inpatient
  centres, mobile units, diagnostic, dialysis, assisted reproduction, day surgery,
  abortion, transfusion, tissue bank, mental health, medical examination and other
  specialised centres, other outpatient providers; first-aid kits, opticians,
  orthopaedic and hearing-aid shops.
- A practice of another profession whose only unit is "U.900 Otras unidades
  asistenciales" and whose name says psychology is listed with the
  psychologists (general health psychologists, whom the register files there):
  `stats.sources.regcess-c2.counters.psychologistsByName`.
- Every care unit of a centre is stored as a qualification (`source =
'oferta'`, `U.7` "Cardiología"), and its dependency (`source = 'dependencia'`,
  `PUBLIC` "Público" or `PRIVATE` "Privado").
- GDPR objections: the rows of a suppressed centre code are dropped while parsing
  (`stats.suppressedLines`), and the purge of #116/#118 runs in the merge, as in
  the other markets.

### Places and precision

Places (`directory.places`, `country = 'ES'`), from the IGN, imported once:

- **regions**: the 17 autonomous communities and Ceuta and Melilla (INE code
  `01`–`19`); no listing pages, they group the provinces on the directory page;
- **departments**: the 52 provinces (INE code `01`–`52`), slugged before the
  communities, so `cantabria` is the province and `cantabria-06` the community;
- **communes**: the 8,132 municipalities (INE code `28079`), a bilingual name's
  two forms slugged once when they read the same (`València/Valencia` →
  `valencia`), unique within the province; the shared territories (province `53`)
  are left out.

The register publishes **no coordinates**. A municipality's point is its capital
population centre's (the IGN's `nuc` with the municipality flag), else its most
populous centre's; 33 municipalities have none (8,099 of 8,132 located, 8,056 by
their capital). A site is placed (`stageEs` in `src/merge-es.ts`) in the
municipality of the register's INE code, else in its province, and located at the
municipality's point: `geo_precision = 'city'`, `geo_source = 'centroid'`, never
a map pin; a site whose municipality has no point has no location. Distances on
Spanish pages are therefore approximate, which the pages say. No geocoder is
called: addresses are not sent anywhere.

### Guards

Per extract (`checkEsSource`): quarantine within 1%, floors of lines and centres
(C1 50 and 30, C2 1,000 and 100, E 300 and 30; never approvable), and at most 5%
more or fewer centres and 15% more or fewer bytes than the last successful run
that read it (approvable). An extract that cannot be fetched, read or pass its
floors is left out and keeps its centres (its centres are not counted missing);
the run imports the others and exits `3`. After staging (`checkEsPlaces`): 99% of
the sites in their municipality and 98% at a point (approvable). Then the
breakers on Spain's own pages, as everywhere. A run that left an extract out
never makes the next one skip unchanged files.

### Schedule and monitoring

The scheduler runs `etl:es $ETL_ES_SCHEDULE_ARGS` every Monday at 08:30 UTC,
after Czechia's import (`docker/crontab`; one advisory lock for every import).
Alert on exit codes 1, 2 and 3 and on the import age: the extracts are monthly,
so most weeks are `skipped` and the age of the last `succeeded` run can reach
five weeks; alert above 40 days.

```sql
-- Spain's last runs: status, per-extract counters, placement and totals.
SELECT id, status, finished_at, stats -> 'sourceErrors' AS errors, stats -> 'staged' AS staged,
	jsonb_object_agg(k, v -> 'counters') AS counters, stats -> 'totals' AS totals
FROM directory.etl_runs, jsonb_each(coalesce(stats -> 'sources', '{}')) AS s (k, v)
WHERE source = 'es' GROUP BY id ORDER BY id DESC LIMIT 5;

-- Days since the extracts last changed and were imported (alert above 40).
SELECT max(finished_at) AS last_import, extract(day FROM now() - max(finished_at))::integer AS age_days
FROM directory.etl_runs WHERE source = 'es' AND status = 'succeeded';
```

### Measured run (extracts of 26 November 2026)

Laptop, local PostGIS 17, fresh database, the real extracts (downloaded once) and
the IGN's API (the run quoted in the pull request):

|           |                                                                                                                                                                                                             |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Duration  | places 41 s (download included); dry run 72 s (parse 2 s, read models 36 s), peak RSS 0.64 GB                                                                                                               |
| Lines     | C1 929 (881 imported), C2 119,577 (91,525), E 40,541 (22,389); 0 quarantined                                                                                                                                |
| Centres   | hospitals 881 · health centres 3,097 · local surgeries 9,920 · doctors' practices 12,366 · other professionals' 30,410 · polyclinics 12,892 · dental clinics 22,840 · pharmacies 22,389 (114,795)           |
| Listings  | dentistas 22,856 · farmacias 22,389 · centros-de-salud 13,017 · policlinicas 12,892 · fisioterapeutas 9,790 · psicologos 8,469 (7,061 by name) · otros-profesionales-sanitarios 5,051 · podologos 4,620 · … |
| Phones    | 95,293 sites with a number; 6,166 shared numbers left out (11 + 5,592 + 563)                                                                                                                                |
| Sites     | 114,795, all in their municipality; 114,778 at their municipality's point, 17 without one                                                                                                                   |
| Indexable | 114,795 centre pages; 8,178 indexable listing pages of 28,159                                                                                                                                               |
| Places    | 19 communities and cities, 52 provinces, 8,132 municipalities                                                                                                                                               |

### Local development

```sh
bun run etl:es --source-dir packages/etl/fixtures/es --offline   # synthetic data
bun run --cwd packages/etl fixtures:es                           # regenerate the fixtures
```

`packages/etl/fixtures/es` holds **synthetic** extracts in the register's exact
format (`centros_C1.xlsx`, `centros_C2.xlsx`, `centros_E.xlsx`) and the two IGN
collections (`ign-unidades-administrativas.json`, `ign-nucleos.json`: five
communities, six provinces and eleven municipalities with their real codes and
capital points, el Brull without one), generated deterministically by
`packages/etl/fixtures/generate-es.ts`: made-up centres and professionals (codes
in the sequence 9xxxxx, above the register's), made-up streets, e-mails, faxes,
web addresses, regional codes and dates (to check they are never stored), a
chain sharing a number, a placeholder number, and rows of types left out above
the line floors. Never commit real rows. The anchors the end-to-end tests use
(`ES_ANCHORS`): `1328900001` Clinica Dental Ejemplo Centro, `1328900002` a health
centre, `1328900003` a pharmacy, `1328900004` a public hospital, `1328900005` a
cardiology practice, `1328900006` a psychologist listed by name, `1328900007` a
local surgery, all in Madrid; `1328900008` a practice named after a made-up
doctor, objected to in the integration test. `test/es-integration.test.ts`
imports them next to the French and Czech fixtures: the other markets untouched
both ways, nothing unneeded stored, placement by INE code (province fallback, a
municipality without a point), read models, idempotence, a dry run, an
unreadable extract left out, absences, objections, the breaker and `--approve`.

## Italy

`etl:it` builds Italy's directory (`/it`) from the open data of the Ministry of
Health (issue #150, [ADR 0002](./adr/0002-multi-country.md#italy-it)).
Everything above about roles, ownership, the outbox and `--approve` applies, and
the per-list behaviour is Austria's; this section says what differs.

```sh
bun run etl:places --country it   # once (etl:it does it on its first run), then each January
bun run etl:it                    # weekly (the shop lists are daily, the hospital beds yearly)
bun run etl:it --sources farmacie # some lists only
bun run etl:it --dry-run          # everything, then roll back
bun run etl:it --approve=<run_id> # accept what a blocked run reported
```

An Italian page is a **place, never a person**: a pharmacy (with its branches
and dispensaries), a parapharmacy, a hospital or an accredited private clinic.
No individual health worker is listed: FNOMCeO's Albo unico forbids commercial
reuse, and the regional open lists of family doctors (on dati.gov.it, for
instance) are not imported, by choice
([`docs/data-requests/it.md`](./data-requests/it.md)). A pharmacy's company
name often names its pharmacists (`FARMACIA ESEMPIO S.N.C. DEI DOTT.RI …`): the
page prints the place's own name without them (below). A sole trader's pharmacy
may still carry a name: the article 14 notice is on `/it/privacy`, and an
objection removes the page.

### Sources

Verified on 26 November 2026 on each publisher's page. The ministry's three
lists are under the **Italian Open Data Licence v2.0** (the licence field of
each dataset page), ISTAT's boundaries under **CC BY 4.0**; their attribution is
printed on every page and on the data sources page (`/it/dati`) and kept in
`italy.registries` (`packages/core/src/country/it.ts`).

| List (`--sources`)                                    | Distribution                                                                                                                                                                 | Format, update                                                                                                                                                                                                                                                        |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Farmacie (`farmacie`)                                 | the current CSV of `https://www.dati.salute.gov.it/it/dataset/farmacie/`, named by the page's JSON twin `…/page-data/it/dataset/farmacie/page-data.json` (`field_listafile`) | `FRM_FARMA_5_<YYYYMMDD>.csv` (also JSON and XML), a new file every day; one line per period of validity of a pharmacy, branch or dispensary (59,309 lines on 26 November 2026)                                                                                        |
| Parafarmacie (`parafarmacie`)                         | the current CSV of `…/it/dataset/parafarmacie/`, the same way                                                                                                                | `FRM_PFARMA_7_<YYYYMMDD>.csv`, daily, the same format (13,938 lines)                                                                                                                                                                                                  |
| Posti letto per struttura ospedaliera (`posti-letto`) | the current CSV of `…/it/dataset/posti-letto-struttura-ospedaliera-{year}/`, last year's first, then each year down to 2023 (`IT_HOSPITAL_BEDS_YEAR`)                        | `Posti letto per struttura ospedaliera_2023.csv`, published 29 July 2025, beds on 1 January 2023; Latin-1, CRLF; one line per facility and area of care (`ACUTI`, `RIABILITAZIONE`, `LUNGODEGENZA`), 1,798 lines; names padded and cut at 40 characters by the source |
| ISTAT boundaries                                      | `https://www.istat.it/storage/cartografia/confini_amministrativi/generalizzati/2026/Limiti01012026_g.zip`                                                                    | "Confini delle unità amministrative a fini statistici al 1° gennaio 2026", generalized version: a ZIP of about 10 MB, three polygon shapefiles in WGS 84 / UTM 32N (EPSG:32632): `Reg`, `ProvCM` (`COD_UTS`), `Com` (`PRO_COM_T`); places import only, yearly         |

The portal renames the shop files every day and publishes the hospital bed
counts as one dataset per year, so the run reads each list's current file from
its dataset page and **throws when the page's licence field is not the IODL
2.0** (`resolveItSourceUrl` in `src/sources/it/portal.ts`): a changed licence
never goes unnoticed. `ETL_IT_FARMACIE_URL`, `ETL_IT_PARAFARMACIE_URL` and
`ETL_IT_POSTI_LETTO_URL` pin a file, `ETL_IT_PORTAL_URL` overrides the portal
and `ETL_IT_PLACES_URL` the boundaries (next January's).

**Licences.** Every page and the data sources page print the ministry's line
with the date of its data: "Fonte: Ministero della Salute, Farmacie, IODL 2.0,
aggiornato al 26 novembre 2026" (the `Last-Modified` of the file the last
Italian import read, else the day of that import: `italianAttribution` in
`apps/web/src/lib/market.ts`), in Italian whatever the interface. ISTAT's legal
notes say "Salvo diversa indicazione, tutti i contenuti pubblicati su questo
sito sono soggetti alla licenza Creative Commons – Attribuzione – versione 4.0";
the line is "Fonte: Istat, Confini delle unità amministrative a fini statistici
al 1° gennaio 2026, CC BY 4.0 (centroidi dei comuni calcolati da Apercura)".

**Format.** Semicolon-separated, double-quoted where a value holds a semicolon,
with HTML entities in some names (`&amp;`) and decimal commas in the
coordinates. The pharmacies' list mixes UTF-8 and Latin-1 lines and holds some
UTF-8 text read twice (`LibertÃ `): the parser decodes it line by line
(`decodeLines`) and repairs it (`repairMojibake`, `src/sources/it/ministry.ts`).
The hospital file has no coordinates, no CAP and no phone; none of the lists
publishes a phone number.

### Identifiers

Each list is its own identifier scheme (a list that fails keeps its rows), and
the page URL ends with its key after a letter naming the list
(`/it/struttura/{name}-{key}`, `/it/struttura/farmacia-esempio-f9000001`; a
reference is `it:f9000001`):

| Scheme     | URL key   | Key                                                                                             |
| ---------- | --------- | ----------------------------------------------------------------------------------------------- |
| `IT-FARM`  | `f12345`  | the ministerial pharmacy code `cod_farmacia` (a number)                                         |
| `IT-PFARM` | `p002112` | the parapharmacy's logistic-site code `codice_identificativo_sito`, six digits                  |
| `IT-HSP`   | `s010030` | the facility code of the HSP.11 model `Codice struttura`, six digits (the region's three first) |

A place has one site, its address, and one activity. The owner's VAT number is
never used as a key (nor read: below).

### Minimisation and what is left out

- Read from a pharmacy's line: `cod_farmacia`, `indirizzo`,
  `descrizione_farmacia`, `cap`, `cod_comune`, `comune`, `frazione`,
  `sigla_provincia`, `cod_regione`, `data_inizio_validita`,
  `data_fine_validita`, `codice_tipologia`, `latitudine`, `longitudine`; from a
  parapharmacy's: `codice_identificativo_sito`, `sito_logistico`, the address,
  municipality, province and region codes, the validity dates and the
  coordinates. **Never read into a row, so never stored**: the owner's VAT
  number (`p_iva`, `partita_iva`), which for a sole trader identifies the
  person, and the local health unit's code (`cod_farmacia_asl`). Quarantined
  lines keep their code only (never a name).
- **History.** The shop lists keep one line per period of validity: the line
  open on the run's day (`--as-of`, default today in Rome) is kept, the most
  recent if two are; closed lines and lines not yet open are counted in
  `stats.sources.{list}.skipped` (`closed`, `future`, `duplicate open line`).
- **Pharmacy types** (`codice_tipologia`): 1 ordinaria, 2 succursale, 3
  dispensario, 4 dispensario stagionale. Every type is a pharmacy's page (the
  `farmacie` listing); a type other than 1 is shown on it
  (`source = 'tipologia'`).
- **Hospitals.** One page per facility code; its lines' beds are summed per
  area of care (`source = 'disciplina'`, "Acuti (250 posti letto)") and its
  facility type is shown (`source = 'tipo-struttura'`). Type `5.1` "Casa di cura
  privata accreditata" is an accredited private clinic (`IT_CLINIC`, listing
  `case-di-cura`); every other type (hospital trusts, directly run hospitals,
  university hospitals, IRCCS, classified hospitals, research bodies) is a
  hospital (`IT_HOSPITAL`, listing `ospedali`).
- **Names.** `pharmacyNameIt`, `parapharmacyNameIt` and `hospitalNameIt`
  (`src/sources/it/names.ts`) print the place's own name: the company form and
  what follows it, and a title (`DOTT.`, `DR.SSA`) with the name after it, are
  left out, the name is cased the Italian way (`Università`, `Sant'Anna`), and
  "Farmacia" is added when a pharmacy's name does not say it. The published
  name is **never stored**, not even as the "source" name;
  `stats.sources.{list}.counters.namesShortened` counts the shortened names. A
  hospital named after a person keeps the name ("Casa di Cura Prof. …").
- GDPR objections: the lines of a suppressed code are dropped while parsing
  (`stats.suppressedLines`), and the purge of #116/#118 runs in the merge, as in
  the other markets.

### Places and precision

Places (`directory.places`, `country = 'IT'`), from ISTAT's boundaries,
imported once (the first `etl:it`, or `etl:places --country it`) and again each
January:

- **regions**: the 20 regions (`COD_REG`, `12` Lazio). Italy's listings exist
  per region too, like the UK's (migration `0028_it_market`):
  `/it/farmacie/lazio`. The ministry's lists write a region as ten times its
  code (`120`), and the autonomous provinces of Bolzano and Trento as `041` and
  `042` (`itRegionOfMinistryCode`);
- **departments**: the 110 provinces, metropolitan cities and free municipal
  consortia (`COD_UTS`, `058`, `258`);
- **communes**: the 7,896 municipalities (`PRO_COM_T`, `058091`), a slug unique
  within the province (`-{code}` on a collision): `/it/farmacie/roma/roma`. No
  arrondissements.

Names are in Italian: a bilingual name keeps its Italian part ("Bolzano/Bozen"
→ "Bolzano"), and the province of Aosta, which ISTAT names like its region,
takes its capital's name. A municipality's point is an interior point of its
largest ring: its centroid when inside, else the middle of the widest stretch
of the ring on the centroid's latitude (a crescent-shaped or coastal
municipality), transformed from EPSG:32632 to WGS 84 in PostGIS
(`interiorPoint`, `src/sources/it/places.ts`). Provinces and regions take the
centre of their municipalities.

**Coordinates.** The ministry says on both shop datasets: "Alcune coordinate
geografiche pubblicate sono state reperite tramite © OpenStreetMap
contributors". OpenStreetMap's data are under the ODbL, a share-alike licence,
and the lists do not say which points came from it, so **by default the import
does not use the lists' coordinates**: every site is located at its
municipality's point, `geo_precision = 'city'`, `geo_source = 'centroid'`, no
map pin, and distances on Italian pages are approximate. `--register-coordinates`
(or `ETL_IT_REGISTER_COORDINATES=1`) keeps them at address precision
(`geo_source = 'source'`); 18,941 of the 20,779 open pharmacies and 7,129 of the
7,179 open parapharmacies have one (`stats.sources.{list}.counters.withPoint`),
the hospitals none. Switching it moves nearly every pin, so the
page-modification circuit breaker blocks the run until it is approved, and a run
with the other setting never counts as unchanged. **This is an open decision
for the operator** ([ADR 0002](./adr/0002-multi-country.md#italy-it)).

A site is placed (`stageIt` in `src/merge-it.ts`):

1. in the municipality of the list's ISTAT code;
2. else (a code ISTAT no longer lists: a merged or renumbered municipality) in
   the only municipality of that name in the place's region;
3. else in the province of the list's abbreviation (`RM`): the province most
   sites with that abbreviation were placed in (ISTAT's places carry no
   abbreviation). Such a site has no location.

The municipality printed is ISTAT's name of the one the site is placed in, else
the list's; a pharmacy's hamlet (`frazione`) follows its street.

### Guards

Per list, before the merge (`IT_LIMITS` and `checkItSource` in
`src/guards.ts`), as Austria's:

- the file is between 2 KB and 200 MB and has the columns read (by header);
  otherwise the list is **left out**;
- at most 1% of its lines quarantined, and at least a floor of lines and places
  (farmacie 100 and 50, parafarmacie 20 and 10, posti-letto 10 and 5; never
  approvable): low, because the synthetic fixtures are small; on the real lists
  the change guards below protect a run once one has succeeded;
- at most 5% more or fewer places and 15% more or fewer bytes than the last
  successful run that read the list: otherwise **blocked** (approvable).

After staging (`checkItPlaces`): less than 99% of the sites placed in their
municipality (by code or name) or less than 98% located blocks the run
(approvable). After the merge, the circuit breakers and the orphan check apply
to Italy's own pages only. A list that cannot be fetched or read is left out
and keeps its rows (its places are not counted missing), and the command exits
with code **3**; when none can be read the run fails (`1`) and the pages stay as
they are; a breaker blocks it (`2`): review, then rerun with
`--approve=<run_id>` (same files only). Unchanged lists skip the run, but the
shop lists change daily, so a weekly run is rarely skipped.

### Schedule and monitoring

The scheduler runs `etl:it $ETL_IT_SCHEDULE_ARGS` every Monday at 09:30 UTC,
after the other imports (`docker/crontab`; one advisory lock for every import).
Alert on exit codes 1, 2 and 3 and on the import age, per market (the market
query of [Austria's monitoring](#schedule-and-monitoring) covers `it`) and per
list:

```sql
-- Days since each Italian list was last loaded (alert above 9), and its places then.
SELECT list, max(r.finished_at) AS last_loaded,
	extract(day FROM now() - max(r.finished_at))::integer AS age_days,
	(array_agg((r.stats -> 'sources' -> list ->> 'people')::integer ORDER BY r.id DESC))[1] AS places
FROM directory.etl_runs r
CROSS JOIN LATERAL jsonb_object_keys(r.stats -> 'sources') AS list
WHERE r.source = 'it' AND r.status = 'succeeded'
	AND NOT coalesce(r.stats -> 'sourceErrors' ? list, false)
GROUP BY list;

-- Italy's last runs: status, lists left out, placement, minimisation and totals.
SELECT id, status, finished_at, stats -> 'sourceErrors' AS left_out, stats -> 'staged' AS staged,
	stats -> 'sources' -> 'farmacie' -> 'counters' AS farmacie, stats -> 'totals' AS totals
FROM directory.etl_runs WHERE source = 'it' ORDER BY id DESC LIMIT 5;
```

The hospital bed counts are yearly: watch `etl_runs.files -> 'posti-letto' ->>
'resolvedUrl'` for a new year's dataset, whose counts may differ by more than 5%
and block the run until it is reviewed and approved.

### Measured run (files of 26 November 2026)

Dry run on a fresh database with the real files:

|           |                                                                                                                                                                                                 |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Duration  | about 35 s                                                                                                                                                                                      |
| Lines     | farmacie 59,309 (38,418 closed and 112 not yet open skipped), parafarmacie 13,938 (6,755 closed, 4 not yet open), posti letto 2023 1,798 (1,044 facilities); none quarantined in the shop lists |
| Places    | 29,002: pharmacies 20,779 · parapharmacies 7,179 · hospitals 564 · accredited clinics 480; all indexable                                                                                        |
| Names     | 12,157 pharmacy, 3,147 parapharmacy and 190 hospital names shortened                                                                                                                            |
| Points    | 18,941 pharmacies and 7,129 parapharmacies with coordinates in the lists, not used (city precision)                                                                                             |
| Sites     | 29,002: 28,760 placed in their municipality (1,156 of them by name), 242 in their province only (municipalities merged since, e.g. Corigliano-Rossano); 28,760 located                          |
| Indexable | 29,002 place pages; 2,758 indexable listing pages of 10,402                                                                                                                                     |
| Places    | 20 regions, 110 provinces, 7,896 municipalities                                                                                                                                                 |

### Local development

```sh
bun run etl:it --source-dir packages/etl/fixtures/it --offline   # synthetic data
bun run --cwd packages/etl fixtures:it                           # regenerate the fixtures
```

`packages/etl/fixtures/it` holds **synthetic** lists in the ministry's exact
formats (`farmacie.csv`, `parafarmacie.csv`, `posti-letto.csv`: semicolons,
quoting, HTML entities, decimal commas, mixed encodings and padded columns) and
a small ISTAT archive (`istat-confini.zip`: the 20 regions, six provinces and
eleven municipalities with their real codes, as squares around their real
interior points), generated by `packages/etl/fixtures/generate-it.ts`: made-up
places, pharmacists named in made-up company names, streets that do not exist,
pharmacy codes from 9000001, parapharmacy codes from 900001 and hospital codes
from 990001 (above the real lists' ranges), and a made-up VAT number starting
with 999 on every line (to check it is never stored). Never commit real rows.
The anchors the tests use: `9000001` Farmacia Esempio in Roma
(`/it/struttura/farmacia-esempio-f9000001`), `9000003` a dispensary in
Fiumicino (hamlet Fregene), `9000006` placed by name, `9000007` in its province
only, `9000008` closed, `9000009` not yet open, `9000013` objected to in the
integration test, `900001` a parapharmacy, `990001` Ospedale Esempio and
`990003` an accredited clinic, both in Roma. `test/it-integration.test.ts`
imports them next to the French and Czech fixtures: the other markets untouched
both ways, nothing of the owners stored, placement (code, name, province, at
the municipality's centre), region listings, idempotence, the register's
coordinates only when asked, a dry run, a list left out, absences, objections,
the breaker and `--approve`.
