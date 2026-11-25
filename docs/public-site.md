# Public site: rendering, caching and SEO

The directory pages (practitioners, listings, place hubs, establishments) are
Server Components that read the read models built by the import
(`practitioner_pages`, `landing_pages`, `search_docs`) through the cached
functions in `apps/web/src/server/queries`.

## Routes

Every market lives on one domain (`APP_URL`, `https://apercura.org` in
production) under its own path segment
([ADR 0002, section 2](adr/0002-multi-country.md)). France is the only open
market: its pages live under `/fr`, their interface translations under
`/fr-en`, `/fr-de`, `/fr-es` and `/fr-it`. The root is the international home.

| Route (France, fr)                             | en (`/fr-en`)                 | Indexed                                    |
| ---------------------------------------------- | ----------------------------- | ------------------------------------------ |
| `/` (international home, English)              | n/a                           | yes, the `x-default`                       |
| `/fr` (France home)                            | `/fr-en`                      | yes                                        |
| `/fr/praticien/{prenom-nom}-{rpps}`            | `/fr-en/practitioner/…`       | when the read model says `indexable` (fr)  |
| `/fr/{specialite}`                             | same                          | from 3 practitioners                       |
| `/fr/{specialite}/{dept}[/{commune}][/{page}]` | same                          | from 3, deindexed below 2; page 2+ noindex |
| `/fr/annuaire`, `/fr/annuaire/{dept}[/{c}]`    | `/fr-en/directory/…`          | when one of its listings is                |
| `/fr/etablissement/{nom}-{finess}`             | `/fr-en/establishment/…`      | with one indexable practitioner            |
| `/fr/recherche?quoi=&ou=&pres=`                | `/fr-en/search`               | never (and disallowed in robots.txt)       |
| `/fr/rdv#t={token}` (manage an appointment)    | `/fr-en/rdv#t=…`              | never (`noindex`, no referrer, no cache)   |
| `/fr/a-propos`, `/fr/donnees`, …               | `/fr-en/about`, `/fr-en/data` | yes                                        |

### The international home

`/` (`app/(international)`, its own root layout) is in English: what Apercura
is, the countries (France open and linked, with its other languages; the
markets still to open as plain text, `src/lib/markets.ts`, so the root creates
no thin or duplicate page) and links to the pages about Apercura in English
(`/fr-en/about`, `/fr-en/open-source`, `/fr-en/data`, the legal pages). It never
redirects on the visitor's language: it is the same cacheable document for
everyone, crawlers included. A browser preferring French, German, Spanish or
Italian shows, after hydration, a link to the France pages in that language
(`LanguageSuggestion`). The France footer links back to it.

### Locales

Five interface locales, all from `apps/web/src/i18n/locales.ts`: French (the
market's language, `/fr`), English (`/fr-en`, the source catalog, British
English), German (`/fr-de`), Spanish (`/fr-es`) and Italian (`/fr-it`). The
locale stays the internal `[locale]` segment; next-intl's custom prefixes
(`LOCALE_PREFIXES`, `localePrefix: { mode: "always" }`) map it to the URL, with
no locale detection and no locale cookie. Route segments are translated per
locale in `routing.ts`; listing slugs stay French in every locale (they are
data):

| fr                  | en               | de                     | es               | it                |
| ------------------- | ---------------- | ---------------------- | ---------------- | ----------------- |
| `/praticien/…`      | `/practitioner`  | `/behandler`           | `/profesional`   | `/professionista` |
| `…/signaler`        | `…/report`       | `…/meldung`            | `…/notificacion` | `…/segnalazione`  |
| `…/retrait`         | `…/removal`      | `…/entfernung`         | `…/retirada`     | `…/rimozione`     |
| `/etablissement/…`  | `/establishment` | `/einrichtung`         | `/centro`        | `/struttura`      |
| `/annuaire`         | `/directory`     | `/verzeichnis`         | `/directorio`    | `/elenco`         |
| `/recherche`        | `/search`        | `/suche`               | `/buscar`        | `/cerca`          |
| `/a-propos`         | `/about`         | `/ueber-uns`           | `/acerca-de`     | `/chi-siamo`      |
| `/donnees`          | `/data`          | `/daten`               | `/datos`         | `/dati`           |
| `/accessibilite`    | `/accessibility` | `/barrierefreiheit`    | `/accesibilidad` | `/accessibilita`  |
| `/confidentialite`  | `/privacy`       | `/datenschutz`         | `/privacidad`    | `/privacy`        |
| `/mentions-legales` | `/legal-notice`  | `/impressum`           | `/aviso-legal`   | `/note-legali`    |
| `/conditions`       | `/terms`         | `/nutzungsbedingungen` | `/condiciones`   | `/condizioni`     |

