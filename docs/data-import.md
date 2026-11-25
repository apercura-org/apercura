# Open data import (France)

`packages/etl` builds the public directory from French open data. It is a Bun
CLI that runs as a scheduled task next to the app, with its own database role
that cannot reach patient data.

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
   [Professions](#professions)).
4. **COPY** into the staging tables (`directory.stg_*`, ordinary tables
   truncated at each run), then `ANALYZE`.
5. **Staging guards**: rows within ±3% and distinct RPPS per profession within
   ±2% of the last success with the same profession list, at least 98% of rows
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
   - suppressions (GDPR objections) are excluded from the merge and always
     applied, and never count against the circuit breakers;
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
   both the precise and the coarse tag.

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
truncated file, removal after two runs, circuit breaker and `--approve`, suppressions, owner data untouched, street
labels from a local mock of the geocoder). Dry runs
commit nothing but the places reference data, imported before the merge when
the table is empty.
