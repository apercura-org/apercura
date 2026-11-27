# Open data import

`packages/etl` builds the public directory from open data: France (this page,
first), Austria ([below](#austria)), the United Kingdom
([below](#united-kingdom)), Czechia ([below](#czechia)), Spain
([below](#spain)), Italy ([below](#italy)), Germany ([below](#germany)),
Switzerland ([below](#switzerland)), Estonia ([below](#estonia)), Poland ([below](#poland)) and Norway ([below](#norway)). It is a
Bun CLI that runs as a
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

## Germany

`etl:de` builds Germany's directory (`/de`) from the statistical offices' yearly
directory of hospitals and of prevention and rehabilitation clinics and from the
pharmacy lists of the Länder that publish a current one as open data (issue #152,
[ADR 0002](./adr/0002-multi-country.md#germany-de)). Everything above about
roles, ownership, the outbox and `--approve` applies; this section says what
differs.

```sh
bun run etl:places --country de   # once (etl:de does it on its first run), then yearly
bun run etl:de                    # monthly (the directory is yearly, the lists change as needed: unchanged files end the run)
bun run etl:de --dry-run          # everything, then roll back
bun run etl:de --approve=<run_id> # accept what a blocked run reported
```

A German page is a **facility**: a hospital site, a prevention or rehabilitation
clinic, a pharmacy. Germany's registers of doctors and dentists are not open
(the KBV's Bundesarztregister, the chambers' searches and 116117 forbid reuse;
ADR 0002), so no page names a practitioner. The directory names facilities by
their operator's registered name; a page drops the legal form and prints the
site.

### Sources

Verified on 26 November 2026 on each publisher's page or metadata record.

| Source                                                                                                                                                          | Distribution                                                                                                                                                                                                                                                                                                                             | Format, update                                                                                                                                                                                                                 |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Verzeichnis der Krankenhäuser und Vorsorge- oder Rehabilitationseinrichtungen (Statistisches Bundesamt, for the statistical offices of the Bund and the Länder) | `https://www.destatis.de/…/Downloads-Krankenhaeuser/krankenhausverzeichnis-3500100{yy}7005.xlsx?__blob=publicationFile` (2024: `…247005`); the joint portal's page `https://www.statistikportal.de/de/veroeffentlichungen/krankenhausverzeichnis` links the latest edition and holds a copy (`…/2026-06/krankenhausverzeichnis_24.xlsx`) | XLSX, 2.5 MB: ` KHV_2024` (2,758 hospital sites of 1,845 hospitals), `RHV_2024` (1,066 clinics), their record descriptions `DSB_KHV_2024`, `DSB_RHV_2024`; yearly (the 2024 edition came out in May 2026, updated 9 June 2026) |
| Gemeindeverzeichnis-Informationssystem GV-ISys: all politically independent Gemeinden with selected features (Statistisches Bundesamt)                          | `https://www.destatis.de/DE/Themen/Laender-Regionen/Regionales/Gemeindeverzeichnis/Administrativ/Archiv/GVAuszugQ/AuszugGV4QAktuell.xlsx?__blob=publicationFile` (always the latest fourth quarter)                                                                                                                                      | XLSX, 1.9 MB: Länder, government regions, Kreise, Gemeindeverbände and 10,953 Gemeinden with population, postcode of the seat and geographic centre; quarterly; places import only                                             |
| Apotheken in Thüringen (Thüringer Landesamt für Verbraucherschutz, through the GDI-Th)                                                                          | `https://www.geoproxy.geoportal-th.de/download-service/opendata/giz/apotheke.zip`; metadata `https://registry.gdi-de.org/id/de.th.csw/259ef2fc-1c82-40cc-99c6-f5b9b1d3dbeb`                                                                                                                                                              | Shapefile in a ZIP, 31 KB, ETRS89 / UTM 32N, 472 pharmacies; updated as needed (data of 14 July 2026)                                                                                                                          |
| Standorte der Apotheken im Land Brandenburg (Landesamt für Arbeitsschutz, Verbraucherschutz und Gesundheit, LAVG, through the LGB)                              | `https://ogc-api.geobasis-bb.de/datasets/apotheken/collections/apotheken/items?bulk=true&f=json` (OGC API Features); metadata `https://registry.gdi-de.org/id/de.bb.metadata/62474539-faa4-4d28-a7ab-74375cf826b4`                                                                                                                       | GeoJSON, 273 KB, longitude and latitude, 531 pharmacies; quarterly (revision of 19 October 2026)                                                                                                                               |

The edition's address embeds its reporting year, so `etl:de` tries, in turn, the
Destatis address of last year's and the year before's edition (a reporting
year's edition comes out about five months after it ends; the address of an
edition not out yet answers 404 at once), the latest edition the portal's page
links, then the portal's known copy. The edition is read from the worksheet
names (`KHV_2024`): one older than the last imported is refused (`khv.edition`,
never approvable), and `stats.sources.khv.edition` says which one a run read.
`ETL_DE_KHV_URL` (that address alone), `ETL_DE_KHV_INDEX_URL`,
`ETL_DE_KHV_MIRROR_URL`, `ETL_DE_APO_TH_URL`, `ETL_DE_APO_BB_URL` and
`ETL_DE_PLACES_URL` override them. Brandenburg's former ZIP
(`mugv.brandenburg.de/lua/gis/apotheke.zip`) no longer resolves.

**Licences and attributions** (`germany.registries`, printed on the data sources
page):

- Both Destatis files say "Vervielfältigung und Verbreitung, auch auszugsweise,
  mit Quellenangabe gestattet": credited "© Statistisches Bundesamt (Destatis),
  2026" (`DESTATIS_YEAR` in `packages/core/src/country/de.ts`, raised with the
  editions).
- Thuringia: CC BY 4.0, attribution "© GDI-Th" (the metadata record's
  `quelle`).
- Brandenburg: Datenlizenz Deutschland – Namensnennung – 2.0, attribution "©
  Landesamt für Arbeitsschutz, Verbraucherschutz und Gesundheit Brandenburg,
  dl-de/by-2-0 (Daten geändert)", with the licence's URL and the dataset's URI as
  the licence asks; the data page says what was changed (hospitals' pharmacies
  left out, placed in their Gemeinde, phone numbers normalised).

**Not used**: the Bundes-Klinik-Atlas (reuse needs the G-BA's permission), the
KBV's and 116117's searches, InEK's site list, OpenStreetMap (ODbL share-alike),
and every per-person source. Saarland's open pharmacy list (CC BY 4.0, "© GDI-SL")
was digitised in March 2021 and its ids are row numbers: not imported, see
[`data-requests/de.md`](./data-requests/de.md).

### Identifiers

Neither the directory nor Brandenburg's list publishes a stable id: the
directory's `KH_ID` is a pseudonym drawn anew for every edition ("zufällig
generierte"), and Brandenburg's feature ids are row numbers. One scheme per
source, so a source left out keeps its rows (`DE_ID_SCHEMES` in
`packages/core/src/slugs.ts`), whose letters name it in the URL:

| Scheme      | Key                                                                                                               | URL                                                    |
| ----------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `DE-KHV`    | derived: ten hex digits of the SHA-256 of the municipality key, street, house number, hospital name and site name | `/de/einrichtung/klinikum-beispiel-erfurt-k40b2300bae` |
| `DE-RHV`    | derived the same way from the clinic's name                                                                       | `/de/einrichtung/rehaklinik-fiktivia-r161d4b92c2`      |
| `DE-APO-TH` | the number of the pharmacy's file at the Landesamt (`Az_VIS` `5040-24-2484/420` → `420`)                          | `/de/einrichtung/beispiel-apotheke-th9001`             |
| `DE-APO-BB` | derived from the postcode, street, house number and name                                                          | `/de/einrichtung/fiktiv-apotheke-am-park-bbef2771a4ae` |

A derived key compares its parts without case, accents, spaces or punctuation and
reads `Str.` as `Straße` (`deSiteKey`, `src/sources/de/names.ts`), so an edition
that adds a dash keeps the page; a renamed hospital or a moved site gets a new
page and the old one is removed. Each facility has one site, keyed by the same
key (`source` per source: `de-destatis-khv`, `de-destatis-rhv`, `de-apo-th`,
`de-apo-bb`), and one activity `{key}@{key}`.

### Minimisation and what is left out

- Read from the directory: the Land, Kreis and Gemeinde codes, name, site name,
  street, house number, postcode, town, phone, operator type, kind of facility,
  emergency care level and modules, and which departments have beds. **Never
  read into a row, so never stored**: e-mail and web addresses, the operator's
  name, the beds and the pseudonymous id (used only to count a hospital's sites
  while parsing).
- A phone is stored as a facility's only when at most three hospitals or clinics
  of its sheet publish it (`MAX_PHONE_OWNERS`): the sites of one hospital share
  its switchboard, which stays; a number of several facilities is an operator's
  (`stats.sources.<source>.counters.sharedPhones`: 4 clinics in 2024).
- Names: the legal form at the end is dropped (`gGmbH`, `SE & Co. KG`, `e. V.`…),
  and so are the directory's site labels (`Hauptstandort`, `Stationäre
  Behandlung`); a hospital with several sites prints `{hospital} – {site}` when
  the site's name adds something (`hospitalSiteName`). Nothing is re-cased.
- Kinds (`deHospitalKind`, `packages/core/src/taxonomy/de.ts`): a hospital site
  whose every department is psychiatric or psychosomatic (`29xx`, `30xx`, `31xx`)
  lists with the psychiatric hospitals, one whose every department is a
  children's one (`10xx`–`13xx`, `3610`) with the children's hospitals, any other
  with the hospitals; a site without departments with beds (day clinics,
  outpatient clinics: 596 in 2024) by its names. `0000` (no department) and
  `3700` (other) never decide and are not shown.
- Qualifications (`source`): `fachabteilung` (code and name of each department,
  without the day-clinic remark), `notfallstufe` (Basis-, Erweiterte, Umfassende
  Notfallversorgung, § 136c SGB V), `notfallmodul` (Schwerverletzte, Kinder,
  Spezial, Schlaganfall, Herz), `traeger` (public, non-profit, private),
  `einrichtungstyp` (Hochschulklinik, Plankrankenhaus…), and for Thuringia
  `apotheke` (main pharmacy or branch) and `barrierefreiheit` (step-free, or with
  restrictions as published).
- Brandenburg's list holds the pharmacies of hospitals under their hospital's
  name (13 in October 2026): they serve wards, not the public, and are left out
  (`skipped["hospital pharmacy"]`). Thuringia's location note completes a name
  only when it says where (`am Markt`).
- GDPR objections: the rows of a suppressed key are dropped while parsing
  (`stats.suppressedLines`), and the purge of #116/#118 runs in the merge, as in
  the other markets.

### Places and precision

Places (`directory.places`, `country = 'DE'`), from GV-ISys, imported once:

- **regions**: the 16 Länder (`09`); no listing pages, slugged after the Kreise
  (`berlin` is the Kreis, `berlin-11` the Land);
- **departments**: the 400 Kreise and kreisfreie Städte (`09162`), named the way
  people say them (`München` the city, `Landkreis München`, `Kreis
  Dithmarschen`, `Rhein-Sieg-Kreis`, `Region Hannover`);
- **communes**: the 10,751 Gemeinden (`09162000`), slugged unique within their
  Kreis; the 202 uninhabited areas outside any Gemeinde (forests, lakes, coastal
  waters) are left out. A kreisfreie Stadt is a Kreis and a Gemeinde at once (its
  Gemeinde part is `000`): like Paris, its city page is its Kreis's.

A site is placed (`placeFacility`, `src/sources/de/places.ts`) in the Gemeinde of
its municipality key; Berlin's and Hamburg's rows carry a district's
statistical code and are read as their city (`11000000`, `02000000`). Else by
its town's name in its Land (the variants of a two-part or bracketed name:
`Cottbus/Chóśebuz`, `Am Mellensee (OT Sperenberg)`), the homonym nearest its
point when it has one; else, when one Gemeinde in Germany bears the name, that
one (two 2024 sites are filed under the Land of their hospital's seat: Mainz's
university hospital's site in Wiesbaden); else the Gemeinde whose centre is
nearest its point in its Land, within 15 km; else its Kreis.

The directory publishes **no coordinates**: a hospital or clinic is located at
its Gemeinde's geographic centre (GV-ISys's `Mittelpunktkoordinaten`):
`geo_precision = 'city'`, `geo_source = 'centroid'`, never a map pin, distances
approximate. Pharmacies are at their published point (`'address'`, `'source'`;
Thuringia's converted from UTM 32N, `src/lib/utm.ts`). Postcode areas are not
open, so nothing is placed by postcode; no geocoder is called.

### Guards

Per source (`checkDeSource`): quarantine within 1%; floors of lines and
facilities (`khv` 200 and 150, `rhv` 100 and 80, each pharmacy list 50 and 40;
never approvable); the directory's edition never older than the last imported
(never approvable); at most 10% more or fewer facilities and 30% more or fewer
bytes than the last successful run that read it (approvable: a new edition
changes more than a month does). A source that cannot be fetched, read or pass
its floors is left out and keeps its facilities (they are not counted missing);
the run imports the others and exits `3`. After staging (`checkDePlaces`): 99%
of the sites in their Gemeinde and 98% located (approvable). Then the breakers on
Germany's own pages, as everywhere.

**Absences** (`DE_MISSING_RUNS`): a run reads a new edition of the directory
once a year, so a hospital site or clinic missing from it is removed at once;
a pharmacy missing from its list twice in a row. A claimed page is kept and
counted for review.

### Schedule and monitoring

The scheduler runs `etl:de $ETL_DE_SCHEDULE_ARGS` on the 2nd of every month at
22:30 UTC (`docker/crontab`), when no weekly import runs; unchanged files end the
run after their download (3 MB). Alert on exit codes 1, 2 and 3. The directory
changes once a year: alert when the edition read (`stats.sources.khv.edition`)
is more than two years behind the current year, and on the age of the last
pharmacy change only if a list stops answering (exit 3).

```sql
-- Germany's last runs: status, edition, per-source counters, placement and totals.
SELECT id, status, finished_at, stats -> 'sourceErrors' AS errors,
	stats -> 'sources' -> 'khv' -> 'edition' AS edition, stats -> 'staged' AS staged,
	stats -> 'totals' AS totals
FROM directory.etl_runs WHERE source = 'de' ORDER BY id DESC LIMIT 5;
```

### Measured run (files of 26 November 2026)

Laptop, local PostGIS 17, fresh database, the real files (downloaded once into a
scratch directory, the run quoted in the pull request):

|           |                                                                                                                                            |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Duration  | places 5 s (download included); dry run 5 s (download 1.9 s, read models 1.3 s), peak RSS 0.16 GB                                          |
| Lines     | khv 2,758 (2,758 imported), rhv 1,066 (1,065: one duplicate), apo-th 472 (471: one without a file number), apo-bb 531 (518: 13 hospitals') |
| Kinds     | hospitals 2,095 · psychiatric hospitals 634 · children's hospitals 29 · rehabilitation clinics 1,065 · pharmacies 989 (4,812)              |
| Phones    | 4,242 sites with a number; 4 shared numbers left out (clinics); 5 of Brandenburg's numbers unreadable                                      |
| Sites     | 4,812, all in their Gemeinde (4,288 by key, 510 by town, 14 by point); 3,823 at their Gemeinde's centre, 989 at their address              |
| Indexable | 4,812 facility pages; 936 indexable listing pages of 3,489                                                                                 |
| Places    | 16 Länder, 400 Kreise, 10,751 Gemeinden (GV-ISys, 31 December 2025)                                                                        |

### Local development

```sh
bun run etl:places --country de --source-dir packages/etl/fixtures/de   # synthetic places
bun run etl:de --source-dir packages/etl/fixtures/de --offline          # synthetic data
bun run --cwd packages/etl fixtures:de                                  # regenerate the fixtures
```

`packages/etl/fixtures/de` holds **synthetic** files in the sources' exact
formats (`krankenhausverzeichnis.xlsx` with its stray-space ` KHV_2024` sheet and
record descriptions, `apotheke_th.zip` in UTM 32N, `apotheken_bb.json`) and a
municipalities' directory of nine Länder, twelve Kreise and thirteen Gemeinden
with their real keys, populations and centres (`gemeindeverzeichnis.xlsx`),
generated deterministically by `packages/etl/fixtures/generate-de.ts`: made-up
hospitals, clinics and pharmacies, two sites of one university hospital filed
under Berlin's districts, a children's hospital under one of Hamburg's, two
hospitals at one address in München, a site filed under the wrong Land, a
psychiatric day clinic without departments, a chain of clinics sharing a number,
a hospital's pharmacy, made-up e-mails, web addresses and operators (to check
they are never stored), and filler rows above the floors. Never commit real
rows. `test/de-integration.test.ts` imports them next to the French and Spanish
fixtures: the other markets untouched both ways, names, kinds, qualifications
and nothing unneeded stored, placement (key, Berlin's districts, town name,
district names), read models without Land listings, idempotence, a dry run, an
older edition refused, an unreadable list left out, absences (at once for the
directory, after two runs for a list), objections, the breaker and `--approve`.

## Switzerland

`etl:ch` builds Switzerland's directory (`/ch` in German, `/ch-fr` in French,
`/ch-it` in Italian) from the Federal Office of Public Health's hospital
figures and the cantons' open lists (issue #154,
[ADR 0002](./adr/0002-multi-country.md#switzerland-ch)). Everything above about
roles, ownership, the outbox and `--approve` applies, and the per-list
behaviour is Austria's and Italy's; this section says what differs.

```sh
bun run etl:places --country ch          # once (etl:ch does it on its first run), then each January
bun run etl:ch                           # monthly
bun run etl:ch --sources zh-heime,ge-ems # some lists only
bun run etl:ch --dry-run                 # everything, then roll back
bun run etl:ch --approve=<run_id>        # accept what a blocked run reported
```

A Swiss page is a **facility, never a person**: a hospital or clinic site, a
nursing home, a pharmacy. No health professional is listed: MedReg, PsyReg and
GesReg may be consulted one by one but their bulk data needs an agreement with
the FOPH, Refdata's GLN partner data is not open, and no list naming people is
read ([`docs/data-requests/ch.md`](./data-requests/ch.md)). What a list says of
a person (Basel-Landschaft's responsible pharmacist, an e-mail address that
names its owner, a care-of person in a hospital's name) is never read into a
row.

What each canton's lists hold once imported. The pages never print this table
as fixed text: the home, the listings, the search and the data page name, for
each kind, the cantons whose list has at least one published facility (see
[Coverage on the pages](#coverage-on-the-pages)), so a list that is left out,
turned off or never imported is never claimed:

| Kind of facility                  | Where                                                                                                                                                                |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hospitals, clinics, birth centres | Every canton (the FOPH's figures, every hospital and clinic and their sites); Bern, Geneva, Basel-Stadt and Jura add their own lists' points, phones and a few units |
| Nursing homes                     | Zürich, Bern, Geneva, Basel-Stadt, Basel-Landschaft and Jura (a few homes just across their borders, on their lists, too)                                            |
| Pharmacies                        | Basel-Landschaft (every pharmacy with an operating licence) and Geneva (only the pharmacies that vaccinate: no open list of all of them)                             |

### Sources

Verified on 27 November 2026 on opendata.swiss (`rights` of each distribution)
and on each publisher's own terms. Only "Open use" (`terms_open`) and "Open
use. Must provide the source." (`terms_by`) lists are read; a list whose terms
ask for permission before commercial use is not (the FOPH's 2024 figures). Every
credit is printed on the pages built from the list and on the data sources page
(`/ch/daten`, `/ch-fr/donnees`, `/ch-it/dati`), in the publisher's own words and
languages, and kept in `switzerland.registries`
(`packages/core/src/country/ch.ts`).

| List (`--sources`)                           | Distribution                                                                                                                                                                                                                                   | Terms and credit                                                                                                                        | Format, rows (27 November 2026)                                                                                                                                                                   |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FOPH hospital figures 2023 (`bag`)           | `kzp23_data.xlsx` of [Kennzahlen der Schweizer Spitäler 2023](https://opendata.swiss/de/dataset/kennzahlen-der-schweizer-spitaler-2023), from `spitalstatistik-ld.bagapps.ch` (the distribution's `opendata.bagnet.ch` answered 503 for a day) | `terms_by`; the workbook: "Auszugsweiser Abdruck unter Quellenangabe gestattet"; "Quelle: © Bundesamt für Gesundheit (BAG), …"          | XLSX, sheets `KZ2023_KZP23` (275 hospitals) and `Standorte_KZ2023_KZP23` (596 sites, 8 of them a hospital's administration, not read); yearly, the edition is fixed in `CH_HOSPITAL_FIGURES_YEAR` |
| Bern hospitals (`be-spitaeler`)              | the canton's web feature service, layer `SPITAL_SPITKLIN_VW_8200`, GeoJSON                                                                                                                                                                     | `terms_open`; the canton's terms: "Freie Nutzung. Quellenangabe ist Pflicht"; "Spitäler und Kliniken © Gesundheitsamt des Kantons Bern" | 72 sites, WGS 84 points, four flags (acute, psychiatry, rehabilitation, birth)                                                                                                                    |
| Bern homes (`be-heime`)                      | the same service, layer `ILV_STOALTER_VW_20214`                                                                                                                                                                                                | `terms_open`, the same terms; "… © Amt für Integration und Soziales des Kantons Bern"                                                   | 269 homes, phone, operator (e-mail not read)                                                                                                                                                      |
| Geneva hospitals (`ge-hopitaux`)             | SITG `DAS_HOPITAUX_CLINIQUES-geojson.zip`                                                                                                                                                                                                      | `terms_open`; SITG's conditions, level A (free access): « Source : Portail des données SITG (État de Genève), téléchargé en date du … » | 40 entries, 23 read (hospitals and clinics; the HUG's outpatient consultations are departments)                                                                                                   |
| Geneva nursing homes (`ge-ems`)              | SITG `DAS_EMS-geojson.zip`                                                                                                                                                                                                                     | as above                                                                                                                                | 54 EMS, keyed by the cantonal address id `IDPADR`                                                                                                                                                 |
| Geneva pharmacies (`ge-pharmacies`)          | SITG's service `GEO_SANTE_VACCINATION_PHARM`, GeoJSON                                                                                                                                                                                          | as above                                                                                                                                | 132 pharmacies that vaccinate                                                                                                                                                                     |
| Basel-Landschaft pharmacies (`bl-apotheken`) | data.bl.ch dataset 10320, GeoJSON export                                                                                                                                                                                                       | `terms_by`; "Quelle: Kanton Basel-Landschaft, Amt für Gesundheit (data.bl.ch)"                                                          | 48 pharmacies, keyed by the business's GLN; the responsible pharmacist's names are not read                                                                                                       |
| Basel-Landschaft homes (`bl-heime`)          | data.bl.ch dataset 10310                                                                                                                                                                                                                       | as above                                                                                                                                | 33 homes with their commune number (some in Basel-Stadt)                                                                                                                                          |
| Basel-Stadt hospitals (`bs-spitaeler`)       | `api.geo.bs.ch/stac/v1/download/SPTL/latest/geojson` (a ZIP)                                                                                                                                                                                   | `terms_by` (CC BY 4.0); "Quelle: Kanton Basel-Stadt (geo.bs.ch), CC BY 4.0"                                                             | 13 hospitals with category and emergency department                                                                                                                                               |
| Basel-Stadt homes (`bs-heime`)               | `…/APFH/latest/geojson`                                                                                                                                                                                                                        | as above                                                                                                                                | 50 entries, 43 read (day centres left out)                                                                                                                                                        |
| Zürich homes (`zh-heime`)                    | `KTZH_00003102_00006486.csv` of [Alters- und Pflegeheime Kanton Zürich](https://opendata.swiss/de/dataset/alters-und-pflegeheime-kanton-zurich)                                                                                                | `terms_open`; "Quelle: Kanton Zürich, Gesundheitsdirektion, …"                                                                          | yearly figures in long format (32,781 lines, 2019–2025): the homes of the latest year (212), keyed by their id                                                                                    |
| Jura institutions (`ju-institutions`)        | `SSA_19_04_Institutions_de_soins_et_de_sante.zip` (geo.jura.ch)                                                                                                                                                                                | `terms_by`, level A; « © Géodonnées de la République et Canton du Jura »                                                                | a shapefile (Windows-1252, LV95 multipoints), 35 entries, 18 read (hospitals, EMS, medicalised homes, birth centre)                                                                               |
| Places                                       | the BFS commune register's API (`agvchapp.bfs.admin.ch/api/communes/snapshot?date=…`) and swisstopo's postcode directory (`ortschaftenverzeichnis_plz_4326.csv.zip`)                                                                           | `terms_open`; "Quelle: BFS – Amtliches Gemeindeverzeichnis der Schweiz", "© swisstopo"                                                  | 26 cantons, 144 districts (9 stand-ins), 2,110 communes; 5,717 locality parts                                                                                                                     |

`ETL_CH_<ID>_URL` (`ETL_CH_BAG_URL`, `ETL_CH_ZH_HEIME_URL`…) overrides a list's
address, `ETL_CH_POSTCODES_URL` and `ETL_CH_COMMUNES_URL` the places'. Bern's
layer names are numbered by its server and may change: a list that cannot be
fetched is left out, and the run says so.

### Turning a list off

`--sources` (or `ETL_CH_SOURCES`, which `--sources` overrides) names the lists a
run imports (`bag,zh-heime`), or every list but some, each prefixed with a
minus (`-ge-hopitaux,-ge-ems,-ge-pharmacies`). The two forms never mix, an
unknown id is an error, and at least one list must be left.

A list that is not selected is not "left out": it is not fetched, it never
appears in `stats.sourceErrors`, and the run exits 0. `etl_runs.scope.sources`
records the selection. Its rows are not touched either: its facilities are
neither counted missing nor removed, its activities and sites stay, and their
pages stay as the last run that read the list left them (so the pages keep
naming its canton while they are published). Only a run that reads the list
again and no longer finds a facility removes it, after two runs as everywhere.
A run with the same selection on unchanged files is skipped; changing the
selection always runs.

#### Geneva's lists from the production server

Geneva's SITG servers (`extract.sitg.ge.ch`, `vector.sitg.ge.ch`) answer HTTP
406, with a page saying the visitor probably uses a VPN, to requests from some
datacenter addresses, the production server's among them. `ge-hopitaux`,
`ge-ems` and `ge-pharmacies` are then left out of every run (`stats.sourceErrors`,
exit code 3), and production publishes no Geneva nursing home or pharmacy.
Geneva's hospitals and clinics still come from the FOPH's figures, without the
points and phones the canton's list adds, and the pages say so on their own:
they stop naming Geneva for the kinds it no longer has.

The import does not work around the block. Until SITG allows the server, turn
the three lists off so the monthly run exits 0 and an exit code 3 means a new
problem again:

```sh
# The Docker stack's scheduler (docker/compose.app.yml passes it this variable only):
ETL_CH_SCHEDULE_ARGS="--sources -ge-hopitaux,-ge-ems,-ge-pharmacies"
# Any other run of etl:ch (a host's cron, a run by hand) reads its environment:
ETL_CH_SOURCES=-ge-hopitaux,-ge-ems,-ge-pharmacies
```

The fix is to ask SITG to allow the server
([`data-requests/ch.md`](./data-requests/ch.md#genevas-lists-blocked-from-the-server)),
then drop the setting: the next run reads Geneva's lists again and the pages
name Geneva for every kind its lists give.

### Coverage on the pages

The cantons a Swiss page names come from the directory, never from the
catalogs: `getSwissCoverage` (`apps/web/src/server/queries/swiss-coverage.ts`)
reads the registries of the published Swiss facilities (active, not withheld,
with a page), from their current activities' sources and their `quelle`
credits, and maps each cantonal registry to its canton (`CH_LIST_CANTONS` in
`packages/core/src/country/ch.ts`, checked against `CH_SOURCES`). A canton is
named for nursing homes or pharmacies when its list has one published facility
of that kind, and for hospitals when its hospital list gives a page or is
credited on a FOPH site; the FOPH's figures stand for every canton. The texts
(`SwissCoverage` in the catalogs) give each canton's name in the page's
language and join them as the language joins a list, with the cases of one
canton and of none. The query is cached for days and tagged like the home's
figures (`registry`, `sitemap`, `practitioner:*`): the import sends `sitemap`
with any change, so the first visitor after a run that adds or drops a list
reads the new coverage.

### Identifiers and deduplication

One scheme per list (`CH-BAG`, `CH-BE-SPITAL`, `CH-BE-PH`, `CH-GE-HOP`,
`CH-GE-EMS`, `CH-GE-PHARM`, `CH-BL-PHARM`, `CH-BL-PH`, `CH-BS-SPITAL`,
`CH-BS-PH`, `CH-ZH-PH`, `CH-JU`), and the URL names it
(`/ch/einrichtung/stadtspital-musterberg-nord-h367757611`). The FOPH's figures
number nothing, and Bern's, Geneva's hospitals', Basel-Stadt's and Jura's ids
look renumbered at each export (1 to n): their key is derived from the canton, the name, the
street and the postcode (FNV-1a, nine digits, as Salzburg's in Austria), so a
renamed or moved facility gets a new page and the old one goes after two
runs. Stable numbers are used where a list has them: a Basel-Landschaft
pharmacy's GLN, a Geneva home's `IDPADR`, a Zürich home's id.

A site the figures name by its town alone ("Payerne", "Standort Wil") is printed
with its hospital's name ("Hôpital Intercantonal de la Broye (HIB) – Payerne");
its key stays the figures' site name.

Lists overlap. A canton's hospital that is a site of the FOPH's figures is that
site's page (same commune or postcode, and the same name and street, the same
name, or the same street and kind; two different streets are two facilities):
the canton adds its point, phone and emergency department and is credited on
the page (`quelle`). On the real lists: 64 of Bern's 72 entries, 9 of Geneva's
23, 10 of Basel-Stadt's 13, 5 of Jura's hospitals. Without the FOPH's figures
in a run, the cantons' hospitals are not read and keep their pages, so none
doubles a FOPH site. A home two cantons list (Basel-Landschaft lists some of
Basel-Stadt's) is one page, its own canton's (3 homes).

### Places and precision

A canton is a region (`ZH`), a district a department (its BFS number), a
commune a commune (its BFS number); names are the BFS's official ones in every
language of the market ("Genève", "Bern / Berne"; a canton's slug is its first
name: `bern`, `valais`). Listings exist per canton too (migration
`0029_ch_market`); the nine stand-in districts of the cantons without districts
("Kanton Zug", "Canton de Genève") have listings that answer but are never
indexed, since they repeat the canton's.

A facility is placed with swisstopo's postcode directory: by the commune
number its list gives (Basel-Landschaft's homes), else its postcode and
locality, else the locality in its canton (a post-office box's postcode,
`3000 Bern 60`), else its point (Geneva's hospitals give no postcode), else a
neighbouring postcode (`8058 Zürich-Flughafen`). It is located at its list's
coordinates (`address` precision, a map pin: Bern, Geneva, Basel-Landschaft,
Basel-Stadt, Zürich and Jura give them, Jura in the Swiss grid, transformed
with swisstopo's approximate formulas) or at its locality's point (`city`
precision: every FOPH site the cantons' lists do not locate).

### Guards

Per list: quarantine within 2% or one line (never approvable), a floor of lines
and facilities at about a tenth of the real list (never approvable: an error
page or a truncated file), and the change since the last successful run that
read it: at most 10% or 3 facilities, 25% of bytes (approvable). Then 99% of
the sites placed in their commune, and the circuit breakers on Switzerland's
own pages as everywhere.

### Schedule and monitoring

The scheduler runs `etl:ch` on the 3rd of each month at 22:30 UTC
(`docker/crontab`), `ETL_CH_SCHEDULE_ARGS` narrows it; exit codes as for
Austria (3: imported without a list; a list turned off is not one, see
[Turning a list off](#turning-a-list-off)). The FOPH's 2023 figures do not change: a
later edition is read only once its terms allow commercial use, by changing
`CH_HOSPITAL_FIGURES_YEAR` (its sites' keys change with their names: review
the blocked run).

### Measured run (files of 26–27 November 2026)

A dry run over the real files (`--source-dir`, places imported first): 1,414
facilities, 234 hospitals, 218 psychiatric clinic sites (many of them
outpatient), 71 rehabilitation and 74 specialised clinics, 16 birth centres,
621 nursing homes and 180 pharmacies; 911 at their list's point, 503 at their
locality's; every site placed in its commune; 1,112 listing pages, 268
indexable. Per canton, nursing homes: Zürich 211, Bern 267, Geneva 54,
Basel-Stadt 40, Basel-Landschaft 34, Jura 13 (and 2 in Solothurn on Bern's
list); pharmacies: Geneva 131, Basel-Landschaft 48 (and 1 in Vaud on Geneva's
list). The whole run takes about a second.

### Local development

```sh
bun run --cwd packages/etl fixtures:ch                       # regenerate the synthetic fixtures
bun run etl:ch --source-dir packages/etl/fixtures/ch --offline
ETL_TEST_DATABASE_URL=… bun run --cwd packages/etl test     # includes test/ch-integration.test.ts
```

The fixtures (`packages/etl/fixtures/ch`) are synthetic: made-up facilities in
each list's exact format, with invented people and e-mail addresses the tests
check are never stored; the cantons, districts and communes are the real ones.

## Estonia

`etl:ee` builds Estonia's directory (`/ee`) from the Health Board's register of
healthcare providers and their activity licences and from the State Agency of
Medicines' register of pharmacies (issue #165,
[ADR 0002](./adr/0002-multi-country.md#estonia-ee)). Everything above about
roles, ownership, the outbox and `--approve` applies; this section says what
differs.

```sh
bun run etl:places --country ee   # once (etl:ee does it on its first run), then when the division changes
bun run etl:ee                    # weekly (the register is rebuilt daily)
bun run etl:ee --dry-run          # everything, then roll back
bun run etl:ee --approve=<run_id> # accept what a blocked run reported
```

An Estonian page is a **provider**: an institution holding at least one activity
licence (tegevusluba) of the Health Board, with every place where it provides
care, or a general pharmacy. The register also names the health workers
registered with each provider (28,337 rows in November 2026): they are **never
read** (ADR 0002, "Estonia": providers only, for now). Some 60 providers are sole
traders registered under their own name ("Mari Näidis"): their page prints the
name as published, under the privacy notice's article 14 information and the
objection form, as in Czechia.

### Sources

Verified on 27 November 2026 on andmed.eesti.ee (the dataset records and their
`license` field), the publishers' pages and the metadata catalogue.

| Source                                                                                                                        | Distribution                                                                                                                                                                                                                               | Licence, format, update                                                                                                                                                                                                                                   |
| ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tervishoiuteenuse osutajate ning tegevuslubade andmestik (Terviseamet; the healthcare information system MEDRE, run by TEHIK) | `https://medre.tehik.ee/api-common/public/companies/open-data` (`od_asutused.xml`, the "Asutused" file of `https://medre.tehik.ee/open-data`); dataset `andmed.eesti.ee/datasets/tervishoiuteenuse-osutajate-ning-tegevuslubade-andmestik` | **CC BY-NC-SA 3.0** (unported, the portal's `CC_BY_NC_SA_3.0`); XML, 14.5 MB, 1,570 providers, 3,029 licences; rebuilt daily (`hetk`); field description: "Terviseameti registrite avaandmed" (updated 11.10.2023)                                        |
| Ravimiameti tegevuslubade register: apteekide koondandmed (Ravimiamet)                                                        | the export button "Apteekide koondandmed" of `https://rkav.tehik.ee/rkav/faces/pages/tegevuslubaForm/tegevuslubaOtsing.xhtml`; dataset `andmed.eesti.ee/datasets/ravimiameti-tegevuslubade-register`                                       | **CC0 1.0**; CSV (`;`, quoted, UTF-8 with a BOM), 100 KB, 495 pharmacies and branches; current on every request                                                                                                                                           |
| Aadressiandmete süsteem (ADS): aadressid ja posti sihtnumbrid (Maa- ja Ruumiamet)                                             | `https://geoportaal.maaruum.ee/docs/aadress/sihtnumbrid.zip`; metadata record `b0bd266e-b4c6-45db-b7ea-f47486b6258b`                                                                                                                       | **CC0 1.0** (the metadata record's constraint); CSV in a ZIP, 30 MB (148 MB inflated), 1,369,879 addresses in force with their postcode and point in L-EST97; rebuilt on the 5th of every month                                                           |
| Haldus- ja asustusjaotus: asustusüksused (Maa- ja Ruumiamet; the units of Statistics Estonia's EHAK classification)           | `https://s3.pilw.io/rp-kemit-kataster/EHAK/asustusyksus_shp.zip`, linked from `https://geoportaal.maaruum.ee/est/ruumiandmed/haldus-ja-asustusjaotus-p119.html`                                                                            | **open data, credited** "Haldus- ja asustusjaotus: Maa- ja Ruumiamet {date}" (the page's licence note; the Board's open data licence, `https://geoportaal.maaruum.ee/opendata-licence`); shapefile, 17 MB, 4,715 settlements; monthly; places import only |

`ETL_EE_MEDRE_URL`, `ETL_EE_APTEEGID_URL`, `ETL_EE_ADS_URL` and
`ETL_EE_PLACES_URL` override them. MEDRE's former `mveeb.sm.ee/od/*.xml` files
are gone.

**The pharmacies' export** is the register's own public search page: `etl:ee`
opens it (keeping its session cookie), reads the form that holds the button
labelled "Apteekide koondandmed" with its hidden fields and default choices, and
submits it as a browser does; the answer must be a CSV attachment. No CAPTCHA,
login or rate limit stands in the way, and nothing is guessed: a changed page
fails the source, which keeps its pharmacies (exit 3).

**Licences and attributions** (`estonia.registries`, printed on the data sources
page and the pages built from them):

- The Health Board's register: **CC BY-NC-SA 3.0**, credited "Terviseamet,
  tervishoiuteenuse osutajate ning tegevuslubade andmestik (MEDRE), CC BY-NC-SA
  3.0; Apercura on andmeid muutnud", with the licence's URL. **Non-commercial**:
  Apercura's instance is free, with no ads, no paid ranking and no paid feature,
  so its republication is not "primarily intended for or directed toward
  commercial advantage" (§ 4(c) of the licence); an operator with a commercial
  purpose must not import it ([self-hosting.md](./self-hosting.md#estonia-non-commercial-data)).
  **Share-alike**: the Estonian data as republished (pages, listings, sitemaps) is
  under CC BY-NC-SA 3.0, which the data page says; no other licence is claimed on
  it. A letter asks the Health Board to confirm this reading
  ([`data-requests/ee.md`](./data-requests/ee.md)).
- The State Agency of Medicines' register and the address data: CC0 1.0, no
  attribution required; credited anyway ("Ravimiamet, tegevuslubade register";
  "Aadressiandmed: Maa- ja Ruumiamet").
- The administrative and settlement division: credited "Haldus- ja
  asustusjaotus: Maa- ja Ruumiamet 01.11.2026" (`EE_PLACES_DATE` in
  `packages/core/src/country/ee.ts`, the `EKSPORT` date of the file the places
  came from; `etl:places --country ee` prints a warning when the file's date
  differs, and the constant is raised with the places).

**Not used**: the register's health workers (`tootajad`) and its family doctors'
lists (`od_nimistud`, which name the doctor and nurses of each list), the
pharmacists' file (`od_apteekrid`), TEHIK's MEDRE person datasets, the Health
Insurance Fund's contract partner lists and OpenStreetMap; see
[`data-requests/ee.md`](./data-requests/ee.md).

### Identifiers

The register publishes each provider's Business Register code; a page never
uses it (a sole trader's code names the person, and the page does not need it).
A provider is keyed by its **lowest-numbered activity licence in force**, the
register's immutable licence designation (`L01909`), which the Advertising Act
(§ 22(3)) has every page about a provider print anyway; licence numbers only
grow, so the key holds while that licence does. A provider whose first licence
ends is listed again under its next one, and the old page is removed after two
runs. A pharmacy is keyed by the register's place of business code
(`Tegutsemiskoha kood`). One scheme per source (`EE_ID_SCHEMES`,
`packages/core/src/slugs.ts`), whose letters name it in the URL:

| Scheme   | Key                                                      | URL                                         |
| -------- | -------------------------------------------------------- | ------------------------------------------- |
| `EE-TTL` | the five digits of the provider's first licence in force | `/ee/asutus/naidise-perearstikeskus-l00021` |
| `EE-APT` | the State Agency of Medicines' place of business code    | `/ee/asutus/naidise-apteek-ap9001`          |

Each place of activity of a provider is a site of its own (`source` `ee-medre`,
key `{licence digits}-{ten hex digits of the SHA-256 of its address}`), linked by
one activity `{licence digits}@{site key}`; a pharmacy has one (`ee-ravimiamet`).
A place a provider no longer lists loses its activity in the run that no longer
reads it.

### Minimisation and what is left out

- Read from the register: the provider's name and, per licence, its number,
  validity, kind of licence and of hospital, and its places of activity with
  their address and services. **Never read into a row, so never stored**: the
  Business Register code, the legal (seat) address and every health worker (the
  `tootajad` element is cut out of each record before anything else is read).
- Read from the pharmacies' export: name, address, address id, kind, licence
  number, place of business code and phone. **Never read**: the responsible
  pharmacist (`Pädev isik`), fax, e-mail and licence holder. A number shared by
  more than three pharmacies is a chain's and is dropped (`MAX_PHONE_OWNERS`).
  The register publishes no phone for providers.
- Names: the legal form at the start or end is dropped (`OÜ`, `AS`, `SA`, `MTÜ`,
  `TÜ`, `UÜ`, `FIE`, written out or not: "Sihtasutus Ida-Viru Keskhaigla" →
  "Ida-Viru Keskhaigla"), as Germany drops `GmbH`; a name the register writes in
  capitals only is re-cased word by word ("SIHTASUTUS AHTME HAIGLA" → "Ahtme
  Haigla"), abbreviations such as `HIV` kept; mixed case is printed as published
  ("Erapolikliinik PRAXIS").
- Kinds (`eeProviderKind`, `packages/core/src/taxonomy/ee.ts`), the first that
  applies: a hospital (a specialist care licence of a regional, central, general,
  local, special or rehabilitation hospital), a family practice (a general
  practice licence), a dental clinic (specialist care whose every service is
  dental), another specialist provider, then nursing care (nursing hospitals
  included), midwifery, physiotherapy, psychological treatment and speech
  therapy. A provider whose only licences are ambulance services is not listed
  (`skipped["ambulance only"]`).
- Places of activity left out: those whose only services are school health
  (`T0001`, a school nurse's office for its pupils) or ambulance (`T0014`), and
  those without a county and municipality (mobile units: "Eesti Vabariik
  (mobiilne …)"). A provider left with none is not listed (`skipped["no place a
patient visits"]`). Of several addresses written as one ("Aia tn 7 // Uus tn
  12"), the first is kept.
- Licences not in force on the run's day (`--as-of`, default today in Tallinn)
  are not read; the register holds none today.
- Pharmacies: general pharmacies (üldapteek) only; hospital pharmacies serve their
  wards and veterinary ones animals (`skipped`).
- Qualifications (`source`): `tegevusluba` (each licence's number and kind),
  `haiglaliik` (the kind of hospital), `teenus` (each service of the kept places,
  as the register names it), and for a pharmacy `apteegi-tegevusluba` (the State
  Agency of Medicines' licence number).
- GDPR objections: the rows of a suppressed key are dropped while parsing
  (`stats.suppressedLines`), and the purge of #116/#118 runs in the merge, as in
  the other markets.

### Places and precision

Places (`directory.places`, `country = 'EE'`), from the Land Board's settlements'
shapefile (`asustusyksus_shp.zip`, the table in Windows-1257, the polygons in
L-EST97), imported once:

- **regions**: the 15 counties (`0037` Harju maakond); no listing pages;
- **departments**: the 78 municipalities (`0784` Tallinn, `0793` Tartu linn,
  `0653` Rae vald), named and slugged as EHAK names them (`tartu-linn`,
  `rae-vald`);
- **communes**: the 4,715 settlements (towns, small towns, boroughs, villages)
  and the districts of Tallinn and Kohtla-Järve (`Kesklinna linnaosa`), slugged
  unique within their municipality. A municipality that is one town (Keila,
  Loksa, Maardu, Narva, Rakvere, Sillamäe, Viljandi, Võru) has that town as its
  only settlement, under the municipality's own code: like Paris, its city page
  is its municipality's.

A settlement's point is an interior point of its largest ring
(`interiorPoint`), converted from L-EST97 in code (`src/sources/ee/lest97.ts`,
the Lambert conformal conic formulas, equal to PostGIS's `ST_Transform` from
EPSG:3301 to the millimetre); municipalities and counties take the centre of
their settlements.

A place of activity is placed (`placeAddress`, `src/sources/ee/places.ts`) by
the names of its address, which the register writes as the address data system
normalizes them (`Tartu maakond, Tartu linn, Tartu linn, Ülase tn 16`): the
settlement it names within its municipality, else the municipality's town of the
same name (`Harju maakond, Keila linn, Pargi tn 2b`). It is **located** at the
address data system's point of that full address (a pharmacy first by its
address id): `geo_precision = 'address'`, `geo_source = 'source'`, a map pin and
the ADS postcode. An address the file does not have (a village named alone, a
building's own name) is located at its settlement's centre (`'city'`,
`'centroid'`, no pin, no postcode). A place whose settlement cannot be told is
left out. The address prints the street and number, then the postcode and the
place as a postal address names it: a town without the word "linn" (`Tartu`,
`Kuressaare`), a city district by its city (`Tallinn`, `Kohtla-Järve`), a small
town or village as named (`Haabneeme alevik`). No geocoder is called.

### Guards

Per source (`checkEeSource`): quarantine within 1%; floors of lines and rows
(`medre` 150 and 100, `apteegid` 60 and 50; never approvable); the register's
extract date (`hetk`) never older than the last imported (never approvable); at
most 10% more or fewer providers and 30% more or fewer bytes than the last
successful run that read it (approvable). A source that cannot be fetched, read
or pass its floors is left out and keeps its rows (they are not counted
missing); the run imports the other and exits `3`. The address file locates
both: when it cannot be fetched or read (or holds fewer than 500,000 lines) the
run fails and the pages stay as they are. After placing (`checkEePlaces`): 95%
of the places in their settlement and 80% at their address (approvable). Then
the breakers on Estonia's own pages, as everywhere.

**Absences** (`EE_MISSING_RUNS`): a provider or pharmacy missing from its
source twice in a row is removed. A claimed page is kept and counted for review.

### Schedule and monitoring

The scheduler runs `etl:ee $ETL_EE_SCHEDULE_ARGS` every Thursday at 03:30 UTC
(`docker/crontab`), when no other import runs. The register is rebuilt every day
(its file never repeats itself), so a weekly run always imports; the run takes a
few seconds after its downloads (45 MB). Alert on exit codes 1, 2 and 3, and
when the extract read (`stats.sources.medre.edition`) is more than a week old.

```sql
-- Estonia's last runs: status, extract, per-source counters, placement and totals.
SELECT id, status, finished_at, stats -> 'sourceErrors' AS errors,
	stats -> 'sources' -> 'medre' -> 'edition' AS extract, stats -> 'batch' -> 'placement' AS placement,
	stats -> 'totals' AS totals
FROM directory.etl_runs WHERE source = 'ee' ORDER BY id DESC LIMIT 5;
```

### Measured run (files of 27 November 2026)

Laptop, local PostGIS 17, fresh database, the real files (downloaded once into a
scratch directory), offline:

|            |                                                                                                                                                                                                                                  |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Duration   | places 0.9 s; dry run 5.5 s (reading the address file 3.4 s, read models 0.7 s), peak RSS 0.29 GB                                                                                                                                |
| Register   | 1,570 providers read, 1,518 listed: 7 ambulance services only, 45 with no place a patient visits (school health, ambulance, mobile units); 507 school-health or ambulance places and 55 mobile places left out; none quarantined |
| Pharmacies | 495 rows, 469 general pharmacies listed (25 hospital and 1 veterinary pharmacy left out); 468 with a phone, none shared by more than three, 1 unreadable                                                                         |
| Kinds      | hospitals 33 · family practices 391 · dental clinics 436 · specialist care 449 · nursing care 92 · midwifery 3 · physiotherapy 84 · psychological treatment 16 · speech therapy 13 · pharmacies 469 (1,986)                      |
| Places     | 2,755 sites (341 providers have several), all in their settlement: 2,722 at their address, 33 at their settlement's centre; 1 place left out (unknown settlement), so 1 provider unlisted                                        |
| Indexable  | 1,986 provider pages; 373 indexable listing pages of 1,138                                                                                                                                                                       |
| Places     | 15 counties, 78 municipalities, 4,715 settlements (EHAK, 1 November 2026)                                                                                                                                                        |

### Local development

```sh
bun run etl:places --country ee --source-dir packages/etl/fixtures/ee   # synthetic places
bun run etl:ee --source-dir packages/etl/fixtures/ee --offline          # synthetic data
bun run --cwd packages/etl fixtures:ee                                  # regenerate the fixtures
```

`packages/etl/fixtures/ee` holds **synthetic** files in the sources' exact
formats (`od_asutused.xml`, `apteekide_koondandmed.csv` with its BOM and quoting,
`sihtnumbrid.zip` with points in L-EST97, `asustusyksus_shp.zip` with its table in
Windows-1257) for eleven real settlements of six counties drawn as small squares
around their real centres, generated deterministically by
`packages/etl/fixtures/generate-ee.ts`: made-up providers of every kind, a
hospital with a nursing licence, a village named alone, a school nurse's office
and a mobile unit, an ambulance service, an ended licence, a broken licence
number, an unknown municipality, a single-town municipality's address without a
settlement, a hospital and a veterinary pharmacy, a pharmacy whose address id is
gone, a chain's shared number, and made-up health workers, registry codes, legal
addresses, pharmacists, e-mails and holders (to check they are never stored),
with filler rows above the floors. Never commit real rows.
`test/ee-integration.test.ts` imports them next to the French fixtures: France
untouched both ways, names, kinds, licences, services and nothing unneeded
stored, placement and precision, read models without county listings,
idempotence, a dry run, an older extract refused, an unreadable source left out,
a missing address file failing the run, absences after two runs, objections, the
breaker and `--approve`.

## Poland

`etl:pl` builds Poland's directory (`/pl`) from RPWDL, the register of entities
performing medical activity (issue #164,
[ADR 0002](./adr/0002-multi-country.md#poland-pl)). Everything above about roles,
ownership, the outbox and `--approve` applies; this section says what differs.

```sh
bun run etl:places --country pl   # once (etl:pl does it on its first run), then yearly
bun run etl:pl                    # weekly (the register is published daily: an unchanged export is skipped)
bun run etl:pl --dry-run          # everything, then roll back
bun run etl:pl --as-of 2026-11-27 # read the register for another day (default: today in Warsaw)
bun run etl:pl --approve=<run_id> # accept what a blocked run reported
```

A Polish page is a **healthcare establishment** (zakład leczniczy) of a
healthcare entity (podmiot leczniczy), the register's unit of care at one or more
addresses: a hospital, a primary care or specialist clinic, a dental clinic, a
hospice, a care home, a sanatorium, a laboratory. Its places of care are the
distinct addresses of its active units (jednostki) and cells (komórki). The
register's other part, the **individual and group practices** of doctors,
dentists, nurses, midwives and physiotherapists (praktyki zawodowe), is never
read: listing named practitioners without their consent waits for a Polish legal
opinion (NSA III OSK 1052/21; see the ADR and ROADMAP.md).

### Sources

Verified on 27 November 2026 on dane.gov.pl (through its API), eTERYT and
geoportal.gov.pl. Their attributions are printed on every page and on the data
sources page (`/pl/dane`) and kept in `poland.registries`
(`packages/core/src/country/pl.ts`).

| Source                                                                                   | Distribution                                                                                                                                                                                                                           | Licence, format, update                                                                                                                                                                                                                                                                                    |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RPWDL, healthcare entities (Centrum e-Zdrowia; dane.gov.pl dataset 728)                  | `https://api.dane.gov.pl/resources/70070/file` (a stable link to the nightly copy; Centrum e-Zdrowia serves the same ZIP at `rpwdl2.ezdrowie.gov.pl/api/rpwdl-public-resource/ledgers-zip/initial?…activityType=HEALTHCARE_PROVIDER…`) | **CC BY 4.0** with the reuse condition of art. 15 ust. 1 pkt 1 of the open data act (the source, the time of production and the time of obtaining); a ZIP of `;`-separated, quoted UTF-8 CSV files (`NULL` for empty), 35 MB (300 MB inflated); daily, "stan rejestru aktualny na 24:00 poprzedniego dnia" |
| TERYT: TERC, the official file (Główny Urząd Statystyczny)                               | eTERYT's page of the full files, whose form serves `TERC_Urzedowy_{date}.zip` (posted back as its "Pobierz" button does: no login, no CAPTCHA)                                                                                         | public and free ("jawny… bezpłatnie wszystkim użytkownikom"), CC BY 4.0 on the GUS portal; a CSV of 4,360 rows, `STAN_NA` 2026-01-01; places import only                                                                                                                                                   |
| PRG: administrative units (Główny Urząd Geodezji i Kartografii; dane.gov.pl dataset 726) | `https://opendata.geoportal.gov.pl/prg/granice/00_jednostki_administracyjne.zip`                                                                                                                                                       | **CC BY 4.0**, material of the State Geodetic and Cartographic Resource, free (geodetic law art. 40a ust. 2 pkt 1 lit. a), the source stated (art. 40c ust. 3); polygon shapefiles in ETRS89 degrees, 377 MB, weekly; only `A03_Granice_gmin` (2,479 gminas) is read; places import only                   |

`ETL_PL_URL`, `ETL_PL_TERC_URL` and `ETL_PL_PRG_URL` override them. The export's
`Info.txt` gives the date and time the report was generated ("Raport wygenerowany
na podstawie danych w systemie RPWDL z dnia 2026-11-27 00:00:00"): the run records
it as the file's date (`files.rpwdl.lastModified`, `stats.producedAt`), the time of
production a page's attribution states, next to the time of obtaining (the day of
the run). RPWDL also publishes the struck-off entities (`activeLedgers=false`):
not read.

### Identifiers

One scheme, `PL-RPWDL`: the establishment number `ID ZOZ`, and the page URL ends
with it (`/pl/placowka/przychodnia-przykladowa-900001`; the reference
`pl:900001`). A site is one address of the establishment's units and cells, keyed
by the establishment number and a hash of its TERYT, SIMC, street, building and
flat (`290629:3f2a9c01d4`), the activity `{ID ZOZ}@{site}`. The entity's register
book number, NIP and REGON are never used: a sole trader's identify a person.

### Kinds and fields

`classifyPlEstablishment` (`packages/core/src/taxonomy/pl.ts`) reads an
establishment's kind from its kind of activity (`Rodzaj działalności`: `1`
hospital care, `2` inpatient care outside hospitals, `3` outpatient care; a
misprinted or empty one from the cells) and the part VIII codes of its active
cells (the ministry's identification codes, `kodResortVIII`):

- `1`: a hospital (`szpitale`), a sanatorium when its only wards are spa wards;
- `2`: a hospice (`hospicja`), a care home (`zaklady-opiekuncze`, ZOL and ZPO), a
  sanatorium (`sanatoria`), an addiction treatment centre (`leczenie-uzaleznien`),
  else other inpatient care (`opieka-stacjonarna`);
- `3`, in this order: a hospice, a primary care clinic with a doctor
  (`przychodnie-poz`), night and holiday care (`nocna-pomoc-lekarska`), a
  specialist clinic, a dental clinic (`stomatologia`), rehabilitation
  (`rehabilitacja`), nurses and midwives (`pielegniarki-i-polozne`), diagnostics
  (`diagnostyka`), else another outpatient establishment (`inne-placowki`).

A specialist clinic of one or two of the 24 fields with a listing
(`PL_SPECIALTIES`: `poradnie-kardiologiczne`, `poradnie-ginekologiczne`…) is listed
under the most specific; a clinic of three fields or more, or of fields without a
listing, under `przychodnie-specjalistyczne`. Left out, counted in
`stats.sources.rpwdl.skipped`: establishments whose only cells are school nurses,
emergency or sanitary transport teams, or blood banks; closed establishments
(`Data zakończenia działalności` on or before `--as-of`), establishments not yet
open, and those of a struck-off or closed entity. A unit or cell that has ended,
or is suspended on the day, is not active. Every cell kind is stored as a
qualification (`source = 'komorka'`, the dictionary's label), with the kind of
activity (`rodzaj`), the beds (`lozka`), the ownership (`forma`: public for an
SP ZOZ, a budget unit, a research institute or a company at least 51% public)
and, for an operator that is not a natural person, the entity's name
(`podmiot`).

### Minimisation and what is left out

- Read from the files: the entities' book id, legal form, name, activity dates;
  the establishments' number, kind, name, address, phone and dates; the units'
  and cells' address, phone, part VIII code and label, beds and dates. **Never
  read into a row, so never stored**: the entities' NIP, REGON, register book
  number, seat, phone, e-mail and website; every e-mail address and website; the
  services (`swiadczenia.csv`), inspections and accreditations.
- **Natural persons.** 11,259 entities are sole traders (forms `0700`, `0702`),
  whose business name is their first and last name; partnerships (`08xx`–`12xx`)
  usually name their partners. Their entity name is never stored, nor their
  units' names. The page is named after the establishment, whose name loses the
  person's name where the entity's name gives it (`src/sources/pl/names.ts`):
  first names are learnt from the register itself (common among natural persons,
  rare among companies), the surname is the word after or before one, a business
  word (by its stem, "stomat", "med", "dent", "gabinet"…, or by how often the
  companies use it) is never a name, initials and spaced hyphenated surnames are
  read, and an entity named by a foreign name alone has its whole name taken out;
  the professional titles left before it go too ("lek. stom."). A name that was
  the person's only is replaced by the establishment's address. The rule is
  best-effort: some names slip through (a plural family name, a surname alone,
  "Nowak i Partnerzy"), and some brand words go with a name; the article 14
  notice and removal on objection cover them
  (`stats.sources.rpwdl.counters.namesStripped`, `namedByAddress`,
  `naturalPersons`).
- A published number is stored as the place's only when at most three
  establishments carry it (`MAX_PHONE_ESTABLISHMENTS`): a laboratory network prints
  its call centre's number on its collection points (`counters.sharedPhones`).
- Quarantined lines keep their establishment number only (never a name).
- GDPR objections: the suppressed establishments are dropped before staging, and
  the purge of #116/#118 runs in the merge, as in the other markets.

### Places and precision

Places (`directory.places`, `country = 'PL'`), from TERC and PRG, imported once:

- **regions**: the 16 voivodeships (`12`), named `województwo małopolskie`,
  slugged by their adjective (`malopolskie`), with listings of their own
  (migration `0030_pl_market`: each voivodeship has its branch of the National
  Health Fund and its wojewoda keeps the register);
- **departments**: the 380 powiats (`1206`), named the way people say them
  (`powiat krakowski`), the 66 cities with powiat rights by their city (`Kraków`,
  `1261`);
- **communes**: the 2,479 gminas, coded by TERYT with their kind (`1206113`); a
  rural gmina named like another gmina of its powiat reads `Bolesławiec (gmina
  wiejska)`. A city with powiat rights is a powiat and a gmina at once
  (`1261011`): like a kreisfreie Stadt, its city page is its powiat's (the web app
  skips a gmina of a powiat numbered from 61). Each gmina's centre is an interior
  point of its boundary in PRG (the centroid of its largest ring when inside the
  gmina, holes counted: a rural gmina often surrounds its town; else the middle of
  its widest stretch), in ETRS89 degrees.

No arrondissement: a town or the rural area of an urban-rural gmina (kinds `4`,
`5`) is read as its gmina (`3`), and a district of Warsaw (`8`) or a delegation
of Kraków, Łódź, Poznań or Wrocław (`9`) as its city, since two thirds of the
register's Warsaw units carry the city's code only. A site is placed (`stagePl`
in `src/merge-pl.ts`) in the gmina of its TERYT code, else the only gmina named
like its locality, else the powiat of its code, and located at its gmina's point
(`geo_source = 'centroid'`, `geo_precision = 'city'`, no map pin): the register
publishes no coordinates.

### Guards

Before the merge (`PL_LIMITS` in `src/guards.ts`):

- the ZIP is between 1 KB and 400 MB and holds the four CSV files with the
  register's columns; otherwise the run **fails** (one register: the pages stay);
- at most 1% of the establishments' lines quarantined, at least 1,000 lines and
  300 establishments imported (never approvable);
- at most 5% more or fewer establishments and 15% more or fewer bytes than the
  last successful run: otherwise **blocked** (approvable).

After staging: less than 98% of the sites placed in a gmina (`pl.places`) blocks
the run (approvable). After the merge, the circuit breakers and the orphan check
apply to Poland's own pages only.

### Schedule and monitoring

The scheduler runs `etl:pl $ETL_PL_SCHEDULE_ARGS` every Tuesday at 04:30 UTC, when
no other import runs (`docker/crontab`; one advisory lock for every import). Exit
codes: 1 failed, 2 blocked. Alert on both and on the import age above 10 days (the
export is daily, so most weeks bring a change).

```sql
-- Poland's last runs: status, the report's date, placement, minimisation and totals.
SELECT id, status, finished_at, files -> 'rpwdl' ->> 'lastModified' AS produced,
	stats -> 'staged' AS staged, stats -> 'sources' -> 'rpwdl' -> 'counters' AS counters,
	stats -> 'totals' AS totals
FROM directory.etl_runs WHERE source = 'pl' ORDER BY id DESC LIMIT 5;
```

### Measured run (export of 27 November 2026)

Laptop, local PostGIS, fresh database, the real files downloaded that day (the
run quoted in the pull request):

|                 |                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Duration        | places 1 s (from the downloaded files); dry run 37 s (parse 5.7 s, read models 12 s), peak RSS 0.4 GB in the parse                                                                                                                                                                                                                                                                                                  |
| Lines           | 37,888 establishments: 34,072 imported, 2 quarantined (no place of care); left out 3,100 closed, 75 not yet open, 2 of struck-off entities, 350 emergency or transport teams only, 260 school nurses only, 27 blood banks only                                                                                                                                                                                      |
| Establishments  | przychodnie-poz 7,076 · stomatologia 5,521 · specialist clinics 8,775 (3,546 of many fields; e.g. ginekologiczne 642, okulistyczne 628, zdrowia psychicznego 592) · inne-placowki 5,275 · rehabilitacja 2,294 · szpitale 1,372 · diagnostyka 986 · pielegniarki-i-polozne 756 · hospicja 674 · zaklady-opiekuncze 515 · opieka-stacjonarna 297 · sanatoria 217 · nocna-pomoc-lekarska 192 · leczenie-uzaleznien 122 |
| Natural persons | 17,681 establishments of a natural person or a partnership of them; 4,258 names without the person's, 64 named after their address                                                                                                                                                                                                                                                                                  |
| Phones          | 57,429 sites with a number; 2,262 shared numbers left out, 610 not plausible                                                                                                                                                                                                                                                                                                                                        |
| Sites           | 61,408, all at their gmina's point: 61,147 placed by TERYT code, 169 by locality name, 92 in their powiat only, none unplaced                                                                                                                                                                                                                                                                                       |
| Indexable       | 34,072 establishment pages; 7,036 indexable listing pages of 20,499                                                                                                                                                                                                                                                                                                                                                 |
| Places          | 16 voivodeships, 380 powiats, 2,479 gminas, every gmina located                                                                                                                                                                                                                                                                                                                                                     |

### Local development

```sh
bun run etl:pl --source-dir packages/etl/fixtures/pl --offline --as-of 2026-11-27   # synthetic data
bun run --cwd packages/etl fixtures:pl                                               # regenerate the fixtures
```

`packages/etl/fixtures/pl` holds a **synthetic** export in the register's exact
format (`rpwdl.zip`: the four CSV files and `Info.txt`), a small TERC file
(`terc.csv`: three voivodeships, five powiats, eight gminas and their parts, real
codes and names) and a small PRG archive (`prg-jednostki-administracyjne.zip`:
made-up square boundaries, a rural gmina surrounding its town), generated by
`packages/etl/fixtures/generate-pl.ts`: made-up establishments and sole traders
(establishment numbers from 900001, tax and statistical numbers from 99), made-up
streets, seats and e-mail addresses ending in `example.invalid` (to check they are
never stored), a laboratory sharing one number, a closed establishment and one of
a closed entity, school nurses only, and 1,000 dental clinics above the floors.
Never commit real rows. The anchors the end-to-end tests use: `900001` Szpital
Przykładowy (Warszawa), `900002` a sole trader's dental clinic in Kraków (her
name taken out), `900003` a cardiology clinic in Skawina, `900004` a primary care
clinic at two places in Bolesławiec's two gminas, `900005` objected to in the
integration test. `test/pl-integration.test.ts` imports them next to the Czech
fixtures: Czechia untouched, nothing of a natural person stored, placement by
code, voivodeship listings, idempotence, an unreadable export, absences,
objections, the breaker and `--approve`.

## Norway

`etl:no` builds Norway's directory (`/no`) from the Brønnøysund Register
Centre's Central Coordinating Register for Legal Entities (Enhetsregisteret):
its establishments (underenheter) registered under a health or pharmacy industry
code (issue #172, [ADR 0002](./adr/0002-multi-country.md#norway-no)). Everything
above about roles, ownership, the outbox and `--approve` applies; this section
says what differs.

```sh
bun run etl:places --country no   # once (etl:no does it on its first run), then when the division changes
bun run etl:no                    # weekly (the register's files are rebuilt every night)
bun run etl:no --dry-run          # everything, then roll back
bun run etl:no --approve=<run_id> # accept what a blocked run reported
```

A Norwegian page is an **establishment**: a physical place of business with its
own organisation number, location address and main industry code, owned by a
main entity (a health trust, a municipality, a company). People are **never
listed**: a sole proprietorship (enkeltpersonforetak) is named after its owner,
and so are many one-doctor companies; both are left out by the filters below.
The register is a business register, not a licence register: an industry code
is what the undertaking declared, so the filters decide what is a place of care.

### Sources

Verified on 27 November 2026 on the publishers' pages, the API documentation and
Geonorge's metadata catalogue (`kartkatalog.geonorge.no/api/getdata/{uuid}`).

| Source                                                                | Distribution                                                                                                                                                                      | Licence, format, update                                                                                                                                                                                                                                              |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Enhetsregisteret: underenheter (Brønnøysundregistrene)                | `https://data.brreg.no/enhetsregisteret/api/underenheter/lastned/csv` ("Last ned totalbestand av underenheter i csv format")                                                      | **NLOD 2.0** (the API documentation: "License: Norsk lisens for offentlige data (NLOD)"; brreg.no: "Dataene i tjenesten er lisensiert med Norsk lisens for offentlige data (NLOD)"); gzipped CSV, 62 MB, 873,697 establishments; produced every night at about 05:00 |
| Enhetsregisteret: enheter (Brønnøysundregistrene)                     | `https://data.brreg.no/enhetsregisteret/api/enheter/lastned/csv`                                                                                                                  | **NLOD 2.0**; gzipped CSV, 155 MB, 1,182,050 entities; nightly. Read for the owners of the establishments kept only                                                                                                                                                  |
| Matrikkelen – Adresse (Kartverket), the cadastre's official addresses | `https://nedlasting.geonorge.no/geonorge/Basisdata/MatrikkelenAdresse/CSV/Basisdata_0000_Norge_4258_MatrikkelenAdresse_CSV.zip`; metadata `f7df7a18-b30f-4745-bd64-d0863812350c`  | **CC BY 4.0** (the metadata record's constraint, "Åpne data"); one `;` CSV in a ZIP, 152 MB (813 MB inflated), 2,605,320 addresses with their postcode and point in EUREF89 (EPSG:4258); updated continuously, extract of 21 November 2026                           |
| Administrative inndelinger: fylker og kommuner (Kartverket)           | `https://ws.geonorge.no/kommuneinfo/v1/fylkerkommuner`; metadata `3fcce35c-759b-4c6e-adb9-f03478c6fb72` (the API) and `041f1e6e-bdbc-4091-b48f-8a5990f3cc5b` (the municipalities) | open data, "no conditions apply" for the API; the municipalities **CC BY 4.0**, credited as such; JSON, 270 kB, 15 counties and 357 municipalities with a point inside each; places import only                                                                      |

`ETL_NO_UNDERENHETER_URL`, `ETL_NO_ENHETER_URL`, `ETL_NO_ADRESSER_URL` and
`ETL_NO_PLACES_URL` override them. The full files are the way the register's
documentation gives for a copy: its search API stops at 10,000 results
(`(page+1)*size`), and no rate limit, login or CAPTCHA stands in the way.

**Licences and attributions** (`norway.registries`, printed on the data sources
page and the pages built from them):

- The register: **NLOD 2.0**, whose § 5 asks to name the licensor as it says,
  else «Inneholder data under Norsk lisens for offentlige data (NLOD)
  tilgjengeliggjort av [lisensgiver]», with a link to the licence and the
  source, and to say when the data was changed. Brønnøysundregistrene specifies
  no wording, so every page prints «Inneholder data under Norsk lisens for
  offentlige data (NLOD) tilgjengeliggjort av Brønnøysundregistrene; endret av
  Apercura». NLOD § 3 does not cover personal data "unless there is a legitimate
  basis for the disclosure and further processing": one more reason the import
  lists establishments, never people.
- Kartverket's addresses and municipalities: **CC BY 4.0**, credited "Adresser:
  © Kartverket, CC BY 4.0" and "Fylker og kommuner: © Kartverket, CC BY 4.0".

**Not used**: the Norwegian Medical Products Agency's (DMP) list of pharmacies
("Landets apotek", 1,070 licences, no street addresses): no licence is stated on
dmp.no, so it is not republished (a request is in
[`data-requests/no.md`](./data-requests/no.md)); Helsedirektoratet's register of
health personnel (HPR), closed to bulk reuse; the GP lists (fastlegeordningen),
not open data; Norsk helsenett's address register, for members of the health
network only.

### Identifiers

One scheme, `NO-ORGNR`: the **establishment's** own organisation number (nine
digits, a modulus 11 check digit, verified before any lookup). The page URL ends
with it (`/no/virksomhet/eksempel-legesenter-910000039`), the reference is
`no:910000039`, and the page prints it as Norway writes it (`910 000 039`). An
establishment's number never names a person: sole proprietorships are not
listed.

### What is kept, and why

Read from the establishments' file, by header name: organisation number, name,
main industry code and its description, location address (street lines,
postcode, post town, municipality number, country), closure date, owner, and
the `telefon` number. Never read: e-mails, mobile numbers (`mobil`, often a
person's), websites, postal addresses, staff numbers, registration dates. From
the entities' file, for the owners of the establishments read: name, legal form,
and whether it is bankrupt or being wound up.

The industry codes read (SN2025, Statistics Norway's NACE) and the listing each
gives:

| Code                   | Description                                                               | Listing (`/no/…`)                                  |
| ---------------------- | ------------------------------------------------------------------------- | -------------------------------------------------- |
| 86.101                 | Somatiske sykehustjenester                                                | `sykehus`                                          |
| 86.102, 86.103, 86.104 | Psychiatric hospitals (adults, children), specialised addiction treatment | `psykisk-helsevern`                                |
| 86.210                 | Allmennlegetjenester                                                      | `legekontorer`; `legevakter` when named a legevakt |
| 86.221, 86.222         | Specialist medical practice, psychiatric practice                         | `legespesialister`                                 |
| 86.230                 | Tannlegetjenester                                                         | `tannklinikker`                                    |
| 87.102                 | Sykehjemstjenester                                                        | `sykehjem`                                         |
| 47.730                 | Detaljhandel med apotekvarer                                              | `apotek`                                           |

Physiotherapy (86.950), psychologists (86.930), ambulances, health stations and
the other codes are not read yet (ROADMAP.md): they are mostly sole
proprietorships. An establishment under a listed code is kept only when
(`exclusionOf`, `src/sources/no/filters.ts`, in this order; `stats.skipped`
counts each reason):

1. its owner is known and is **not a sole proprietorship** (`ENK`;
   `sole-proprietorship`, `owner-unknown`);
2. neither it nor its owner is **closed, bankrupt or being wound up**
   (`closed`, `winding-up`);
3. it has a **location address in Norway** (`no-address`);
4. its name names **no holding, investment, consulting, property, locum,
   purchasing, IT, building or administrative unit**, nor a bankrupt's estate
   (`not-a-place-of-care`: a health trust registers its purchasing and IT units
   under hospital codes);
5. its name is **not a person's practice** (`named-after-a-person`): a word
   naming a profession or a title on its own (`Lege Ola Nordmann AS`,
   `Dr. Hansen AS`, `Øyelege Kari Nordmann AS`, never a compound such as
   `legesenter` or `øyelegekontor`), or the plural first (`Legene Hansen og
   Berg`, `Tannlegene Nordmann`; `Tannlegene i Sentrum` is a place);
6. a GP, emergency, specialist or dental practice owned by anyone but a public
   body or a foundation (`KOMM`, `ORGL`, `KF`, `FYLK`, `FKF`, `STAT`, `SF`,
   `SÆR`, `IKS`, `KIRK`, `STI`) **names a place of care** (`legesenter`,
   `legekontor`, `klinikk`, `tannlegesenter`, `tannhelse`, `spesialistsenter`…;
   `no-place-of-care-in-name`); a pharmacy names an `apotek` (`not-a-pharmacy`).

A second establishment of the same kind, name and street in a municipality (a
practice registered by its company and by its partnership) is the same place:
the lower number is kept (`same-place`).

What remains can still be named after a person ("Klinikk Kleppe"): the privacy
notice gives the article 14 information and the objection form removes the page
for good. Minimisation:

- Names are printed re-cased (the register writes capitals only) with the
  trailing company form dropped (`AS`, `ASA`, `DA`, `ANS`, `NUF`, `SA`, `STI`,
  `BA`, `KF`, `IKS`, `FKF`); abbreviations stay (`HF`, `DPS`, `BUP`, `TSB`).
- An address line that is a care-of line (`c/o …`, which may name a person) is
  never kept (`counters.careOfLines`); a line naming a floor or an entrance is
  skipped for the street.
- A number shared by more than three establishments (a chain's switchboard) is
  dropped (`counters.sharedPhones`); one that is no Norwegian subscriber number
  too (`counters.invalidPhones`).
- Qualifications (`source`): `naeringskode` (the registered code and the
  register's description of it), and `eier` (the owner's number and name) only
  when the owner is a public body or a foundation (a health trust, a
  municipality, a county), never a company.
- GDPR objections: the rows of a suppressed number are dropped while parsing
  (`stats.suppressedLines`), and the purge of #116/#118 runs in the merge, as in
  the other markets.

### Places and precision

Places (`directory.places`, `country = 'NO'`), from Kartverket's counties with
their municipalities (`fylkerkommuner.json`), imported once:

- **departments**: the 15 counties of the 2024 reform (`46` Vestland), slugged
  `vestland`, `more-og-romsdal` (`slugifyNo`: `ø` → `o`, `æ` → `ae`, `å` → `a`);
- **communes**: the 357 municipalities (`4601` Bergen), each at the point
  Kartverket gives inside it (`punktIOmrade`), slugged unique within its county.
  Oslo is a county and a municipality (`0301`): like Paris, its city page is its
  county's. No regions, no migration: a county listing is a department listing.
- Names are Norwegian (`kommunenavnNorsk`: Kautokeino, Karasjok); the Sámi,
  Kven and Finnish official names come with the Sámi interface (ROADMAP.md).

An establishment is placed in the municipality its location address names
(`kommunenummer`); Svalbard (`21xx`) is no municipality and is left out. It is
**located** (`buildNoBatch`, `src/merge-no.ts`) at the cadastre's point of its
street address in that municipality, compared without case, punctuation or a
house number range (`Tunveien 5 - 7` → `tunveien 5`): `geo_precision =
'address'`, `geo_source = 'source'`, a map pin. An address the file does not
have (a building's name, a shopping centre) is located at its postcode's centre,
the mean of the postcode's address points (`'city'`, `'postcode'`, no pin), else
at the municipality's point (`'city'`, `'centroid'`). The address prints the
street, then the postcode and the post town (`2050 Jessheim`). No geocoder is
called.

### Guards

On the source (`checkNoSource`): quarantine within 1% of the establishments
under a listed code; floors of 100 establishments in the file and 100 kept, and
for a real download 500,000 establishments, 800,000 entities and 2,000,000
addresses (a truncated file; never approvable); at most 10% more or fewer
establishments kept and 30% more or fewer bytes than the last successful run
(approvable: a change of the filters or of the register's coding shows here
first). Norway has one source read from two files: when either cannot be
fetched or read, the run fails and the pages stay as they are; so does a run
without the address file. After placing (`checkNoPlaces`): 98% of the
establishments in their municipality and 75% at their address (approvable).
Then the breakers on Norway's own pages, as everywhere.

**Absences** (`NO_MISSING_RUNS`): an establishment missing from the register, or
no longer passing the filters, twice in a row is removed. A claimed page is kept
and counted for review.

### Schedule and monitoring

The scheduler runs `etl:no $ETL_NO_SCHEDULE_ARGS` every Friday at 03:30 UTC
(`docker/crontab`), when no other import runs. The register's files are rebuilt
every night, so a weekly run always imports; it takes about 10 seconds after its
downloads (370 MB, a few minutes). Alert on exit codes 1 and 2, and on a sharp
change of `stats.sources.brreg.skipped`.

```sql
-- Norway's last runs: status, counters, what the filters left out, placement and totals.
SELECT id, status, finished_at, stats -> 'sourceErrors' AS errors,
	stats -> 'sources' -> 'brreg' -> 'skipped' AS skipped, stats -> 'batch' -> 'placement' AS placement,
	stats -> 'totals' AS totals
FROM directory.etl_runs WHERE source = 'no' ORDER BY id DESC LIMIT 5;
```

### Measured run (files of 27 November 2026)

Laptop, local PostGIS 17, fresh database, the real files (downloaded once into a
scratch directory), offline:

|           |                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Duration  | places 0.4 s; dry run 10 s (reading the register's two files 3.4 s, the address file 3.2 s, read models 1.2 s), peak RSS 0.47 GB                                                                                                                                                                                                                                                                  |
| Register  | 873,697 establishments; 25,832 under a listed code; 5,823 kept. Left out: 15,474 sole proprietorships, 2,471 practices without a place of care in their name, 1,220 named after a person, 622 holding, consulting or administrative units, 82 with an owner bankrupt or being wound up, 47 non-pharmacies, 51 without an address, 25 without a known owner, 17 registered twice; none quarantined |
| Kinds     | hospitals 191 · mental health and addiction 586 · GP offices 1,515 · emergency clinics 108 · specialists 348 · dental clinics 1,118 · nursing homes 916 · pharmacies 1,039 (5,821)                                                                                                                                                                                                                |
| Places    | 5,821 sites in their municipality (2 on Svalbard left out): 5,206 at their address (89%), 609 at their postcode's centre, 6 at their municipality's point; 1,753 with a phone (93 shared numbers and 68 unreadable ones dropped); 1,777 care-of lines dropped                                                                                                                                     |
| Indexable | 5,821 establishment pages; 668 indexable listing pages of 1,761                                                                                                                                                                                                                                                                                                                                   |
| Places    | 15 counties, 357 municipalities                                                                                                                                                                                                                                                                                                                                                                   |

### Local development

```sh
bun run etl:places --country no --source-dir packages/etl/fixtures/no   # synthetic places
bun run etl:no --source-dir packages/etl/fixtures/no --offline          # synthetic data
bun run --cwd packages/etl fixtures:no                                  # regenerate the fixtures
```

`packages/etl/fixtures/no` holds **synthetic** files in the sources' exact
formats (`underenheter.csv.gz` and `enheter.csv.gz` with the register's real
headers, every field quoted, an address of two lines; `adresser.zip` with
Kartverket's header and EPSG:4258 points; `fylkerkommuner.json`) for seven real
municipalities of five counties, generated deterministically by
`packages/etl/fixtures/generate-no.ts`: made-up establishments of every kind, a
pharmacy whose address is not in the file, a care-of line, a sole
proprietorship, a company named after a doctor, a practice named after its
dentists, a holding company, a practice without a care word, physiotherapy, a
bankrupt owner, a purchasing unit, a closed nursing home, a unit on Svalbard, and
e-mails and mobile numbers (to check they are never stored), with filler rows
above the floors. Never commit real rows. `test/no-integration.test.ts` imports
them next to the French fixtures: France untouched both ways, names, kinds,
owners and nothing unneeded stored, placement and precision, county and
municipality listings, idempotence, a dry run, an unreadable file failing the
run, a missing address file failing it too, absences after two runs, objections,
the breaker and `--approve`.

## Ireland

`etl:ie` builds Ireland's directory (`/ie`, in English) from the Pharmaceutical
Society of Ireland's register of pharmacies, HIQA's register of designated
centres for older people and the HSE's Health Atlas layers on GeoHive (issue
#171, [ADR 0002](./adr/0002-multi-country.md#ireland-ie)). Everything above
about roles, ownership, the outbox and `--approve` applies, and the per-list
behaviour is Switzerland's; this section says what differs.

```sh
bun run etl:places --country ie          # once (etl:ie does it on its first run), then after a census
bun run etl:ie                           # weekly
bun run etl:ie --sources psi,hiqa        # some lists only (`--sources -hse-health-centres` leaves one out)
bun run etl:ie --dry-run                 # everything, then roll back
bun run etl:ie --approve=<run_id>        # accept what a blocked run reported
```

An Irish page is a **facility, never a person**: a retail pharmacy business, a
nursing home, a hospital or a health centre. No health professional is listed:
the registers of doctors, nurses, pharmacists and dentists cannot be downloaded
or republished ([`docs/data-requests/ie.md`](./data-requests/ie.md)), and what
the lists say of people is never read into a row (below). The written
legitimate-interest assessment is
[`docs/legal/legitimate-interest-ie.md`](./legal/legitimate-interest-ie.md).

### Sources

Verified on 27 November 2026 on each publisher's own terms: the PSI workbook's
"Terms & Conditions of Use" sheet and its [Terms of Use](https://www.psi.ie/terms-use),
HIQA's [disclaimer](https://www.hiqa.ie/disclaimer), each GeoHive item's
`licenseInfo`. Every credit is printed on the pages built from the list and on
the data sources page (`/ie/data`), and kept in `ireland.registries`
(`packages/core/src/country/ie.ts`).

| List (`--sources`)   | Distribution                                                                                                                                   | Terms and credit                                                                                                                                                                                                                                                                                                         | Format, rows (27 November 2026)                      |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| `psi`                | [Register of Pharmacies](https://www.psi.ie/information-and-resources/information-about-our-public-registers) (`Extract_of_Pharmacies_0.xlsx`) | PSI re-use conditions: free of charge in any format, source and copyright acknowledged, accurate, not misleading, not "for the principal purpose of advertising or promoting a particular product or service". `Source: Pharmaceutical Society of Ireland, Register of Pharmacies. © Pharmaceutical Society of Ireland.` | XLSX, monthly ("correct at: 02.11.2026"), 2,003 rows |
| `hiqa`               | [Register of designated centres for older people](https://www.hiqa.ie/areas-we-work/older-peoples-services) (`older_persons_register.csv`)     | HIQA's re-use terms, "subject to the latest PSI licence". `Source: Health Information and Quality Authority, register of designated centres for older people. © HIQA.`                                                                                                                                                   | CSV, live export, 548 rows                           |
| `hse-hospitals`      | [Hospitals – HSE Ireland](https://www.arcgis.com/home/item.html?id=feb34881088341bbbf80d86af6a4f333) (feature service, GeoJSON)                | CC BY 4.0. `Source: Health Service Executive, Health Atlas Ireland, Hospitals – HSE Ireland (March 2020), via GeoHive, CC BY 4.0.`                                                                                                                                                                                       | GeoJSON, a March 2020 snapshot, 132 features         |
| `hse-health-centres` | [Health Centres – HSE Ireland](https://www.arcgis.com/home/item.html?id=c2e825ef881b4e7daca59b0faa232b72)                                      | CC BY 4.0. `Source: Health Service Executive, Health Atlas Ireland, Health Centres – HSE Ireland (March 2020), via GeoHive, CC BY 4.0.`                                                                                                                                                                                  | GeoJSON, a March 2020 snapshot, 921 features         |

Each run reads the terms again: a PSI workbook whose terms sheet no longer
contains its re-use and advertising conditions, or a GeoHive item whose
`licenseInfo` no longer names CC BY 4.0, is left out of the run (exit code 3),
its pages kept, and says why in `stats.sourceErrors`. The PSI's "correct at"
date is the date the data page prints (`files.psi.lastModified`); HIQA's is its
export's `Last-Modified`; the HSE's layers say "March 2020" on every page they
build, because no later open list of the HSE's facilities was found.

**The PSI's advertising condition.** The register may not be used "for the
principal purpose of advertising or promoting a particular product or service".
Apercura is free, carries no advertising and sells no placement or ranking: it
lists every registered pharmacy the same way. A sponsored result, a paid
upgrade or an affiliate link on Irish pharmacy pages would breach the condition
([`docs/data-requests/ie.md`](./data-requests/ie.md#the-psis-and-hiqas-re-use-conditions)).

### Minimisation and what is left out

- PSI: `RPB Owner` (the company owning the pharmacy, at times a sole trader's
  name) is never read; the superintendent pharmacist is not in the extract. A
  trading name is shown as published (one in capitals is cased: 15 in November
  2026); it may carry a person's name, under the article 14 notice and the
  objection form.
- HIQA: never read are `Person_in_Charge` and its phone, `Management_Contacts`,
  the provider's address and phone, the registration conditions and dates; the
  Chief Inspector's notes are counted, not stored. The provider is shown ("Run
  by …") only when it is the HSE (112) or a company with a CRO number whose name
  names no member (399); 37 providers (individuals, partners "trading as",
  bodies "with A, B as members") are not stored. The CRO number decides and is
  not stored. Kept: the centre's phone, its maximum occupancy and the slug of its
  HIQA page (inspection reports).
- HSE: name, kind (`subcategory`), address and point only. The GP layer (names
  doctors) and the 2020 pharmacies layer (the PSI's register is current) are not
  read. Three health-centre rows that are not places of care (stores, civil
  registration, a Department of Social Protection office) and three repeats are
  left out.
- Eircodes are printed with the address and **never** used to place or locate a
  facility: the Eircode database is licensed, not open data. Comparing two
  lists' Eircodes to tell they are one facility is the only use.

### Identifiers and deduplication

One scheme per list (`IE_ID_SCHEMES`, `packages/core/src/slugs.ts`): `IE-PSI`
the PSI's registration number (`…-p10000612`), `IE-HIQA` HIQA's `Centre_ID`
(`…-n738`), `IE-HSE-HOSP` and `IE-HSE-HC` a nine-digit key derived from county,
normalised name and first address line (`…-h123456789`, `…-c123456789`): the
layers number their rows only.

An HSE hospital of kind Community, Continuing Care Service or Psycho-Geriatric
that is a HIQA centre (same Eircode, or same county and normalised name) is that
centre's page, credited to HIQA, and is not imported (41 in November 2026, all
by Eircode: 91 hospital pages remain). Without HIQA in a run, those hospitals
are not read and keep their pages, so a failed download never doubles a page.

Names: an HSE community hospital the layer names by its town only becomes "X
Community Hospital" (27), or takes its first address line when that line is the
hospital's name, never a street (9); a health centre named by a street or town
becomes "X Health Centre" (171); 47 health-centre names the layer double-encoded
("Ionad SlÃƒÂ¡inte") are repaired.

### Places and precision

`etl:places --country ie` (or the first `etl:ie`) imports:

- the four provinces as regions (grouping only, no listing);
- the 26 counties as departments (Tailte Éireann, Counties – National Statutory
  Boundaries – 2019 – Generalised 20m, CC BY 4.0; code `CO_ID`, name "County
  Cork", slug `cork`);
- the CSO's Census 2022 Built Up Areas as communes (867 towns, CC BY 4.0, code
  `BUA_CODE`, population; "Dublin city and suburbs" is named Dublin), each
  town's point computed in PostGIS (`ST_PointOnSurface`: a centroid falls outside
  about a hundred concave or coastal towns) and its county by the largest
  overlap;
- into `directory.place_lookup` (migration `0031_ie_market`), each county's and
  town's boundary and a town's other names: the localities of Tailte Éireann's
  Centres of Population gazetteer whose point lies inside it, with their Irish
  names (Tallaght → Dublin, Dungloe → An Clochán Liath), and about 24 documented
  by hand in `IE_MANUAL_ALIASES` (`packages/etl/src/sources/ie/places.ts`) for
  suburbs and spellings the gazetteer lacks.

Facilities are placed by what their list writes, never by Eircode:

- PSI and HIQA rows by their county (`Co. Cork`, `Dublin 15`) and town (the PSI's
  `Town`, else a street line; HIQA's address parts from the end), compared
  without accents, apostrophes or spaces, `saint` as `st`, a trailing "City",
  "Town", "West"… dropped as a second try. Else a town of that name in another
  county, when it is the only one in Ireland and reaches into the county the list
  names (Athlone, Limerick). Else the county itself: the site is placed in the
  county, unlocated, and shows in the county's listing. Located at the town's
  point (`city` precision: no map pin, distances approximate).
- HSE rows at their layer's point (`address` precision, map pin), placed in the
  town whose boundary holds it, else in the town their address names within the
  county that holds the point, else in that county.

### Guards

Per list: quarantine within 1% or two lines (never approvable), a floor of lines
and facilities at about a tenth of the real list (never approvable), and the
change since the last successful run that read it: at most 10% or 5 facilities,
25% of bytes (approvable). Then 99% of the sites placed, 85% of them in a census
town rather than only in their county (approvable; 93.9% in November 2026), and
the circuit breakers on Ireland's own pages as everywhere.

### Schedule and monitoring

The scheduler runs `etl:ie` every Thursday at 20:30 UTC (`docker/crontab`),
when no other import runs; `ETL_IE_SCHEDULE_ARGS` narrows it. Exit codes as for
Switzerland (3: imported without a list that could not be fetched or read, or
whose terms or licence changed). Unchanged lists are skipped, so the HSE's
layers are read once and then only checked. Environment: `ETL_IE_SOURCES` (the
lists by default), `ETL_IE_<ID>_URL` (`ETL_IE_PSI_URL`, `ETL_IE_HSE_HOSPITALS_URL`…),
`ETL_IE_COUNTIES_URL`, `ETL_IE_TOWNS_URL`, `ETL_IE_PLACENAMES_URL` (the places'
sources), `ETL_IE_SOURCE_DIR` (like `--source-dir`).

### Measured run (files of 27 November 2026)

A dry run over the real files (`--source-dir`, places imported first): 3,556
facilities, 2,003 pharmacies, 548 nursing homes, 91 hospitals and 914 health
centres; 1,005 at the HSE's point, 2,449 at their town's, 102 unlocated in their
county. Pharmacies placed in a town: 1,967 of 2,003 (401 by another name of the
town, 4 in another county, 36 in their county only); nursing homes 482 of 548
(112 by another name, 3 in another county, 66 in their county only: city
addresses naming no town); health centres 798 of 914 in a town, 116 in their
county at their own point. 1,274 listing pages, 318 indexable. A second run
skips; a forced one changes nothing.

### Local development

```sh
bun run --cwd packages/etl fixtures:ie                       # regenerate the synthetic fixtures
bun run etl:places --country ie --source-dir packages/etl/fixtures/ie
bun run etl:ie --source-dir packages/etl/fixtures/ie --offline
ETL_TEST_DATABASE_URL=… bun run --cwd packages/etl test     # includes test/ie-integration.test.ts
```

The fixtures (`packages/etl/fixtures/ie`) are synthetic: made-up facilities in
each list's exact format (the PSI's two sheets, HIQA's CSV with invented people
the tests check are never stored, the HSE's GeoJSON with its swapped fields),
with the real counties' and census towns' codes and names but made-up
rectangular boundaries, and invented Eircodes of the right form.