Each segment follows the locale's prefix: `/fr/annuaire`, `/fr-de/verzeichnis`.

Only French pages are indexed in v1 (`INDEXABLE_LOCALES`): pages in the other
locales exist for the interface, are always `noindex`, stay out of the
sitemaps and get no hreflang until their market opens
([ADR 0002](adr/0002-multi-country.md)). Dates, times and numbers use each
locale's own conventions (`LOCALE_TAGS`: `fr-FR`, `en-GB`, `de-DE`, `es-ES`,
`it-IT`, a 24-hour clock in all of them); emails use the recipient's stored
locale. The catalogs (`apps/web/messages/{fr,en,de,es,it}.json`) are checked
by `src/i18n/catalogs.test.ts`: the same keys as `en.json`, the same ICU
arguments and tags in every message, and every plural form each language
selects.

Reserved first segments (`RESERVED_SEGMENTS` in `@apercura/core/taxonomy`) are
never treated as listing slugs; the former locale prefixes (`en`, `de`, `es`,
`it`) stay among them.

### Former URLs

Until November 2026 the French directory lived on apercura.fr without a prefix
and its translations under `/en`, `/de`, `/es`, `/it`. `src/lib/market-path.ts`
maps every such path to its new one, keeping everything after the prefix
(translated segments did not change) and the query:

| Former path (apercura.fr)                                | New path (apercura.org)                                        |
| -------------------------------------------------------- | -------------------------------------------------------------- |
| `/`                                                      | `/fr`                                                          |
| `/praticien/{slug}`, `/annuaire/…`, `/{spec}/…`          | `/fr/praticien/{slug}`, `/fr/annuaire/…`, `/fr/{spec}/…`       |
| `/recherche?quoi=…`, `/rdv#t=…`, `/pro/…`                | `/fr/recherche?quoi=…`, `/fr/rdv#t=…`, `/fr/pro/…`             |
| `/a-propos`, `/mentions-legales`, …                      | `/fr/a-propos`, `/fr/mentions-legales`, …                      |
| `/en`, `/en/practitioner/…`, `/en/legal-notice`          | `/fr-en`, `/fr-en/practitioner/…`, `/fr-en/legal-notice`       |
| `/de/impressum`, `/es/aviso-legal`, `/it/note-legali`    | `/fr-de/impressum`, `/fr-es/aviso-legal`, `/fr-it/note-legali` |
| `/fr/…`                                                  | unchanged                                                      |
| `/sitemaps/{kind}-{k}.xml`                               | `/sitemaps/fr/{kind}-{k}.xml`                                  |
| `/robots.txt`, `/sitemap.xml`, `/og/…`, `/.well-known/…` | same path                                                      |

The fragment of `/rdv#t=…` never reaches the server; browsers keep it across
the redirect.

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
- former scheme, in the proxy (`marketPath`): on the canonical host an
  unprefixed French path answers 301 (308 for other methods than GET and HEAD)
  to its `/fr` path, a former locale prefix 307 to `/fr-{locale}` (temporary:
  `/de`, `/es` and `/it` are the segments of markets still to open); `/` is the
  international home and never redirects;
