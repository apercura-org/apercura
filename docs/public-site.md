# Public site: rendering, caching and SEO

The directory pages (practitioners, listings, place hubs, establishments) are
Server Components that read the read models built by the import
(`practitioner_pages`, `landing_pages`, `search_docs`) through the cached
functions in `apps/web/src/server/queries`.

## Routes

| Route (fr)                                  | en                         | Indexed                                    |
| ------------------------------------------- | -------------------------- | ------------------------------------------ |
| `/praticien/{prenom-nom}-{rpps}`            | `/en/practitioner/…`       | when the read model says `indexable` (fr)  |
| `/{specialite}`                             | same                       | from 3 practitioners                       |
| `/{specialite}/{dept}[/{commune}][/{page}]` | same                       | from 3, deindexed below 2; page 2+ noindex |
| `/annuaire`, `/annuaire/{dept}[/{commune}]` | `/en/directory/…`          | when one of its listings is                |
| `/etablissement/{nom}-{finess}`             | `/en/establishment/…`      | with one indexable practitioner            |
| `/recherche?quoi=&ou=&pres=`                | `/en/search`               | never (and disallowed in robots.txt)       |
| `/a-propos`, `/donnees`, …                  | `/en/about`, `/en/data`, … | yes                                        |

English pages exist for the interface and are always `noindex` in v1.
Reserved first segments (`RESERVED_SEGMENTS` in `@apercura/core/taxonomy`) are
never treated as listing slugs.

## Status codes

Each page decides its status before rendering anything (no Suspense above the
decision, `instant = false`), with the pure rules of `@apercura/core`
(`practitionerRoute`, `landingRoute`, `parsePageSegment`):

- practitioner: Luhn check of the trailing RPPS before any database access
  (404), then 404 without a page or without a public place, 308 when the name
  part is not the canonical slug;
- listing: 404 for an unknown listing or place, an empty listing or a page
  past the end; 308 for old place slugs, merged communes, the Paris city
  (its department page) and page `1`;
- search: a query naming a page (an RPPS, a specialty in one place, a
  specialty alone) answers 307 from the proxy, before the page streams.

## Caching

Pages export `ensureStatic = "navigation"`: the first request waits for the
complete page, which is then cached and served with `x-nextjs-cache: HIT`.
Queries are tagged with the import's cache tags and their coarse form
(`practitioner:{id}` and `practitioner:*`, `listing:{slug}:{place}`…), so
`/api/revalidate` refreshes them after each import. Practitioner pages use
`cacheLife("max")`; listings, hubs and establishments `cacheLife("weeks")`
(their neighbour counts are not tagged precisely).

`generateStaticParams` prerenders a few pages from the database at build time.
**A build without a database works**: the params fall back to values that
answer 404 before any query, and pages without params (`/annuaire`,
`/donnees`) prerender an empty state cached for minutes, replaced on the first
requests after deployment. Sitemaps and robots.txt are rendered at request time.

`APP_URL` must be set **at build time** as well as at runtime: static pages
bake canonical URLs, Open Graph and JSON-LD on it.

## Sitemaps and robots

- `/sitemap.xml`: hand-written index (Next.js has none) listing
  `/sitemaps/pages-0.xml` and every non-empty chunk
  `/sitemaps/{praticiens|listes|lieux|etablissements}-{k}.xml`, where chunk `k`
  holds the ids `[k × 20,000, (k + 1) × 20,000)`. Only indexable canonical
  French URLs, `lastmod` = `content_updated_at`, no `changefreq`/`priority`.
- `/robots.txt` disallows only `/recherche`, `/en/search`, `/api/`, `/_ui` and
  the practitioner app area `/pro/`; `noindex` pages stay crawlable.
- Open Graph: one static image per profession, `/og/{medecin|chirurgien-dentiste|sage-femme|annuaire}.png`.

## Canonical host

In production the proxy answers 308 from any other host (www., the hosting
provider's domain) to the same path on `APP_URL`. Loopback hosts are left
alone (health checks). Set `CANONICAL_HOST_REDIRECT=false` to disable it, and
`TRUSTED_PROXY_COUNT` behind a proxy so `X-Forwarded-Host` is read.

## Local checks

```sh
POSTGRES_PORT=5433 docker compose -f docker/compose.yml up -d postgres
DATABASE_URL=postgres://postgres:postgres@localhost:5433/apercura bun run db:migrate
DATABASE_URL=… bun run etl:fr --source-dir packages/etl/fixtures/fr --offline  # synthetic data
DATABASE_URL=… APP_URL=http://localhost:3100 bun run test:e2e
```

The end-to-end tests expect the synthetic fixtures (CI seeds a throwaway
PostGIS the same way); never run them against real registry data.
