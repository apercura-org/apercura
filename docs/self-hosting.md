# Self-hosting

Run all of Apercura on your own machine: the public directory, the open data
import, practitioner accounts and, if you turn it on, online booking. One
Compose file starts everything from one image; the import of one department
takes a few minutes.

| Service      | Role                                                                                       |
| ------------ | ------------------------------------------------------------------------------------------ |
| `postgres`   | PostgreSQL 17 + PostGIS. Creates the database roles on its first start                     |
| `migrate`    | Migrations, then the roles' passwords, then exits. Runs before the app at every `up`       |
| `app`        | The web app (Next.js standalone server), one replica, published on `127.0.0.1:${APP_PORT}` |
| `valkey`     | The app's page cache, in memory only, bounded (`CACHE_MAX_MEMORY`, 1 GB), not published    |
| `scheduler`  | supercronic: `jobs:tick` and the cache warm-up every 5 minutes, the weekly import          |
| `etl`        | The import, on demand (`docker compose … run --rm etl`)                                    |
| `minio`      | S3-compatible storage for photos and encrypted claim documents (not published on the host) |
| `minio-init` | Creates the private bucket and an access key limited to it, then exits                     |
| `mailpit`    | Profile `dev` only: catches every email, web UI on `127.0.0.1:${MAILPIT_UI_PORT}`          |