- canonical path, in the proxy: paths with capitals answer 308 to the
  lowercase path (the practitioner space `/{prefix}/pro/…` and percent-escapes
  are left as they are); next-intl's redirects of a path in another locale's
  form (`/fr-en/annuaire` → `/fr-en/directory`, `/fr-de/annuaire` →
  `/fr-de/verzeichnis`) are 308.

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
  `/sitemaps/international.xml` (the international home), then each open
  market's files under its segment: France's `/sitemaps/fr/pages-0.xml` and
  every non-empty chunk
  `/sitemaps/fr/{praticiens|listes|lieux|etablissements}-{k}.xml`, where chunk
  `k` holds the ids `[k × 20,000, (k + 1) × 20,000)`. Only indexable canonical
  URLs (`/` and France's French pages), `lastmod` = `content_updated_at`, no
  `changefreq`/`priority`. A market that opens adds its own
  `/sitemaps/{segment}/…`.
- `/robots.txt` disallows only the search page of every locale
  (`/fr/recherche`, `/fr-en/search`, `/fr-de/suche`…), `/api/`, `/{prefix}/_ui`
  and the signed-in practitioner area (`/fr/pro/tableau-de-bord`,
  `/fr-en/pro/agenda`…); `noindex` pages stay crawlable, among them the claim,
  sign-in and sign-up pages every practitioner page links to.
- `X-Robots-Tag` (next.config.ts) repeats the robots meta for every page outside French
  (`/fr-en`, `/fr-de`…), search, the practitioner space and the report and removal
  forms. The international home has none: it is indexed.
- The import blocks a run (`integrity.orphans`, approvable) when an indexable
  practitioner is listed on no listing page.

## Metadata and structured data

- `pageMetadata` (`src/lib/seo.ts`) gives every public page its title (60
  characters at most when possible, brand suffix), description (155), absolute
  self canonical, robots (`robotsFor`: only French indexed in v1) and
  complete Open Graph and Twitter cards (Next.js replaces a parent's
  `openGraph` instead of merging it). hreflang only between indexed pages: the
  two homes print the same pair, `fr-FR` → `/fr` and `x-default` → `/`
  (`homeAlternates`); other pages have none while the other locales are
  `noindex` and France is the only market.
- One JSON-LD `@graph` per page (`src/lib/structured-data.ts`, typed with
  `schema-dts`), with `@id`s made of the canonical URL and a fragment:
  `IndividualPhysician` (doctors), `Dentist`, `Person` with `hasOccupation`
  (midwives, ISCO-08 2222; nurses, 2221), their places (`PhysiciansOffice`,
  `MedicalClinic`, `Hospital`, an establishment sharing its own page's `@id`),
  `BreadcrumbList`, `ItemList` on listings and hubs, `WebSite` with
  `SearchAction` and `Organization` on the France home (`@id`s on the site root,
  `{origin}/#website`), a `WebPage` on the international home. `medicalSpecialty` only takes the schema.org enumeration;
  `ReserveAction` only when booking is open; photo, website, languages and
  opening hours only from the owner; never a rating or a review.
- Open Graph: one static image per profession,
  `/og/{medecin|chirurgien-dentiste|sage-femme|infirmier|annuaire}.png`; site
  icons `/icon/{48,192,512}`, `/apple-icon` and `/manifest.webmanifest`.

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

## Canonical host and former domains

In production the proxy answers a permanent redirect (301 for GET and HEAD,
308 otherwise, so a form keeps its method and body) from any other host (www.,
the hosting provider's domain) to the same page on `APP_URL`, moved to the
current scheme on the way (`/annuaire` → `/fr/annuaire`) in one hop, query
kept. The former hosts listed in `LEGACY_HOSTS` (production:
`apercura.fr,www.apercura.fr`) redirect everything a crawler or a shared link
reaches, not only pages: robots.txt, the sitemaps, the Open Graph images,
security.txt, the icons; and their home `/` goes to France's (`/fr`), while an
unlisted host's home goes to the international one (`www.` of the canonical
host is treated as the same site). API routes are never redirected (the proxy
does not run on them: it would buffer upload bodies), so calendar feeds
subscribed on apercura.fr keep answering there. Loopback hosts are left alone
(health checks). Set `CANONICAL_HOST_REDIRECT=false` to disable it all, and
`TRUSTED_PROXY_COUNT` behind a proxy so `X-Forwarded-Host` is read.

## Local checks

```sh
POSTGRES_PORT=5433 docker compose -f docker/compose.yml up -d postgres
DATABASE_URL=postgres://postgres:postgres@localhost:5433/apercura bun run db:migrate
DATABASE_URL=… bun run etl:fr --source-dir packages/etl/fixtures/fr --offline  # synthetic data
DATABASE_URL=… APP_URL=http://localhost:3100 bun run test:e2e  # E2E_PORT moves the servers
DATABASE_URL=… APP_URL=http://localhost:3100 LHCI_PORT=3100 bun run --cwd apps/web lhci
```

The end-to-end tests expect the synthetic fixtures (CI seeds a throwaway
PostGIS the same way); never run them against real registry data.
