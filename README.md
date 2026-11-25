# Apercura

The open directory and free booking tool for every health practitioner in France.

Apercura publishes a public directory of French health practitioners, built from the national
open data (RPPS / Annuaire Santé), and gives every practitioner a free online booking tool.

- **Free** for practitioners and patients.
- **Open source** (AGPL-3.0).
- **Health data encrypted** at the application level, and built to run on an HDS-certified host. The official instance runs on an interim host in the European Economic Area for now, and will name its HDS-certified host only once it runs there.
- **Run it all yourself**: self-hostable with Docker, open data import included
  ([guide](./docs/self-hosting.md)).

> **Status: work in progress.** Nothing here is production-ready yet. See the
> [roadmap](./ROADMAP.md) and the [issues](https://github.com/maxgfr/apercura/issues).

## Run it yourself

Everything (database, app, scheduled jobs, open data import, file storage) starts from one
Compose file and one image:

```sh
cp docker/.env.selfhost.example docker/.env.selfhost    # fill it in (see the guide)
docker compose -f docker/compose.selfhost.yml --env-file docker/.env.selfhost up -d --build
docker compose -f docker/compose.selfhost.yml --env-file docker/.env.selfhost run --rm etl --department 75
```

Read [docs/self-hosting.md](./docs/self-hosting.md) first: prerequisites, the first import and the
first administrator, backups, upgrades, key rotation, the reverse proxy, and what hosting health
data for others requires (an HDS-certified host). Production deployment:
[Clever Cloud](./docs/deploy-clever-cloud.md) (default) or [Scalingo](./docs/deploy-scalingo.md);
as a low-cost interim with booking off, a [single VPS](./docs/deploy-vps.md).
Directory only, without booking, it runs on any Node.js host (see
[Directory-only mode](./docs/self-hosting.md#directory-only-mode)). What remains before the
public launch (legal entity, HDS contract, DPIA, audits) is in the
[launch checklist](./docs/launch-checklist.md).

## Development

Requirements: [Bun](https://bun.sh) 1.4, Node.js 26, Docker with Compose.

```sh
bun install
docker compose -f docker/compose.yml up -d
cp .env.example .env
bun run db:migrate
bun run dev
```

The app runs on <http://localhost:3000> (French), with the other interface languages under
<http://localhost:3000/en>, `/de`, `/es` and `/it`.
Mailpit catches outgoing email at <http://localhost:8025>.

Generate local secrets for `.env` with `bun run keys:generate`.

> The official `postgis/postgis` image is published for amd64 only. On Apple Silicon, Docker
> runs it emulated, which is slower but works.

## Scripts

| Command                         | What it does                                        |
| ------------------------------- | --------------------------------------------------- |
| `bun run dev`                   | Start the web app in development mode               |
| `bun run build`                 | Build every package and the web app                 |
| `bun run check` / `check:write` | Lint and format with Biome (`:write` applies fixes) |
| `bun run typecheck`             | Type-check every package                            |
| `bun run test`                  | Run the unit tests (Vitest)                         |
| `bun run test:e2e`              | Build, then run Playwright and axe checks           |
| `bun run db:generate`           | Generate a SQL migration from the Drizzle schema    |
| `bun run db:migrate`            | Apply pending migrations                            |
| `bun run keys:generate`         | Print fresh random secrets for `.env`               |

## Repository layout

```
apps/
  web/          Next.js app (App Router, next-intl, tRPC)
packages/
  core/         Pure domain logic (RPPS validation, slugs), fully unit-tested
  db/           Drizzle ORM schema, client and SQL migrations (PostgreSQL + PostGIS)
  etl/          Open data import CLI (placeholder)
  ui/           Design system: tokens, React Aria components, domain components (see DESIGN.md)
docker/
  compose.yml          Development services: PostgreSQL (PostGIS), Mailpit, MinIO
  compose.selfhost.yml Self-hosting: the whole stack (docs/self-hosting.md)
  compose.vps.yml      Override for a single VPS behind a host Caddy (docs/deploy-vps.md)
  deploy-vps.sh        Server side of the GitHub deploy (docs/deploy-vps.md)
  Dockerfile           Production image: app, scheduler, import and migrations
clevercloud/           Clever Cloud hooks and cron jobs (docs/deploy-clever-cloud.md)
```

The database uses two Postgres schemas: `directory` for the public, open-data side and `care`
for accounts, bookings and anything touching health data.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). Please report security issues privately as described in
[SECURITY.md](./SECURITY.md). Everyone taking part is expected to follow the
[Code of Conduct](./CODE_OF_CONDUCT.md).

## License

[AGPL-3.0](./LICENSE). If you run a modified version of Apercura as a network service, you must
make its source code available to its users.
