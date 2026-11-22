# Deploy on Scalingo (alternative)

Scalingo is also on the ANS list of HDS-certified hosts. Its HDS region is
`osc-secnum-fr1`; as with Clever Cloud, health data needs that region **and** a
signed HDS contract. This page is a short map of the differences with
[deploy-clever-cloud.md](./deploy-clever-cloud.md); it has not been run end to
end yet, so check each step against Scalingo's current documentation.

| Need           | Scalingo                                                                                                                                                                                         |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Runtime        | Node.js buildpack. The workspace installs with Bun: add Bun with a multi-buildpack (`.buildpacks`) or build the Docker image elsewhere.                                                          |
| Build          | `bun run --cwd apps/web build`, then copy `apps/web/.next/static` into the standalone folder (as `clevercloud/build.sh` does).                                                                   |
| Start          | `Procfile`: `web: cd apps/web/.next/standalone/apps/web && HOSTNAME=0.0.0.0 node server.js` (Scalingo sets `PORT`).                                                                              |
| Migrations     | `Procfile`: `postdeploy: bun run db:migrate`. It runs in a one-off container before the new version gets traffic; a failure keeps the old version.                                               |
| Scheduled jobs | `cron.json` at the repository root, run in one-off containers: `{"jobs": [{"command": "*/5 * * * * bun run jobs:tick"}, {"command": "0 3 * * 1 bun run etl:fr", "size": "XL"}]}`. Times are UTC. |
| Database       | PostgreSQL add-on (dedicated plan, PostGIS available); same role and extension requirements as on Clever Cloud.                                                                                  |
| Files          | Any S3-compatible storage in the HDS perimeter (`S3_*` variables).                                                                                                                               |
| Proxy          | `TRUSTED_PROXY_COUNT=1`.                                                                                                                                                                         |

The import runs in a one-off container of the scheduler: size it for about
1 GB of RAM (`XL` or larger) and give that job only `DATABASE_URL_ETL`,
`APP_URL`, `REVALIDATE_SECRET` and `ETL_PROFESSIONS` if your setup allows
per-job variables; otherwise prefer a separate application for the import.

The same rules apply as everywhere: `PUBLIC_HDS_HOST` is set only once
production really runs there, and Apercura is never described as
"HDS-certified" itself.
