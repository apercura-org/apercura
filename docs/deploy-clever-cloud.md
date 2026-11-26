# Deploy on Clever Cloud

Production runs on Clever Cloud's **Node.js & Bun** runtime, in an HDS region
(`parhds`, Paris), with a dedicated PostgreSQL add-on and Cellar for files. The
configuration lives in [`clevercloud/`](../clevercloud):

| File                             | Role                                                                                             |
| -------------------------------- | ------------------------------------------------------------------------------------------------ |
| `clevercloud/env.sh`             | Maps the add-on variables (`POSTGRESQL_ADDON_URI`, `CELLAR_ADDON_*`) to the names Apercura reads |
| `clevercloud/build.sh`           | `CC_POST_BUILD_HOOK`: migrations, `next build`, static assets next to the standalone server      |
| `clevercloud/start.sh`           | `CC_RUN_COMMAND`: the standalone server on `0.0.0.0:$PORT` (8080)                                |
| `clevercloud/cron.json`          | `jobs:tick` every 5 minutes, the cache warm-up, the weekly import (Monday 03:00 UTC)             |
| `clevercloud/cron/jobs-tick.sh`  | First instance only, `flock` against overlaps                                                    |
| `clevercloud/cron/warm.sh`       | `jobs:tick warm` against the first instance's own server (`127.0.0.1:$PORT`), `flock` too        |
| `clevercloud/cron/etl-weekly.sh` | Restarts the import task (Clever Tasks do not read `cron.json`)                                  |

Why not the Docker image: Clever Cloud's Docker runtime does not run
`clevercloud/cron.json`, and a Clever Task can only be scheduled from a
non-Docker application. The Node.js & Bun runtime installs the Bun workspace
from `bun.lock` and runs everything from the same build. The image in
`docker/` remains the way to self-host (see [self-hosting.md](./self-hosting.md)).

Nothing in this guide is automated: every step is run by an operator.

## Before anything: the HDS contract

Hosting health data requires an HDS region **and** a signed HDS contract with
Clever Cloud (it starts with a discussion with their team). Until it is signed,
deploy with `FEATURE_BOOKING=false` (directory only, no health data) or keep to
`staging` with synthetic data.

Wording rule: Apercura is not "HDS-certified". The public pages say "hosted in
France by an HDS-certified host (Clever Cloud)" only when `PUBLIC_HDS_HOST` is
set, and it is set only once production really runs there (step 9).

## 1. Applications and add-ons