The files are in [`docker/`](../docker): `Dockerfile`, `compose.selfhost.yml`,
`compose.app.yml`, `.env.selfhost.example`, the Postgres init script and the
scheduler's `crontab`. `compose.selfhost.yml` includes `compose.app.yml` (the
application stack: `migrate`, `app`, `scheduler`, `etl`, `minio-init`) and adds
the data services (`postgres`, `minio`, `mailpit`; `valkey` is part of the
application stack, it holds nothing that outlives a restart); to run the application
against a database and an S3 storage of your own, see
[External database and S3](#external-database-and-s3). `docker/compose.yml` is
something else: the services of local development.

To run this stack in production on one rented server, behind a Caddy on the
host and deployed from GitHub Actions, follow [deploy-vps.md](./deploy-vps.md)
(directory only: a generic VPS is not an HDS host).

## Health data and HDS

If you install Apercura on hardware you run yourself, for your own patients,
you host your own data. If you hand that server to someone else (a hosting
provider, an IT contractor, a cloud machine), French law requires that
provider to be certified for health data hosting (HDS, article L.1111-8 of the
Code de la santé publique) as soon as online booking is on. An appointment with
a practitioner is health data. Application-level encryption does not change
that obligation.

Apercura itself is not "HDS-certified": software cannot be. Leave
`PUBLIC_HDS_HOST` empty unless the data really is hosted by a certified
provider under an HDS contract; the public pages then name that provider.

With `FEATURE_BOOKING=false` (the default) there is no health data at all: see
[Directory-only mode](#directory-only-mode).

## Prerequisites

- A Linux server, amd64. The official PostGIS image is published for amd64
  only: arm64 machines (Apple Silicon, Ampere) run it emulated, which works but
  makes the import several times slower.
- Docker Engine with Compose v2.24 or later (`compose.selfhost.yml` uses
  `include`).
- 2 vCPU, 4 GB of RAM (the import peaks at about 0.8 GB, plus PostgreSQL and
  the page cache, 1 GB by default: [Page cache](#page-cache)), and 20 GB of disk. The import downloads about 1.2 GB of files into the
  container's temporary folder at each run.
- A domain name and a reverse proxy that terminates TLS (Caddy, nginx,
  Traefik).
- Outgoing HTTPS to `www.data.gouv.fr`, `static.data.gouv.fr`,
  `geo.api.gouv.fr` and `data.geopf.fr` (the open data sources), and an SMTP
  provider for email.
- Optional: [Bun](https://bun.sh) 1.4 to generate the secrets with
  `bun run keys:generate`. The image can print them too.

## Start

```sh
git clone https://github.com/apercura-org/apercura.git
cd apercura
cp docker/.env.selfhost.example docker/.env.selfhost
chmod 600 docker/.env.selfhost
```

Fill in `docker/.env.selfhost`:

1. `APP_URL`: the public origin, e.g. `https://annuaire.example.org`.
2. The secrets. `bun run keys:generate` prints `ENCRYPTION_KEYS`,
   `ENCRYPTION_ACTIVE_KEY`, `BLIND_INDEX_KEY`, `BETTER_AUTH_SECRET`,
   `RATE_LIMIT_KEY`, `ALTCHA_HMAC_KEY`, `REVALIDATE_SECRET` and `JOBS_SECRET`.
   Without Bun, build the image first (step below) and run
   `docker run --rm apercura:local keys`, which prints the same eight.
3. The passwords of `POSTGRES_PASSWORD`, `APERCURA_APP_DB_PASSWORD`,
   `APERCURA_ETL_DB_PASSWORD`, `MINIO_ROOT_PASSWORD` and
   `S3_SECRET_ACCESS_KEY`. They end up in connection URLs: letters and digits
   only, e.g. `openssl rand -hex 24` for each.
4. `SMTP_URL` and `MAIL_FROM` for your email provider.
5. The publisher and the host the legal pages must name (legal notice, privacy policy,
   terms): `LEGAL_PUBLISHER_NAME`, `LEGAL_PUBLISHER_LEGAL_FORM`, `LEGAL_PUBLISHER_ADDRESS`,
   `LEGAL_PUBLISHER_PHONE`, `LEGAL_PUBLISHER_REGISTRATION`, `LEGAL_PUBLICATION_DIRECTOR`,
   `LEGAL_CONTACT_EMAIL`, `LEGAL_HOST_NAME`, `LEGAL_HOST_ADDRESS`, `LEGAL_HOST_PHONE`,
   `LEGAL_SMTP_PROVIDER`, `LEGAL_EFFECTIVE_DATE` (and `LEGAL_DPO_CONTACT` with booking on).
   The app refuses to start without them; add them to `docker/.env.selfhost` by hand. They are
   your own organization's details: the texts around them are drafts to have reviewed for
   your situation.

Every variable is described in [configuration.md](./configuration.md). Then
build and start:

```sh
docker compose -f docker/compose.selfhost.yml --env-file docker/.env.selfhost up -d --build
```

To save typing, the examples below use an alias:

```sh
alias apercura-compose='docker compose -f docker/compose.selfhost.yml --env-file docker/.env.selfhost'
apercura-compose ps
curl -s http://127.0.0.1:3000/api/health      # {"status":"ok"}
```

`/api/health` answers 200 when the app runs and reaches its database, 503
otherwise, without any detail. The image's own Docker health check uses it.

Start-up order: `migrate` and `minio-init` start with the database and MinIO and
wait for them (`migrate` retries for up to `DATABASE_WAIT_SECONDS`, 120 by
default, and logs `Waiting for the database …`), then the app and the scheduler
start. Compose cannot make the included application stack depend on the health
checks of this file's services; the retries replace them.

To try the stack without an SMTP provider, add `--profile dev` to `up` and set
`SMTP_ALLOW_INSECURE=true` in `docker/.env.selfhost` (Mailpit offers no TLS, and the app
otherwise refuses to start: production sends mail over TLS only). Mailpit then receives every
email (sign-up codes, booking confirmations) and shows them on `http://127.0.0.1:8025`. Never
use it in production: nothing is delivered. With a real provider, remove
`SMTP_ALLOW_INSECURE` and use `smtps://` or an `smtp://` server with STARTTLS.

The scheduler purges both access logs after a year (`AUDIT_LOG_RETENTION_MONTHS`) with the
`apercura_jobs` role, which may only call that purge: set `APERCURA_JOBS_DB_PASSWORD`. On an
existing volume too: `apercura-compose up -d` reruns `migrate`, which gives the role its login
and password. Without it the purge is skipped with a warning.

The database roles' passwords are applied twice: by `docker/postgres/10-apercura-roles.sh` when
the volume is first created, and by `migrate` after the migrations on every `up`
(`ALTER ROLE … WITH LOGIN PASSWORD …` for each `APERCURA_*_DB_PASSWORD` set). The init script
is a convenience: on a database without it, the migrations create the missing roles without
login and `migrate` then gives them theirs. An empty
variable leaves its role as it is: `migrate` never turns a role's login off, so a role you
enabled by hand keeps working; disable one with `ALTER ROLE … NOLOGIN` in `psql`. Passwords
are never logged.

## First import

The directory is empty until the first import. Start with one department:

```sh
apercura-compose run --rm etl --department 75
```

It downloads the national files (Annuaire Santé, FINESS+, Ameli, all under
the Licence Ouverte 2.0), imports the communes on the first run, then merges
the practitioners with a structure in that department. Paris took about
6 minutes (2.5 of them downloading) on a laptop. Then all of France, when you are ready:

```sh
apercura-compose run --rm etl
```

The import exits with `0` (succeeded or skipped because nothing changed), `1`
(failed) or `2` (blocked by a circuit breaker; read `etl_runs.guards`, then
rerun with `--approve=<run_id>`). Every flag is in
[data-import.md](./data-import.md); `apercura-compose run --rm etl --help`
lists them.

The scheduler reruns the import every Monday at 03:00 UTC. Set
`ETL_SCHEDULE_ARGS=--department 75` to keep it to one department, and follow
it with `apercura-compose logs -f scheduler`.

Austria (`/at`) has its own import, from the Vienna, Styria and Salzburg open
data (CC BY 4.0, about 10,400 doctors and dentists, a few seconds):

```sh
apercura-compose run --rm --entrypoint "apercura etl:at" etl
```

It imports the Austrian Gemeinden on its first run. The scheduler reruns it
every Monday at 05:30 UTC (`ETL_AT_SCHEDULE_ARGS=--sources wien` keeps it to
some lists). Exit code `3` means it imported, but left out a list it could not
fetch or read ([data-import.md](./data-import.md#austria)).

The United Kingdom (`/gb`) has its own import, from the NHS organisation data of
England and Wales (ODS), Scotland (Public Health Scotland) and Northern Ireland
(BSO), under the Open Government Licence (about 31,000 GP practices, dental
practices and pharmacies):

```sh
apercura-compose run --rm --entrypoint "apercura etl:gb" etl
```

Its first run imports the UK's places (OS Open Names, about 100 MB, a few
minutes). The scheduler reruns it every Monday at 06:30 UTC
(`ETL_GB_SCHEDULE_ARGS=--sources ods-gp` keeps it to some lists); exit code `3`
as for Austria ([data-import.md](./data-import.md#united-kingdom)).

Czechia (`/cz`) has its own import, from the National Register of Healthcare
Providers (NRPZS, ÚZIS ČR, CC BY 4.0, about 33,000 places of care):

```sh
apercura-compose run --rm --entrypoint "apercura etl:cz" etl
```

Its first run imports the Czech regions, districts and municipalities (RÚIAN,
about 5 MB, a few seconds). The scheduler reruns it every Monday at 07:30 UTC
and skips an unchanged export (`ETL_CZ_SCHEDULE_ARGS` adds flags); one list
only, so it exits `1` when the export cannot be read
([data-import.md](./data-import.md#czechia)).

## Scheduled jobs

The `scheduler` service runs [`docker/crontab`](../docker/crontab) with
supercronic: `jobs:tick` every 5 minutes (expirations, reminders, the email
outbox, next free slots, purges of patient data and claim documents, retention,
expired rate-limit counters), the cache warm-up (below) and the weekly import. Each sub-job holds a Postgres advisory lock, so a slow run never
overlaps the next. To run them by hand:

```sh
apercura-compose exec scheduler apercura jobs:tick
apercura-compose exec scheduler apercura jobs:tick outbox
```

The jobs refresh cached practitioner pages through `APP_URL/api/revalidate`:
the scheduler must be able to reach the public URL. If your server cannot reach
its own public name (no hairpin NAT), add an `extra_hosts` entry pointing the
name to the host, e.g. `annuaire.example.org:host-gateway`, in an override file
(`docker/compose.vps.yml` does it from `APP_HOST`, see [deploy-vps.md](./deploy-vps.md)).
The import sends its tags straight to `http://app:3000` instead.

### Cache warm-up

Pages are cached in the [page cache](#page-cache) on their first visit. A
deploy that replaces the build, or an import that changes pages, leaves them
to be rendered again; so the first visitor is not a crawler waiting on a cold
page, the scheduler also runs `jobs:tick warm` every 5 minutes, two minutes
after `jobs:tick`. Each run requests the next slice of the sitemap URLs from
`INTERNAL_APP_URL` (`http://app:3000`) as `APP_URL`'s host: up to 4 at a time,
5,000 URLs or 4 minutes, whichever comes first, and it stops early when the
app's health check or latency degrades. It continues where the last run
stopped, starts over after a deploy or an import, and stops for good once it
has warmed its budget: what half of the page cache holds (16,384 pages for
the default 1 GB), highest-value pages first (the homes and static pages, the
listings and place hubs, then establishments and practitioners). Warming more
would only evict what it warmed first. Each run logs one line:

```sh
apercura-compose logs scheduler | grep '"job":"warm"'
# {"job":"warm","result":{"generation":"build:…|import:12","warmed":5000,"errors":0,
#  "remaining":181234,"stopped":"count",…}}
apercura-compose exec scheduler apercura jobs:tick warm --restart   # walk again now
```

`WARM_CACHE=false` turns it off; `WARM_CACHE_CONCURRENCY`,
`WARM_CACHE_MAX_URLS`, `WARM_CACHE_MAX_SECONDS`, `WARM_CACHE_MAX_P95_MS` and
`WARM_CACHE_BUDGET_URLS` (`0`: every sitemap URL) tune it
([configuration.md](./configuration.md#cache-warm-up-bun-run-jobstick-warm)).
A larger `CACHE_MAX_MEMORY` raises the budget with it.
On a small server, lower the concurrency to 2 rather than turning it off.

Public pages answer `Cache-Control: public, max-age=0, s-maxage=300,
stale-while-revalidate=3600`: a CDN in front of the app may keep them five
minutes ([public-site.md](./public-site.md#cache-control)).

## First administrator

Administrators review claims and reports. There is no sign-up for them:

1. Create an account at `/pro/inscription`, confirm the email, and set up a
   second factor at `/pro/securite`.
2. Promote it:

   ```sh
   apercura-compose exec postgres psql -U postgres -d apercura \
     -c "UPDATE directory.\"user\" SET is_platform_admin = true WHERE email = 'you@example.org';"
   ```

The admin pages are then under `/pro/admin`.

## Reverse proxy

The app only listens on `127.0.0.1:${APP_PORT}`. Put a reverse proxy in front
of it for TLS and set `TRUSTED_PROXY_COUNT` to the number of proxies between
the visitor and the app (1 for a single Caddy or nginx). The app then reads the
client address from the last trusted `X-Forwarded-For` entry for its rate
limits, and the host from `X-Forwarded-Host`. With `0`, forwarded headers are
ignored and every visitor shares one rate-limit bucket; never set it higher
than the real number of proxies, or clients can choose their own address.

Caddy (certificates included):

```caddy
annuaire.example.org {
	reverse_proxy 127.0.0.1:3000
}
```

nginx:

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```

HSTS (two years, subdomains included) is sent by any production build whose `APP_URL` is
HTTPS. `HSTS_PRELOAD=true` at build time adds `preload`; only set it once the domain and
every subdomain serve HTTPS for good, then submit the domain at <https://hstspreload.org>.
Leaving the list takes months.

In production, any other host name answers a permanent redirect (301 for GET and HEAD, 308
otherwise) to the same page on `APP_URL` (`CANONICAL_HOST_REDIRECT=false` turns it off). A
former domain listed in `LEGACY_HOSTS` has its files redirected too (robots.txt, sitemaps,
images) and its old paths mapped ([public site](./public-site.md#former-urls)). Loopback
hosts and `/api/*` are left alone, so `curl http://127.0.0.1:3000/api/health` keeps working.

## Online booking

Set `FEATURE_BOOKING=true` and recreate the app and the scheduler
(`apercura-compose up -d`). The encryption keys must be set; the app refuses to
start if the booking overlap constraint is missing. Read
[Health data and HDS](#health-data-and-hds) first.

## Backups and restore

Three things to back up, together:

1. **The database**, with `pg_dump` (custom format, compressed):

   ```sh
   apercura-compose exec -T postgres pg_dump -U postgres -Fc apercura > "apercura-$(date +%F).dump"
   ```

2. **The files** in MinIO (photos, claim documents), e.g. a copy of the
   `minio-data` volume while MinIO is stopped, or `mc mirror` to another S3.
3. **`docker/.env.selfhost`**, kept apart from the dumps. Patient data and
   claim documents are encrypted with `ENCRYPTION_KEYS` and `BLIND_INDEX_KEY`:
   a dump without them cannot be read, by you either.

Run the dump daily from the host's cron, keep several days, copy them off the
machine, and test a restore regularly. To restore into a fresh stack:

```sh
apercura-compose down                      # keep the volumes of the old stack apart first
docker volume rm apercura-selfhost_postgres-data
apercura-compose up -d postgres            # recreates the roles from docker/.env.selfhost
apercura-compose exec -T postgres pg_restore -U postgres -d apercura --clean --if-exists < apercura-2026-11-22.dump
apercura-compose up -d                     # migrations, app, scheduler
```

The roles are not part of a `pg_dump`: the init script recreates them on an
empty volume with the passwords of the environment file, before the restore (and the last
`up -d` sets them again through `migrate`).

### Verify a backup

A backup is only known to work once it has been restored. `scripts/verify-backup.sh`
restores a dump into a throwaway PostGIS container (no published port, no network, removed
on exit) and checks the result:

```sh
scripts/verify-backup.sh apercura-2026-11-22.dump
```

It creates the four roles without login (they are not in the dump, and the grants need
them), restores with `pg_restore --exit-on-error`, then checks the extensions, the schemas,
the number of applied migrations (the migrations of the checkout; override with
`VERIFY_EXPECTED_MIGRATIONS` for a dump of another version), the booking overlap constraint,
the grants of `apercura_app`, `apercura_etl`, `apercura_readonly` and `apercura_jobs`, and that the directory
holds at least `VERIFY_MIN_PRACTITIONERS` practitioners (default 1), then prints row counts
and the date of the last successful import. It exits 1 if anything fails. Patient fields stay
encrypted: the keys are never needed.

Run it after every change to the backup job and at least monthly, on a machine with Docker
and enough disk for one restore, never on the production host.

## Upgrades

```sh
git pull
apercura-compose up -d --build
```

The image is rebuilt, `migrate` applies the new migrations, then the app and
the scheduler restart on the new version. Read the release notes first and take
a backup: migrations only go forward, a rollback is a restore. Pages cached by
the previous version are never served again (the page cache's keys carry the
build id; Valkey evicts the old ones) and are regenerated on their first
request or by the warm-up; the `next-cache` volume can be deleted at any time.

To move to a new PostgreSQL major version, dump, change the image in
`docker/compose.selfhost.yml`, restore into a new volume.

## Key rotation

| Secret                              | How                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ENCRYPTION_KEYS`                   | Add a new version (`1:old,2:new`), set `ENCRYPTION_ACTIVE_KEY=2`, `apercura-compose up -d`. New data uses version 2. Then run `apercura-compose run --rm scheduler jobs:tick rotate-keys`: it re-wraps the practices' data keys and re-encrypts reports, removal requests and claim documents with version 2. Once a second run reports `"rewrapped": 0, "remaining": 0, "texts": 0, "documents": 0`, remove version 1. |
| `BLIND_INDEX_KEY`                   | Do not rotate it: existing indexes (search of encrypted emails and phones) would stop matching.                                                                                                                                                                                                                                                                                                                         |
| `BETTER_AUTH_SECRET`                | Replace it: every session ends, users sign in again (without `RATE_LIMIT_KEY`, the sign-in rate-limit counters reset too).                                                                                                                                                                                                                                                                                              |
| `RATE_LIMIT_KEY`, `ALTCHA_HMAC_KEY` | Replace at any time: rate-limit counters reset, pending booking challenges fail once.                                                                                                                                                                                                                                                                                                                                   |
| `REVALIDATE_SECRET`, `JOBS_SECRET`  | Replace at any time; the app, the scheduler and the import read the same file.                                                                                                                                                                                                                                                                                                                                          |
| Database passwords                  | Change `APERCURA_APP_DB_PASSWORD` (or `_ETL_`, `_READONLY_`, `_JOBS_`) in the file and `apercura-compose up -d`: `migrate` sets the new password, then the services using it restart with it. `POSTGRES_PASSWORD` is only read on first start: `ALTER ROLE postgres WITH PASSWORD '…';` in `psql`, then the file and `up -d`.                                                                                           |
| `S3_SECRET_ACCESS_KEY`              | Update the file and rerun `apercura-compose up -d`: `minio-init` sets the new secret (with `MINIO_ROOT_PASSWORD`; otherwise rotate it at the S3 provider first).                                                                                                                                                                                                                                                        |

`apercura-compose up -d` recreates every container whose environment changed.

## External database and S3

`docker/compose.app.yml` is the application stack alone: no `postgres`, no
`minio`, and no dependency on them, so restarting or redeploying it never
touches the data. Point it at a PostgreSQL 17 with PostGIS (the
`postgis/postgis:17-3.7` image, or a managed database offering PostGIS,
`pg_trgm`, `unaccent` and `btree_gist`) and at any S3-compatible storage:

```sh
docker compose -f docker/compose.app.yml --env-file docker/.env.selfhost up -d --build
```

with, in the same environment file, in addition to the variables of [Start](#start):

| Variable                                                   | Value                                                                                                                                                                                         |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `APERCURA_DB_HOST`, `APERCURA_DB_PORT`, `APERCURA_DB_NAME` | Where the database is (default `postgres`, `5432`, `apercura`). The app, the import and the scheduler connect there with their roles.                                                         |
| `DATABASE_URL_MIGRATE`                                     | A superuser URL for `migrate` (extensions, roles), e.g. `postgres://postgres:…@db.internal:5432/apercura`. Without it, `migrate` builds one from `POSTGRES_PASSWORD` for the user `postgres`. |
| `S3_ENDPOINT`                                              | The S3 API, path-style (default `http://minio:9000`).                                                                                                                                         |
| `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`                   | A MinIO administrator: `minio-init` then creates the bucket and the app's key limited to it. Empty: `minio-init` does nothing; create the bucket and a key limited to it at the provider.     |

The containers must reach the database and the storage by these names: put them
on a shared Docker network, or use addresses reachable from the containers. On
a **new, empty database** there is nothing to prepare beyond the database itself:
the migrations create the four roles without login when they are missing
(migrations 0004 and 0016) and `migrate` gives each role whose
`APERCURA_*_DB_PASSWORD` is set its login and password. With a migration user
that is not a superuser, create the roles beforehand (see
[data-import.md](./data-import.md)); `migrate` then warns and leaves their
passwords to you. Coolify's version of this layout is in
[deploy-vps.md](./deploy-vps.md#under-coolify).

## Page cache

Pages are rendered on their first visit and cached in the `valkey` service:
the HTML, the RSC payload and the segments of each page, compressed (about
25 KB a page), and the results of the cached queries. The app's handlers
(`apps/web/cache-handler`, [configuration.md](./configuration.md#page-cache-appswebcache-handler))
use it when `CACHE_REDIS_URL` is set, which `docker/compose.app.yml` does
(`redis://valkey:6379`). Its size is fixed:

- `CACHE_MAX_MEMORY` (default `1gb`, about 32,000 pages with their queries) is
  Valkey's `maxmemory`; past it, the least recently used entries are evicted
  (`allkeys-lru`). `CACHE_MEM_LIMIT` (default `1280m`) is the container's
  memory limit: keep it about a quarter above `CACHE_MAX_MEMORY`. Raise both
  together where RAM allows, e.g. `2gb` and `2560m`.
- Nothing is persisted (no RDB, no AOF, no volume): a restart of `valkey`
  starts empty, pages are rendered again on demand and by the warm-up.
- Keys carry the build id: a new image never serves the previous build's pages
  (whose scripts are gone); the old keys are evicted as the new ones come in.
- It is never a dependency: Valkey down, slow or full makes a page a cache
  miss (rendered, as on its first visit), never an error, and `/api/health`
  does not look at it. `/api/revalidate` answers 503 while it is unreachable,
  so the import sends its cache tags again later.
- Not published, no port on the host. Under Coolify's predefined network, where
  another stack may have a `valkey` service too, set `CACHE_REDIS_PASSWORD`
  (letters and digits): the server then requires it, and the app sends it.

```sh
apercura-compose exec valkey valkey-cli info memory | grep used_memory_human
apercura-compose exec valkey valkey-cli dbsize
```

Without `CACHE_REDIS_URL` (another deployment, `next start` by hand), the app
keeps Next.js's own caches: pages on its disk (`.next/server`, uncompressed,
about 225 KB a page) and a 50 MB memory cache. Disk writes then stop while the
disk has less than `CACHE_DISK_MIN_FREE_MB` (1024) free, and a full or
read-only disk never makes a page fail.

Run **one replica** of the app: the scheduler and the import send their cache
tags to `app`, one instance. A single instance with 2 to 4 GB of RAM, plus the
page cache's, serves the whole of France.

## Directory-only mode

With `FEATURE_BOOKING=false` (the default) Apercura is a public directory with
practitioner accounts and no health data. It can then run on any Node.js host,
Vercel included, for a demo or a fork:

- a PostgreSQL 17+ with PostGIS, `pg_trgm`, `unaccent` and `btree_gist`
  (applied by the migrations);
- the web app built from `apps/web` (`bun install`, then `bun run build`), with
  `APP_URL`, `DATABASE_URL`, `BETTER_AUTH_SECRET`, `RATE_LIMIT_KEY`,
  `REVALIDATE_SECRET` and SMTP;
- the migrations and the import run from any machine that reaches the database
  (`bun run db:migrate`, `bun run etl:fr`), weekly;
- `FEATURE_CLAIM_DOCUMENTS=false` if you do not want to store claim documents
  (then no S3 storage and no encryption keys are needed: practitioners claim
  with Pro Santé Connect or the registry email).

`jobs:tick` still refreshes the next free slots and purges claim documents;
without booking and without claim documents it has nothing to do.

## Smoke test

`docker/smoke-test.sh` builds the image, starts the stack under its own project
name on port 3090 with throwaway secrets, imports the **synthetic** fixtures,
checks the home page, a practitioner page, `/api/health`, `jobs:tick` and the
import role's grants, then removes everything. It runs twice: `selfhost`, the
whole of `docker/compose.selfhost.yml`, and `external`, `docker/compose.app.yml`
alone against a PostGIS and a MinIO started apart, fresh and without the init
script (`migrate` starts while PostGIS is still initialising and waits for it),
where it also checks that the migrations created the roles and that each logs in with its password, that the
app's S3 key cannot create buckets, and that removing the application's
containers leaves the data alone. CI runs both on every pull request
(`docker/smoke-test.sh selfhost`, `docker/smoke-test.sh external`).
