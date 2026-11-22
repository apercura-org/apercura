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
| `/rdv#t={token}` (manage an appointment)    | `/en/rdv#t=…`              | never (`noindex`, no referrer, no cache)   |
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
  specialty alone) answers 307 from the proxy, before the page streams;
- canonical path, in the proxy: `/fr/…` and paths with capitals answer 308 to
  the unprefixed, lowercase path (`/pro` and percent-escapes are left as they
  are); next-intl's redirects of a prefixed path (`/en/annuaire` →
  `/en/directory`) are 308, its locale detection of an unprefixed path 307.

Next.js 16.4 repeats the (identical) `Location` header on the first, uncached
render of a page-level redirect; clients follow either copy.

## Caching

Pages export `ensureStatic = "navigation"`: the first request waits for the
complete page, which is then cached and served with `x-nextjs-cache: HIT`.
Queries are tagged with the import's cache tags and their coarse form
(`practitioner:{id}` and `practitioner:*`, `listing:{slug}:{place}`…), so
`/api/revalidate` refreshes them after each import. Practitioner pages use
`cacheLife("max")`; listings, hubs and establishments `cacheLife("weeks")`
(their neighbour counts are not tagged precisely).

Online booking keeps practitioner pages static. The read model query also
returns whether an agenda is open and the denormalized next free time
(`directory.practitioners.next_free_at`); the booking services revalidate
`practitioner:{id}` whenever either changes (a hold, a confirmation, a
cancellation, an agenda opened or paused), and `bun run jobs:tick` does the
same through `/api/revalidate` as time passes. The booking panel is a client
island loaded on demand: it reads `?rdv=1` in the browser (the server never
looks at it) and fetches the free times itself, so no session, cookie or search
parameter ever reaches the cached HTML.

`/rdv` is rendered per request and reads its token from the URL fragment in the
browser; every `booking.manage.*` call is a POST with the token in its body, so
a link scanner opening the email link changes nothing. It sends
`Referrer-Policy: no-referrer` (header and meta) and `X-Robots-Tag: noindex`.

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
  the signed-in practitioner area (`/pro/tableau-de-bord`, `/pro/agenda`…);
  `noindex` pages stay crawlable, among them the claim, sign-in and sign-up
  pages every practitioner page links to.
- `X-Robots-Tag` (next.config.ts) repeats the robots meta for English pages,
  search, the practitioner space and the report and removal forms.
- The import blocks a run (`integrity.orphans`, approvable) when an indexable
  practitioner is listed on no listing page.

## Metadata and structured data

- `pageMetadata` (`src/lib/seo.ts`) gives every public page its title (60
  characters at most when possible, brand suffix), description (155), absolute
  self canonical, robots (`robotsFor`: English never indexed in v1) and
  complete Open Graph and Twitter cards (Next.js replaces a parent's
  `openGraph` instead of merging it). No hreflang while English is `noindex`.
- One JSON-LD `@graph` per page (`src/lib/structured-data.ts`, typed with
  `schema-dts`), with `@id`s made of the canonical URL and a fragment:
  `IndividualPhysician` (doctors), `Dentist`, `Person` with `hasOccupation`
  (midwives), their places (`PhysiciansOffice`, `MedicalClinic`, `Hospital`,
  an establishment sharing its own page's `@id`), `BreadcrumbList`, `ItemList`
  on listings and hubs, `WebSite` with `SearchAction` and `Organization` on the
  home page. `medicalSpecialty` only takes the schema.org enumeration;
  `ReserveAction` only when booking is open; photo, website, languages and
  opening hours only from the owner; never a rating or a review.
- Open Graph: one static image per profession, `/og/{medecin|chirurgien-dentiste|sage-femme|annuaire}.png`;
  site icons `/icon/{48,192,512}`, `/apple-icon` and `/manifest.webmanifest`.

## Client JavaScript

Public pages are Server Components; their interactive parts are islands. The
root layout passes only the `Site` and `LocaleSwitcher` messages to the
client: an island gets its own namespaces from `<ClientIsland>` (the whole
catalogue would be serialized into every page), and wraps itself in
`<TRPCReactProvider>` when it calls the API. `ProShell` and `AuthFrame` give
the practitioner space the whole catalogue and the API client. The booking
panel loads its API client with itself, on demand.

Budgets: `e2e/performance.spec.ts` bounds the first-load JavaScript a page adds
to the framework runtime (60 KB gzip on practitioner and listing pages);
`bun run lhci` (Lighthouse CI, mobile emulation, run by the e2e job) checks
LCP ≤ 1.8 s, CLS ≤ 0.05, TBT ≤ 200 ms, SEO 100 and accessibility ≥ 95.

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
DATABASE_URL=… APP_URL=http://localhost:3100 LHCI_PORT=3100 bun run --cwd apps/web lhci
```

The end-to-end tests expect the synthetic fixtures (CI seeds a throwaway
PostGIS the same way); never run them against real registry data.