With [Clever Tools](https://www.clever.cloud/developers/doc/tools/cli/), from
a clone of the repository, in the organization that holds the HDS contract
(`--org`):

```sh
# Web app (also runs the scheduled jobs from its cron.json)
clever create --type node apercura-web --region parhds --org <org>

# PostgreSQL 17, dedicated plan (DEV plans have no backups and no extensions)
clever addon create postgresql-addon apercura-db --plan <dedicated plan> \
  --addon-version 17 --region parhds --org <org>
clever service link-addon apercura-db --app apercura-web

# Cellar (S3), Paris HDS region
clever addon create cellar-addon apercura-files --region parhds --org <org>
clever service link-addon apercura-files --app apercura-web

# Import task: same repository, runs `bun run etl:fr` and stops
clever create --type node apercura-etl --task "bun run etl:fr" --region parhds --org <org>
clever service link-addon apercura-db --app apercura-etl
```

`clever addon providers show postgresql-addon` (or `cellar-addon`) lists the
plans and regions available to your organization.

Start with one web instance of 2 to 4 GB and scale vertically first: pages are
cached on the instance's disk (see [Cache](#cache)).

## 2. Database

The add-on gives you an owner role (`POSTGRESQL_ADDON_URI`). It cannot create
other roles nor install extensions; open tickets with Clever Cloud support:

1. **Extensions**: `postgis`, `pg_trgm`, `unaccent` and `btree_gist` are in
   the add-on's default list. Check with `\dx` in `psql "$POSTGRESQL_ADDON_URI"`;
   migration 0000 runs `CREATE EXTENSION IF NOT EXISTS` and needs them present.
2. **Roles**: ask for `apercura_app`, `apercura_etl`, `apercura_readonly` and
   `apercura_jobs` with `LOGIN` and passwords you send through a secure channel.
   Migrations 0004 and 0016 then only apply the grants
   ([data-import.md](./data-import.md#database-roles)). `apercura_jobs` gets no table
   privilege: it may only call the audit log purge (`DATABASE_URL_JOBS`).
3. **Point-in-time recovery** (pgBackRest): not installed by default, ask for
   it. Clever Cloud already takes a daily backup kept 7 days.

Test a restore before opening booking, then monthly: download a backup from the add-on's
**Backups** tab (a `pg_dump` custom-format file) to a trusted machine with Docker and run
`scripts/verify-backup.sh <file>` ([self-hosting](./self-hosting.md#verify-a-backup)); it
restores into a throwaway container and checks schema, constraints, grants and counts. A
restore into a separate add-on remains the rehearsal of the real procedure.

## 3. Environment of the web app

Set the runtime first:

```sh
clever env set --app apercura-web NODE_ENV production
clever env set --app apercura-web CC_NODE_VERSION 26
clever env set --app apercura-web CC_NODE_BUILD_TOOL bun
# The Next.js build needs the dev dependencies (Tailwind, type checks)
clever env set --app apercura-web CC_NODE_DEV_DEPENDENCIES install
clever env set --app apercura-web CC_POST_BUILD_HOOK "bash clevercloud/build.sh"
clever env set --app apercura-web CC_RUN_COMMAND "bash clevercloud/start.sh"
clever env set --app apercura-web CC_HEALTH_CHECK_PATH /api/health
```

Then Apercura's variables ([configuration.md](./configuration.md)). Write them
in a local file that never enters the repository, then
`clever env import --app apercura-web < that-file`:

| Variable                                                                                                                 | Value                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `APP_URL`                                                                                                                | `https://apercura.health` (read at build time too)                                                                                                                                     |
| `DATABASE_URL`                                                                                                           | `postgres://apercura_app:…@<POSTGRESQL_ADDON_HOST>:<POSTGRESQL_ADDON_PORT>/<POSTGRESQL_ADDON_DB>`                                                                                      |
| `DATABASE_URL_JOBS`                                                                                                      | `postgres://apercura_jobs:…@<POSTGRESQL_ADDON_HOST>:<POSTGRESQL_ADDON_PORT>/<POSTGRESQL_ADDON_DB>` (audit log retention of `jobs:tick`)                                                |
| `DATABASE_POOL_MAX`                                                                                                      | `10`, within the plan's connection limit                                                                                                                                               |
| `BETTER_AUTH_SECRET`, `ENCRYPTION_KEYS`, `ENCRYPTION_ACTIVE_KEY`, `BLIND_INDEX_KEY`, `ALTCHA_HMAC_KEY`, `RATE_LIMIT_KEY` | `bun run keys:generate`, on a trusted machine. Production keys exist only here.                                                                                                        |
| `REVALIDATE_SECRET`, `JOBS_SECRET`                                                                                       | `bun run keys:generate` too (same run)                                                                                                                                                 |
| `SMTP_URL`, `MAIL_FROM`                                                                                                  | European SMTP provider over TLS: `smtps://…:465`, or `smtp://…:587` with STARTTLS (required in production; never set `SMTP_ALLOW_INSECURE`); SPF, DKIM and DMARC on the sending domain |
| `S3_BUCKET`                                                                                                              | e.g. `apercura-prod`; the app creates it on first use                                                                                                                                  |
| `TRUSTED_PROXY_COUNT`                                                                                                    | `1` (Clever Cloud's load balancer)                                                                                                                                                     |
| `FEATURE_BOOKING`                                                                                                        | `false` until the HDS contract is signed                                                                                                                                               |
| `PSC_CLIENT_ID`, `PSC_CLIENT_SECRET`, `PSC_ISSUER`                                                                       | Pro Santé Connect, once registered                                                                                                                                                     |
| `PUBLIC_HDS_HOST`                                                                                                        | **unset** for now (step 9)                                                                                                                                                             |
| `LEGAL_*` (publisher, director, contact, host, SMTP provider, effective date; DPO with booking)                          | From the legal entity's documents and the contracts. `next build` fails without them ([configuration](./configuration.md))                                                             |
| `SECURITY_CONTACT`                                                                                                       | Optional, `mailto:` or `https://`; defaults to `mailto:` `LEGAL_CONTACT_EMAIL` in `security.txt`                                                                                       |
| `GOOGLE_SITE_VERIFICATION`, `BING_SITE_VERIFICATION`                                                                     | Search Console and Bing Webmaster Tools tokens, once the domain is final (step 10)                                                                                                     |
| `HSTS_PRELOAD`                                                                                                           | `true` only once the domain is final (step 10)                                                                                                                                         |

`clevercloud/env.sh` fills the rest from the linked add-ons: `DATABASE_URL_MIGRATE`
from `POSTGRESQL_ADDON_URI` (owner role, migrations only), and `S3_ENDPOINT`,
`S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` from `CELLAR_ADDON_*` with
`S3_REGION=default`, as Cellar's documentation signs. Set any of them by hand to
override.

## 4. Deploy

```sh
clever deploy --app apercura-web
```

The build installs the workspace with Bun, then `clevercloud/build.sh` applies
the migrations and runs `next build`. Migrations run once per build, before any
instance of the new version starts; they must stay compatible with the version
still serving during the deployment. A restart from the build cache skips the
build, and the migrations with it. The deployment succeeds when
`/api/health` answers 200 (process up, database reachable).

## 5. Scheduled jobs

`clevercloud/cron.json` is installed on every instance of the web app at each
deployment; the scripts run on the first instance only (`INSTANCE_NUMBER=0`).
Schedules are in UTC. Clever Cloud does not catch up on missed runs, and during
a deployment a job can run on an old and a new instance at once: every sub-job
of `jobs:tick` holds a Postgres advisory lock, so this is harmless.

Check them in the logs (`clever logs --app apercura-web`), lines prefixed with
`CMDOUT`.

## 6. Import task

```sh
clever env set --app apercura-etl CC_NODE_VERSION 26
clever env set --app apercura-etl CC_NODE_BUILD_TOOL bun
clever env set --app apercura-etl CC_RUN_COMMAND "bun run etl:fr"
clever env set --app apercura-etl DATABASE_URL_ETL "postgres://apercura_etl:…@…/…"
clever env set --app apercura-etl APP_URL https://apercura.health
clever env set --app apercura-etl REVALIDATE_SECRET "<same as the web app>"
clever env set --app apercura-etl ETL_PROFESSIONS 10,40,50,60
```

Give it nothing else: the import's role reaches `directory` only. Size it at
2 GB of RAM or more (peak about 0.8 GB, see the
[measured run](./data-import.md#measured-run-department-75-21112026)); it needs
about 1.2 GB of temporary disk. Deploy it once (`clever deploy --app
apercura-etl`): that is the first import.

To run it every week, give the web app a Clever Tools token restricted to the
task and its id:

```sh
clever env set --app apercura-web CLEVER_TOKEN <token>
clever env set --app apercura-web CLEVER_SECRET <secret>
clever env set --app apercura-web ETL_TASK_APP_ID <app id of apercura-etl>
```

`clevercloud/cron/etl-weekly.sh` then restarts the task every Monday at 03:00
UTC. A task blocks deployments of its own application while it runs, never the
web app's. Alert on a failed run (exit code `1`) or a blocked one (`2`), and
when the last `succeeded` row of `etl_runs` is older than nine days.

## 7. Domain and TLS

```sh
clever domain add apercura.health --app apercura-web
clever domain add www.apercura.health --app apercura-web
```

Point the DNS records the Console shows for the `parhds` region, then check
that `https://apercura.health/api/health` answers. TLS certificates are managed
by Clever Cloud. Any other host (the `cleverapps.io` domain, `www.`) answers a
permanent redirect to the same page on `APP_URL`.

## 8. Environments

- **staging**: same setup in the same organization, its own add-ons, synthetic
  data only (`bun run etl:fr --source-dir packages/etl/fixtures/fr --offline`
  from the task), its own keys.
- **review apps**: none with health data; preview the pages locally or on
  `staging`.

## 9. Switching `PUBLIC_HDS_HOST` on

Only when production really runs on Clever Cloud, in `parhds`, under the
signed HDS contract (application, database, task and Cellar all there):

```sh
clever env set --app apercura-web PUBLIC_HDS_HOST "Clever Cloud"
clever restart --app apercura-web --without-cache
```

The value is baked into static pages, hence the rebuild without cache. The
public pages then say that health data is hosted by Clever Cloud. Turn on
`FEATURE_BOOKING=true` at the same time, or later.

## 10. Search engines, HSTS preload, monitoring

Once `apercura.health` serves production for good:

1. **Search Console and Bing Webmaster Tools**: add the domain property, choose the HTML meta
   tag method, set `GOOGLE_SITE_VERIFICATION` and `BING_SITE_VERIFICATION` to the tokens, then
   `clever restart --app apercura-web --without-cache` (static pages bake them) and confirm
   ownership in each tool. Submit `https://apercura.health/sitemap.xml`.
2. **HSTS preload**: check that every subdomain serves HTTPS (`www.`, mail and DNS-only names
   included), set `HSTS_PRELOAD=true`, rebuild, check the header
   (`curl -sI https://apercura.health | grep -i strict`), then submit the domain at
   <https://hstspreload.org>. Removal from the list takes months.
3. **security.txt**: `https://apercura.health/.well-known/security.txt` names
   `SECURITY_CONTACT` (or the legal contact) and the repository's security policy; its
   `Expires` moves forward by itself.
4. **Uptime**: set the repository variable `PRODUCTION_URL` (GitHub, Settings → Secrets and
   variables → Actions → Variables); `.github/workflows/uptime.yml` then checks `/api/health`
   and a practitioner page every 15 minutes and opens an `uptime` issue on failure.

## Cache

`next start` keeps rendered pages on the instance's disk: they are lost at each
deployment and rendered again on demand, which is acceptable; page writes stop
while the disk is short of space (`CACHE_DISK_MIN_FREE_MB`). To bound the cache
in memory instead, link a Redis-compatible add-on and set `CACHE_REDIS_URL` to
it ([configuration.md](./configuration.md#page-cache-appswebcache-handler)). Stay
on one instance: several would also need the same `deploymentId` and
`NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` everywhere. No third-party CDN in front of
routes that carry patient data.
