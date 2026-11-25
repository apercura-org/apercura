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
| `/fr/guides`, `/fr/guides/{slug}`              | `/fr-en/guides/…`             | yes (fr); the articles are French only     |

### Guides

The guides are articles in French stored in the repository as Markdown with a YAML
frontmatter (`apps/web/content/guides/{slug}.md`: title, description, category, dates of
publication, update and review, related listing slugs, official sources with the date each
was checked), registered in `src/lib/guides/catalog.ts` and validated by
`src/lib/guides/guide.ts` (official source hosts only, a restricted Markdown subset, no raw
HTML). The files are imported as text (Turbopack `text` rule, a Vite plugin in the unit
tests, Bun's loader for the jobs), so nothing is read from disk at request time. Pages are
prerendered; each guide has its own Open Graph image (`/og/guides/{slug}.png`), an `Article`
(author: the editorial team, an `Organization`) and a `BreadcrumbList`. The guides are in
`pages-0.xml` with their `lastmod` and in the warm-up's `pages` unit; listing and practitioner
pages link to the guides whose `listings` match ("Guides utiles"). Editorial rules and the
plan: [docs/guides/editorial-plan.md](guides/editorial-plan.md).

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
  (404), then 404 without a page, without a public place or while the page is
  withheld by a removal request (GDPR art. 21: it answers like an unknown page,
  as its Open Graph image and the contact form do), 308 when the name part is
  not the canonical slug;
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

### Revalidation after an import

The import sends its tags to `/api/revalidate` once it has committed
([data-import.md](./data-import.md), step 8): the precise ones, or above
20,000 of them the coarse `practitioner:*`, `listing:*`, `site:*` and `place:*`,
which every page query carries too. With any change it also sends `sitemap`,
the tag of every sitemap query: a precise tag (`practitioner:12`) never matches
them, and an import always changes what they list.

- **Pages** are revalidated with the `max` profile (stale-while-revalidate): the
  next request for a page still gets the copy from before the import, once, and
  triggers its render; the one after gets the new page. A national import marks
  400,000 pages at once, and none of their visitors waits for a render: the cache
  warm-up, which the import restarts, walks them and takes that one stale answer
  for most of them.
- **Sitemaps** are expired at once (`expire: 0`): the very next request for
  `/sitemap.xml` or a sitemap file reads the new data. Their queries are also cached
  five minutes at most (`revalidate` and `stale` of 300 seconds; a production
  server's in-memory cache drops an entry past its `revalidate`), so a sitemap
  never lags behind the data longer than that, even when a revalidation does not
  reach it. They are answered with `Cache-Control: public, max-age=0, s-maxage=300`.

`e2e/revalidation.spec.ts` checks both on a production build: it fills the
caches, changes the data, runs the import's own drain (`etl:outbox`) with
coarse, then precise tags, and reads the new sitemaps on the next request and
the new pages right after.

**Known limit (Next.js 16.4)**: Next.js timestamps the `"use cache"` entries with
the server process's monotonic clock (`performance.timeOrigin +
performance.now()`) but marks revalidated tags with the wall clock
(`Date.now()`, written last by its file-system cache over the in-memory
handler's own mark). The two drift apart in a long-running process; when the
monotonic clock is ahead (the system clock was stepped back after the server
started), every revalidation, `max` or `expire: 0`, misses the entries younger
than the gap, and they keep being served until their own lifetime ends: five
minutes for the sitemaps, weeks for the pages. A server in that state shows what
#97 reported in production: the sitemap index from before the first national
import, served for over half an hour across many requests, until a new
deployment restarted the server (sitemaps were then cached for an hour). Restarting the
app (`docker compose restart app`) clears it.

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

### Cache warm-up

Every other page is rendered on its first request, and an import expires the
pages it changed (stale-while-revalidate: the next visitor gets the old page
and triggers the render). So that this first visitor is not a crawler on a cold
page, `jobs:tick warm` (scheduled every five minutes by the image's crontab,
`apps/web/src/server/warm/`) requests the site's pages from the app itself,
as a visitor would:

- **What**: every URL of the sitemaps, from the same queries
  (`src/server/queries/sitemap-sql.ts`): first the homes, the static pages and
  the sitemap files themselves, then the listings, the place hubs, the
  establishments and the practitioners, chunk by chunk.
- **Where**: `INTERNAL_APP_URL` (`http://app:3000` in the image's stack), with
  `APP_URL`'s host as `Host` and `X-Forwarded-Host`, so the canonical host
  redirect lets it through.
- **How much**: `WARM_CACHE_CONCURRENCY` requests at a time (4), at most
  `WARM_CACHE_MAX_URLS` (5000) and `WARM_CACHE_MAX_SECONDS` (240) per run. It
  checks `/api/health` before starting and every 15 seconds, and stops when the
  health check fails or takes over 2 seconds, when the p95 of its last 100
  requests exceeds `WARM_CACHE_MAX_P95_MS` (3000), on a 429 or 503, or when
  errors pass a tenth of its requests: live traffic always comes first.
- **Resumable**: its cursor (`directory.cache_warmup`, one row: the unit
  reached and the offset in it) is saved as it goes, so the next run continues
  there. A finished walk waits.
- **When it starts over**: on a new build (the `.next/BUILD_ID` of the image the
  scheduler shares with the app), on a new successful import (the last
  `succeeded` row of `directory.etl_runs`), and when the import asks for it after
  draining its invalidation outbox (it sets `restart_requested_at`, the only
  column of the row its role may write). `jobs:tick warm --restart` forces it.
- **Logs**: one JSON line per run, e.g.
  `{"job":"warm","result":{"warmed":5000,"errors":0,"remaining":182000,"stopped":"count",…}}`
  (`"locked"` when a run is still going). `WARM_CACHE=false` turns it off.

At the default budget a run warms up to 5,000 pages in four minutes, 288 runs
a day: a walk of the whole of France (hundreds of thousands of URLs) takes about
a day when a cold page renders in a few hundred milliseconds, longer when the
guards slow it down. The listings and hubs, which crawlers and visitors reach
first, are warm within the first runs.

### Cache-Control

The proxy (`src/proxy.ts`, `src/lib/public-cache.ts`) gives every public page,
and the practitioners' Open Graph images, an explicit
`Cache-Control: public, max-age=0, s-maxage=300, stale-while-revalidate=3600`:
a CDN or caching proxy may serve a page five minutes, then stale for an hour
while it fetches the new one, which the app answers from its own cache. Without
it Next.js would derive the header from the cache lifetimes
(`s-maxage=2592000` on a practitioner page, a year on a static page and on a
404): a shared cache would keep a page for a month after a removal request.
Next.js keeps a Cache-Control the response already has, and still answers
errors with `private, no-cache, no-store`.

The practitioners' presentation page (`/fr/pro`, `/fr-en/pro`…) gets it too: it
is static, without a nonce (Next.js would give it a year). Never on the
practitioner space below it (`/fr/pro/connexion`, `/fr/pro/agenda`…), `/rdv`
(both rendered per request with a nonce), search results, the
report and removal forms, the API, and anything but GET and HEAD: those keep
Next.js's own `private, no-cache, no-store` (or `next.config.ts`'s). RSC
payloads of client navigations carry the same public header (the proxy cannot
tell them apart from the documents); they are the same public content, and
Next.js separates them with `Vary: rsc, …` and a `?_rsc=` parameter.

## Sitemaps and robots

- `/sitemap.xml`: hand-written index (Next.js has none) listing
  `/sitemaps/international.xml` (the international home), then each open
  market's files under its segment: France's `/sitemaps/fr/pages-0.xml` (static
  pages, then the guides with their `lastmod`) and
  every non-empty chunk
  `/sitemaps/fr/{praticiens|listes|lieux|etablissements}-{k}.xml`, where chunk
  `k` holds the ids `[k × 20,000, (k + 1) × 20,000)`. Only indexable canonical
  URLs (`/` and France's French pages), `lastmod` = `content_updated_at`, no
  `changefreq`/`priority`. A market that opens adds its own
  `/sitemaps/{segment}/…`.
  Fresh on the first request after an import (`sitemap` tag expired at once),
  five minutes old at most otherwise (see
  [Revalidation after an import](#revalidation-after-an-import)).
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
  characters at most when possible, brand suffix; a practitioner's title drops
  the brand before the commune, `withoutBrand`, so namesakes of one specialty
  keep distinct titles), description (155), absolute
  self canonical, robots (`robotsFor`: only French indexed in v1) and
  complete Open Graph and Twitter cards (Next.js replaces a parent's
  `openGraph` instead of merging it). hreflang only between indexed pages: the
  two homes print the same pair, `fr-FR` → `/fr` and `x-default` → `/`
  (`homeAlternates`); other pages have none while the other locales are
  `noindex` and France is the only market.
- One JSON-LD `@graph` per page (`src/lib/structured-data.ts`, typed with
  `schema-dts`), with `@id`s made of the canonical URL and a fragment:
  `IndividualPhysician` (doctors), `Dentist`, `Person` with `hasOccupation`
  (midwives, ISCO-08 2222; nurses, 2221, as a `CategoryCode`), their places
  (`PhysiciansOffice` for a doctor's office, `MedicalBusiness` for another
  profession's, `MedicalClinic`, `Hospital`, an establishment sharing its own
  page's `@id`), `BreadcrumbList`, `ItemList` on listings and hubs, and on the
  homes (`/`, `/fr` and the other locales' homes) the same `WebSite` and
  `Organization` (`src/lib/site-entities.ts`: `@id`s on the site root,
  `{origin}/#website` and `#organization`, logo `/icon/512`, `sameAs` the
  source repository; nothing in them depends on the page's language, and no
  `SearchAction`). Every other page's `WebPage` is `isPartOf` that `WebSite`.
  `medicalSpecialty` only takes the schema.org enumeration;
  `ReserveAction` only when booking is open; photo, website, languages and
  opening hours only from the owner; never a rating or a review.
- Open Graph: one static image per profession,
  `/og/{medecin|chirurgien-dentiste|sage-femme|infirmier|annuaire}.png`; site
  icons `/icon/{48,192,512}`, `/apple-icon` and `/manifest.webmanifest`.
- Practitioner pages have their own card, `/og/praticien/{slug}.png`
  (`src/app/og/praticien/[file]`, `src/server/og/practitioner-image.tsx`),
  listed first with the profession's image as the fallback: 1200 × 630, the
  name, the profession or specialty, the commune, the RPPS number and the
  Apercura print, graphite ink on white paper (the site's own contrast pairs),
  in French like the other images. The photo only when the owner published one
  on the page. Fonts are static Allo cuts vendored in `apps/web/src/fonts/allo/og`, read
  on disk, never fetched.
  The PNG is cached (`"use cache"`) with the page's tags (`practitioner:{id}`,
  `practitioner:*` and those of its commune and listing), so an import or an
  owner's edit renders it again; an unknown, malformed or withheld page answers
  404.
- Opening hours: the JSON-LD builder accepts owner-entered hours
  (`openingHoursSpecification`), but nothing enters them yet. The booking
  agenda's weekly windows (`care.availability_rules`) are when patients may
  book online, for some appointment types, between two dates: not when the
  practice is open, so they are never published as opening hours. Owner-entered
  hours are in the [roadmap](../ROADMAP.md#practitioner-tools).

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

## SEO checklist

Audit of production (https://apercura.org) on 25 November 2026, after the first
national import (#104): about 180 read-only requests with a browser user agent,
under two per second. Rerun it before a market opens or after a change to the
routes, the metadata or the structured data.

### How

- **Pages**: the server HTML (what crawlers get) of `/`, `/fr`, `/fr-en`, a
  practitioner of each profession (doctor, dentist, midwife, nurse, a
  specialist), listings at department (`/fr/medecin-generaliste/75-paris`, 4,375
  practitioners) and commune level, page 2 and the last page of a big listing,
  a one-practitioner listing, place hubs (department, commune, `/fr/annuaire`), a
  specialty hub, an establishment, the legal pages and `/fr/pro`: status,
  title, description, canonical, robots meta and `X-Robots-Tag`, hreflang, Open
  Graph and Twitter tags, icons, the h1 and where each tag sits (in `<head>`).
- **Structured data**: every JSON-LD block, parsed and checked against the
  schema.org vocabulary (`schemaorg-all-https.jsonld`: types, properties in the
  domain of their type, enumeration members in the range of their property,
  `@id` references), then with `@adobe/structured-data-validator` (schema.org and
  Google's rich result rules) on the same HTML. Both run locally, nothing is
  sent to a third party. Google's rules per type: `BreadcrumbList` (eligible),
  `Organization` (logo of at least 112 px, crawlable), `WebSite` (site name, on
  the home page), `LocalBusiness` subtypes (name and address), and no review or
  rating markup anywhere.
- **Crawlability**: `/robots.txt`, the sitemap index and one chunk of every kind
  (XML well-formed, at most 50,000 URLs and 50 MB, `lastmod` as `YYYY-MM-DD`,
  `&` escaped, lowercase URLs), the 33 practitioner chunks for the name
  statistics below; status of unknown, malformed and redirected URLs; the
  former domain over HTTP and HTTPS, with and without `www.`.
- **Performance**: Lighthouse 13 (mobile emulation, simulated throttling) on the
  Paris generalists listing and two practitioner pages.
- **Metadata at scale**: the title templates reasoned over the real names of
  the 393,846 indexed practitioners (from the sitemaps) and the commune names
  of the place hubs.

### Results

| Check                                                                       | Result                                                                                                                                                                                                                         |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| JSON-LD is valid schema.org on every page type                              | Pass: no unknown type or property, no out-of-domain property, no validator error or warning; `practicesAt` and `occupationalCategory` are still `pending` terms                                                                |
| No review, rating or comparison markup                                      | Pass                                                                                                                                                                                                                           |
| `WebSite` and `Organization` on the site's home page                        | **Fixed**: only on `/fr`; `/` (the home page Google reads the site name from) had a `WebPage` pointing at an undefined `/#website`                                                                                             |
| Same `@id`, same entity                                                     | **Fixed**: `/#website` had a different `description` and `inLanguage` on each locale's home                                                                                                                                    |
| `SearchAction`                                                              | **Removed**: Google retired the sitelinks search box in November 2024, and its target (`/fr/recherche`) is disallowed in robots.txt                                                                                            |
| Place types                                                                 | **Fixed**: a nurse's, midwife's or dentist's office was a `PhysiciansOffice` ("a doctor's office"); now a `MedicalBusiness`                                                                                                    |
| Title, description, canonical, robots, OG/Twitter, icons, manifest          | Pass on every page type: one of each, in `<head>`, self canonical, absolute URLs, `og:image` 1200 × 630 PNG                                                                                                                    |
| Unique titles at scale                                                      | **Fixed**: 7 % of indexed practitioners share their name with another; the commune told them apart in only 28 % of generalists' and dentists' titles (60 characters with the brand). Dropping the brand first keeps it in 78 % |
| hreflang / `x-default`                                                      | Pass: `/` and `/fr` print the same reciprocal pair; nothing elsewhere while other locales are `noindex`                                                                                                                        |
| Other locales                                                               | Pass: `noindex, follow` in the meta and `X-Robots-Tag`, self canonical, out of the sitemaps                                                                                                                                    |
| Sitemaps                                                                    | Pass: index of 47 files, chunks of at most 20,000 URLs (largest 12,000, 1.3 MB), valid XML, `lastmod` from the content hash                                                                                                    |
| robots.txt                                                                  | Pass: only search, the API, `_ui` and the signed-in practitioner space; no `noindex` page linked publicly is hidden                                                                                                            |
| Unknown slugs (bad RPPS, unknown RPPS, listing, place, establishment, page) | Pass: real 404 with `noindex`; page `1`, a trailing slash, capitals, an old name answer 308                                                                                                                                    |
| Withheld page (removal request being checked)                               | **Fixed**: answered 200 with `noindex, nofollow` and a notice; now a 404 like an unknown page                                                                                                                                  |
| Internal links that redirect                                                | **Fixed**: every Paris listing linked the Paris city (`/{listing}/75-paris/paris`), which answers 308 to the listing itself                                                                                                    |
| Thin listings                                                               | Pass: below 3 practitioners `noindex, follow` and out of the sitemaps (hysteresis down to 2)                                                                                                                                   |
| Pagination                                                                  | Page 2+ `noindex, follow`, self canonical, `rel="next"`; see the recommendations                                                                                                                                               |
| Former domain                                                               | Pass over HTTPS: one 301 to the new URL, path and query mapped. Over HTTP, two hops (see below)                                                                                                                                |
| Core Web Vitals (Lighthouse, mobile)                                        | Pass: performance, accessibility, best practices and SEO 100 on all three pages; LCP 1.2–1.3 s, CLS 0, TBT 10–60 ms, about 370 KB transferred                                                                                  |

### Recommendations (not done)

- **Pagination depth** (medium): a listing links only to the next and the
  previous page, so the last of the 219 pages of the Paris generalists is 218
  clicks away, and Google stops following the links of pages that stay
  `noindex` for long. Practitioners are reachable through their arrondissement
  or commune listing and the sitemaps, but a pager with the first, last and
  nearby page numbers would bound the depth to a few clicks. Indexing pages 2+
  (each its own canonical, as Google recommends) is worth weighing with it.
- **HTTP on the former domain** (low): `http://apercura.fr/…` answers a 301 to
  `https://apercura.fr/…` from the hosting proxy before the app's 301 to
  apercura.org. Routing plain HTTP of the former hosts to the app too would make
  it one hop.
- **Exact namesakes** (low): two practitioners of the same name, specialty and
  commune still share a title and description; adding the street to the
  description would tell them apart.
- **Pending schema.org terms** (info): `practicesAt` and `occupationalCategory`
  are still in schema.org's pending area; no validator flags them, but follow
  their status.

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
