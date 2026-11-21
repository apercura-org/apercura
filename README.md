# Apercura

The open directory and free booking tool for every health practitioner in France.

Apercura publishes a public directory of French health practitioners, built from the national
open data (RPPS / Annuaire Santé), and gives every practitioner a free online booking tool.

- **Free** for practitioners and patients.
- **Open source** (AGPL-3.0).
- **Health data hosted in France** by an HDS-certified host, encrypted at the application level.
- **Run it all yourself**: self-hostable with Docker, open data import included.

> **Status: work in progress.** Nothing here is production-ready yet. See the roadmap in the
> [issues](https://github.com/maxgfr/apercura/issues).

## Quick start

Requirements: [Bun](https://bun.sh) 1.4, Node.js 24, Docker with Compose.

```sh
bun install
docker compose -f docker/compose.yml up -d
cp .env.example .env
bun run db:migrate
bun run dev
```

The app runs on <http://localhost:3000> (French) and <http://localhost:3000/en> (English).
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
  ui/           Shared UI components (placeholder until the design system lands)
docker/
  compose.yml   Local PostgreSQL (PostGIS) and Mailpit
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
