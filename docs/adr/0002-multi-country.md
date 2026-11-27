# ADR 0002: Multi-country foundation and European market study

- Status: accepted; France, Austria, the United Kingdom, Czechia, Spain, Italy, Germany, Switzerland, Estonia, Poland, Norway, Ireland, Finland, Lithuania and Slovenia are open
- Date: 2026-11-22; section 2 amended 2026-11-25; Austria opened 2026-11-25; the United Kingdom opened 2026-11-25; Czechia opened 2026-11-26; Spain opened 2026-11-26; Italy opened 2026-11-26; Germany opened 2026-11-26; Switzerland opened 2026-11-27; section 2 amended for Switzerland 2026-11-27; Poland opened 2026-11-27; Estonia opened 2026-11-27; Norway opened 2026-11-27; Ireland opened 2026-11-27; Finland opened 2026-11-27; Lithuania opened 2026-11-27; Slovenia opened 2026-11-27
- Issue: #45; section 2: #81; market study: #82 (2026-11-25); Austria: #107; United Kingdom: #125; Czechia: #131; Spain: #148; Italy: #150; Germany: #152; Switzerland: #154; Estonia: #165; Poland: #164; Norway: #172; Ireland: #171; Finland: #173; Lithuania: #170; Slovenia: #167

## Context

Apercura publishes a page for every health practitioner registered in France,
built from French open data (Annuaire Santé, FINESS, Ameli), and lets patients
book online. The product should later serve other European markets: Germany,
the United Kingdom, Spain and Italy first in the original plan, and since #82
every EU and EEA country, Switzerland and the United Kingdom, in the order of
the "Launch order" section. Each of those markets differs in ways the code
cannot guess: where the practitioner data comes from and under which licence, how practitioners are
identified, which rules apply to hosting health data, which legal notices a site
must carry, how phone numbers and addresses are written.

Two things must not be confused:

- an **interface locale** is a language of the interface (`fr`, `en`, `de`,
  `es`, `it`); anyone can read the French directory in German;
- a **market** is a country whose practitioners are listed, with its own
  registry, rules and URL segment.

This ADR sets the foundation for markets without opening any. The interface is
translated now; markets open one at a time, each after the research listed
below has been verified.

## Decision

### 1. Interface locales now, markets later

`apps/web/src/i18n/locales.ts` lists the five interface locales. French is the
language of France's pages (`/fr`), English is the source catalog (British
English, the language of the UK market); English, German, Spanish and Italian
interfaces of France's pages live under `/fr-en`, `/fr-de`, `/fr-es` and
`/fr-it` with translated route segments (section 2, `docs/public-site.md`).

Until a market opens, its pages are `noindex`, absent from the sitemaps and
announced by no hreflang (`INDEXABLE_LOCALES = ["fr", "de-AT", "en-GB", "cs-CZ",
"es-ES", "it-IT", "de-DE", "de-CH", "fr-CH", "it-CH", "et-EE", "pl-PL", "nb-NO", "en-IE", "fi-FI", "lt-LT",
"sl-SI", "el-CY", "lv-LV"]`
since Latvia opened: France in French, Austria in German, the UK in British English, Czechia in
Czech, Spain in Spanish, Italy in Italian, Germany in German, Switzerland in German, French and
Italian, Estonia in Estonian, Poland in Polish, Norway in Norwegian Bokmål, Ireland in English,
Finland in Finnish, Lithuania in Lithuanian, Slovenia in Slovenian, Cyprus in Greek, Latvia in Latvian). A locale becomes indexable only
with its market, because a German page of a French
directory is not what a German searching for a doctor near Munich expects.

### 2. One domain, one path segment per market

Decided on 2026-11-25 (#81), replacing "one domain per market": every market
lives on **apercura.org**, under its own first path segment. One domain keeps
one reputation, one certificate, one cookie and passkey scope, one Search
Console property and one set of mail records, and lets a market open without
buying, securing and warming up a new domain. apercura.fr, the French site's
first domain, only redirects.

#### The scheme

| Path                                           | What                                                            | Indexed           |
| ---------------------------------------------- | --------------------------------------------------------------- | ----------------- |
| `/`                                            | International home, in English: what Apercura is, the countries | yes (`x-default`) |
| `/fr/…`                                        | France, in French                                               | yes               |
| `/fr-en/…`, `/fr-de/…`, `/fr-es/…`, `/fr-it/…` | France's pages, interface in another language                   | never             |
| `/at/…`                                        | Austria, in German (open since #107)                            | yes               |
| `/gb/…`                                        | United Kingdom, in British English (open since #125)            | yes               |
| `/es/…`                                        | Spain, in Spanish (open since #148)                             | yes               |
| `/it/…`                                        | Italy, in Italian (open since #150)                             | yes               |
| `/de/…`                                        | Germany, in German (open since #152)                            | yes               |
| `/ch/…`, `/ch-fr/…`, `/ch-it/…`                | Switzerland, in German, French and Italian (open since #154)    | yes               |
| `/ee/…`                                        | Estonia, in Estonian (open since #165)                          | yes               |
| `/pl/…`                                        | Poland, in Polish (open since #164)                             | yes               |
| `/no/…`                                        | Norway, in Norwegian Bokmål (open since #172)                   | yes               |
| `/ie/…`                                        | Ireland, in English (open since #171)                           | yes               |
| `/fi/…`                                        | Finland, in Finnish (open since #173)                           | yes               |
| `/lt/…`                                        | Lithuania, in Lithuanian (open since #170)                      | yes               |
| `/si/…`                                        | Slovenia, in Slovenian (open since #167)                        | yes               |
| `/cy/…`                                        | Cyprus, in Greek (open since #174)                              | yes               |
| `/lv/…`                                        | Latvia, in Latvian (open since #166)                            | yes               |
| `/se/…`                                        | Sweden, in Swedish (open since #175)                           | yes               |
| `/be-fr/…`, `/be-nl/…`                         | Later: a market in each of its official languages               | once open         |

The rule is `/{market}` for a market's main language and
`/{market}-{language}` for any other language of it, whether an official
language of the market (`/ch-fr`, indexed since Switzerland opened) or an
interface translation for visitors (`/fr-en`, never indexed: a French
directory read in English is not what someone searching in English expects).
A country with several official languages and no main one (Belgium) has only
`-{language}` segments. Switzerland was planned that way (`/ch-de`, `/ch-fr`, `/ch-it`) and opened
otherwise (#154, amended 2026-11-27): its German, the language of about 60% of its people and of
most of the FOPH's and cantons' lists, is `/ch` (locale `de-CH`), French `/ch-fr` (`fr-CH`) and
Italian `/ch-it` (`it-CH`). The three are market languages, each indexed, each the hreflang
alternate of the others; none is an interface translation. A market's segment then stays one
code everywhere it is used alone (the search's `pays` value, `marketSegment`, the country
menu's link; each language has its sitemaps, `/sitemaps/ch/…`, `/sitemaps/ch-fr/…`, `/sitemaps/ch-it/…`), and `/ch-de/…` answers a permanent redirect to `/ch/…`
for those who type it. Ireland was planned under `/ie-en` (launch order) and opened under `/ie`
(#171, amended 2026-11-27): English is the language of its registers and of nearly every reader, so
it is the market's main language (locale `en-IE`), and an Irish interface, when one is written, goes
under `/ie-ga`. Market codes are ISO 3166-1 alpha-2
in lowercase (`gb`, not `uk`), language codes ISO 639-1. Translated route
segments follow the prefix (`/fr-de/behandler/…`, `docs/public-site.md`).

Why one segment, market first:

- next-intl routes one locale segment (`app/[locale]`) and maps each locale to
  any URL prefix (`localePrefix: { mode: "always", prefixes }`). The locale
  stays the internal key of the catalogs, formats, the user's stored locale and
  the email links; only `LOCALE_PREFIXES` changed. A nested `/fr/en/…` would
  need two dynamic segments, a custom proxy and one pathnames table per market.
- Market first keeps all of a market's URLs under one prefix: robots rules,
  sitemaps (`/sitemaps/fr/…`), analytics and a Search Console URL-prefix view
  all filter on `/fr`. The BCP 47 order (`/en-fr`) would scatter France's pages
  over `/en-fr`, `/de-fr`…, and make `/de` ambiguous between Germany and German.
- The segment is not a language tag (`ch-fr` would read as Chamorro): `lang`,
  `og:locale`, JSON-LD `inLanguage` and hreflang use real tags (`LOCALE_TAGS`,
  `HREFLANGS`: `fr-FR`, later `fr-CH`, `de-CH`).

When a second market opens, its languages become locales of their own (a
German interface of France's pages and German pages of Germany are not the
same thing), each with its catalog language and its URL prefix. Locale ids
stay BCP 47 tags (`de-AT` for `/at`, `fr-CH` for `/ch-fr`), because
next-intl formats with the id; the segment is only the prefix. Today's French
ids map one to one (`en` is `/fr-en`).

#### Indexing

- **Canonical**: always self, absolute on `APP_URL` (`https://apercura.org`),
  whatever host the request came from.
- **Indexed**: the international home and each open market's own languages
  (`/fr`, `/at`, `/gb`, `/cz`, `/es`, `/it`, `/de`, `/ch`, `/ch-fr`, `/ch-it`, `/ee`, `/pl`, `/no`, `/ie`, `/fi`, `/lt`, `/si` and `/lv` today). Interface translations (`/fr-en`…) are `noindex`, absent from
  the sitemaps and never targeted by hreflang (`INDEXABLE_LOCALES`).
- **hreflang**: only between indexed pages that are the same thing in another
  language or market. The homes form one cluster, printed by both: `x-default`
  → `/`, `fr-FR` → `/fr`, `de-AT` → `/at`, `en-GB` → `/gb`, `cs-CZ` → `/cz`, `es-ES` → `/es`, `it-IT` → `/it`, `de-DE` → `/de`, `de-CH` → `/ch`, `fr-CH`
  → `/ch-fr`, `it-CH` → `/ch-it`, `et-EE` → `/ee`, `pl-PL` → `/pl`, `nb-NO` → `/no`, `en-IE` → `/ie`, `lv-LV` → `/lv`, `fi-FI` → `/fi`, `lt-LT` → `/lt`, `sl-SI` → `/si`. Below the homes, hreflang links the languages of one market only
  (a Swiss facility's `/ch/einrichtung/…`, `/ch-fr/etablissement/…` and `/ch-it/struttura/…`
  pages, its listings, its legal pages), never two markets: a French practitioner has no
  German-market page. Switzerland is the only market whose pages below the home have alternates.
- **Sitemaps**: one index, `/sitemap.xml`, listing
  `/sitemaps/international.xml` and each open market's files under its segment
  (`/sitemaps/fr/{kind}-{k}.xml`). Only indexed URLs.
- **robots.txt**: one file for the domain, with per-prefix rules (search
  results, the practitioner app area, the component gallery of every locale).
- **The root** never redirects on the visitor's language, so crawlers and
  people see the same `x-default`. A browser preferring another language of an
  open market sees a link to it, added in the browser. Markets still to open
  are listed as plain text ("coming soon"): no page exists for a market until
  its checklist (section 4) passes, so the root creates no thin or duplicate
  page.

#### The former domain

Until the switch the French directory lived on apercura.fr without a prefix,
its interface translations under `/en`, `/de`, `/es`, `/it`. Every former URL
answers a permanent redirect to its new address on apercura.org, path and
query kept (301 for GET and HEAD, 308 otherwise), in one hop:

| apercura.fr                                   | apercura.org                                   |
| --------------------------------------------- | ---------------------------------------------- |
| `/`                                           | `/fr`                                          |
| `/praticien/{slug}`, any French page          | `/fr/praticien/{slug}`, `/fr/…`                |
| `/en/…`, `/de/…`, `/es/…`, `/it/…`            | `/fr-en/…`, `/fr-de/…`, `/fr-es/…`, `/fr-it/…` |
| `/sitemaps/{kind}-{k}.xml`                    | `/sitemaps/fr/{kind}-{k}.xml`                  |
| robots.txt, sitemap.xml, images, security.txt | same path                                      |

The former hosts are configured (`LEGACY_HOSTS`); the mapping is
`apps/web/src/lib/market-path.ts`. On apercura.org itself, an old unprefixed
French path answers 301 as well, while an old locale prefix answers a
temporary 307 to its `/fr-…` path until the market of that segment opens; none
is left: `/es`'s was dropped when Spain opened (#148), `/it`'s when Italy opened (#150)
and `/de`'s when Germany opened (#152): on apercura.org they are those markets'
pages, and only the former host still maps them to `/fr-es/…`, `/fr-it/…` and
`/fr-de/…`. The data model already carries `country` on
`directory.practitioners` and `directory.suppressions`, and the unique key is
`(country, id_scheme, national_id)`, so two markets never collide.

What the move costs, once: sessions (cookies are host-only) and passkeys (the
relying party is the host) registered on apercura.fr do not carry over;
calendar invitations sent before the switch keep their `@apercura.fr` UIDs;
the Pro Santé Connect redirect URI, the mail domain (Brevo authentication,
DKIM, DMARC, `contact@apercura.org`) and the Search Console property change
(`docs/deploy-vps.md`, "Moving production to apercura.org").

### 3. `CountryAdapter`

`packages/core/src/country` (`@apercura/core/country`) defines one interface
for everything that differs per market. Adapters are pure: no network, no
database. France wraps the code the app already used; Austria (#107) is the
first market written against the interface, the United Kingdom (#125) the second, Czechia (#131) the
third, Spain (#148) the fourth, Italy (#150) the fifth, Germany (#152) the sixth, Switzerland (#154) the seventh, Estonia (#165) the eighth, Poland (#164) the ninth, Norway (#172) the tenth, Ireland (#171) the eleventh, Finland (#173) the twelfth, Lithuania (#170) the thirteenth,
Slovenia (#167) the fourteenth, Cyprus (#174) the fifteenth, Latvia (#166) the sixteenth, Sweden (#175) the seventeenth.

| Member               | France                                                                    | Austria                                                                                                                         | United Kingdom                                                                                                                                                                                     | Czechia                                                                                                                                        | Spain                                                                                                                                             | Italy                                                                                                                                                                                                | Germany                                                                                                                                                                                                                            | Switzerland                                                                                                                                                                                                                                                                                                                    | Estonia                                                                                                                                                                                                                                                                                                                     | Poland                                                                                                                                                                                                                                                                | Norway                                                                                                                                                                                                                                                                  | Ireland                                                                                                                                                                                                                                                                                                                                                                               | Finland                                                                                                                                                                                                                   | Lithuania                                                                                                                                                                                                                                                                  | Slovenia                                                                                                                                                                  | Cyprus                                                                                                                                                                                                                                                                                                       | Latvia                                                                                                                                                                                                                                                                    | Sweden |
| -------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| `segment`            | `fr`                                                                      | `at`                                                                                                                            | `gb`                                                                                                                                                                                               | `cz`                                                                                                                                           | `es`                                                                                                                                              | `it`                                                                                                                                                                                                 | `de`                                                                                                                                                                                                                               | `ch` (German), with `/ch-fr` and `/ch-it`                                                                                                                                                                                                                                                                                      | `ee`                                                                                                                                                                                                                                                                                                                        | `pl`                                                                                                                                                                                                                                                                  | `no`                                                                                                                                                                                                                                                                    | `ie`                                                                                                                                                                                                                                                                                                                                                                                  | `fi`                                                                                                                                                                                                                      | `lt`                                                                                                                                                                                                                                                                       | `si`                                                                                                                                                                      | `cy`                                                                                                                                                                                                                                                                                                         | `lv`                                                                                                                                                                                                                                                                      | `se` |
| `defaultLocale`      | `fr`                                                                      | `de` (web locale `de-AT` under `/at`: the German catalog with Austrian overrides)                                               | `en` (web locale `en-GB` under `/gb`: the English catalog with UK overrides)                                                                                                                       | `cs` (web locale `cs-CZ` under `/cz`: the English catalog with the Czech translation on top)                                                   | `es` (web locale `es-ES` under `/es`: the Spanish catalog with Spanish-market overrides, `messages/es-ES.json`)                                   | `it` (web locale `it-IT` under `/it`: the Italian catalog with Italy's overrides, `messages/it-IT.json`; `it` stays France's Italian interface at `/fr-it`)                                          | `de` (web locale `de-DE` under `/de`: the German catalog with Germany's overrides, `messages/de-DE.json`; `de` stays France in German under `/fr-de`)                                                                              | `de` (web locales `de-CH` under `/ch`: the German catalog with Swiss overrides, `messages/de-CH.json`, every ß written ss; `fr-CH` under `/ch-fr` and `it-CH` under `/ch-it`: the French and Italian catalogs with theirs)                                                                                                     | `et` (web locale `et-EE` under `/ee`: the English catalog with the Estonian texts on top, `messages/ee.json`, as Czechia)                                                                                                                                                                                                   | `pl` (web locale `pl-PL` under `/pl`: the English catalog with the Polish texts on top, `messages/pl.json`, every plural with its four Polish forms)                                                                                                                  | `nb` (web locale `nb-NO` under `/no`: the English catalog with the Norwegian Bokmål texts on top, `messages/no.json`, as Estonia)                                                                                                                                       | `en` (web locale `en-IE` under `/ie`: the English catalog with Ireland's overrides, `messages/en-IE.json`; no Irish interface yet)                                                                                                                                                                                                                                                    | `fi` (web locale `fi-FI` under `/fi`: the English catalog with the Finnish texts on top, `messages/fi.json`; Swedish, `/fi-sv`, is a follow-up)                                                                           | `lt` (web locale `lt-LT` under `/lt`: the English catalog with the Lithuanian texts on top, `messages/lt.json`)                                                                                                                                                            | `sl` (web locale `sl-SI` under `/si`: the English catalog with the Slovenian translation on top, `messages/si.json`, as Czechia's; plurals `one`, `two`, `few`, `other`)  | `el` (web locale `el-CY` under `/cy`: the English catalog with the Greek texts on top, `messages/cy.json`, as Estonia; English `/cy-en` deferred)                                                                                                                                                            | `lv` (web locale `lv-LV` under `/lv`: the English catalog with the Latvian texts on top, `messages/lv.json`, as Czechia)                                                                                                                                                  | `sv` (web locale `sv-SE` under `/se`: the English catalog with the Swedish texts on top) |
| `defaultTimeZone`    | `Europe/Paris`                                                            | `Europe/Vienna`                                                                                                                 | `Europe/London`                                                                                                                                                                                    | `Europe/Prague`                                                                                                                                | `Europe/Madrid`                                                                                                                                   | `Europe/Rome`                                                                                                                                                                                        | `Europe/Berlin`                                                                                                                                                                                                                    | `Europe/Zurich`                                                                                                                                                                                                                                                                                                                | `Europe/Tallinn`                                                                                                                                                                                                                                                                                                            | `Europe/Warsaw`                                                                                                                                                                                                                                                       | `Europe/Oslo`                                                                                                                                                                                                                                                           | `Europe/Dublin`                                                                                                                                                                                                                                                                                                                                                                       | `Europe/Helsinki`                                                                                                                                                                                                         | `Europe/Vilnius`                                                                                                                                                                                                                                                           | `Europe/Ljubljana`                                                                                                                                                        | `Europe/Nicosia`                                                                                                                                                                                                                                                                                             | `Europe/Riga`                                                                                                                                                                                                                                                             | `Europe/Stockholm` |
| `timeZones`          | Paris and the 8 overseas zones                                            | Vienna only                                                                                                                     | London only                                                                                                                                                                                        | Prague only                                                                                                                                    | Madrid and `Atlantic/Canary`                                                                                                                      | Rome only                                                                                                                                                                                            | Berlin only                                                                                                                                                                                                                        | Zurich only                                                                                                                                                                                                                                                                                                                    | Tallinn only                                                                                                                                                                                                                                                                                                                | Warsaw only                                                                                                                                                                                                                                                           | Oslo only (Svalbard is not listed)                                                                                                                                                                                                                                      | Dublin only                                                                                                                                                                                                                                                                                                                                                                           | Helsinki only                                                                                                                                                                                                             | Vilnius only                                                                                                                                                                                                                                                               | Ljubljana only                                                                                                                                                            | Nicosia only                                                                                                                                                                                                                                                                                                 | Riga only                                                                                                                                                                                                                                                                 | Stockholm only |
| `timeZoneOf(region)` | `timeZoneForDepartment` (INSEE department code, throws if unknown)        | Bundesland number `1`–`9` (throws if unknown)                                                                                   | any ONS area code (`E12000007`, `S92000003`, `E09000007`; throws otherwise)                                                                                                                        | region or district NUTS/LAU code (`CZ010`, `CZ0642`; throws otherwise)                                                                         | INE province code (`35`, `38`: Canary) or `C` + community code (`C05`); throws otherwise                                                          | ISTAT region (`12`), province (`058`, `258`) or municipality (`058091`) code; throws otherwise                                                                                                       | AGS code of a Land, Kreis or Gemeinde of a known Land (`09`, `09162`, `09162000`; throws otherwise)                                                                                                                                | canton abbreviation (`ZH`), BFS district or commune number (`112`, `261`); throws otherwise                                                                                                                                                                                                                                    | any EHAK code of four digits (a county, municipality or settlement: `0037`, `0784`, `8151`); throws otherwise                                                                                                                                                                                                               | TERYT code of a voivodeship, powiat or gmina of a known voivodeship (`12`, `1261`, `1261011`; throws otherwise)                                                                                                                                                       | a county number (`46`) or a municipality number (`4601`) of one of the fifteen counties; throws otherwise (Svalbard `21xx`, a pre-2024 county)                                                                                                                          | province letter (`L`), Tailte Éireann county code (`40000`) or CSO Built Up Area code (`13200`); throws otherwise                                                                                                                                                                                                                                                                     | Statistics Finland code of a region or wellbeing services county (two digits) or of a municipality (three; throws otherwise)                                                                                              | county `1`–`10`, municipality (two digits) or settlement code of the Address Register; throws otherwise                                                                                                                                                                    | statistical region (`1`–`12`) or RPE municipality code (`1`–`213`); throws otherwise                                                                                      | a district code (`1`, `3`–`6`) or a municipality's or community's four-digit CYSTAT code in it (`1000`, `5000`); throws otherwise (Kyrenia `2`)                                                                                                                                                              | statistical region (`LV00A`) or ATVK code of a territory, town or parish (`0001000`, `0054010`); throws otherwise                                                                                                                                                         | county code (`01`–`25`) or municipality code of a known county (throws otherwise) |
| `registries`         | Annuaire Santé (RPPS), FINESS+, Ameli, under the Licence Ouverte 2.0      | Vienna, Styria, Salzburg doctors and Salzburg dentists lists, Statistik Austria Gemeinden, CC BY 4.0, each with its attribution | ODS (England and Wales), Public Health Scotland, BSO (Northern Ireland) practice lists, Code-Point Open, OS Open Names, ONS local authorities, OSNI gazetteer, OGL v3.0, each with its attribution | NRPZS places of care (ÚZIS ČR) and RÚIAN territorial units (ČÚZK), CC BY 4.0, each with its attribution                                        | REGCESS monthly extracts (Ministerio de Sanidad, reuse under Ley 37/2007: source and date) and the IGN's units and population centres (CC BY 4.0) | Farmacie, Parafarmacie and Posti letto per struttura ospedaliera (Ministero della Salute, IODL 2.0, cited with the date of their data) and ISTAT's boundaries (CC BY 4.0), each with its attribution | Destatis's yearly directory of hospitals and rehabilitation clinics and GV-ISys (reproduction with the source), Thuringia's (CC BY 4.0, © GDI-Th) and Brandenburg's (dl-de/by-2-0, LAVG) pharmacy lists, each with its attribution | FOPH's Kennzahlen der Schweizer Spitäler 2023, the hospital, nursing home and pharmacy lists of Bern, Geneva (SITG), Basel-Landschaft, Basel-Stadt, Zürich and Jura, the BFS commune register and swisstopo's postcode directory, opendata.swiss "Open use" with the source, each with its credit in its publisher's languages | The Health Board's providers and activity licences (MEDRE open data, CC BY-NC-SA 3.0, republished under the same licence), the State Agency of Medicines' pharmacies (CC0 1.0), the Land and Spatial Development Board's EHAK units (open data with its credit) and ADS address points (CC0 1.0), each with its attribution | RPWDL's healthcare entities (Centrum e-Zdrowia, dane.gov.pl, CC BY 4.0, cited with the time of production and of obtaining), TERYT's TERC (GUS, CC BY 4.0) and PRG's boundaries of the gminas (GUGiK, CC BY 4.0, with the PZGiK statement), each with its attribution | Brønnøysundregistrene's Enhetsregisteret (its establishments, NLOD 2.0, credited with NLOD's default sentence and "endret av Apercura"), Kartverket's addresses (Matrikkelen – Adresse, CC BY 4.0) and counties and municipalities (CC BY 4.0)                          | The PSI's register of retail pharmacy businesses and HIQA's register of designated centres for older people (re-use under the publishers' PSI conditions), the HSE's Health Atlas hospitals and health centres on GeoHive (CC BY 4.0, March 2020), Tailte Éireann's counties and placenames gazetteer and the CSO's Census 2022 Built Up Areas (CC BY 4.0), each with its attribution | The Finnish Service Catalogue (PTV, DVV, CC0 1.0, its open API) and Statistics Finland's municipalities, wellbeing services counties and regions (CC BY 4.0), each with its credit                                        | VASPVT's licence register of health-care institutions (data.gov.lt, daily) and the Address Register of VĮ Registrų centras (counties, municipalities, elderships, settlements and their boundaries), CC BY 4.0, each with its Lithuanian credit                            | ZZZS's lists of personal doctors (general practice, gynaecologists, dentists) and GURS's Register of Spatial Units, CC BY 4.0, each with its attribution                  | The Ministry of Health's lists on data.gov.cy: the Pharmaceutical Services' private pharmacies, the state hospitals and health centres; Cyprus Post's postcodes by municipality and community; CYSTAT's 2021 census table; all CC BY 4.0, each with its attribution ("με αλλαγές της Apercura" on the lists) | NVD's quarterly list of GPs, the Ministry of the Interior's Information Centre's addresses of medical institutions, the State Agency of Medicines' register of pharmacies (CC0 1.0, credited anyway), the State Land Service's address register (CC BY 4.0, VZD's credit) | Läkemedelsverket's licensed pharmacies (CC BY 4.0), Västra Götalandsregionen's health centres and SCB's counties and municipalities (CC0 1.0), each with its credit |
| `practitionerIds`    | RPPS, 11 digits with a Luhn check digit (`isValidRpps`)                   | One scheme per list (`AT-WIEN`, `AT-STMK`, `AT-SBG`, `AT-SBGZ`): no national number is published                                | One scheme per list (`GB-ODS-GP`, `GB-ODS-DENT`, `GB-ODS-PHARM`, `GB-PHS-*`, `GB-BSO-*`): ODS codes, PHS and BSO numbers, an address-derived key for NI dental                                     | One scheme, `CZ-NRPZS`: the register's facility number `ZZ_ID` (the provider's IČO is never used)                                              | One scheme, `ES-REGCESS`: the normalised centre code `CCN` (ten digits); the regional code is not used                                            | One scheme per list (`IT-FARM`, `IT-PFARM`, `IT-HSP`): the ministry's code of the place (the owner's VAT number is never read)                                                                       | One scheme per source (`DE-KHV`, `DE-RHV`, `DE-APO-TH`, `DE-APO-BB`): keys derived from the municipality, address and names (the directory's `KH_ID` is drawn anew each edition), Thuringia's file numbers                         | One scheme per list (`CH-BAG`, `CH-BE-SPITAL`, `CH-GE-EMS`, `CH-BL-PHARM`, `CH-ZH-PH`…): the list's number where it has one (a pharmacy's GLN, a home's cantonal address id), else a key derived from canton, name, street and postcode                                                                                        | One scheme, `PL-RPWDL`: the establishment number `ID ZOZ` (the entity's NIP, REGON and book number are never used)                                                                                                                                                                                                          | One scheme per register (`EE-TTL`, `EE-APT`): a provider's first activity licence in force (`L01909`, printed on its page as § 22(3) of the Advertising Act requires), a pharmacy's place of business code; the Business Register code is never used                  | One scheme, `NO-ORGNR`: the establishment's own organisation number (modulus 11 checked, printed `910 000 039`); sole proprietorships are never listed, so no number is a person's                                                                                      | One scheme per list (`IE-PSI`, `IE-HIQA`, `IE-HSE-HOSP`, `IE-HSE-HC`): the PSI's registration number, HIQA's centre id, a key derived from county, name and address for the HSE's rows                                                                                                                                                                                                | One scheme, `FI-PTV`: the service location's channel UUID, stored as 32 hexadecimal digits; no business id                                                                                                                | One scheme (`LT-VASPVT`): the institution's number and the Address Register code of the activity address (`5271-12679435`), or `v` and the start of the address's GUID where VASPVT gives no code                                                                          | One scheme, `SI-ZZZS`: the insurer's doctor number (`Šifra zdravnika`) across the three lists; the provider number keys practices, never a page                           | One scheme per publisher (`CY-FARM`, `CY-MOH`): a pharmacy's registration number (ΑΜ) in the list, a state facility's key derived from its kind and name; the pharmacist's columns are never read                                                                                                            | One scheme per register (`EE-TTL`, `EE-APT`): a provider's first activity licence in force (`L01909`, printed on its page as § 22(3) of the Advertising Act requires), a pharmacy's place of business code; the Business Register code is never used                      | `SE-GLN` (a pharmacy's GLN, GS1 check digit) and `SE-HSA` (a health centre's HSA-id) |
| `taxonomy`           | `FR_PROFESSIONS`, `listingSlugFor`, `isListingSlug`                       | `AT_PROFESSIONS` (doctors, dentists), `atListingSlugFor`, `isAtListingSlug`, German slugs                                       | `GB_PROFESSIONS` (GP practices, dental practices, pharmacies), `gbListingSlugFor`, `isGbListingSlug`, English slugs, no specialty                                                                  | `CZ_PROFESSIONS` (eleven facility kinds), `CZ_SPECIALTIES` (fields of care of specialists), `czListingSlugFor`, `isCzListingSlug`, Czech slugs | `ES_PROFESSIONS` (eight centre kinds), `ES_SPECIALTIES` (care units U.x of the practices), `esListingSlugFor`, `isEsListingSlug`, Spanish slugs   | `IT_PROFESSIONS` (pharmacies, parapharmacies, hospitals, accredited clinics), `itListingSlugFor`, `isItListingSlug`, Italian slugs, no specialty                                                     | `DE_PROFESSIONS` (hospitals, psychiatric and children's hospitals by their departments, rehabilitation clinics, pharmacies), `deListingSlugFor`, `isDeListingSlug`, German slugs never Austria's                                   | `CH_PROFESSIONS` (hospitals, psychiatric, rehabilitation and specialised clinics, birth centres, nursing homes, pharmacies), `chListingSlugFor`, `isChListingSlug`, one German slug per listing in every language (`spital`, `apotheke`)                                                                                       | `EE_PROFESSIONS` (hospitals, family practices, dental clinics, specialist care, nursing, midwifery, physiotherapy, clinical psychology, speech therapy, pharmacies), `eeProviderKind`, `eeListingSlugFor`, `isEeListingSlug`, Estonian slugs                                                                                | `PL_PROFESSIONS` (14 kinds of establishment, from the kind of activity and the part VIII codes of the cells), `PL_SPECIALTIES` (24 fields of the specialist clinics), `plListingSlugFor`, `isPlListingSlug`, Polish slugs (`szpitale`, `poradnie-kardiologiczne`)     | `NO_PROFESSIONS` (hospitals, mental health and addiction, GP offices, emergency clinics, specialists, dental clinics, nursing homes, pharmacies), `noKindOf` (the SN2025 code, a legevakt by its name), `noListingSlugFor`, `isNoListingSlug`, Bokmål slugs (`ø` → `o`) | `IE_PROFESSIONS` (pharmacies, nursing homes, hospitals, health centres), `ieListingSlugFor`, `isIeListingSlug`, English slugs never the UK's (`pharmacy`)                                                                                                                                                                                                                             | `FI_PROFESSIONS` (8 kinds of public health service location, told by `fiLocationKind` from the name, then the health service classes), `fiListingSlugFor`, `isFiListingSlug`, Finnish slugs (`terveysasemat`, `neuvolat`) | `LT_PROFESSIONS` (hospitals, primary care, medical centres, dental clinics, mental health, rehabilitation, nursing, laboratories, optometry), read from the services licensed at the address (`ltKindOfServices`), `ltListingSlugFor`, `isLtListingSlug`, Lithuanian slugs | `SI_PROFESSIONS` (family doctors, children's and school doctors, gynaecologists, dentists, by ZZZS activity code), `siListingSlugFor`, `isSiListingSlug`, Slovenian slugs | `CY_PROFESSIONS` (state hospitals, state health centres, private pharmacies: the list is the kind), `cyListingSlugFor`, `isCyListingSlug`, Greek slugs in Latin letters (`nosokomeia`, `kentra-ygeias`, `farmakeia`)                                                                                         | `LV_PROFESSIONS` (GP practices, hospitals, pharmacies), `lvListingSlugFor`, `isLvListingSlug`, Latvian slugs (`gimenes-arstu-prakses`, `slimnicas`, `aptiekas`)                                                                                                           | `SE_PROFESSIONS` (pharmacies, health centres), `seListingSlugFor`, `isSeListingSlug`, Swedish slugs (`apoteken`, `vardcentraler`) |
| `phone`              | `toE164Fr`, `formatPhoneFr` (`+33` and the overseas codes)                | `toE164At`, `formatPhoneAt` (`+43`, national form `01 7673315`)                                                                 | `toE164Gb`, `formatPhoneGb` (`+44`, national form `020 7946 0000`, `01642 672351`)                                                                                                                 | `toE164Cz`, `formatPhoneCz` (`+420`, nine digits, `326 357 125`)                                                                               | `toE164Es`, `formatPhoneEs` (`+34`, nine digits, `965 950 865`)                                                                                   | `toE164It`, `formatPhoneIt` (`+39`, the leading `0` of fixed lines kept, `06 12345678`)                                                                                                              | `toE164De`, `formatPhoneDe` (`+49`, DIN 5008 `0461 8120`; the area code apart only when it can be told)                                                                                                                            | `toE164Ch`, `formatPhoneCh` (`+41`, trunk `0`, `044 268 31 11`)                                                                                                                                                                                                                                                                | `toE164Ee`, `formatPhoneEe` (`+372`, no trunk prefix, `610 9490`, `5123 4567`)                                                                                                                                                                                                                                              | `toE164Pl`, `formatPhonePl` (`+48`, nine digits, `12 345 67 89`, mobiles `512 345 678`)                                                                                                                                                                               | `toE164No`, `formatPhoneNo` (`+47`, eight digits, `22 12 34 56`, `912 34 567`)                                                                                                                                                                                          | `toE164Ie`, `formatPhoneIe` (`+353`, `01 846 2115`, `071 967 0111`)                                                                                                                                                                                                                                                                                                                   | `toE164Fi`, `formatPhoneFi` (`+358`, trunk `0` and the code apart: `09 310 5015`, `040 123 4567`)                                                                                                                         | `toE164Lt`, `formatPhoneLt` (`+370`, trunk `8`, `+370 5 212 3456`)                                                                                                                                                                                                         | `toE164Si`, `formatPhoneSi` (`+386`, trunk `0`, `01 234 56 78`, `041 123 456`); the lists give no phone                                                                   | `toE164Cy`, `formatPhoneCy` (`+357`, eight digits, `22 603000`, mobiles `99 123456`, never stored for a pharmacy)                                                                                                                                                                                            | `toE164Lv`, `formatPhoneLv` (`+371`, eight digits, `67 123 456`)                                                                                                                                                                                                          | `toE164Se`, `formatPhoneSe` (`+46`, national form `08-123 456 78`, `070-123 45 67`) |
| `address`            | 5-digit postcode, `street` then `postcode city`                           | 4-digit postcode, `street` then `postcode city`                                                                                 | UK postcode (`SW1A 1AA`), `street`, then the town and the postcode on lines of their own                                                                                                           | 5-digit postcode written `110 00`, `street` then `postcode town`                                                                               | 5-digit postcode, `street, number` then `postcode town`                                                                                           | 5-digit CAP, `street` then `CAP comune` (`00184 Roma`)                                                                                                                                               | 5-digit postcode, `street number` then `postcode town`                                                                                                                                                                             | 4-digit postcode (Liechtenstein's excluded), `street` then `postcode locality` (`8001 Zürich`)                                                                                                                                                                                                                                 | 5-digit postcode, `street` then `postcode place` (`Ülase tn 16`, `50412 Tartu linn`)                                                                                                                                                                                                                                        | 5-digit postcode written `00-950`, `street number` then `postcode town` (`59-220 Legnica`)                                                                                                                                                                            | 4-digit postcode, `street` then `postcode post town` (`Ragnar Strøms veg 10`, `2067 Jessheim`)                                                                                                                                                                          | Eircode (`D02 X285`), printed only, never used to locate; `street`, then the town and the Eircode on lines of their own                                                                                                                                                                                                                                                               | 5-digit postcode, `street number` then `postcode post office` (`33100 Tampere`)                                                                                                                                           | `LT-` and 5 digits, `street` then `postcode settlement` (VASPVT gives no postcode)                                                                                                                                                                                         | 4-digit postcode, `street` then `postcode post office` (`3211 Škofja vas`), not the municipality                                                                          | 4-digit postcode, `street` then `postcode town` (`Ερμού 51Γ`, `6023 Λάρνακα`)                                                                                                                                                                                                                                | `LV-` and four digits, `street` then `locality, postcode` (`Rīgas iela 5, Sigulda, LV-2150`)                                                                                                                                                                              | 5-digit postcode written `111 22`, `street` then `postcode city` |
| `legalPages`         | mentions légales (LCEN), privacy (GDPR art. 13–14), terms, RGAA statement | Impressum (ECG § 5, MedienG § 25), Datenschutzerklärung (DSGVO art. 13, 14, 21), Nutzungsbedingungen                            | legal notice (E-Commerce Regulations 2002, reg. 6), privacy notice (UK GDPR art. 13, 14, 21), terms                                                                                                | legal notice (Civil Code § 435, Act 480/2004), privacy notice (GDPR art. 13, 14, 21, Act 110/2019), terms, voluntary accessibility statement   | aviso legal (LSSI, Ley 34/2002 art. 10), privacy notice (GDPR art. 13, 14, 21, LOPDGDD), terms, voluntary accessibility statement                 | note legali (D.Lgs. 70/2003 art. 7; DPR 633/1972 art. 35), privacy notice (GDPR art. 13, 14, 21, Codice privacy), terms, voluntary accessibility statement                                           | Impressum (DDG § 5, MStV § 18 Abs. 2), Datenschutzerklärung (DSGVO Art. 13, 14, 21; BDSG), Nutzungsbedingungen, voluntary accessibility statement                                                                                  | Impressum (UWG Art. 3 Abs. 1 lit. s), Datenschutzerklärung under the revised FADP (Art. 19, 16, 30 and 32; GDPR for EU visitors), terms, voluntary accessibility statement, in German, French and Italian                                                                                                                      | legal notice (InfoTS § 4 lg 1), privacy notice (GDPR art. 13, 14, 21; IKS; Andmekaitse Inspektsioon), terms, voluntary accessibility statement (LPS does not cover a free directory)                                                                                                                                        | nota prawna (art. 5 of the 2002 e-services act), privacy notice (GDPR art. 13, 14, 21; the 2018 Act on personal data protection; UODO), regulamin (art. 8 of the 2002 act), voluntary accessibility statement                                                         | legal notice (ehandelsloven § 8), privacy notice (GDPR art. 13, 14, 21 through the EEA; personopplysningsloven; Datatilsynet), terms, voluntary accessibility statement (the universal design regulation's § 4e binds public bodies)                                    | legal notice (S.I. No. 68 of 2003, reg. 7), privacy notice (GDPR art. 13, 14, 21, 77; Data Protection Act 2018), terms, voluntary accessibility statement                                                                                                                                                                                                                             | oikeudelliset tiedot (Act 917/2014 § 176), privacy notice (GDPR art. 13, 14, 21; tietosuojalaki 1050/2018; the Data Protection Ombudsman), käyttöehdot, voluntary accessibility statement (in the form of Act 306/2019)   | teisinė informacija (Law on Information Society Services, art. 6), privatumo politika (GDPR art. 13, 14, 21; ADTAĮ), terms, voluntary accessibility statement, in Lithuanian                                                                                               | legal notice (ZEPT art. 5), privacy notice (GDPR art. 13, 14, 21; ZVOP-2 where its art. 4 applies), terms, voluntary accessibility statement                              | legal notice (Law 156(I)/2004, section 8), privacy notice (GDPR art. 13, 14, 21; Law 125(I)/2018; the Commissioner for Personal Data Protection), terms, voluntary accessibility statement (Law 50(I)/2019 binds public bodies)                                                                              | legal notice (Informācijas sabiedrības pakalpojumu likums, s. 4), privacy notice (GDPR art. 13, 14, 21; Personal Data Processing Law), terms, voluntary accessibility statement                                                                                           | legal notice (e-handelslagen 8 §), privacy notice (GDPR art. 13, 14, 21, dataskyddslagen, IMY), terms, voluntary accessibility statement (lag 2018:1937) |
| `healthDataHosting`  | HDS (Code de la santé publique, art. L1111-8)                             | No certification: DSGVO and DSG; Gesundheitstelematikgesetz 2012 for electronic health data exchange                            | No certification: UK GDPR and DPA 2018 (as amended by the DUAA 2025); the DSPT binds organisations with access to NHS patient data and systems                                                     | No certification: GDPR and Act 110/2019; Act 372/2011 governs providers' records                                                               | No certification: GDPR and LOPDGDD; Ley 41/2002 governs clinical records                                                                          | No certification: GDPR and D.Lgs. 196/2003 as amended by D.Lgs. 101/2018 (Codice privacy)                                                                                                            | No certification: DSGVO and BDSG; § 393 SGB V (BSI C5) binds statutory insurance providers and their processors, not a directory without booking                                                                                   | No certification: the revised FADP (nFADP) and its ordinance; health data are sensitive (Art. 5 lit. c)                                                                                                                                                                                                                        | No certification: GDPR and IKS; the Health Services Organisation Act governs the national Health Information System, which a directory without booking does not join                                                                                                                                                        | No certification: GDPR and the 2018 Act on personal data protection; the 2008 Act on patients' rights governs providers' records                                                                                                                                      | No certification: GDPR and personopplysningsloven; the Normen code binds undertakings connected to the Norwegian health network, which a directory without booking does not join                                                                                        | No certification: GDPR and the Data Protection Act 2018                                                                                                                                                                                                                                                                                                                               | No certification: GDPR and the Data Protection Act; booking would process client data under Act 784/2021 (registered systems, Kanta), which a directory does not                                                          | No certification: GDPR and the Law on Legal Protection of Personal Data; the VDAI supervises                                                                                                                                                                               | No certification: GDPR and ZVOP-2; ZZPPZ and ZPacP govern providers' records                                                                                              | No certification: GDPR and Law 125(I)/2018; a directory without booking processes no health data                                                                                                                                                                                                             | No certification found (unverified): GDPR and the Personal Data Processing Law; the Medical Treatment Law governs records                                                                                                                                                 | No certification: GDPR and dataskyddslagen; the Patient Data Act binds care providers' records |
| `features`           | directory, booking and e-identity claim (Pro Santé Connect)               | directory only: no booking, claims with documents and an administrator's review                                                 | directory only (practices, no clinician): no booking, claims with documents and an administrator's review                                                                                          | directory only (facilities): no booking, claims with documents and an administrator's review                                                   | directory only (centres): no booking, claims with documents and an administrator's review                                                         | directory only (places, no health worker): no booking, claims with documents and an administrator's review                                                                                           | directory only (facilities): no booking, claims with documents and an administrator's review                                                                                                                                       | directory only (facilities): no booking, claims with documents and an administrator's review                                                                                                                                                                                                                                   | directory only (providers and pharmacies, no health worker): no booking, claims with documents and an administrator's review                                                                                                                                                                                                | directory only (establishments, no practitioner): no booking, claims with documents and an administrator's review                                                                                                                                                     | directory only (establishments, no person): no booking, claims with documents and an administrator's review                                                                                                                                                             | directory only (facilities): no booking, claims with documents and an administrator's review                                                                                                                                                                                                                                                                                          | directory only (public service locations, no person): no booking, claims with documents and an administrator's review                                                                                                     | directory only (licensed institutions, no health worker): no booking, claims with documents and an administrator's review                                                                                                                                                  | directory only (doctors): no booking, claims with documents and an administrator's review                                                                                 | directory only (facilities, no person): no booking, claims with documents and an administrator's review                                                                                                                                                                                                      | directory only (GP practices naming their GPs, hospitals, pharmacies): no booking, claims with documents and an administrator's review                                                                                                                                    | directory only (facilities, no person): no booking, claims with documents and an administrator's review |

Per-country feature flags are the adapter's `features`: what a market can
support once it is open. The global environment flags (`FEATURE_BOOKING`…)
still switch a module off everywhere. Registry imports follow the same split:
`packages/etl/sources/{country}` reads a market's sources and writes the shared
`directory` schema with that market's `country` and `id_scheme`.

Every market below needs an adapter, an ETL source, a taxonomy (professions and
specialties mapped to the market's own terms, with catalog labels under
`taxonomy.*`), its legal pages and its own hosting contract before it opens.

### 4. Opening a market: the checklist

1. Verify every point marked UNVERIFIED below with a primary source or a
   lawyer of that country, and record the answer in this file.
2. Confirm a lawful source of practitioner data with a licence that allows
   republication. Without one, or where the data protection authority
   requires opt-in (Belgium), the market opens with claimed pages only
   (`features.directory = false`). With one, write the legitimate-interest
   assessment and the art. 14 notice: a reuse licence is not a GDPR basis.
3. Sign a hosting contract that meets the market's health-data rules.
4. Write the adapter, the ETL source and the taxonomy; add the legal pages the
   market requires.
5. Add the market's segments (section 2) with their locales, sitemaps and
   legal pages, list it as open on the international home, join its home to
   the homes' hreflang, then make its languages indexable under its segments
   only.

#### What the Austrian pilot proved (#107)

- **The data model held, with one addition.** `country` on practitioners and
  suppressions was not enough: places, place slug aliases and the three read
  models needed it too (migration `0023_at_market`), because a Statistik
  Austria Gemeinde code can equal an INSEE code and a country-wide listing has
  no place to tell its market. Every query that joins places on a code joins
  on (country, code); each import scopes its absences, indexing, orphan check,
  breakers and totals to its own country, so France's run never touches
  Austria's rows and the reverse.
- **A market's places fit the four kinds.** Bundesländer are departments,
  Gemeinden communes, Vienna's districts arrondissements of the Gemeinde Wien,
  whose city page is its Bundesland's, like Paris. No new kind, no new route.
- **A second market is a locale of its own, named by its BCP 47 tag.**
  `de-AT` is a next-intl locale whose prefix is `/at`, whose catalog is the
  German one with Austrian overrides and whose pages query Austria only
  (`LOCALE_MARKETS`). The id must be a real tag, not the segment: next-intl
  formats dates, numbers and plurals with it, and Intl does not know `at` (nor
  would it know `ch-fr`). France's locale ids did not have to move.
- **Open data may have no national number.** One identifier scheme per list,
  and a key derived from the names where a list has none (Salzburg), with the
  URL naming the list (`/at/arzt/anna-muster-w7983`). No merge across lists.
- **Coordinates beat geocoding.** The lists ship address-level points, so the
  Austrian import calls no geocoder; Gemeinde centres (CC BY 4.0) place the
  practices, by name first, then by distance.
- **Guard per list.** Regional lists fail one at a time: a list that cannot be
  read is left out and keeps its rows, the others are imported (exit code 3).
- **Look beyond the study.** The study found two lists; the search for the
  pilot found a third (Salzburg, CC BY 4.0 on the Land's own catalogue though
  missing from data.gv.at's metadata) and a fourth (Salzburg dentists). The
  candidates that could not be used, and whom to ask, are in
  [`docs/data-requests/at.md`](../data-requests/at.md): write such a file for
  every market.

#### What the UK opening proved (#125)

- **A market can list places, not people.** The UK's open data names practices
  (the OGL "does not cover personal data"; the clinicians' registers need a
  licence), so a practice is a row of `directory.practitioners`: its name in
  `last_name`, no first name, its kind as the profession (`GB_GP`, `GB_DENTAL`,
  `GB_PHARMACY`), its address and branch surgeries as sites. Pages, listings,
  search, sitemaps, claims and objections work unchanged; the page prints the
  practice as a `MedicalClinic`, `Dentist` or `Pharmacy`, never as a `Physician`.
- **Open data can still name people.** About 900 practices of the November 2026
  files are published under a person's name (`DR A EXAMPLE & PARTNERS`, nearly
  every Northern Irish GP practice): they are shown under their premises, else their
  street, and the published name is never stored. Lists of named clinicians
  published under the OGL (Public Health Scotland's GPs with GMC numbers, the
  BSO's dentists, ODS `egpcur`) are not imported.
- **A region level, for one market.** The four kinds of places held: England's
  nine regions and the three other nations are regions, the 361 local
  authorities departments, the OS towns communes. The UK's listings also exist
  per region (migration `0026_gb_market`); France's and Austria's regions still
  have none.
- **Postcodes beat geocoding, where they are open.** Code-Point Open locates
  every practice of Great Britain at its postcode (street precision), with no
  geocoder call; Northern Irish postcodes are licensed by Land & Property
  Services for internal use only, so Northern Ireland is placed by town.
- **A nation can be outside the market.** ODS lists the Isle of Man, Guernsey
  and Jersey, which are not in the United Kingdom: left out, like prison services
  that are not open to the public.
- **Write the data-request file first.** The UK's is
  [`docs/data-requests/gb.md`](../data-requests/gb.md).

#### What the Czech opening proved (#131)

- **A national register can be the whole market.** One monthly CSV (NRPZS, CC BY 4.0) gives every
  place of care with its coordinates, kind and fields of care: one list, one identifier scheme
  (`CZ-NRPZS`, the register's facility number), one guard set. A list that cannot be read fails the
  run (exit code 1) and the pages stay as they are; there is no list to leave out.
- **A page can name a facility that names a person.** A sole trader's facility carries their name
  in the register ("MUDr. Hana Boháčková"): the page shows it as published, as the DPA allowed for
  basic profiles in 2013, with an article 14 notice and removal on objection. What the page does
  not need is never stored: the provider's company number (and the facility code that embeds it),
  seat, professional representative, e-mail, data box and fax; a head office's phone shared by more
  than three places of care is dropped (2,944 rows of the November 2026 export).
- **Specialists list by their field.** The register's fields of care map to Czech listing slugs,
  the most specific field first (`kardiolog` before `internista`); every field is shown on the page.
- **Prague is Paris again.** A region, a district (LAU 1 `CZ0100`, which RÚIAN does not have) and a
  municipality at once: its 22 administrative districts are arrondissements of the municipality,
  whose city page is the district's (migration `0027_cz_market`). Regions keep no listing pages.
- **A language with four plural forms.** `cs-CZ` is the English catalog with the Czech texts on
  top (`messages/cz.json`); every plural reachable in it carries `one`, `few`, `many` and `other`.
  The client islands now receive only their market's taxonomy labels, so opening a market adds no
  page weight elsewhere.

#### What the Spanish opening proved (#148)

- **A register of authorised centres can open a market whose people are closed.** Spain's
  registers of professionals (REGCESS's sibling REPS, the colegios' lists) are not reusable, but
  the General Register of health centres, services and establishments publishes every authorised
  centre monthly, and the Ministry's legal notice allows reuse with the source and its date: one
  page per centre, the UK's and Czechia's model (`listsPractices`), about 115,000 pages.
- **A market can have no coordinates.** REGCESS gives an INE municipality code and an address,
  no point. Centres are placed by code (no name matching, no geocoder) and located at their
  municipality's main population centre (the IGN's, CC BY 4.0) at `city` precision: no map pin,
  distances said to be approximate. The places came from an API (OGC API Features) rather than a
  file, because the CNIG's download centre cannot be scripted.
- **A market's segment can be a language's.** `es` was the Spanish interface of France's pages
  (`/fr-es`, locale `es`) and is now Spain's segment: the market is the locale `es-ES` under `/es`,
  reading the Spanish catalog with Spain's overrides in `messages/es-ES.json` (the segment-named
  file the other markets use, `messages/es.json`, is the language's). `/fr-es` stays France in
  Spanish; the temporary redirect of the former `/es` prefix on apercura.org was dropped.
- **Several extracts, one register.** C1, C2 and E are fetched, guarded and left out one at a time,
  like Austria's lists, with their own site source, so an extract that cannot be read keeps its
  centres; a run that left one out never makes the next one skip unchanged files.
- **A spreadsheet is a source like a CSV.** The extracts are XLSX workbooks (135 MB of sheet XML
  for C2): a small streamed reader (`packages/etl/src/lib/xlsx.ts`) over the ZIP reader, no
  dependency.

#### What the Italian opening proved (#150)

- **A ministry's lists of places can open a market whose people are closed.** The Albo Unico
  forbids commercial reuse and the regional GP lists name people, but the Ministry of Health
  publishes its pharmacies and parapharmacies daily and its hospital bed counts yearly under the
  IODL 2.0: one page per place, the UK's and Czechia's model, 29,002 pages. Three lists, three
  identifier schemes (`IT-FARM`, `IT-PFARM`, `IT-HSP`), left out one at a time like Austria's
  (exit code 3); each list's current file is read from its dataset page, which must still name the
  IODL 2.0.
- **History lines are filtered by validity.** The shop lists keep every period of validity of a
  place (59,309 lines for 20,779 open pharmacies): the line open on the run's day (`--as-of`, today
  in Rome) is the place; closed lines and lines not yet open are counted, never imported.
- **A company name can name people.** "FARMACIA ESEMPIO S.N.C. DEI DOTT.RI …": the page prints the
  place's own name, without the company form, the titles and what follows them (12,157 pharmacy,
  3,147 parapharmacy and 190 hospital names of the November 2026 files), and the published name is
  not stored. A sole trader's pharmacy may still carry a name: article 14 notice, removal on
  objection. The owner's VAT number, which identifies a sole trader, is never read.
- **Coordinates of unclear provenance are not used by default.** The ministry says some of its
  points were found through OpenStreetMap (ODbL, share-alike) without saying which: every place is
  at its municipality's interior point (computed from ISTAT's boundaries, CC BY 4.0, in PostGIS) at
  `city` precision, with no map pin. Keeping the lists' points (`--register-coordinates`) is left to
  the operator; switching moves nearly every page, so the modification breaker asks for approval.
- **Regions list, as in the UK.** The twenty regions run the health service, so Italy's listings
  exist per region too (migration `0028_it_market`, `/it/farmacie/lazio`). A site whose ISTAT code
  is gone (a merged municipality) is placed by name in its region, else in its province (242 sites).
- **A market's segment can be a language's.** `it` was France's Italian interface: Italy is the
  locale `it-IT` under `/it` (the Italian catalog with `messages/it-IT.json` on top), France in
  Italian stays at `/fr-it`, and the former `/it/…` links of apercura.fr move to `/fr-it/…` on the
  former host only.

#### What the German opening proved (#152)

- **A market can open from statistics.** Germany's registers of people are closed and the
  Bundes-Klinik-Atlas needs the G-BA's permission, but the statistical offices' yearly directory of
  hospitals and of prevention and rehabilitation clinics may be reproduced with its source: 2,758
  hospital sites and 1,065 clinics, the UK's and Spain's model (a page per facility), with the
  pharmacies of the two Länder whose lists are open and current (Thuringia, Brandenburg; 989). The
  pages say pharmacies are listed for those Länder only.
- **No stable id at all.** The directory's `KH_ID` is a pseudonym drawn anew for every edition, and
  Brandenburg's feature ids are row numbers: a page's key is derived from what the facility is
  (municipality, address, names), compared loosely, like the UK's Northern Irish dental list. A
  renamed hospital gets a new page.
- **A yearly source on a monthly schedule.** The newest edition is found among the addresses it
  may have (Destatis's, the portal's link, the portal's copy), an older one is refused, unchanged
  files end the run after a 3 MB download, and a site missing from a new edition is removed at once
  rather than after two runs.
- **Three levels, no Land listing, no migration.** Länder are regions (grouping only), Kreise
  departments and Gemeinden communes, all from GV-ISys with their centres; a kreisfreie Stadt is a
  Kreis and a Gemeinde at once, so its city page is its Kreis's (the Paris rule, by code:
  `_____000`). Berlin's and Hamburg's rows carry district codes and are read as the city; two rows
  filed under another Land are placed by their town's name.
- **A market's segment was a language's, again.** `de` is the German interface of France
  (`/fr-de`) and Austria reads it with overrides (`de-AT`); Germany is the locale `de-DE` under
  `/de`, reading the German catalog with `messages/de-DE.json`, as Spain did with `es-ES`.

#### What the Swiss opening proved (#154)

- **A federal statistic and the cantons' lists can open a market whose people are closed.** The
  federal registers of health professions (MedReg, PsyReg, GesReg) are consulted one by one, and
  their bulk data needs an agreement with the FOPH; but the FOPH's "Kennzahlen der Schweizer
  Spitäler" name every hospital and its sites under "Open use. Must provide the source.", and six
  cantons publish hospitals, nursing homes or pharmacies under opendata.swiss's open terms: twelve
  lists, twelve identifier schemes, left out one at a time (exit code 3), 1,414 pages.
- **Read the terms of each edition.** The 2024 figures ask for permission before any commercial
  use, the 2023 ones do not: the edition read is fixed (`CH_HOSPITAL_FIGURES_YEAR`), and the
  request for the later ones is in [`docs/data-requests/ch.md`](../data-requests/ch.md).
- **Lists overlap: one facility, one page.** A canton's hospital that is a FOPH site (same commune
  or postcode, same name or street) adds its point, phone and emergency department to the site's
  page and is credited there (88 of the cantons' 113 hospitals); without the FOPH's figures in a
  run the cantons' hospitals are not read, so a failed download never doubles a page.
- **A list without numbers keys its rows.** The figures number nothing and four cantons renumber
  their exports: the key is derived from canton, name, street and postcode, as Salzburg's names
  in Austria; a pharmacy's GLN, a Geneva home's address id or a Zürich home's id are kept where
  they exist.
- **Three indexed languages, one market.** `/ch` (German), `/ch-fr` and `/ch-it` are the first
  market pages below a home with hreflang alternates; one listing slug in every language, as
  France's; Swiss German writes no ß, so `de-CH` is the German catalog with every ß written ss.
  Place and facility names stay as their sources write them in every language ("Genève" under
  `/ch`).
- **Cantons list, districts may not exist.** The 26 cantons are regions with listings (migration
  `0029_ch_market`); the nine cantons without districts have a stand-in district in the BFS
  register, whose listings answer but are never indexed.
- **A postcode directory locates without a geocoder.** swisstopo's directory places every facility
  by its postcode and locality (or its point, or its locality for a post-office box) and gives
  the locality's point when a list has none (city precision); six cantons give their own points
  (address precision, 911 pages).

#### What the Estonian opening proved (#165)

- **A register under a non-commercial, share-alike licence can open a market.** The Health
  Board's register of healthcare providers and their activity licences (MEDRE open data) is
  under CC BY-NC-SA 3.0 Unported (the distribution's `license` on andmed.eesti.ee, VERIFIED
  2026-11-27). Apercura is free for patients and providers, non-profit, AGPL-3.0, without ads,
  paid ranking or sale of data: its use is not "primarily intended for or directed toward
  commercial advantage or private monetary compensation" (§ 4(c)). The data as republished (the
  pages, listings, sitemaps) is offered under the same licence, which the data page and every
  page's credit say; no other licence claim of the site covers it (the AGPL covers the code).
  The Health Board is asked to confirm this reading
  ([`docs/data-requests/ee.md`](../data-requests/ee.md)); the opening did not wait. An operator
  who would use it commercially must not import Estonia (`docs/self-hosting.md`).
- **The law can ask for a field on every page.** The Advertising Act (reklaamiseadus, § 22(3),
  redaction in force 2026-03-16, VERIFIED on Riigi Teataja) requires information about a
  healthcare provider to include its activity licence number, and § 22(4)(1) keeps the factual
  information a page shows (name, hours, place of activity, specialty, services) outside the ban
  on advertising health services. Every provider page prints its licence numbers and kinds; the
  first licence in force is the page's key (`EE-TTL`, `/ee/asutus/{name}-l01909`), so the URL
  carries no Business Register code (a sole trader's names the person).
- **Providers, not the people the same file names.** The register lists, with each provider, the
  health workers registered with it (codes, names, professions, specialties). They are never read
  into a row: naming them needs a legitimate-interest assessment, the article 14 notice, opt-out
  handling and a reading of how the NC and SA terms apply to personal data, decided against for
  the opening (as Germany lists facilities). About eighty sole traders whose business name is
  their own are listed as the register publishes them, with the article 14 notice and removal on
  objection, as Czechia did.
- **One page per provider, its places of activity as sites, one listing.** A provider holds one
  to sixteen licences, each with its places of activity and services; its page lists them all,
  and its kind (one listing) is the first its licences say: a hospital, a family practice, a
  dental clinic, specialist care, nursing, midwifery, physiotherapy, psychology, speech therapy
  (`eeProviderKind`). Ambulance-only providers, school-health and ambulance places and mobile
  units without an address are left out.
- **An address register locates without a geocoder.** The Land and Spatial Development Board's
  ADS extract (CC0 1.0, monthly) gives every valid address with its point (L-EST97, converted in
  code) and postcode: 2,722 of the 2,755 sites of the November 2026 files (98.8%) are located at
  their ADS point, a place of activity by its full address word for word, a pharmacy by the ADS
  address id its register carries; the others are placed at their settlement's centre (city
  precision).
- **Three levels from one file, a town that is its municipality.** EHAK's settlements carry
  their municipality and county: counties are regions (grouping only, no migration),
  municipalities departments, settlements communes, Tallinn's eight districts communes of the
  municipality Tallinn. Eight towns are a municipality of their own and share its code (Narva,
  Viljandi…): their page is the municipality's, the Paris rule. Place names keep their kind
  ("Tartu linn", "Haabneeme alevik"), so the search matches a name without it.
- **A new interface language over English, as Czechia.** `et-EE` reads the English catalog with
  the Estonian texts on top (`messages/ee.json`), its route segments translated
  (`ESTONIAN_SEGMENTS`). Russian, widely spoken, is a follow-up.

#### What the Polish opening proved (#164)

- **A register of entities can open a market whose practitioners wait for a legal opinion.**
  RPWDL publishes the healthcare entities and the professional practices apart; the entities'
  establishments (zakłady lecznicze) are the market, 34,072 pages at 61,408 places of care, and
  the practices, entirely personal data, wait for a Polish legal opinion on III OSK 1052/21 (the
  decision of #164, below). The UK's and Czechia's model: a page per establishment.
- **One register, four files.** The export is a ZIP of entities, establishments, units and cells:
  an establishment's places of care are the distinct addresses of its active units and cells, its
  kind comes from its kind of activity and the part VIII codes of its cells (fourteen kinds,
  24 fields of specialist clinics), and its cells, beds, ownership and, for a legal person, its
  operator are its facts. Every date is read against the run's day (`--as-of`): closed and
  suspended units and cells are not active.
- **A natural person's name is minimised from the register itself.** 11,259 entities are sole
  traders named by their first and last name: the entity's name is never stored, and an
  establishment's name loses the person's name where the entity's name gives it (4,258 names),
  first names being learnt from the register (common among its natural persons, rare among its
  companies). Best-effort, unlike Italy's rule on company forms: what slips through is covered by
  the article 14 notice and removal on objection.
- **An attribution can carry two dates.** RPWDL's reuse condition (art. 15 ust. 1 pkt 1 of the
  open data act) asks for the time the information was produced and the time it was obtained:
  the report's generation time (`Info.txt`) is recorded as the file's date, the import's day as
  the obtaining, and every page prints both.
- **Voivodeships list, cities with powiat rights are their powiat.** The sixteen voivodeships
  each have their NFZ branch: regions with listings (migration `0030_pl_market`, as the UK, Italy
  and Switzerland). A city with powiat rights is a powiat and a gmina at once, its city page the
  powiat's (Germany's kreisfreie Stadt rule, by code: a powiat numbered from 61). No
  arrondissement: two thirds of the register's Warsaw units carry the city's code only.
- **Boundaries give the points.** RPWDL publishes no coordinate and TERC no point: each gmina's
  interior point is computed from PRG's boundaries (holes counted: a rural gmina often surrounds
  its town), every site at city precision, no map pin, as in Spain and Italy.
- **A market's places can come from two publishers.** TERC (GUS) names the division, PRG (GUGiK)
  draws it, joined by the TERYT code; eTERYT serves TERC through its download form, posted back
  the way its button does.

#### What the Norwegian opening proved (#172)

- **A business register can open a market, with filters of its own.** The Brønnøysund Register
  Centre's Central Coordinating Register for Legal Entities publishes every establishment
  (underenhet) with its address and main industry code under NLOD 2.0 (VERIFIED 2026-11-27 on the
  API documentation and brreg.no [NO8][NO9]). An industry code is a self-declaration, not a
  licence: of the 25,832 establishments under a listed code, 5,823 are kept. Sole
  proprietorships (15,474) are left out because they are named after a person; one-doctor
  companies named after the doctor (`Lege Ola Nordmann AS`, `Tannlegene Hansen og Berg`),
  holding, consulting and administrative units, and practices owned by a company without a care
  word in their name are left out too, each reason counted (`stats.sources.brreg.skipped`). A
  public owner (a health trust, a municipality, a county) is trusted without a care word.
- **The licence itself excludes personal data.** NLOD 2.0 § 3 does not cover "personal data
  covered by the Norwegian Personal Data Act unless there is a legitimate basis for the disclosure
  and further processing" [NO10]: listing establishments, never sole proprietorships, keeps the
  import inside the licence without a legitimate-interest assessment for named persons. Mobile
  numbers, e-mails and care-of lines are never read; only a public owner is named.
- **NLOD's default credit, word for word.** § 5 asks for the licensor's own wording, else
  «Inneholder data under Norsk lisens for offentlige data (NLOD) tilgjengeliggjort av …», a link to
  the licence and the source, and a note that the data was changed: Brønnøysundregistrene gives no
  wording, so every page prints the default sentence and "endret av Apercura".
- **Full files rather than the search API.** The API stops at 10,000 results; the register's
  documentation points copies to the nightly full files (62 MB of establishments, 155 MB of
  entities, gzipped CSV), read as streams in about 3.5 s, the owners only for the establishments
  read.
- **A cadastre's address file locates without a geocoder.** Kartverket's national file of
  addresses (Matrikkelen – Adresse, CC BY 4.0, 2.6 million addresses in EPSG:4258 [NO11]) places
  5,206 of 5,821 establishments at their address point (89%), the others at their postcode's
  centre computed from the same file.
- **Two levels, a capital that is both.** Kartverket's fifteen counties (the 2024 reform) are
  departments and its 357 municipalities communes, as Austria's; Oslo is a county and a
  municipality (`0301`) and has the county's page only, like Paris. No migration.
- **A new interface language over English, as Estonia.** `nb-NO` reads the English catalog with
  the Bokmål texts on top (`messages/no.json`), its route segments translated
  (`NORWEGIAN_SEGMENTS`). Nynorsk and Northern Sámi are follow-ups.

#### What the Irish opening proved (#171)

- **Regulators' registers can open a market whose people are closed.** The Medical Council's
  register cannot be downloaded, but the PSI and HIQA publish their registers of pharmacies and
  nursing homes for re-use, "free of charge in any format", and the HSE's Health Atlas layers are
  CC BY 4.0: four lists, four identifier schemes, left out one at a time (exit code 3), 3,556
  pages. Each run reads the terms again (the PSI's terms sheet, each GeoHive item's licence), and a
  list whose terms changed is left out like one that cannot be read.
- **A re-use condition can bind the product.** The PSI's terms forbid using the register "for the
  principal purpose of advertising or promoting a particular product or service": a free directory
  without advertising meets it, and any paid placement on Irish pharmacy pages would not
  ([`docs/data-requests/ie.md`](../data-requests/ie.md)).
- **Old open data is said to be old.** The HSE's layers are a March 2020 snapshot, and no later
  open list was found: every page they build, and the data page, say so; the PSI's monthly date
  and HIQA's export date are printed too.
- **A postcode may be printed and still not be used.** Eircodes are in every list, but their
  database is licensed: they are printed with the address and only compared between two lists to
  tell one facility; places come from the towns the lists write. The CSO's census towns (Built
  Up Areas) and Tailte Éireann's gazetteer, joined in PostGIS, give a town its other names
  (Tallaght is Dublin, Dungloe is An Clochán Liath): 98% of pharmacies and 88% of nursing homes
  are placed in a town; the rest are placed in their county, unlocated (migration
  `0031_ie_market`: `directory.place_lookup`, boundaries and other names).
- **Lists overlap, again.** 41 HSE community and continuing-care hospitals are HIQA designated
  centres: HIQA's current page is the facility's, as Switzerland's FOPH site was.
- **An English market beside the UK's.** `en-IE` under `/ie` reads the English catalog with
  `messages/en-IE.json`; listing slugs must never be the UK's, so the pharmacies' is `pharmacy`.
  Ireland was planned under `/ie-en` and opened under `/ie`, English being its main language; an
  Irish interface is a follow-up (`/ie-ga`).

#### What the Finnish opening proved (#173)

- **A national service catalogue can open a market.** Finland has no open register of providers
  under a licence, but every public organiser describes its services and service locations in
  the Finnish Service Catalogue (Suomi.fi-palvelutietovaranto, PTV, DVV), CC0 1.0 and free to read
  through its open API without a key or a permit ([FI7][FI8]). The catalogue describes everything
  public, schools and parks too: the market is its health care, 3,752 public health service
  locations of the 10,037 its health services are given at (27 November 2026).
- **An API without a bulk file is read as a snapshot.** Each run asks the health care class
  (`P5`) and each of its subclasses (the class query answers for one class at a time), the
  services, the locations they link and their organisations, 305 requests, about 13 minutes, and
  writes them, trimmed, to one file (`ptv.json`) the rest of the run reads, checksums and guards
  like any downloaded file. The catalogue is live, so a blocked run keeps its snapshot and is
  approved on that same file (`--approve=<id> --source-dir <dir>`).
- **A kind is told from the name first.** The catalogue's service classes are coarse and loosely
  applied (primary care tags home care, mental health tags schools' welfare): a location's kind
  comes from its own name in Finnish or Swedish ("terveysasema", "hammashoitola", "neuvola"),
  after a list of names that are no place of care (schools, home care, housing, offices, Kela's
  points), and only then from the classes, never primary care alone. Public organisers only:
  associations' and companies' locations are left out.
- **Booking and a directory are separate questions.** Whether a booking tool must be a registered
  class A or B system connected to Kanta (Act 784/2021) still waits for a ruling [FI4][FI5]; that
  concerns booking only. A directory without booking processes no client data in the act's sense,
  so it opened (`features.booking = false`), and the Kanta question stays the condition for booking.
- **Wellbeing services counties are the departments.** Public health care is organised by the 21
  wellbeing services counties, the City of Helsinki and Åland: Statistics Finland's
  correspondence tables put each municipality in one of them and in one of the 19 regions, so
  the counties are departments with listings, the regions group them (no migration), and
  Helsinki, the only municipality of its department, has the department's page only (the Paris
  rule) [FI9].
- **The catalogue gives the points.** Every location carries its point in ETRS-TM35FIN, converted
  to WGS 84 in code (Krüger's series): 3,703 of 3,752 at address precision; the others at their
  municipality's centre.
- **An open API can change its terms.** Version 12 of the catalogue's API needs a key ordered by
  the user organisation, and version 11 is switched off in April 2027 [FI10]: a founder action,
  not a blocker of the opening.

#### What the Lithuanian opening proved (#170)

- **A licence register can open a market, even without a kind of institution.** Lithuania's
  registers of people are lookup-only, but the State Accreditation Service for Health Care
  Activities (VASPVT) publishes every licensed institution, every licensed activity address and
  every service licensed there, daily, under CC BY 4.0: one list, one identifier scheme
  (`LT-VASPVT`), 6,208 pages. The register names no kind of institution, so the kind is
  read from the services licensed at the address, the most specific first (inpatient services
  make a hospital, family medicine a primary care centre, outpatient specialists a medical
  centre, then dental care, mental health, laboratories, nursing, rehabilitation and optometry);
  every service is shown on the page. Addresses patients do not visit for care (public health
  services alone, ambulance services, a pharmacist's extended practice, tissue banks) are counted
  and left out.
- **A page is an activity address, keyed by what does not move.** The institution's number and
  the Address Register's permanent code of the address (`5271-12679435`); where VASPVT gives no
  address code, the start of the address's GUID (`5271-v00141024`). The legal entity code is never
  read.
- **An Address Register places without a geocoder.** VASPVT writes each address as free text in
  two styles ("… apskr. … sav. … sen. … k. …" and "… r.sav., …, …"); a parser reads the
  municipality, the eldership and the settlement and matches them against the Address Register's
  20,880 current settlements (6,184 pages placed in their settlement, 24 in
  their municipality only, 1 quarantined); a city filed under the wrong municipality, or none, is
  found nationally. A page is located at its settlement's
  interior point, computed in PostGIS from the register's settlement boundaries (written
  northing first in LKS-94, so the axes are flipped before the transform; 20 settlements have no
  boundary row and no point), at city precision and without a map pin. The open address points
  (dataset 1351) are a 2021 snapshot whose store model is empty: they are not used.
- **Counties list, the big cities are their municipality.** The ten counties are regions with
  listings (migration `0032_lt_market`, as Italy's and Switzerland's), the 60 municipalities
  departments, the settlements communes; a homonym inside a municipality carries its eldership.
  Vilnius, Kaunas, Klaipėda, Šiauliai, Panevėžys, Alytus, Palanga and Neringa are a municipality
  of their own: their municipality's page is theirs, and their own listings answer but stay
  noindex (the Paris rule, by settlement code, as a Swiss canton's stand-in district).
- **A sole trader's name stays the registered name, and nothing more is added.** An individual
  enterprise or a small partnership is often named after its owner. The page prints the legal name
  as registered, its legal form abbreviated ("UAB", "VšĮ", "MB", "IĮ"), with the article 14
  notice and removal on objection; the seat address, the legal entity code and the licence
  numbers are never stored, and an individual enterprise's premises number is left out of its
  street (231 of the 508 pages of individual enterprises).
- **A rate-limited portal is read slowly.** data.gov.lt and its data store answer HTTP 429: the
  import makes one request at a time, at least 20 seconds apart, retries only 429 and 5xx
  answers, honouring `Retry-After` and doubling its wait up to ten minutes, and reads only the
  columns it needs: about four minutes of waiting per run. Each run first checks that the dataset page still names
  "Creative Commons Attribution 4.0".
- **A second list is refused when it cannot say what it seems to.** The health insurance fund's
  list of institutions (VLK, CC BY 4.0) has no addresses, its open records cover nearly every
  licensed legal entity and its contract dates are mostly empty, so it cannot tell which places
  are contracted; its pharmacies have no address either. It is not imported
  ([`docs/data-requests/lt.md`](../data-requests/lt.md)), and pharmacies are not listed.
- **A language with four plural forms, again.** `lt-LT` is the English catalog with the
  Lithuanian texts on top (`messages/lt.json`), as Czechia's; every plural reachable carries
  `one`, `few`, `many` and `other`, and the "not covered yet" phrase takes the genitive a negation
  governs ("Apercura kol kas neapima Latvijos").

#### What the Slovenian opening proved (#167)

- **An insurer's daily list can open a person market.** The Medical Chamber's register forbids
  republication, but the health insurer (ZZZS) names every doctor who can be chosen as a personal
  doctor under CC BY 4.0: family doctors, children's and school doctors, gynaecologists and
  dentists, one page per doctor as in Austria (2,881 doctors, 792 practices), three lists left out
  one at a time (exit code 3).
- **An open-data portal's HTML page can hide daily workbooks.** The study read "HTML page only";
  the page links four XLSX workbooks published every day at addresses that change with each
  publication. A run reads the page once, then the three workbooks that name doctors, one at a
  time with a pause, weekly, and the request for a stable address is in
  [`docs/data-requests/si.md`](../data-requests/si.md) (the links carry a `cHash` the site's
  robots.txt disallows).
- **Taking new patients is a dated fact per activity.** Each row says whether the doctor still
  accepts insured persons (`DA`/`NE`): it is stored on the activity (`mode_code`) and printed per
  practice and activity with the date the list states ("ZZZS list of {date}") and its source
  (1,113 of 3,120 rows say yes).
- **A locator instead of settlement pages.** Settlements, postal areas and streets place the
  practices without a geocoder but are no pages: one document in `directory.meta` (`si:locator`,
  about 2 MB). A practice's town line is its post office, often not its municipality, so
  migration `0033_si_market` adds the post office as `locality` to Slovenian pages' site payload
  only; no other market's payload or hash changes.
- **Names in capitals are cased, not guessed.** The lists write everything in capitals: a doctor's
  name is split at the two spaces between family and given names and capitalised; a provider's
  name and street take the register's place names and the lists' doctors' names as proper names,
  `d.o.o.` in small letters, acronyms (`ZD`, `UKC`) kept.
- **One identifier scheme across three lists.** `SI-ZZZS`, the insurer's doctor number, is one
  person in every list (none was in two lists in November 2026); absences are scoped per list, so
  a list left out never counts its doctors missing.
- **Regions as departments.** The 12 statistical regions are departments with no listing above
  them, the 212 municipalities communes, each in the region holding most of its settlements: the
  register does not say, and the result matches the Statistical Office's counts.

#### What the Cypriot opening proved (#174)

- **Small open lists can open a market.** Three CSV files of the Ministry of Health on
  data.gov.cy, under CC BY 4.0 (VERIFIED 2026-11-27 on each dataset page [CY5][CY6][CY7]), open
  Cyprus with 699 facilities: 658 private pharmacies, 8 state hospitals and 33 state health
  centres. Each list is a source of its own: one that fails is left out and keeps its pages.
- **A census table tells the areas the Government controls.** The 2021 census was taken in the
  areas the Government of the Republic of Cyprus controls: its table of municipalities and
  communities (CYSTAT, PxWeb table 1891164G, read as JSON-stat 2.0 [CY8]) is the market's list of
  places (404), with their population; Cyprus Post's postcodes table (2021 [CY9]) gives their
  postcodes, official Latin names and centres. The areas where the Government does not exercise
  effective control have no place and no data, which the data page says neutrally.
- **A list that names facilities only by a person is named by address.** The pharmacies' list
  identifies each pharmacy by its pharmacist and gives their house telephone number: those
  columns are never mapped, and a page reads "Φαρμακείο, {street}, {town}". A mobile number is
  not stored. A letter asks the Pharmaceutical Services for a pharmacy name
  ([`data-requests/cy.md`](../data-requests/cy.md)).
- **A key derived from a name.** The state lists number nothing: a hospital or health centre is
  keyed by a hash of its kind and name (`CY-MOH`, `m3fa9c01b2e`); a renamed facility gets a new
  page, the old one removed after two runs. A health centre has no address and is placed by the
  place its name gives in the genitive (`Κέντρο Υγείας Κοφίνου`), word stems compared, in the
  district its number dials, with a short table of aliases; two that fit no single place are left
  out rather than guessed.
- **Greek needed the search to read a second script.** `text_norm()` and `name_norm()` kept Latin
  letters only, so every Greek name normalised to nothing: migration 0034 writes Greek in Latin
  letters first (ELOT 743), leaving other text as it was, so a place is found typed in Greek or
  in Latin letters (`Λεμεσός`, `Lemesos`). Slugs follow the same transliteration
  (`slugifyEl`).
- **One interface language over English, as Estonia.** `el-CY` reads the English catalog with
  the Greek texts on top (`messages/cy.json`), its route segments in Greek written in Latin
  letters (`CYPRIOT_SEGMENTS`). English (`/cy-en`, as Switzerland's languages) and Turkish were
  deferred to keep the opening small: ROADMAP.md.

#### What the Latvian opening proved (#166)

- **A list of people can open a market, when its publisher publishes it for patients.** The
  National Health Service publishes its contracted GPs with their practices every quarter, under
  CC0 1.0, so that patients can choose a family doctor: a page per GP practice, naming its GPs,
  the first market since Austria whose pages name practitioners. The licence settles reuse, not
  the GDPR: the written legitimate-interest assessment
  ([`docs/legal/lia-latvia-gps.md`](../legal/lia-latvia-gps.md)), the article 14 notice on
  `/lv/privatums` and the objection form on every page come with it, and the list's GP
  identifiers and patient counts are never read.
- **A list of people needs a list of places.** The NVD's dataset has no address: practices are
  joined by institution code to the Ministry of the Interior's addresses of medical
  institutions (CC0, March 2024), which hold 293 of the 1,098 practices of March 2026. The others
  are not listed, and the pages say so; the NVD's own lists by territory carry every address but
  are "all rights reserved" ([`docs/data-requests/lv.md`](../data-requests/lv.md)). The same
  addresses list 66 hospitals, and the State Agency of Medicines' daily register 814 pharmacies:
  1,173 pages.
- **A portal's metadata can be the source.** Every list's current file and its licence are read
  from its data.gov.lv dataset on each run (CKAN `package_show`): a new NVD quarter is found by
  its name, a licence other than CC0 stops the list.
- **An address register names places the way addresses do.** The State Land Service's open data
  give every town, parish and municipality its standard name (`Mores pag., Siguldas nov.`), the
  ending of every Latvian address: sites are placed by name, no geocoder, no postcode table, and
  a 2024 address naming a municipality merged since falls back to its point.
- **Another language with three plurals.** `lv-LV` is the English catalog with the Latvian texts
  on top, like Czechia's; Latvian selects `zero`, `one` and `other`, and every plural reachable
  from a Latvian page carries the three. The seven state cities are departments and towns at
  once, their city page the department's.


#### What the Swedish opening proved (#175)

- **A market can open from one national list and one region's.** Sweden publishes no open list of
  hospitals, clinics or health professionals (HOSP, IVO's register of care providers and the HSA
  directory are closed, VERIFIED [SE1][SE4]); the Swedish Medical Products Agency's register of
  licensed pharmacies is open under CC BY 4.0 (the distribution's `license` in Läkemedelsverket's
  own DCAT catalogue, VERIFIED 2026-11-27 [SE9]), and of the 21 regions only Västra Götaland
  publishes its health centres, under CC0 1.0 (VERIFIED [SE10]). The market lists both, and the
  home and the data page say plainly that health centres are listed in one region only, as
  Germany says which Länder have no pharmacy list. Each run reads both licences again; a list
  whose licence changed is left out (exit code 3).
- **A person's identity number can hide in an organisation number.** A Swedish sole trader's
  organisation number is the trader's personal identity number (personnummer). Every licence
  holder of the November 2026 register is a legal person, but the import checks: a holder is
  printed only when its number's third digit is 2 or more and its Luhn digit matches
  (`isValidSeLegalPersonNumber`); otherwise the pharmacy is listed without its holder.
- **A register's search export is its download.** Läkemedelsverket's catalogue points to the
  search page, which says "Sök utan filter för att se alla apotek med tillstånd" and exports the
  result to Excel: the unfiltered export (about 116 kB, updated daily) is the dataset, read as
  the page's own button reads it.
- **Licensed is not open to the public.** Pharmacies whose name says "stängt för allmänheten" are
  licensed but serve care homes or dose dispensing: they are left out and counted. A cell may list
  several GLNs (one truncated): the first valid one keys the page.
- **Statistics Sweden's borders place without a geocoder.** SCB's simplified county and
  municipality borders (CC0 1.0) give the 21 counties (departments) and 290 municipalities
  (communes) and each municipality's interior point; the register names the municipality of every
  pharmacy, which is placed there at city precision, without a map pin. Lantmäteriet's address
  points are CC BY 4.0 but ordered through Geotorget under extra terms: a follow-up. Västra
  Götaland's health centres carry their own SWEREF 99 TM points and are placed by the border that
  holds them (`directory.place_lookup`, migration `0031`). Gotland, a county with one
  municipality, has the county's page only, like Paris.
- **Norway's word is not Sweden's slug.** Listing slugs never collide across markets, and
  `apotek` is Norway's: Swedish pharmacies list under `apoteken`, their kind under the register's
  own word, `oppenvardsapotek`.
- **A new interface language over English, as Norway.** `sv-SE` reads the English catalog with the
  Swedish texts on top (`messages/se.json`), its route segments translated (`SWEDISH_SEGMENTS`).
  Finnish, Meänkieli and the Sámi languages (national minority languages) are follow-ups.
## What is known per market

Research of November 2026, from the sources listed at the end, extended on
2026-11-25 (#82) to every EU and EEA country, Switzerland and the United Kingdom.
A point marked VERIFIED was read on the primary source cited (registry,
regulator, open-data portal, law text), checked on 2026-11-25 unless it cites a
numbered source of the first round; **UNVERIFIED** means a secondary source, an
inference, a page that could not be fetched, or a negative (nothing found). A
licence is recorded only when its text or the portal's licence field was read;
otherwise "licence not found". Access is classified as `open data` (bulk or API
with a reuse licence), `searchable website only`, `restricted` (authenticated,
paid or for public bodies) or `not found`. Practitioner counts marked [EU1] are
Eurostat "practising" (or "professionally active") figures for the year given.
France, the open market, is described in section 3 and `PRODUCT.md`. The facility study of 2026-11-27 (#168),
which ranked Lithuania first, is kept as research in
[`docs/research/facility-open-data-2026-11.md`](../research/facility-open-data-2026-11.md).

### Germany (DE)

- **Open since 2026-11-26 (#152), facilities only.** The statistical offices' yearly
  "Verzeichnis der Krankenhäuser und Vorsorge- oder Rehabilitationseinrichtungen" (Destatis, 2024
  edition: 2,758 hospital sites, 1,066 clinics; "Vervielfältigung und Verbreitung, auch
  auszugsweise, mit Quellenangabe gestattet", VERIFIED on the workbook's Impressum sheet) and the
  pharmacy lists of Thuringia (TLV through the GDI-Th, CC BY 4.0, "© GDI-Th", VERIFIED on its
  metadata record) and Brandenburg (LAVG through the LGB, dl-de/by-2-0, VERIFIED on its metadata
  record) are imported, placed in GV-ISys's Gemeinden (same Destatis note). Saarland's open list
  (CC BY 4.0) dates from March 2021 and is not imported; no other Land's list is open
  (`docs/data-requests/de.md`). Pages are facilities, never people.
- **Registry.** No open national register of practitioners. The KBV's
  Bundesarztregister is not public; only the Kassenärztliche Vereinigungen (KV)
  and health insurers can use it [1]. Single records can be looked up on
  arztsuche.116117.de and gesund.bund.de [1]. KBV publishes statistics, and its
  SDAV master file has no names or addresses [2]. No published terms allow
  bulk reuse of the 116117 search; similar portals forbid it [3][4]. The
  Landesärztekammer searches forbid reuse: Baden-Württemberg's terms say
  "Vervielfältigung und Weitergabe der Inhalte sind grundsätzlich nicht
  gestattet" (VERIFIED [DE1]); no chamber allowing bulk reuse was found, though
  not every chamber was checked. Dentists have no central database: the KZBV
  links to 17 regional searches (VERIFIED [DE2]). Consequence: no directory
  from open data; a licence or claimed pages only.
- **Identifiers.** LANR, 9 digits: 6 for the doctor, a check digit (digits 1–6
  weighted alternately 4 and 9, then `(10 − sum mod 10) mod 10`), 2 for the
  specialty group; the pseudo-LANR `999999900` must be accepted separately [5].
  BSNR (practice), 9 digits, the first two the KV region, no check digit [6].
  eFN (continuing education), 15 digits ending with a Luhn check digit [7].
- **Health data.** §393 SGB V (since 1 July 2024): processing of social and
  health data for statutory health insurance providers and their processors
  must happen in Germany, the EU or an equivalent country, and the processor
  needs a current BSI C5 attestation, Type 2 since 1 July 2025 [8][9]. The
  law covers providers under chapter 4 of SGB V (contracted doctors, midwives)
  "and their processors" using cloud services, and its paragraph 2 adds
  "sofern die datenverarbeitende Stelle über eine Niederlassung im Inland
  verfügt", an establishment in Germany (VERIFIED [DE4]); whether that
  condition qualifies every location or only the third-country one is a matter
  of reading. Apercura acting as processor for contracted doctors is in scope;
  as an independent controller it arguably is not (our reading,
  **UNVERIFIED**). §22(1)(1)(b) BDSG allows health-care processing only by, or
  under the responsibility of, people bound by professional secrecy (VERIFIED
  [DE5]): the platform acts under the doctor's responsibility or relies on
  explicit consent (our reading).
- **Formats.** `Europe/Berlin`; phone `+49`, trunk prefix `0`, area codes of 2
  to 5 digits, 11-digit numbers (10 in Berlin, Hamburg, Frankfurt and Munich)
  assigned since 2011, shorter legacy numbers still in use (VERIFIED [DE6]);
  5-digit postcode before the city, street before house number (VERIFIED
  [DE7]).
- **Legal pages.** Impressum under §5 DDG (which replaced the TMG on 14 May
  2024); regulated professions add their chamber, legal title and professional
  rules [10].
- **Professional advertising.** MBO-Ä §27 allows factual information only [11];
  the HWG can apply to the choice of a doctor [12]. BGH VI ZR 30/17 (2018): a
  directory may list doctors without their consent only as a neutral
  intermediary; Jameda lost for showing paying competitors on non-paying
  doctors' profiles [13]. Apercura's identical free pages and absence of paid
  ranking fit that line. After Jameda changed its portal, the BGH dismissed
  deletion claims (VI ZR 488/19 and 489/19, 12 October 2021; **UNVERIFIED**,
  read in summaries). LG Berlin II (52 O 149/25, 18 November 2025, under
  appeal) held Doctolib's filter for statutory patients misleading because it
  also showed self-pay slots (VERIFIED [DE8]).
- **Booking platforms.** The GeDIG bill (cabinet 15 July 2026, in the Bundestag
  since October 2026) plans booking through 116117 in the ePA app and
  requirements for private booking platforms set by the KBV and the
  GKV-Spitzenverband (bill VERIFIED [DE9][DE10]; the platform requirements
  **UNVERIFIED**). A moving target for any German launch.
- **Market.** German. 437,162 practising doctors, 170,964 of them in ambulatory
  care (31 December 2024, VERIFIED [DE11]); 73,511 practising dentists
  (VERIFIED [DE3]); about 1 million qualified nurses (VERIFIED [DE12]);
  midwives: no national total found. Doctolib, Jameda (Docplanner group), the
  public 116117 service (**UNVERIFIED** figures).
- **Verdict.** Facility pages from the hospital directory and the open pharmacy
  lists (open); practitioners on claimed pages only; booking for contracted
  doctors probably needs a C5 Type 2 host, possibly a German establishment, and
  the GeDIG rules.

### United Kingdom (GB)

Open since 2026-11-25 (#125) at `/gb`: practice pages for the four nations from NHS open data,
claimed pages for clinicians later (a GMC licence).

- **Registry.** GMC List of Registered Medical Practitioners: bulk download for
  a yearly fee, republication needs a separate licence and GMC approval, no free
  API [14]. GDC (dentists): "Copies of the registers are not available for sale
  or for commercial purposes", single lookups only (VERIFIED [GB1]). NMC
  (nurses, midwives): free single search only [16]. Consequence: individual
  clinicians are not open data; practices are.
- **Access and licence.** `open data` for practices, each VERIFIED on 2026-11-25 on the
  publisher's portal; formats, URLs and keys in `docs/data-import.md`, "United Kingdom":
  - **NHS England, Organisation Data Service** (England and Wales): the ODS Data Search and
    Export reports `epraccur` (prescribing cost centres; GP practices carry the non-primary role
    RO76), `ebranchs` (branch surgeries), `egdpprac` (dental practices) and `edispensary`
    (pharmacies), headerless 27-column CSVs at
    `https://www.odsdatasearchandexport.nhs.uk/api/getReport?report=…`, which replaced the
    legacy CSV downloads (the old `files.digital.nhs.uk/assets/ods/current/*.zip` answer 403); the
    service says "The information is refreshed at 2am each night" [GB11][GB12]. Licence: "ODS data
    is published under Open Government Licence and is therefore available for all to use"
    (VERIFIED on the ODS service page [17], read through the Web Archive capture of 2026-10-12
    because digital.nhs.uk answers 403 to scripts; TRUD's licence page says the same [GB4]). No
    attribution wording is prescribed: the OGL's own statement is used. Rows of 25 November 2026:
    6,558 active GP practices (6,160 England, 398 Wales), 2,553 open branch surgeries, 9,818
    active dental practices, 11,252 active pharmacies and appliance contractors;
  - **Public Health Scotland** (opendata.nhs.scot, CKAN, licence field `uk-ogl`): "GP Practice
    Contact Details and List Sizes" (quarterly, 879 practices in October 2026), "Dental
    Practices and Patient Registrations" (quarterly, 989 practices in March 2026), "Dispenser
    Location Contact Details" (monthly, 1,346 dispensers in August 2026) [GB13]. The same
    publisher's "General Practitioner Contact Details" lists individual GPs with their GMC
    number under the OGL: not imported (personal data);
  - **Business Services Organisation** (OpenDataNI, licence field `uk-ogl`): "GP Practice List
    Sizes" (quarterly reference file, 305 practices in July 2026, `PracticeName` gives the
    partners' names) and "Dentist and Surgery List" (quarterly, 347 surgeries in September 2026,
    no identifier; its "Dentist Contractor List" names dentists and is not imported) [GB14];
  - **places**: Ordnance Survey's Code-Point Open (every postcode unit of Great Britain, British
    National Grid, quarterly) and OS Open Names (16,854 cities, towns and villages kept), both
    under the OGL, attribution as in their `Doc/licence.txt` ("Contains OS data © Crown copyright
    and database right 2026", plus the Royal Mail and National Statistics statements of
    Code-Point Open) [GB15][GB16]; the ONS ward-to-region lookup and local authority boundaries
    (2026 vintage, 361 authorities), "Source: Office for National Statistics licensed under the
    Open Government Licence v.3.0" [GB17]; the OSNI gazetteer of Northern Irish towns (336
    places, 2015) [GB18].

  Northern Irish postcode locations (ONS Postcode Directory, NSPL) are not open: "you need a
  separate licence for commercial use direct from Land and Property Services", the ONS issuing
  only an internal-business-use licence (VERIFIED [GB19]). The OGL "does not cover: personal data
  in the Information" (VERIFIED [GB5]): 891 practices published under a person's name are
  shown under their premises or street, the name never stored. Everything not imported and whom
  to ask, under the Re-use of Public Sector Information Regulations 2015 [GB20], is in
  [`docs/data-requests/gb.md`](../data-requests/gb.md). An open licence settles copyright and
  database rights, not the UK GDPR: listing practices rests on legitimate interests with an
  article 14 notice (the privacy notice at `/gb/privacy`).
- **Identifiers.** ODS codes: a GP practice a letter and 5 digits, a dental practice `V` and 5 or 6
  digits (7-character codes since February 2021, published without the added `0` for older
  practices), a pharmacy `F` and 4 characters (VERIFIED on the data). PHS and BSO number their
  practices; the BSO's dental list gives no number. GMC reference number, 7 digits [20]; NMC PIN
  `\d{2}[A-Z]\d{4}[A-Z]` [21]; GDC number numeric, up to 6 digits, no check digit found (VERIFIED
  [GB2]). Branch codes vary by date [22].
- **Health data.** UK GDPR and the Data Protection Act 2018, amended by the Data (Use and Access)
  Act 2025 (main provisions in force since 5 February 2026) [23]; since then the article 14
  disproportionate-effort exemption is article 14(5)(e), with the safeguards of 14(7) ("making
  the information publicly available"), and article 14(2)(da) adds the right to complain to the
  controller (DPA 2018 s. 164A, from 19 June 2026) (VERIFIED [GB21]). A transfer to an EEA state is
  approved by the DPA 2018, schedule 21, paragraphs 4 and 5, under UK GDPR article 45A (VERIFIED
  [GB22]). The NHS Data Security and Protection Toolkit: "All organisations that have access to
  NHS patient data and systems must use the toolkit" (VERIFIED [GB3]); a directory with no NHS
  connection is outside it. No HDS-like hosting certification in UK GDPR or the DPA 2018
  (**UNVERIFIED** as a negative). Supervisory authority: the ICO, Wycliffe House, Water Lane,
  Wilmslow, Cheshire SK9 5AF, helpline 0303 123 1113 (VERIFIED [GB23]).
- **Formats.** `Europe/London`; phone `+44`, trunk prefix `0`, 10 digits after it, with some
  9-digit areas left (VERIFIED [GB6]); postcode as outward code, space, inward code (`SW1A 1AA`)
  (VERIFIED [GB7]).
- **Legal pages.** The Electronic Commerce (EC Directive) Regulations 2002, regulation 6: name,
  geographic address, contact details including an email address, register and registration
  number, VAT number where the activity is subject to VAT (VERIFIED [GB24]); company details of a
  UK company on its website (SI 2015/17, regs 24–25) [25]; a privacy notice. The accessibility
  regulations (SI 2018/952) bind public sector bodies only (VERIFIED [GB25]).
- **Professional advertising.** GMC Good medical practice (2024): accurate, not misleading, within
  the CAP/ASA codes [26]. The UK pages carry no ratings, rankings or paid placement.
- **Booking platforms.** The CQC registers regulated activities, not channels, and says
  introductory services that only pass on contact details are not a regulated activity [GB8]: a
  booking site that provides no care should not need CQC registration (our reading,
  **UNVERIFIED** for booking; England only, the devolved regulators not checked). Booking stays
  off in the UK (`features.booking`).
- **Market.** English (and Welsh). About 328,000 licensed doctors (end 2024, **UNVERIFIED**);
  47,022 dentists (VERIFIED [GB9]); 799,001 nurses and 48,545 midwives on the NMC register (31
  March 2026, VERIFIED [GB10]). NHS App and GP online-services suppliers, Doctify, Top Doctors
  (**UNVERIFIED**).
- **Verdict.** Directory of practices from open data: 31,240 GP practices, dental practices and
  pharmacies from the files of 25 November 2026 (real-data dry run on a fresh database: ODS GP
  6,558, ODS dental 9,712, ODS pharmacies 11,109, PHS GP 879, PHS dental 986, PHS pharmacies 1,345,
  BSO GP 304, BSO dental 347; 31,219 indexable; 33,733 sites, 33,027 located by postcode, 33,712
  placed in a local authority; 3,380 indexable listing pages); claimed pages for clinicians once a
  GMC licence is obtained; booking later.

### Austria (AT)

Open since 2026-11-25 (#107) at `/at`: a directory from open data for Vienna, Styria and
Salzburg, claimed pages elsewhere.

- **Registry.** The Ärzteliste of the Austrian Medical Chamber (ÄrzteG §27) has a public part that
  must be online: doctor number, name, degrees, address, practice locations, titles, insurance
  contracts (VERIFIED [AT1][AT2]). The Gesundheitsberuferegister (GÖG and Arbeiterkammer) covers
  nursing and allied professions (VERIFIED [AT3]); the midwives' register and the dentists'
  search are lookup-only (VERIFIED [AT4][AT5]). National registers: `searchable website only`.
- **Access and licence.** Regional `open data`, each VERIFIED on 2026-11-25 on data.gv.at, the
  publisher's catalogue and its terms of use ([AT6], [AT10]–[AT15]); formats, URLs and keys in
  `docs/data-import.md`, "Austria":
  - **Ärzte Standorte Wien** (City of Vienna): WFS layer `ogdwien:ARZTOGD` as GeoJSON, CSV or
    shapefile, **CC BY 4.0**, updated daily, "die Daten stammen von der Ärztekammer für Wien, sind
    adressscharf geocodiert"; 7,642 rows, 6,100 doctors (one practice-plan number each), a phone
    on 57% of rows. Attribution: "Datenquelle: Stadt Wien – data.wien.gv.at" [AT10];
  - **Niedergelassene Ärzte Steiermark** (Land Steiermark): shapefile ZIP and KMZ, **CC BY 4.0**,
    modified 31 October 2026; 4,101 rows, 2,668 doctor numbers, no phone. Attribution:
    "Datenquelle: CC-BY-4.0: Land Steiermark - data.steiermark.gv.at" [AT11];
  - **Ärzte Land Salzburg** (list of the Ärztekammer für Salzburg): JSON, shapefile, KMZ, WFS,
    **CC BY 4.0** on the Land's own catalogue (the data.gv.at record lacks the licence field; the
    Land's terms put all its open data under CC BY 4.0), modified 12 June 2026; 1,523 rows, 1,276
    people, gender given, no number, no phone. Attribution: "Datenquelle: Land Salzburg –
    data.salzburg.gv.at" [AT12][AT13];
  - **Zahnärzte Land Salzburg** (list of the Zahnärztekammer): same terms; 366 rows, 345 dentists
    [AT14];
  - Statistik Austria's **Gemeinden – Schwerpunkte**, **CC BY 4.0**, places the practices
    (attribution "Datenquelle: Statistik Austria - data.statistik.gv.at") [AT15].

  Everything else found (the other six Länder publish no list; Linz publishes counts only;
  Engerwitzdorf's list dates from 2022; Burgenland's driving-licence examiners; the labour
  inspectorate's authorised doctors, whose file is gone) and whom to ask, under the IWG 2022
  [AT16], is in [`docs/data-requests/at.md`](../data-requests/at.md). An open licence settles
  copyright and database rights, not the GDPR: listing named doctors rests on legitimate interest
  with an art. 14 notice, as in France (the Datenschutzerklärung at `/at/datenschutz`).
- **Health data.** GDPR and DSG; no hosting certification or localisation rule found. The
  Gesundheitstelematikgesetz 2012 binds health service providers exchanging data electronically
  and allows cloud storage only with state-of-the-art encryption (VERIFIED text [AT7]); whether it
  reaches a booking site is UNVERIFIED, so booking stays off in Austria (`features.booking`).
- **Booking and advertising.** ÄrzteG §53 bans unobjective, untrue or reputation-harming
  information and referral fees, and binds "sonstigen physischen und juristischen Personen" too,
  so it reaches platforms (VERIFIED [AT8]). The chamber's guideline on advertising was not checked
  (UNVERIFIED): the Austrian pages carry no ratings, rankings or paid placement.
- **Market.** German. 53,353 doctors (Austrian Medical Chamber, 31 December 2025, VERIFIED
  [AT9]); over 220,000 in the health-professions register (UNVERIFIED). DocFinder (search, booking
  and ratings), Doctena; doctolib.at and jameda.at did not resolve (UNVERIFIED).
- **Verdict.** Directory from open data for Vienna, Styria and Salzburg (10,377 doctors and
  dentists from the files of November 2026, about a fifth of Austria's doctors); claimed pages for
  the six other states; booking later.

### Belgium (BE)

- **Registry.** The federal cadastre of licensed practitioners (eCAD) and the database of active
  practitioners (ProSanté) can be searched one practitioner at a time (VERIFIED [BE1]); the INAMI
  search shows the declared work address and convention status, "©INAMI, tous droits réservés"
  (VERIFIED [BE2]). CoBRHA, which merges INAMI, SPF and AFMPS data, is reached only through
  eHealth web services by partners (VERIFIED [BE3]). Flanders publishes its slice of CoBRHA for
  **care facilities**, not individuals, under the Vlaamse Modellicentie voor Gratis Hergebruik
  (VERIFIED [BE4]). Individuals: `searchable website only`.
- **Health data.** No hosting certification found (UNVERIFIED as a negative). The DPA treats
  booking data as health data and criticised a platform for requiring the national register number
  (VERIFIED [BE5]).
- **Booking and advertising.** **Decision 149/2023 of the Belgian DPA (10 November 2023):** a
  booking platform listing practitioners who had not signed up, with contact details from their own
  websites, could not rely on legitimate interest because the listing exceeded their reasonable
  expectations; reprimand and ban on that processing; the Market Court dismissed the appeal on 8
  May 2024 (VERIFIED [BE5]). This is the opposite of the French model and applies directly to
  Apercura. The Ordre des médecins tells doctors to avoid sites with review sections (VERIFIED
  [BE6]); the 2018 code of medical ethics allows factual, non-commercial information (UNVERIFIED).
- **Market.** French, Dutch, German. About 56,000 licensed doctors (40,000 practising), 11,600
  dentists, 103,800 nurses, 11,100 midwives (INAMI, end 2024, UNVERIFIED). Doctoranytime,
  Progenda (Helena), Doctena, Rosa; no Doctolib found.
- **Verdict.** Claimed pages only, opt-in: no reusable register, and the DPA has ruled against
  listing practitioners who did not opt in. Whether a non-profit site using official data would
  fare differently is untested.

### Bulgaria (BG)

- **Registry.** The Bulgarian Medical Association's national register (eBLS): doctor search, ID
  (УИН), name, specialties (UNVERIFIED [BG1]). The insurance fund (NHIF) has a search of
  contracted GPs, specialists and dentists, no export (VERIFIED [BG2]). `searchable website
  only`; data.egov.bg returned 403, so the licence of its outpatient-facility register is unknown
  (UNVERIFIED [BG3]).
- **Health data.** No hosting certification found (UNVERIFIED).
- **Booking and advertising.** Doctors' ethics code: no use of a doctor's name for advertising,
  directory entries must not be advertising in character (UNVERIFIED [BG4]).
- **Market.** Bulgarian. 29,656 doctors, 7,373 dentists, 29,160 nurses (2020) [EU1].
  Superdoc.bg (paid per doctor); Docplanner absent (VERIFIED [BG5]).
- **Verdict.** Claimed pages only.

### Croatia (HR)

- **Registry.** The Croatian Medical Chamber's directory of doctors is searchable by name or
  number; the Medical Practice Act makes it a public book (UNVERIFIED, page not fetched
  [HR1][HR2]). Other chambers not checked. The health insurance fund (HZZO) publishes XLSX lists
  of contracted primary-care doctors (GPs, paediatricians, gynaecologists, dentists; October
  2026): doctor code, name, public or private, patient count, practice address (VERIFIED [HR3]).
- **Access and licence.** The HZZO files are mirrored on data.gov.hr, but their licence field
  reads "Nije navedena" (not specified) (VERIFIED [HR4]); whether the national Otvorena dozvola
  applies by default is UNVERIFIED [HR5]. So: bulk files, licence not found.
- **Health data.** Medical records live in the national health information infrastructure
  (CEZIH) under the health data act; nothing found that targets a third-party booking site
  (UNVERIFIED [HR6]).
- **Booking and advertising.** The chamber's ethics code and its 2019 rulebook on informing the
  public ban self-promotion; factual information is allowed (UNVERIFIED [HR7]).
- **Market.** Croatian. 14,529 doctors (2021), 3,526 dentists (2020), about 28,000 nurses
  (2021) [EU1]. eDoktor.hr (paid directory and booking), the public Portal zdravlja; Docplanner
  absent (UNVERIFIED).
- **Verdict.** Claimed pages only today; one written answer from HZZO on the licence would make
  it a directory from open data for contracted primary care.

### Cyprus (CY)

- **Open since 2026-11-27 (#174), facilities.** The Ministry of Health's lists on data.gov.cy:
  the Pharmaceutical Services' private pharmacies (2024–2025 edition, yearly), the state
  hospitals and the state health centres (2018), all CC BY 4.0 (VERIFIED [CY5][CY6][CY7]); placed
  in the five districts and the 404 municipalities and communities of the 2021 census (CYSTAT,
  CC BY 4.0, VERIFIED [CY8]) with Cyprus Post's postcodes and centres (CC BY 4.0, VERIFIED [CY9]).
  No person is listed: the pharmacist each pharmacy is listed under and their house telephone are
  never read. Legal notice under Law 156(I)/2004, section 8 (UNVERIFIED citation, for the lawyer's
  review); privacy notice under the GDPR and Law 125(I)/2018, with the Commissioner for Personal
  Data Protection as the authority; the accessibility statement is voluntary (Law 50(I)/2019 binds
  public sector bodies; UNVERIFIED). Data and requests:
  [`docs/data-import.md`](../data-import.md#cyprus),
  [`docs/data-requests/cy.md`](../data-requests/cy.md).
- **Registry.** The Cyprus Medical Council publishes its whole register as one HTML table (about
  9,400 rows: name, specialty, registration number, school, practice address, town), posted 12
  March 2026 (VERIFIED [CY1]). Nurses and midwives: yearly list in the Government Gazette;
  dentists: no public lookup found (UNVERIFIED). The national health system (GESY) has a provider
  search (UNVERIFIED [CY2]).
- **Access and licence.** The register of doctors states no licence or terms, only "© Republic of
  Cyprus" (VERIFIED, licence not found [CY1]); data.gov.cy has no practitioner dataset (VERIFIED
  [CY3]), but lists of facilities under CC BY 4.0, which the market opened from.
- **Health data.** No hosting certification found; GDPR with Law 125(I)/2018 (UNVERIFIED).
- **Booking and advertising.** Code of Medical Ethics (KDP 100/91) art. 45: directory listings
  must be "uniform for all", without paid prominence; art. 43: no public praise (VERIFIED, 1991
  text, later amendments not checked [CY4]). Apercura's model fits it exactly: factual pages, a
  neutral order, no ratings, advertising or paid placement. The pharmacies' advertising rules
  were not read (UNVERIFIED).
- **Market.** Greek, Turkish, English widely used. About 4,900 doctors and 4,900 nurses (OECD
  2023 density, our estimate). Doctoranytime and several local directories.
- **Verdict.** Open as a directory of pharmacies, state hospitals and health centres (#174);
  doctors only if the Ministry of Health publishes the register under an open licence.

### Czechia (CZ)

Open since 2026-11-26 (#131) at `/cz`: facility pages from the National Register of Healthcare
Providers, in Czech.

- **Registry.** The Czech Medical Chamber's list of doctors (Act 220/1991 §6a), searchable by name,
  specialty and district, says "Všechna práva vyhrazena Česká lékařská komora" (VERIFIED [CZ1],
  2026-11-26). The national register of health workers (NRZP) is not public (UNVERIFIED [CZ2]). The
  national register of healthcare providers (NRPZS, ÚZIS): the open dataset "NRPZS: Místa
  poskytování zdravotních služeb" lists every current place of care, one row per facility and place
  (41,136 rows on 1 November 2026), with the facility's name, kind (`ZZ_druh_kod`, ÚZIS code list),
  fields, forms and kinds of care, the address of the place with its RÚIAN address code, WGS 84
  coordinates (`POINT(lat lng)`), the region, district and administrative-district codes, and the
  provider's company number, seat, phone, e-mail, website, data box and professional
  representative (VERIFIED [CZ3][CZ4]). "Datová sada neobsahuje již zaniklé subjekty" and leaves out
  the facilities of the Ministries of the Interior and of Justice (prisons) (VERIFIED [CZ3]). About
  38% of the places of care (15,643 rows) belong to a natural person, whose facility is named after
  them ("MUDr. Hana Boháčková").
- **Access and licence.** NRPZS: `open data`, "Autorské dílo licencované CC BY 4.0", "Není
  autorskoprávně chráněnou databází", "Není chráněna zvláštním právem", "Aktualizace měsíční",
  27 MB CSV at
  `https://datanzis.uzis.gov.cz/data/NR-01-NRPZS/NR-01-06/Otevrena-data-NR-01-06-nrpzs-mista-poskytovani-zdravotnich-sluzeb.csv`
  (`Last-Modified` of the 1st of the month), with a citation the publisher asks for (VERIFIED
  [CZ3], 2026-11-26). The dataset's personal-data note: "Datová sada může obsahovat identifikační
  údaje právnických osob a osobní údaje, v souladu s ust. § 73 odst. 8, § 74 § 75 zák. č. 372/2011
  Sb. … a ust. § 16 zák. č. 110/2019 Sb." (VERIFIED [CZ3]). No API is documented on the NRPZS site
  or the dataset page (read 2026-11-26; the first round's "API" is not confirmed) [CZ5]. Places:
  RÚIAN's state basic dataset `ST_UZSZ` (VFR XML, monthly, regions, districts, municipalities,
  Prague's administrative districts with definition points in EPSG:5514), open data "bezúplatně na
  základě licence Creative Commons CC-BY 4.0", credited „ČÚZK, [rok]“ (VERIFIED on ČÚZK's terms
  [CZ8]). SÚKL's pharmacy list is open data under SÚKL's own terms (VERIFIED [CZ9]), not read yet.
  Everything not imported and whom to ask: [`docs/data-requests/cz.md`](../data-requests/cz.md).
- **Identifiers.** `ZZ_ID`, "Jednoznačný identifikátor zdravotnického zařízení" (VERIFIED [CZ3]),
  1 to 6 digits today, is the page's key (`/cz/zarizeni/mudr-hana-bohackova-39781`). The facility
  code `ZZ_kod` is the provider's IČO followed by the facility and branch numbers: for a sole trader
  the IČO identifies the person, so neither is stored. No birth number (rodné číslo) is published.
- **Health data.** GDPR and Act No. 110/2019 Coll.; Act No. 372/2011 Coll. on health services
  governs the providers' records. No hosting certification found (UNVERIFIED as a negative).
  Supervisory authority: the Úřad pro ochranu osobních údajů (ÚOOÚ).
- **Formats.** `Europe/Prague`; phone `+420` and nine digits, no trunk prefix, printed `326 357 125`;
  postcode five digits written `110 00`.
- **Legal pages.** A business website names its operator (§ 435 of the Civil Code, Act No.
  89/2012 Coll.); Act No. 480/2004 Coll. on certain information society services; a privacy notice
  with the article 14 information. Act No. 99/2019 Coll. on accessibility binds public sector bodies:
  the statement at `/cz/pristupnost` is voluntary.
- **Booking and advertising.** The chamber's ethics code bans undignified self-promotion,
  including through third parties (UNVERIFIED [CZ6]). The DPA inspected ZnanyLekarz in 2013:
  doctors' basic profile data "mohou být zpracovávány (zveřejněny) bez jejich souhlasu" because they
  come from public sources (§ 5(2)(d) of the former Act 101/2000), opinions on unregistered doctors
  may not, and a doctor who withdraws must be deleted (VERIFIED [CZ7], pre-GDPR). Booking stays off
  (`features.booking`).
- **Market.** Czech. 43,810 doctors, 7,914 dentists, 92,664 nurses, 4,248 midwives (2020) [EU1].
  Znamylekar.cz (Docplanner), TopDoktor.
- **Verdict.** Directory of facilities from open data: 33,173 places of care from the export of 1 November
  2026 (real-data dry run on a fresh database: general practitioners 5,324, paediatricians 1,973,
  dentists 5,616, gynaecologists 1,627, specialists 10,785, pharmacies 2,527, home care 949,
  physiotherapists 2,767, clinical psychologists 702, speech therapists 611, midwives 292; all
  indexable; 33,101 at the register's point, 72 at their municipality's centre; 33,169 placed in a
  municipality or a Prague district by name; 13,330 listing pages, 4,318 indexable); claimed pages
  for facilities; booking later.

### Denmark (DK)

- **Registry.** The Autorisationsregister (Styrelsen for Patientsikkerhed) lists every authorised
  health professional (doctors, dentists, nurses, midwives among 20 professions): name, date of
  birth, authorisation ID and profession, optionally specialty and the clinic of a responsible
  doctor or dentist [DK1][DK2]. `searchable website only` (autreg.dk); no bulk download or reuse
  licence found (VERIFIED). Bulk copies go to healthcare actors through the national service
  platform and to researchers (UNVERIFIED [DK3]). The health-sector organisation register (SOR)
  is a free CSV/XML download, "frit tilgængelige", but names no licence and its coverage of
  private practices was not confirmed (VERIFIED as downloadable [DK4][DK5]).
- **Health data.** No hosting certification beyond the GDPR found; national security terms
  apply to connections to the national platforms (UNVERIFIED as a negative).
- **Booking and advertising.** Marketing of health services must be factual and not misleading;
  the guidance warns against flash discounts and undocumented subjective claims (VERIFIED [DK6]).
  A 2013 Datatilsynet decision let a dentist-review portal operate under the old law (UNVERIFIED
  [DK7]).
- **Market.** Danish. Practising in 2024: 27,878 doctors, 4,817 dentists, 62,913 nurses, 2,734
  midwives [EU1]. The public Min Læge app books GPs [DK8]; no Docplanner or Doctolib presence
  found (UNVERIFIED).
- **Verdict.** Claimed pages only; SOR could feed establishment pages once its terms are
  confirmed with the publisher.

### Estonia (EE)

- **Open since 2026-11-27 (#165), providers and pharmacies.** The Health Board's
  "Tervishoiuteenuse osutajate ning tegevuslubade andmestik" (MEDRE open data, CC BY-NC-SA 3.0
  Unported, VERIFIED [EE6]: 1,518 providers listed, every page printing its activity
  licence numbers) and the State Agency of Medicines' general pharmacies (Ravimiamet's register
  of activity licences, CC0 1.0, VERIFIED [EE7]: 469), placed in EHAK's counties,
  municipalities and settlements (Maa- ja Ruumiamet, open data credited with its name and the
  data's date, VERIFIED [EE8]) at their ADS address points (CC0 1.0, VERIFIED [EE9]). The health
  workers are not listed. Legal notice under InfoTS § 4(1) (VERIFIED [EE10]); privacy notice with
  Andmekaitse Inspektsioon as the authority; the accessibility statement is voluntary (LPS covers
  e-commerce and the services it lists, VERIFIED [EE11]). Data and requests:
  [`docs/data-import.md`](../data-import.md#estonia),
  [`docs/data-requests/ee.md`](../data-requests/ee.md).
- **Registry.** The Health Board's register of healthcare professionals (MEDRE, run by TEHIK)
  publishes XML open data: providers with activity licences, service addresses and **the health
  workers registered with each provider** (code D or N plus 5 digits, name, profession,
  specialty), and GP lists with their doctors and nurses (VERIFIED [EE1][EE2]).
- **Access and licence.** `open data` under **CC BY-NC-SA 3.0** on andmed.eesti.ee; publication is
  required by the Public Information Act (VERIFIED [EE3][EE4]). Republication is allowed with
  attribution, non-commercially, under the same licence. Apercura is free, but the NC term binds
  the operator and the SA term binds any republished enriched data.
- **Health data.** No hosting certification for private sites found; national booking runs
  through the state's Digiregistratuur (UNVERIFIED).
- **Booking and advertising.** The Advertising Act §22 bans health-service advertising but
  exempts factual information (name, specialty, location, hours, price list); information about
  a provider must carry its activity licence number (VERIFIED as read in the index of Riigi
  Teataja [EE5]). Apercura's pages fit; a page must show the licence number.
- **Market.** Estonian (Russian widely spoken). 4,626 doctors, 1,336 dentists, 8,484 nurses
  (2020) [EU1]. Digiregistratuur, veebiregistratuur.ee, clinics' own booking; Docplanner absent.
- **Verdict.** Open as a directory of providers and pharmacies (#165); the Health Board is asked
  to confirm the NC and SA reading; health workers only after a legitimate-interest assessment.

### Finland (FI)

- **Registry.** Terhikki, public version JulkiTerhikki, run since 1 January 2026 by Lupa- ja
  valvontavirasto (LVV, formerly Valvira): name, 11-digit registration number, year of birth,
  right to practise, restrictions, qualification (VERIFIED [FI1][FI2]). `searchable website
  only`: "one person at a time"; the full register only on request or permit (VERIFIED [FI1]).
  LVV's CC BY 4.0 open data is aggregate counts, not individuals (UNVERIFIED [FI3]).
- **Health data.** Act 784/2021 on client data in social and health care: systems are class A
  (Kanta-connected) or class B, the supplier must register a system before production use, and
  private providers with patient-data systems must join Kanta (VERIFIED [FI4]). Providers must
  store an appointment document in Kanta from 1 October 2026 (VERIFIED [FI4]); that this reaches
  a separate booking tool used alongside a Kanta-certified record system is a secondary reading
  (UNVERIFIED [FI5]). A booking site for Finnish clinicians likely needs class B registration and
  a Kanta integration (UNVERIFIED; ask THL).
- **Booking and advertising.** The Finnish Medical Association's marketing guidelines, an
  approved code of conduct: no superlatives, objective comparisons only, price available before
  purchase (VERIFIED [FI6]).
- **Market.** Finnish, Swedish. Practising in 2025: 20,751 doctors, 3,978 dentists, 73,956
  nurses, 2,233 midwives [EU1]. Terveystalo, Mehiläinen and Pihlajalinna run their own booking;
  Doktor.se entered in 2025 (UNVERIFIED).
- **Open data (2026-11-27).** The Finnish Service Catalogue (Suomi.fi-palvelutietovaranto, PTV,
  DVV) is CC0 1.0 on avoindata.suomi.fi, read through its open API version 11 without a key
  (VERIFIED [FI7][FI8]); version 12 needs a key and version 11 is switched off in April 2027
  (VERIFIED [FI10]). It has no community pharmacies and almost no private clinics. Fimea's open
  data (CC BY 4.0) covers medicines only, no pharmacy list (VERIFIED [FI11]); THL's SOTE
  organisation register (about 14,900 health units, mostly private, sole traders under their own
  names) states no licence (VERIFIED [FI12]). Statistics Finland's municipalities, wellbeing
  services counties and regions are CC BY 4.0 (VERIFIED [FI9]).
- **Advertising.** The marketing section of the private health care act (152/1990) went with that
  act, repealed by the Act on the Supervision of Social and Health Care (741/2023, § 53, from 1
  January 2024), which has no marketing section of its own (VERIFIED [FI13]); its § 14 lets the
  providers' register be published online except personal identity codes (VERIFIED [FI13]).
  Health-service marketing now falls under the Consumer Protection Act (38/1978, chapter 2:
  factual, not misleading; UNVERIFIED), the Medicines Act for medicines and pharmacies (Fimea;
  UNVERIFIED) and the Finnish Medical Association's guidelines [FI6]. A neutral directory, paid
  by no one, with the same facts for every location, meets them.
- **Legal pages.** The provider's information under the Act on Electronic Communications Services
  (917/2014, § 176: text read, section number to confirm) [FI14]; privacy under the GDPR and the
  Data Protection Act (1050/2018), the Data Protection Ombudsman as authority; a voluntary
  accessibility statement in the form of the Act on the Provision of Digital Services (306/2019).
- **Verdict.** Open since #173 as a directory of public health service locations (`/fi`, in
  Finnish; [data import](../data-import.md#finland)). Not yet for booking (system registration
  and Kanta: the open question concerns booking only, not a directory). Swedish (`/fi-sv`),
  pharmacies and private providers are follow-ups.

### Greece (GR)

- **Registry.** The Panhellenic Medical Association runs a national register of doctors (name,
  specialty, association) since 2020 (VERIFIED [GR1]); dentists and nurses have no national
  public lookup found (UNVERIFIED). `searchable website only`, no licence found. One local
  medical association publishes its member list under CC BY 4.0 on data.gov.gr (VERIFIED [GR2]),
  not a national path.
- **Health data.** No hosting certification found; GDPR with Law 4624/2019 (UNVERIFIED).
- **Booking and advertising.** Law 3418/2005 (Code of Medical Ethics) art. 17 bans "any personal
  advertising", direct or indirect, and praise notices; informational listings are allowed in
  print; art. 18 allows a doctor's own website without comparison of qualifications (UNVERIFIED,
  read on a private copy of the law [GR3]). The strictest regime of the region.
- **Market.** Greek. About 70,000 doctors and 13,800 dentists registered (2024, UNVERIFIED).
  Doctoranytime (dominant), other local directories, the public e-appointment system.
- **Verdict.** Not yet: no reusable register, and a Greek lawyer must first confirm that a free,
  uniform, unranked claimed page is not "indirect advertising".

### Hungary (HU)

- **Registry.** The OKFŐ register of health workers (doctors, dentists, nurses): name-based lookup,
  "bárki számára hozzáférhető", no licence (VERIFIED [HU1]). The insurer (NEAK) publishes lists of
  contracted GP and dental practices; their licence was not found (UNVERIFIED [HU2]).
- **Health data.** Providers must connect to the national eHealth platform (EESZT); nothing found
  for a private booking site (UNVERIFIED).
- **Booking and advertising.** The Medical Chamber's ethics code allows factual advertising only
  (UNVERIFIED). DPA decisions on rating sites not checked.
- **Market.** Hungarian. 31,951 doctors, 64,127 nurses (2021), 6,578 dentists, 2,282 midwives
  (2020) [EU1]. Competitors not researched.
- **Verdict.** Claimed pages only.

### Iceland (IS)

- **Registry.** Starfsleyfaskrá heilbrigðisstarfsfólks (Embætti landlæknis) on island.is: every
  health worker with a valid licence and specialist licences (VERIFIED [IS1][IS2]).
  `searchable website only`: "opin öllum" for lookup, no bulk download or licence found.
- **Health data.** GDPR (EEA) and the Patient Records Act 55/2009; no hosting certification
  found (UNVERIFIED).
- **Booking and advertising.** Health Personnel Act 34/2012: promotion must be objective and
  accurate (UNVERIFIED, secondary [IS3]).
- **Market.** Icelandic. Practising in 2024: 1,801 doctors, 315 dentists, 3,989 nurses, 321
  midwives [EU1]. Heilsuvera (public portal with booking) and Noona (UNVERIFIED).
- **Verdict.** Claimed pages only; very small market.

### Ireland (IE)

**Open since 2026-11-27 (#171): facilities, under `/ie` in English.**

- **Registry.** The Medical Council register (name, registration number, registration type,
  qualifications, specialty; **no address**; CAPTCHA), the NMBI register of nurses and midwives, and
  the Dental Council registers, "published annually" on paper or CD (VERIFIED [IE1][IE3][IE4]).
  `searchable website only`. None can be republished; the market lists facilities instead.
- **Access and licence of people.** The Medical Council says the public may not download the
  register; in RPSI/22/04 (12 December 2024) the Information Commissioner, under the Open Data and
  PSI Regulations 2021, upheld the refusal of a full report but annulled it for data exportable from
  the main database and ordered a fresh decision (VERIFIED [IE2]); the outcome is unknown
  ([`docs/data-requests/ie-medical-council.md`](../data-requests/ie-medical-council.md)).
- **Facilities (VERIFIED 2026-11-27 [IE6]–[IE11][IE14], [`docs/data-requests/ie.md`](../data-requests/ie.md)).**
  - The PSI's Register of Pharmacies (retail pharmacy businesses, 2,003 rows, monthly XLSX), public
    by statute (Pharmacy Act 2007, s. 13(2): published on the Internet, free of charge). Its terms
    sheet allows re-use "free of charge in any format" if the source and copyright are acknowledged,
    the information is reproduced accurately and not misleadingly, and it is not used "for the
    principal purpose of advertising or promoting a particular product or service". A free, ad-free
    directory that lists every pharmacy alike meets that condition and must keep meeting it.
  - HIQA's register of designated centres for older people (548 nursing homes, live CSV), public by
    statute (Health Act 2007, s. 49(3)); HIQA's disclaimer allows re-use "free of charge in any
    format", under the same PSI licence. The person in charge, management contacts and an individual
    registered provider are never read.
  - The HSE's Health Atlas layers on GeoHive, CC BY 4.0: hospitals (132) and health centres (921),
    with coordinates, **a March 2020 snapshot** (last edited April 2020). No more recent open HSE list
    was found: the 2017 "List of Hospitals in Ireland" is older, the CSO's 2026 "Distance to
    Services" gives distances only. The GP layer names doctors and is not read.
  - The "latest PSI licence available at Data.Gov.ie" the PSI and HIQA point to is now data.gov.ie's
    open data licence, CC BY 4.0, which "does not cover personal data" (VERIFIED).
- **Places.** Tailte Éireann's 26 counties (National Statutory Boundaries) and the CSO's Census 2022
  Built Up Areas (867 towns), CC BY 4.0, with Tailte Éireann's placenames gazetteer for the other
  names of a town's localities. **Eircodes are not open** (the Eircode database is licensed): they
  are printed as part of a published address and never used to place or locate a facility.
- **Health data.** No hosting certification found (UNVERIFIED negative). The Data Protection
  Commission is the supervisory authority under the GDPR (Data Protection Act 2018, s. 11); the
  controller being established in France, the CNIL leads and Irish users may complain to the DPC.
- **Booking and advertising.** Medical Council Guide (9th edition, 2024), §50: advertising
  "responsible, accurate, ethical, legal, and truthful", with appropriate information about fees;
  §54.7: a doctor who promotes a product or service declares any financial interest; no ban on
  directories (VERIFIED [IE5]). The PSI's advertising guidance (2011): any advertising "must be
  factual, accurate, professional in character and should not draw an invidious distinction between
  the pharmacy in question and any other pharmacy"; the PSI's Code of Conduct (2019), principle 2,
  asks for accurate and impartial information and declared commercial incentives (VERIFIED [IE12]). Both
  bind doctors and pharmacists, not a neutral directory; the Medicinal Products (Control of
  Advertising) Regulations 2007 (S.I. No. 541 of 2007) cover medicines, which the pages never name.
  Pharmacy Act 2007, s. 64(5): a doctor may recommend a pharmacy only in their professional judgment.
- **Languages.** English and Irish are official. The Official Languages Act 2003 binds public bodies
  only: the market opens in English, and an Irish interface (`/ie-ga`) is a follow-up.
- **Market.** 22,257 clinically active doctors in 2025 (UNVERIFIED); about 92,000 nurses and
  midwives (UNVERIFIED). DocNearMe.ie, many online GP services; no Doctolib or Docplanner found
  (UNVERIFIED).
- **Verdict.** Open with facilities: about 3,600 pages from the PSI, HIQA and the HSE; a PSI re-use
  request to the Medical Council is still worth filing for doctors.

### Italy (IT)

Open since 2026-11-26 (#150) at `/it`: pages of pharmacies, parapharmacies, hospitals and
accredited private clinics from the open data of the Ministry of Health, in Italian.

- **Registry.** FNOMCeO's Albo Unico (doctors and dentists, from 106 provincial Ordini) is searched
  by full surname; "Ogni uso dei dati dell'Albo UNICO per fini commerciali è proibito" (VERIFIED
  [IT1]). No national open list of individual doctors. Some regions and cities publish their family
  doctors (MMG) and paediatricians (PLS) as open data: Campania under CC BY 4.0 (January 2024,
  stale), Milan under CC BY-SA 3.0 IT (November 2026, with practice address), several Puglia towns
  and Trento under CC BY 4.0 (VERIFIED [IT2]); they name people and are not imported. The Ministry
  of Health's portal (dati.salute.gov.it) lists places: "Farmacie", every pharmacy open to the
  public with its branches and dispensaries, one line per period of validity (59,309 lines for
  20,779 open pharmacies on 26 November 2026), with the ministerial code, the company name (which
  often names the pharmacists), address, CAP, ISTAT municipality code, hamlet, province, region,
  validity dates, type and coordinates, and the owner's VAT number; "Parafarmacie", the same for the
  parapharmacies (13,938 lines, 7,179 open); "Posti letto per struttura ospedaliera 2023"
  (published 29 July 2025, beds on 1 January 2023), one line per facility and area of care (1,798
  lines, 1,044 facilities) with the HSP.11 facility code, type, address and ISTAT municipality
  code, names cut at 40 characters, no coordinates, CAP or phone (VERIFIED [IT4][IT5][IT6],
  2026-11-26). The portal also has "Strutture di ricovero pubbliche e equiparate" and "Case di cura
  accreditate" (2022, staff counts), "Consultori familiari" (2019) and "Strutture e attività ASL"
  [36]; the national health service's outpatient facilities (model STS.11) were not found as open
  data. Everything not imported and whom to ask:
  [`docs/data-requests/it.md`](../data-requests/it.md).
- **Access and licence.** Ministry lists: `open data`, licence field "Italian Open Data Licence
  v2.0" on each dataset page; the shop files are renamed daily (`FRM_FARMA_5_<YYYYMMDD>.csv`,
  `FRM_PFARMA_7_<YYYYMMDD>.csv`) and named by each page's JSON twin (VERIFIED [IT4][IT5][IT6],
  2026-11-26). Pages cite "Fonte: Ministero della Salute, <dataset>, IODL 2.0, aggiornato al
  <date>" [IT7], the date of the file's `Last-Modified`, else of the import. Both shop datasets say
  "Alcune coordinate geografiche pubblicate sono state reperite tramite © OpenStreetMap
  contributors" (VERIFIED [IT4][IT5]): OpenStreetMap's data are under the ODbL (share-alike), so the
  import does not use the lists' points by default and places every page at its municipality's
  point (`city` precision); keeping them (`--register-coordinates`) is an **open decision for the
  operator** (18,941 of the 20,779 open pharmacies and 7,129 of the 7,179 open parapharmacies have
  one). Places: ISTAT's "Confini delle unità amministrative a fini statistici al 1° gennaio 2026",
  generalized version (a ZIP of about 10 MB: 20 regions, 110 provinces, metropolitan cities and
  free municipal consortia, 7,896 municipalities, in EPSG:32632), under ISTAT's legal notes:
  "Salvo diversa indicazione, tutti i contenuti pubblicati su questo sito sono soggetti alla
  licenza Creative Commons – Attribuzione – versione 4.0" (VERIFIED [IT8][IT9], 2026-11-26).
- **Identifiers.** The ministerial pharmacy code (`cod_farmacia`, `IT-FARM`), the parapharmacy's
  six-digit logistic-site code (`codice_identificativo_sito`, `IT-PFARM`) and the six-digit HSP.11
  facility code (`Codice struttura`, `IT-HSP`), each after a letter naming its list in the page's
  key (`/it/struttura/farmacia-esempio-f9000001`, reference `it:f9000001`). The owner's VAT number
  (`p_iva`, `partita_iva`) identifies a sole trader, and the local health unit's pharmacy code is
  not needed: neither is read. The codice fiscale (16 characters, DM 23/12/1976, with _omocodia_)
  [37] is not in the lists. FNOMCeO albo numbers and regional GP codes: **UNVERIFIED**.
- **Health data.** GDPR and the Codice privacy (D.Lgs. 196/2003 as amended by D.Lgs. 101/2018).
  No hosting certification found (UNVERIFIED as a negative); the ACN's cloud qualification applies
  to suppliers of the public administration only [39]. Supervisory authority: the Garante per la
  protezione dei dati personali.
- **Formats.** `Europe/Rome`; phone `+39`, the leading `0` of fixed lines kept (`06 12345678`;
  UNVERIFIED on the numbering plan itself; the lists publish no phone); CAP five digits before the
  municipality, then the province code (`00184 ROMA RM`), house number after the street (VERIFIED
  [IT3]): a page prints the street, then `CAP comune`.
- **Legal pages.** D.Lgs. 70/2003, art. 7 (the provider's details); the partita IVA on the website
  (DPR 633/72 art. 35; the rule moves to the VAT consolidated text, art. 68, from 1 January 2027)
  [40]; a privacy notice with the article 14 information for the people a pharmacy's name may name.
  Legge 4/2004 (Legge Stanca) binds public administrations and the largest private companies: the
  statement at `/it/accessibilita` is voluntary.
- **Booking and advertising.** The Garante's 2024 compendium on platforms connecting patients and
  practitioners: booking is an administrative service, the platform is controller for accounts and
  history, a DPIA is required, and booking data are not processed for care, so the platform must
  obtain the patient's "preventivo consenso informato" (art. 9(2)(a)): account-free booking needs an
  explicit consent step (VERIFIED [38]). Code of Medical Ethics art. 56: truthful information on
  titles, activity, services and fees [41]; Law 145/2018 (c. 525, as amended in 2023) forbids
  offers, discounts and promotions [42]. Booking stays off (`features.booking`).
- **Market.** Italian (German and French co-official in Alto Adige and Valle d'Aosta).
  Practitioner counts: not obtained. MioDottore (Docplanner), Doctolib, Top Doctors, iDoctors,
  regional booking centres (CUP) (UNVERIFIED).
- **Verdict.** Directory of places from open data: 29,002 places from the files of 26 November
  2026 (real-data dry run on a fresh database: pharmacies 20,779, parapharmacies 7,179, hospitals
  564, accredited clinics 480; all indexable; 28,760 placed in their municipality, 1,156 of them by
  name, 242 only in their province; 28,760 at their municipality's point; 10,402 listing pages,
  2,758 indexable); no health worker; claimed pages for places; booking later, with the consent
  step.

### Latvia (LV)

Open since 27 November 2026 (#166): GP practices, hospitals and pharmacies, in Latvian, under `/lv`
([data import](../data-import.md#latvia)).

- **Registry.** The Health Inspectorate's registers of medical practitioners and of medical
  institutions: lookup only, "visas tiesības aizsargātas" (VERIFIED [LV1]). The National Health
  Service (NVD) publishes quarterly the GPs and their practices (territorial office, institution
  code and name, GP family name, first name and identifier, status, registered patients by age
  group), 1,183 registered GPs at 1,098 institutions in March 2026, without addresses (VERIFIED
  [LV2]). The Ministry of the Interior's Information Centre publishes the addresses of 473
  medical institutions with WGS 84 points (404 GP practice lines, 69 hospitals and their branches),
  last updated 7 March 2024 (VERIFIED [LV3]). The State Agency of Medicines publishes its
  register of licensed pharmaceutical businesses daily, 826 general pharmacies and branches
  (VERIFIED [LV5]). The NVD's own lists of GPs by territory and of contracted institutions, with
  addresses, are on its website, "publicētā satura visas tiesības aizsargātas" (VERIFIED [LV6]).
- **Access and licence.** `open data`: the NVD's, the Ministry's and the State Agency of
  Medicines' datasets are **CC0 1.0** on data.gov.lv (VERIFIED [LV2][LV3][LV5]); the State Land
  Service's address register is **CC BY 4.0**, credited "Izmantoti Valsts adrešu reģistra
  informācijas sistēmas dati" with the licence and the changes (VERIFIED [LV7]). The full
  registers are `searchable website only`.
- **Health data.** No hosting certification found (UNVERIFIED); GDPR and the Personal Data
  Processing Law (Fizisko personu datu apstrādes likums); the authority is the Data State
  Inspectorate (Datu valsts inspekcija, Elijas iela 17, Rīga, VERIFIED on dvi.gov.lv).
- **Booking and advertising.** The Advertising Law (Reklāmas likums) has no rule for medical
  services: advertising must be lawful, truthful and objective (s. 3(1)), misleading advertising
  is banned (s. 8), comparative advertising is regulated (s. 9), and section 7 leaves further
  rules, and those of particular goods and services, to other laws and regulations (VERIFIED
  [LV4]). The Medical Treatment Law
  (Ārstniecības likums), section 11, says notices and advertising about medical treatment,
  medical institutions and practitioners are placed in the mass media "normatīvajos aktos
  noteiktajā kārtībā", and no Cabinet regulation under it was found (VERIFIED [LV8]; the absence
  of a regulation is UNVERIFIED). Medicines advertising has its own Cabinet Regulation No. 378 of
  17 May 2011 (VERIFIED [LV9]). A free directory without paid placement, ranking or reviews is
  not advertising under these texts, as far as could be read; the Latvian Medical Association's
  ethics code on doctors' self-promotion was not checked (UNVERIFIED). A lawyer should confirm
  both before practitioners' own pages carry more than the facts.
- **Market.** Latvian. 6,346 doctors, 1,362 dentists (2020) [EU1]. piearsta.lv, hospitals' own
  booking; Docplanner absent (UNVERIFIED).
- **Verdict.** Open: GP practices where an address is published (293), naming their GPs, with the
  hospitals of the same list (66) and the pharmacies (814); claimed pages for everyone else. Ask
  the NVD to publish its practices' addresses as open data.

### Liechtenstein (LI)

- **Registry.** The Medical Chamber's "Arzt finden" lists about 129 doctors with specialty,
  practice and statutory-insurance contract (VERIFIED [LI1]); `searchable website only`, no reuse
  terms (VERIFIED [LI2]). The public-health office's licence register could not be reached
  (UNVERIFIED). GLNs come from Refdata, with the Swiss terms.
- **Health data.** GDPR (EEA) and the national DSG; no hosting certification found (UNVERIFIED).
- **Booking and advertising.** Not checked (UNVERIFIED).
- **Market.** German. About 130 doctors, capped by the insurance-contract quota.
- **Verdict.** Claimed pages only, as an extension of the Swiss market if at all.

### Lithuania (LT)

Open since 2026-11-27 (#170) at `/lt`: pages of licensed health-care institutions, one per
activity address, from the open data of the State Accreditation Service for Health Care
Activities, in Lithuanian.

- **Registry.** The State Accreditation Service for Health Care Activities (VASPVT) licence
  register: public search of medical, nursing, midwifery and oral-care licences of individuals,
  exportable to XLSX, with no reuse licence (VERIFIED [LT1]); data.gov.lt has pseudonymised
  competences (no names) (VERIFIED [LT2]). For institutions, VASPVT publishes "Sveikatos
  priežiūros įstaigų licencijų duomenys" (dataset 1623): the institutions (`Istaiga`, 4,131 rows),
  their activity addresses (`IstaigosVeiklosAdresas`, 9,731), licences (`Licencija`, 6,290: issued,
  suspended or revoked), the services licensed per address (`IstaigosPaslauga`, 676,797 rows, of
  which 40,400 belong to live licences) and the service settings (`PaslauguNustatymas`: mode,
  group, level and type of each service), with names in `Paslauga` (VERIFIED [LT7], files of
  2026-11-27). Of the 9,731 activity addresses, 3,193 have no current licence, 52 only a suspended
  one and 262 no service of a place of care; 722 pages belong to an institution missing from
  `Istaiga`, named by its newest current licence. No kind of institution, no postcode, no phone. The licence status codes are
  `3` issued, `4` revoked and `2` read as suspended (an assumption from the model's enumeration;
  suspended licences are not imported). The health insurance fund's "Gydymo įstaigų, vaistinių ir
  kitų įmonių sąrašas" (VLK, dataset 1386, yearly, last data 2026-03-28) lists 23,212 records, 16,333
  open, without addresses (VERIFIED [LT8]); it is not imported. Pharmacies are licensed by the
  State Medicines Control Agency (VVKT), whose open datasets cover medicines only (VERIFIED [LT15]).
  Everything not imported and whom to ask: [`docs/data-requests/lt.md`](../data-requests/lt.md).
- **Access and licence.** VASPVT institutions: `open data`, licence field "Creative Commons
  Attribution 4.0" on the dataset page, "Atnaujinama: Kasdien" (VERIFIED [LT7], 2026-11-27); CSV per
  model on the portal and through the data store's API, which selects columns (`?select(…)`)
  [LT3][LT16]. VLK: `open data`, CC BY 4.0, yearly (VERIFIED [LT8]). Individuals: `searchable
  website only`. Places: the Address Register of VĮ Registrų centras, CC BY 4.0 on each dataset
  page: settlements as text (dataset 1287, monthly) and their boundaries (dataset 1347, yearly),
  with the counties, municipalities and elderships, all read through the data store [LT12]
  (VERIFIED [LT9][LT10], 2026-11-27). The open address points (dataset 1351, CC BY 4.0) are a JSON
  of 25 August 2021, and their store model returns no row (VERIFIED [LT11]): not used. Both portals
  answer HTTP 429 to quick successive requests: the import is slow on purpose. Pages cite
  "Šaltinis: Valstybinė akreditavimo sveikatos priežiūros veiklai tarnyba prie SAM, „Sveikatos
  priežiūros įstaigų licencijų duomenys“ (data.gov.lt), CC BY 4.0" and "Šaltinis: VĮ Registrų
  centras, Lietuvos Respublikos adresų registras (data.gov.lt), CC BY 4.0 (gyvenamųjų vietovių
  taškus apskaičiavo Apercura)".
- **Identifiers.** VASPVT's institution number (`spi_id`) and the Address Register's code of the
  activity address (`adreso_id`, permanent), `LT-VASPVT` `5271-12679435`; an address without an
  address code takes `v` and the first eight hexadecimal digits of its GUID; two rows of one
  institution at one address are one page (15 merged). The legal
  entity code (`ja_kodas`), the seat addresses and the licence and order numbers are never read.
- **Names.** 508 pages belong to individual enterprises, others to small partnerships,
  whose names often carry the owner's name. The page prints the registered legal name, legal
  form abbreviated (1,412 names); the privacy notice gives the article 14 information and an
  objection removes the page; an individual enterprise's premises number is left out (231 pages).
- **Health data.** GDPR and the Law on Legal Protection of Personal Data (Asmens duomenų teisinės
  apsaugos įstatymas). No hosting certification found (UNVERIFIED as a negative). Supervisory
  authority: the Valstybinė duomenų apsaugos inspekcija (VDAI), L. Sapiegos g. 17, 10312 Vilnius
  [LT14]. No VDAI decision against directories was found (UNVERIFIED negative).
- **Formats.** `Europe/Vilnius`; phone `+370`, trunk prefix `8`, area code apart
  (`+370 5 212 3456`, `+370 612 34567`); postcode `LT-` and five digits before the settlement. The
  licence register gives no postcode and no phone.
- **Legal pages.** The Law on Information Society Services (No. X-614), article 6 (the
  provider's name, seat and registration details) [LT13]; a privacy notice with the article 14
  information for the owners an institution's name may name; terms; a voluntary accessibility
  statement (the rules implementing Directive (EU) 2016/2102 bind public sector bodies). Written
  in Lithuanian, to be reviewed by a native speaker and a lawyer before announcement.
- **Booking and advertising.** The Law on Advertising (Reklamos įstatymas, No. VIII-1871), article
  15 "Sveikatos priežiūros paslaugų ir medicinos priemonių reklama", in its wording in force since
  2022-05-26 (Law No. XIV-1062): advertising of health-care services and medical devices may not use
  a patient's name, surname or image, nor rely on recommendations of health-care institutions,
  health-care specialists or their professional organisations; advertising that does not comply
  with Regulations (EU) 2017/745 and 2017/746 is prohibited (VERIFIED on the consolidated text of
  2026-06-30 at infolex.lt [LT5]; e-tar.lt answered HTTP 403). Secondary sources say a clinic
  reposting patients' reviews is prohibited advertising and that the State Consumer Rights
  Protection Authority (VVTAT) supervises (UNVERIFIED [LT6]). A factual directory with no reviews,
  no testimonials and no recommendations stays outside the article. Booking stays off
  (`features.booking`).
- **Market.** Lithuanian. 12,529 doctors, 3,100 dentists, 21,818 nurses (2020) [EU1].
  manodaktaras.lt (with reviews), the state e-health booking; Docplanner absent (UNVERIFIED).
- **Verdict.** Directory of licensed institutions from open data: 6,208 pages from the
  files of 27 November 2026 (real-data dry run on a fresh database: dental clinics 2,247, medical centres 1,622, nursing 776, primary care 741, rehabilitation 298, hospitals 236, mental health 151, optometrists 99, laboratories 38;
  6,184 placed in their settlement, 24 in their municipality only, 1 quarantined; 1,807 listing
  pages, 533 indexable); no health worker, no
  pharmacy; claimed pages for institutions; booking later.

### Luxembourg (LU)

- **Registry.** The Ministry's register of health professionals is public as a searchable directory
  (law of 29 April 1983, UNVERIFIED); in practice the Agence eSanté directory and the Collège
  médical register (doctors, dentists, pharmacists, psychotherapists) are lookups (VERIFIED
  [LU1][LU2]). `searchable website only`; data.public.lu has aggregates only.
- **Health data.** No hosting certification found (UNVERIFIED).
- **Booking and advertising.** Collège médical charter on information and advertising (2021): no
  "apparitions prioritaires" in directories or search engines, no paid priority listing (art. 7 and
  13), and practitioners may say how patients book (art. 11) (VERIFIED [LU3]). The code for other
  health professions reportedly bans listings in directories that do not include all authorised
  practitioners (UNVERIFIED). Apercura's model fits; a complete directory needs data that is not
  open.
- **Market.** Luxembourgish, French, German. About 2,000 doctors and 560 dentists (2018, VERIFIED
  [LU2], old figure). Doctena (founded in Luxembourg) dominates (UNVERIFIED).
- **Verdict.** Claimed pages only.

### Malta (MT)

- **Registry.** The Medical Council keeps the registers of doctors (principal, provisional,
  temporary, specialist) and dentists, with a statutory duty "to keep, publish and update" them
  (Cap. 464 art. 10, VERIFIED [MT1]); online search and PDF lists, many addresses withheld
  (UNVERIFIED [MT2]). Nurses and midwives: separate council, PDF registers (UNVERIFIED [MT3]).
- **Access and licence.** `open data`, with caveats: the national catalogue lists the doctor and
  dentist registers, published by the Medical Council, under **CC BY 4.0**, last modified 25
  September 2026 (VERIFIED [MT4]). The distribution is the web search, not a file; in practice
  the data is the PDFs. No nurse or midwife dataset.
- **Health data.** No hosting certification found; GDPR with Cap. 586 (UNVERIFIED).
- **Booking and advertising.** The Medical Council's code on advertising makes advertisements
  subject to its review for objectivity (UNVERIFIED [MT5]).
- **Market.** Maltese, English. About 2,600 doctors and 4,400 nurses (OECD 2023 density, our
  estimate). Doctonica, Digimed (shows ratings), the public myHealth portal.
- **Verdict.** Directory from open data for doctors and dentists, once the Medical Council
  confirms in writing that the CC BY 4.0 covers republishing entries; claimed pages for nurses
  and midwives. Small market, English-speaking.

### Netherlands (NL)

- **Registry.** The BIG-register (CIBG, Ministry of Health): doctors, dentists, nurses, midwives
  and other professions, more than 380,000 entries (VERIFIED [NL1]); public fields are name,
  initials, gender, BIG number, profession, specialism and disciplinary measures, **no address**
  (UNVERIFIED as to the exact list). The LRZa registers care providers as organisations; its web
  service needs a PKIoverheid certificate and names no licence (VERIFIED [NL3]).
- **Access and licence.** `open data` as an API: the "BIG-register systeemkoppeling" dataset is
  listed "Licentie: CC-0 (1.0)" (VERIFIED [NL2]), but the public SOAP service searches "hetzelfde
  als die van de website", one lookup at a time, with no dump (VERIFIED [NL4]). Enumerating the
  register through it may not be welcome; its terms of use were not found.
- **Health data.** The decree on electronic data processing by care providers (BWBR0040238) makes
  **care providers** run their systems "overeenkomstig NEN 7510 en NEN 7512" with NEN 7513 logging;
  certification is not mandatory, and suppliers meet it by contract (UNVERIFIED, law text read in
  search excerpts [NL5]). No data-localisation rule found.
- **Booking and advertising.** Rb. Overijssel, 9 October 2019 (ECLI:NL:RBOVE:2019:3755):
  ZorgkaartNederland could list a doctor under art. 6(1)(f) GDPR and refuse to delete her profile
  (UNVERIFIED, read in professional press summaries).
- **Market.** Dutch (Frisian regional). Over 380,000 BIG registrations [NL1]. ZorgkaartNederland
  (directory with reviews), Doctolib (since 2023), GP practice portals (UNVERIFIED).
- **Verdict.** Claimed pages only for launch, with BIG lookups (CC0) to verify claims; a directory
  needs CIBG's agreement to bulk use and locations from LRZa or from the practitioner.

### Norway (NO)

- **Open since 2026-11-27 (#172), establishments of care.** Brønnøysundregistrene's
  Enhetsregisteret, its establishments (underenheter) under SN2025 codes 86.101–86.104, 86.210,
  86.221, 86.222, 86.230, 87.102 and 47.730 (NLOD 2.0, VERIFIED [NO8][NO9]: 5,821 listed of 25,832,
  no sole proprietorship, no practice named after a person), placed in Kartverket's counties and
  municipalities (CC BY 4.0, VERIFIED [NO12]) at the cadastre's address points (CC BY 4.0,
  VERIFIED [NO11]). Legal notice under ehandelsloven § 8 (a provider established in another EEA
  state follows its own rules, § 5; VERIFIED [NO13]); privacy notice under the GDPR through the EEA
  and personopplysningsloven, with Datatilsynet as the authority; the accessibility statement is
  voluntary (the universal design regulation's § 4 asks a private undertaking's web solutions to
  meet WCAG 2.0 AA, its § 4e statement binds public bodies; VERIFIED [NO14]). Data and requests:
  [`docs/data-import.md`](../data-import.md#norway),
  [`docs/data-requests/no.md`](../data-requests/no.md).
- **Registry.** Helsepersonellregisteret (HPR, Helsedirektoratet, operated by Norsk helsenett):
  every authorisation and licence (VERIFIED [NO1]). `restricted`: the public web search now asks
  for a login and "privatpersoner har ikke denne muligheten" (VERIFIED [NO3]); the "HPR Offentlig
  API" serves Norwegian organisations through Maskinporten (VERIFIED [NO2]). No licence stated;
  Helsedirektoratet refuses "videreformidling av HPR-data uten rettslig behandlingsgrunnlag"
  (VERIFIED [NO1]). The medicines agency's list of pharmacy licences ("Landets apotek") states no
  licence and names each pharmacist: not used, a licence is asked for
  ([`data-requests/no.md`](../data-requests/no.md)).
- **Health data.** No hosting certification found; the sector code (Normen) binds organisations
  connected to Norsk helsenett, and clinics may require it from suppliers (UNVERIFIED [NO5]).
- **Booking and advertising.** Health Personnel Act §13: "Markedsføring av helse- og
  omsorgstjenester skal være forsvarlig, nøktern og saklig", the second paragraph applying it to
  undertakings that provide health and care services, the third letting the Ministry set rules by
  regulation (VERIFIED on Lovdata 2026-11-27 [NO4]; no regulation on directories found,
  UNVERIFIED negative). The Privacy Appeals Board held in 2018 that GPs cannot refuse to be listed
  on Legelisten.no (UNVERIFIED as read from a summary [NO6]), which supports a factual listing
  without consent under legitimate interest.
- **Market.** Norwegian (Bokmål and Nynorsk), Sámi. Practising in 2024: 28,271 doctors, 4,878
  dentists, 84,897 nurses, 2,685 midwives [EU1]. Helsenorge (public GP booking), Legelisten.no,
  Dr.Dropin [NO7], Kry, Aleris (UNVERIFIED except Dr.Dropin).
- **Verdict.** Open as a directory of establishments of care (#172); people only from a licence
  register (HPR) under an agreement, after a legitimate-interest assessment.

### Poland (PL)

Open since 2026-11-27 (#164), healthcare establishments only.

- **Registry.** The Central Register of Doctors (NIL, doctors and dentists, "not a state
  register") and the nurses' and midwives' register (NIPiP) are lookups (VERIFIED [PL1][PL2];
  NIPiP UNVERIFIED). RPWDL (Centrum e-Zdrowia) is published in two parts: the healthcare entities
  (podmioty lecznicze: 29,884 entities, 37,888 establishments, 57,016 units, 483,821 cells in the
  export of 27 November 2026), and the individual and group practices of doctors, dentists,
  nurses, midwives, physiotherapists and diagnosticians (praktyki zawodowe), whose files carry
  each practitioner's name, licence (PWZ) number, specialty and places of practice (VERIFIED,
  column headers read [PL3][PL9]); salaried staff without a practice are in neither. "Rejestr jest
  jawny" (Act on medical activity, art. 106 ust. 1a, VERIFIED [PL10]). 11,259 entities are sole
  traders (form 0700, 0702), whose name is the person's (VERIFIED).
- **Access and licence.** RPWDL: dataset 728 on dane.gov.pl, **CC BY 4.0** with the reuse
  condition of art. 15 ust. 1 pkt 1 of the Act of 11 August 2021 on open data and the re-use of
  public sector information (inform about the source and the time the information was produced
  and obtained; `license_condition_timestamp`); daily, "stan rejestru aktualny na 24:00
  poprzedniego dnia", a stable link to the current ZIP of CSV files (resource 70070) and an XML
  variant (VERIFIED [PL3][PL11][PL12]). The dataset's metadata also carries a stray
  `license_description` "Other (Public Domain)"; the CC BY 4.0 licence and its condition are
  followed. The NIL register is `restricted` for reuse: terms, CAPTCHA, and a paid agreement for
  organisations (VERIFIED [PL2]). The pharmacy register (Rejestr Aptek, dataset 1925) is CC BY
  4.0, but published only as a legacy binary XLS (its CSV and XML links answer 404) and names
  owners (4,304 active sole traders) and managers with their licence numbers (VERIFIED [PL13]).
- **Places.** TERYT (GUS): TERC, the official file, public and free ("jawny… bezpłatnie
  wszystkim użytkownikom"), CC BY 4.0 on the GUS portal, served by eTERYT's download form; 16
  voivodeships, 380 powiats, 2,479 gminas, `STAN_NA` 2026-01-01 (VERIFIED [PL14]). PRG (GUGiK):
  dataset 726, CC BY 4.0, material of the State Geodetic and Cartographic Resource, free under the
  geodetic law (art. 40a ust. 2 pkt 1 lit. a) with the source stated (art. 40c ust. 3); the
  administrative units' shapefiles, 377 MB (VERIFIED [PL15][PL16]). Postcodes: Poczta Polska's
  list is sold, not open (VERIFIED [PL17]); PRG's address points carry one, unused.
- **Health data.** GDPR and the Act of 10 May 2018 on personal data protection; supervisory
  authority the President of UODO, ul. Stanisława Moniuszki 1A, 00-014 Warszawa (VERIFIED
  [PL18]); no hosting certification found; the national P1 platform concerns providers
  (UNVERIFIED).
- **Legal pages.** A legal notice with the information of art. 5 and terms (regulamin) as art. 8
  of the Act of 18 July 2002 on providing services by electronic means require; a privacy notice
  under GDPR art. 13, 14 and 21; a voluntary accessibility statement following art. 10 of the Act
  of 4 April 2019 on digital accessibility, which binds public bodies only (art. 2, VERIFIED
  [PL19]).
- **Booking and advertising.** Act on medical activity art. 14 ust. 1: a provider makes public
  the scope and kinds of its services, and "Treść i forma tych informacji nie mogą mieć cech
  reklamy" (VERIFIED on the consolidated text, Dz.U. 2026 poz. 156 [PL10]; no delegation to a
  regulation). It binds providers about their own information; Apercura is not a provider, prints
  the same facts in the same form for every establishment, takes no payment for listing or
  ranking and orders listings neutrally, so its factual pages fit (reasoning, a Polish lawyer to
  confirm). Pharmacies: advertising is banned, "Nie stanowi reklamy informacja o lokalizacji i
  godzinach pracy apteki" (Prawo farmaceutyczne art. 94a ust. 1, VERIFIED [PL20]). The 2025 Code
  of Medical Ethics allows information on services (UNVERIFIED [PL5]). On listing without consent,
  the Supreme Administrative Court (III OSK 1052/21, 26 January 2022) set aside the judgment of
  the Warsaw Administrative Court (II SA/Wa 2013/17) that had upheld the DPA's refusal to order
  ZnanyLekarz to delete a doctor's profile, and sent the case back (VERIFIED [PL21]; the
  balancing it asks for, secondary [PL6]); a regional chamber published a template complaint to
  the DPA in 2025 [PL7].
- **Market.** Polish. About 143,600 doctors and 37,000 dentists working with patients (2025,
  UNVERIFIED); 243,596 nurses and 30,682 midwives employed (31 December 2025, VERIFIED [PL8]).
  ZnanyLekarz (Docplanner's home market), the state e-registration, private chains.
- **Decision (#164, 2026-11-27).** The healthcare establishments of the healthcare entities are
  listed; the professional practices are not, until a Polish legal opinion on listing named
  practitioners without consent after III OSK 1052/21, as the roadmap asked. A sole trader who
  runs an establishment is never named from the entity's name, and the establishment's name drops
  theirs where the register gives it (docs/data-import.md, "Poland"). Pharmacies follow once the
  register is readable and its owners' and managers' columns are left out.
- **Verdict.** Open with establishment pages (34,072 at the export of 27 November 2026);
  practitioners' pages wait for the legal opinion; booking off. Docplanner's home market: hard
  competition.

### Portugal (PT)

- **Registry.** Each order publishes its register: Ordem dos Médicos, Ordem dos Médicos
  Dentistas, Ordem dos Enfermeiros (midwives are specialist nurses) [PT1][PT2][PT3]. Lei 2/2013
  art. 23 obliges every professional order to publish an updated online register with name,
  professional address, cédula number, title and specialties (VERIFIED [PT4]). The ERS keeps a
  public register of every health establishment, searchable only (UNVERIFIED [PT5]).
  `searchable website only`: no download or reuse licence found for the orders or the ERS
  (UNVERIFIED as a negative); the SNS transparency portal and dados.gov.pt hold statistics only
  (VERIFIED [PT6]).
- **Health data.** No hosting certification found; GDPR with Lei 58/2019 (UNVERIFIED).
- **Booking and advertising.** Medical Code of Ethics art. 56: advertising "meramente
  informativa", discreet, no promise of results (VERIFIED [PT7]); the health-advertising regime
  of DL 238/2015 is enforced by the ERS (UNVERIFIED [PT8]).
- **Market.** Portuguese. About 65,000 doctors, 13,900 dentists, 87,800 nurses (2025,
  UNVERIFIED, national figures via the orders and press [PT9]). Doctoralia (Docplanner),
  hospital-group apps (CUF, Luz, Lusíadas); no Doctolib found.
- **Verdict.** Claimed pages only, though the statutory public registers make verification
  easy. Whether the public-sector information law (Lei 26/2016) opens their reuse is UNVERIFIED.

### Romania (RO)

- **Registry.** The College of Physicians runs the Registrul unic al medicilor (name, county
  college, status, specialty), searchable only; dentists have a separate college (UNVERIFIED
  [RO1]). The insurance fund (CNAS) publishes "Lista furnizori", XLS lists of contracted providers
  by type (March 2026): contract number, provider fiscal code and name, county; no address or
  specialty (VERIFIED [RO2]).
- **Access and licence.** `open data`: the dataset's metadata carries **CC BY 4.0** (VERIFIED
  [RO3]), though the dataset page shows none. Practice names often contain the doctor's name.
- **Health data.** No hosting certification found (UNVERIFIED).
- **Booking and advertising.** The College's new code of ethics (in force 1 January 2026,
  updated April 2026): advertising strictly informative, no misleading or disparaging comparison
  (document VERIFIED [RO4]; article content UNVERIFIED).
- **Market.** Romanian. 64,127 doctors, 18,298 dentists (2020) [EU1]. Docbook.ro, ROmedic, the
  in-house booking of Regina Maria and MedLife.
- **Verdict.** Directory from open data in name only: without addresses or specialties the CNAS
  lists cannot make a useful page. Claimed pages only in practice.

### Slovakia (SK)

- **Registry.** The Slovak Medical Chamber's register is a lookup (UNVERIFIED [SK1]); the NCZI
  register of health workers has no public access (VERIFIED [SK2]). The supervisory authority
  (ÚDZS) publishes an XLSX of provider codes with name and address, "© 2026 ÚDZS", no licence
  (VERIFIED [SK3]).
- **Health data.** No hosting certification found (UNVERIFIED).
- **Booking and advertising.** Act 578/2004, annex 4: advertising of a private practice must be
  "pravdivá, striedma, výsostne informujúca" (UNVERIFIED, secondary copy of the law).
- **Market.** Slovak. 20,026 doctors, 2,887 dentists, 31,604 nurses, 1,773 midwives (2020) [EU1].
  TopDoktor.sk, the state insurer's booking.
- **Verdict.** Claimed pages only.

### Slovenia (SI)

Open since 2026-11-27 (#167) at `/si`: doctors' pages from the health insurer's lists of personal
doctors.

- **Registry.** The Medical Chamber's search of doctors and dentists forbids republication
  without prior permission (VERIFIED [SI1][SI2]): not used. The health insurer (Zavod za
  zdravstveno zavarovanje Slovenije, ZZZS) publishes the named lists of the doctors who can be a
  personal doctor ("Poimenski seznami zdravnikov, ki so lahko osebni zdravniki"): general
  practices with children's and school dispensaries, gynaecologists, dentists, with whether each
  still accepts new patients, every day, and a fourth list of additional practices for adults
  without a personal doctor that names no doctor (VERIFIED 2026-11-27 [SI3][SI4]). Its monthly
  detailed lists of active doctors on partner.zzzs.si are CC BY 4.0 too, but built around patient
  counts per doctor (VERIFIED [SI13]). NIJZ publishes no open register of providers (RIZDDZ) on
  podatki.gov.si (searched 2026-11-27; UNVERIFIED as a negative).
- **Access and licence.** ZZZS lists: `open data`, **CC BY 4.0** on podatki.gov.si ("Priznanje
  avtorstva (CC BY 4.0)", conditions "Ni omejitev (navedba vira)", free of charge) (VERIFIED
  [SI3]). The portal names an HTML page (the old `ioz_izvajalci` address redirects to the
  insurer's page on choosing a personal doctor), which links four XLSX workbooks published every
  day at addresses that change with each publication: TYPO3 download links with a `stdatoteke` id
  and a `cHash`, which the site's robots.txt disallows (`Disallow: /*cHash`, an SEO rule) (VERIFIED
  [SI4]). The market study's "HTML page only, fields not confirmed" is corrected: the
  machine-readable form is XLSX, and the fields are confirmed: ZZZS regional unit, provider number
  and name, street, postcode and post office, doctor number, name, ZZZS activity code and name,
  whether the doctor still accepts insured persons (`DA`/`NE`), employment share, registered
  patients or capitation figures, trainee, and (general practice list) the obligation to accept
  newborns. Each sheet states its data date; ZZZS states that the providers report the doctors'
  data and answer for its accuracy, and that the data are valid when the file is prepared
  (VERIFIED [SI4]). Only the doctor number, name, provider, address, activity and acceptance are
  read.
- **Places.** GURS's Register of Spatial Units through its web feature service, CC BY 4.0,
  credited with GURS's name, the kind of data and the date of its state (VERIFIED [SI5]): 12
  statistical regions, 212 municipalities, 6,035 settlements, 466 postal areas and about 10,500
  streets. The lists give no coordinates.
- **Health data.** The GDPR and the ZVOP-2 (Uradni list RS 163/22, in force 2023-01-26): its
  article 4(1) covers private bodies with an establishment in Slovenia, which a publisher
  established in France probably does not have (UNVERIFIED, for a lawyer: the privacy notice cites
  the ZVOP-2 "where its article 4 makes it apply"); articles 86 (public registers used for their
  purpose), 73 and 92 (public work contact data); no article on directories (VERIFIED [SI7]). The
  Information Commissioner (Informacijski pooblaščenec, Dunajska cesta 22, 1000 Ljubljana) [SI8]:
  opinion 07121-1/2021/526 (17.3.2021): doctors' names, specialisation and place of work are
  public, and republishing them is "načeloma ni problema"; 07121-1/2022/1036 (3.10.2022):
  private-sector doctors need a documented article 6(1)(f) balancing; 0712-1/2019/21 (on
  zdravniki.org); 07121-1/2026/1009: data from public sources still need an article 14 notice
  (VERIFIED). A 2008 opinion on the Chamber publishing its register: UNVERIFIED. The ZPacP (art. 1)
  and the ZZPPZ (arts. 1 and 3) cover providers and health databases, not a directory that handles
  no patient data, as Slovenia has no booking (VERIFIED [SI11]). No hosting certification
  (VERIFIED: none found).
- **Legal pages.** A legal notice under the ZEPT art. 5 (easy, direct and permanent access to the
  provider's name and seat, e-mail, registration and tax numbers, authorisations and supervisory
  authority, a regulated profession's details); under its art. 12(2) a provider established in
  France is bound through French law (VERIFIED [SI6]). A privacy notice under the GDPR (art. 13, 14
  and 21) with the legitimate-interest assessment for named doctors; terms; a voluntary
  accessibility statement: the ZDSMA (art. 2) binds the public sector only, and the ZDPSI
  (Uradni list RS 14/23, from 2025-06-28) covers listed services provided in an economic activity,
  e-commerce meaning the conclusion of consumer contracts, microenterprises exempt; a free
  directory without booking is outside both (VERIFIED [SI9]). All in Slovenian, with the data page.
- **Advertising.** The ZZDej art. 75.a defines health advertising by its aim of promoting or
  marketing services and bans misleading, indecent or unlawfully comparative advertising (fines:
  art. 88); the ZZdrS has no advertising article; the Kodeks zdravniške etike (2016), arts. 60, 62
  and 63: no self-glorification, no sensationalism, only professionally correct information; the
  ZMed-1 art. 57 bans advertising health services in the media, its art. 3(31) defining
  advertising as paid content or self-promotion; the ZVPot-1 art. 36 (VERIFIED [SI10]). A factual,
  unpaid page built from ZZZS data is therefore not advertising, while a doctor's own text on a
  claimed page could be and must avoid comparisons, superlatives, promises, testimonials, prices,
  the promotion of medicines and sensational claims; the terms say so (UNVERIFIED: an inference,
  for a lawyer to confirm).
- **Market.** Slovenian (Italian and Hungarian locally). 6,944 doctors, 1,570 dentists, 22,002
  nurses, 308 midwives (2020) [EU1]. Competitors not researched. The pages: `/si` (`sl-SI`),
  indexed (section 2). Pharmacies: the Ministry of Health's "Seznam izvajalcev lekarniške
  dejavnosti na primarni ravni" (CC BY 4.0, XLSX, 355 pharmacies with names and addresses, updated
  as needed, last on 2026-06-01) (VERIFIED [SI12]), not imported: Slovenia's pages and URLs are
  doctors' (`/si/zdravnik/…`), and a facility in a market of people needs its own page handling.
- **Verdict.** Open with doctors' pages for the personal doctors of the four kinds (2,881 doctors
  at 792 practices, files of 27 November 2026); other specialists wait for the Medical Chamber's
  permission, pharmacies for a follow-up. No booking.

### Spain (ES)

Open since 2026-11-26 (#148) at `/es`: centre pages from the General Register of health centres,
services and establishments, in Spanish.

- **Registry.** REPS, the state register of health professionals (RD 640/2014), has public fields
  but no bulk access or reuse licence (UNVERIFIED as a negative [ES1][ES4]); the colegios publish
  their registers of members for consultation (Ley 2/1974 [ES5]). REGCESS, the General Register of
  health centres, services and establishments (RD 1277/2003), publishes monthly extracts per
  listing at `https://regcesslm.sanidad.gob.es/recesAdminWeb/lm/GetExcelListadoMensual?tipoListado={C1|C2|C3|E}`
  (VERIFIED [ES9], 2026-11-26): C1 929 hospitals, C2 119,577 centres without inpatient care, C3
  services within centres, E 40,541 establishments (22,389 pharmacies). A row has the normalised
  centre code (CCN), the regional code, name, type (RD 1277/2003 annex), community, province and
  INE municipality codes, address, postcode, e-mail, fax, phone, web address, functional
  dependency and its public or private group, authorisation dates and, for C1 and C2, the care
  units offered (`U.1`…`U.900`). No coordinates. Many practices and pharmacies carry the
  professional's name.
- **Access and licence.** `open data` by the Ministry's legal notice: reuse of the Ministry's
  content is authorised, for commercial or non-commercial purposes, under Ley 37/2007, provided
  the source is cited, the date of the last update is given and the data are not distorted
  (VERIFIED [ES2][ES3]). Places: the IGN's OGC API Features (`administrativeunit`,
  `nuc`), CC BY 4.0 under Orden FOM/2807/2015, attributed "Obra derivada de <producto> <fecha>
  CC-BY 4.0 ign.es" (VERIFIED [ES10][ES11]); the CNIG's download centre needs a browser session.
  OpenStreetMap is not used (ODbL share-alike).
- **Health data hosting.** No certification: GDPR and the LOPDGDD (Ley Orgánica 3/2018); Ley
  41/2002 governs clinical records; the ENS (RD 311/2022) binds the public sector and its
  providers [ES6]. No HDS-like scheme found (UNVERIFIED as a negative). Supervisory authority: the
  Agencia Española de Protección de Datos (AEPD).
- **Personal data.** The data of sole traders and liberal professionals, processed in that
  capacity, fall under LOPDGDD art. 19.3 (VERIFIED [ES12]); the pages show the centre's
  registered name and professional fields only, with the article 14 information and removal on
  objection. E-mail, fax and web address are not stored.
- **Formats.** `Europe/Madrid` and `Atlantic/Canary` (provinces 35 and 38); phone `+34` and nine
  digits, printed `965 950 865` [ES7]; postcode five digits, the province's INE code first [ES8].
- **Legal pages.** Aviso legal under LSSI (Ley 34/2002) art. 10; privacy notice under GDPR art.
  13, 14 and 21 and the LOPDGDD; terms; RD 1112/2018 on accessibility binds public sector bodies:
  the statement is voluntary.
- **Market.** Spanish (Catalan, Galician and Basque are co-official in their communities: later
  `/es-ca`, `/es-gl`, `/es-eu`). Doctoralia (Docplanner), Top Doctors.
- **Verdict.** Directory of centres from open data: 114,795 centres from the extracts of 26
  November 2026 (real-data dry run on a fresh database: hospitals 881, health centres 3,097,
  local surgeries 9,920, doctors' practices 12,366, other professionals' practices 30,410,
  polyclinics 12,892, dental clinics 22,840, pharmacies 22,389; all placed in their municipality
  by INE code, 114,778 at its point; 28,159 listing pages, 8,178 indexable); claimed pages for
  centres; booking later.

### Sweden (SE)

- **Open since 2026-11-27 (#175), pharmacies and Västra Götaland's health centres.**
  Läkemedelsverket's "Apotek med tillstånd" (CC BY 4.0, updated daily, VERIFIED [SE9]): every
  licensed community pharmacy open to the public, keyed by its GLN, with its licence case number
  and date and its holder (a company); Västra Götalandsregionen's "Vårdcentraler i Vårdval
  vårdcentral" (CC0 1.0, VERIFIED [SE10]), keyed by HSA-id, at their own points; SCB's counties and
  municipalities (CC0 1.0, VERIFIED [SE11]). Legal notice under lag (2002:562) om elektronisk
  handel 8 § (VERIFIED [SE12]); privacy notice under the GDPR and dataskyddslagen (2018:218), IMY
  as the authority; the accessibility statement is voluntary (lag 2018:1937 om tillgänglighet
  till digital offentlig service, 4 § and 13 §, binds public actors and publicly financed private
  ones, VERIFIED [SE13]; DIGG supervises). Data and requests:
  [`docs/data-import.md`](../data-import.md#sweden),
  [`docs/data-requests/se.md`](../data-requests/se.md).
- **Registry.** HOSP (Socialstyrelsen) holds licensed health staff. `restricted`: no public
  search; employers request extracts by email (VERIFIED [SE1][SE2]). The SOU 2021:39 proposal for
  a public search and API was not found to be enacted (UNVERIFIED [SE3]). The IVO register of
  care providers and the HSA directory behind 1177 are not open data (UNVERIFIED [SE4]). The other
  twenty regions publish no open list of health centres (searched on dataportal.se 2026-11-27;
  Region Blekinge's catalogue lists some under CC BY 4.0 but its portal did not resolve):
  [`data-requests/se.md`](../data-requests/se.md) asks them.
- **Health data.** No hosting certification found (UNVERIFIED as a negative); the Patient Data
  Act binds the care provider, the platform is its processor. IMY fined two pharmacies SEK 37m
  and 8m for sending health-related data to Meta through a tracking pixel (VERIFIED [SE5]):
  booking pages must carry no third-party trackers, which Apercura already guarantees.
- **Booking and advertising.** The Swedish Medical Association's marketing rules: factual,
  correct and dignified; no claim of greater skill than colleagues (VERIFIED [SE6]). The Marketing
  Act (marknadsföringslagen, 2008:486, 5 § and 10 §) asks for good marketing practice and no
  misleading statement, and the Medicinal Products Act (läkemedelslagen, 2015:315, ch. 12, 1 § and
  2 §) bans marketing prescription medicines to the public and asks that marketing of medicines be
  "aktuell, saklig och balanserad" (VERIFIED on riksdagen.se 2026-11-27 [SE14][SE15]). The pages
  print the registers' facts, name no medicine and rank nothing; no rule specific to directories
  was found (UNVERIFIED negative).
- **Market.** Swedish. Practising in 2024: 49,240 doctors, 8,465 dentists, 117,720 nurses,
  8,359 midwives [EU1]. 1177 (Inera, regions), Kry (buying Min Doktor, November 2026 [SE7]),
  Doktor.se; five firms held about 90% of digital visits in 2022 [SE8].
- **Verdict.** Open as a directory of pharmacies and, in Västra Götaland, health centres (#175);
  other regions as they open their lists; people only from HOSP, which is closed.

### Switzerland (CH)

Open since 2026-11-27 (#154), facilities only.

- **Registries.** MedReg (doctors, dentists, pharmacists, chiropractors, vets), PsyReg and GesReg
  are public lookups; bulk access needs an agreement with the FOPH under the Registerverordnung
  MedBG art. 11 (VERIFIED, [`ch-medreg.md`](../data-requests/ch-medreg.md)). The FMH's
  doctorfmh.ch and Refdata's GLN partner data are private, with no reuse terms for a directory
  (VERIFIED). The FOPH's "Kennzahlen der Schweizer Spitäler 2023" (opendata.swiss, "Open use.
  Must provide the source."; the workbook: "Auszugsweiser Abdruck unter Quellenangabe
  gestattet") list 275 hospitals and 596 sites; the 2024 edition requires permission for
  commercial use (VERIFIED 2026-11-27). Cantonal open lists: Bern (hospitals, homes), Geneva
  (hospitals and clinics, EMS, vaccinating pharmacies; SITG level A, commercial use allowed),
  Basel-Landschaft (pharmacies, homes), Basel-Stadt (hospitals, homes, CC BY 4.0), Zürich (homes),
  Jura (institutions), all "Open use" on opendata.swiss with a credit (VERIFIED 2026-11-27); no
  canton-wide open list of pharmacies or nursing homes was found for the other twenty cantons.
- **Places.** The BFS commune register (26 cantons, 144 districts with 9 stand-ins, 2,110
  communes) and swisstopo's postcode directory (5,717 locality parts with a point), "Open use"
  (VERIFIED).
- **Health data.** The revised Federal Act on Data Protection (nFADP, in force 2023-09-01) and its
  ordinance: health data are sensitive (art. 5 lit. c); disclosure abroad to states with adequate
  protection (art. 16, Annex 1 DSV: the EEA states are adequate); duty to inform (art. 19–20);
  right to object (art. 30 para. 2 lit. b, art. 32); a Swiss representative where a private
  controller abroad processes Swiss residents' data regularly and on a large scale (art. 14,
  UNVERIFIED whether it applies); no hosting certification (VERIFIED: none found).
- **Legal pages.** Impressum (UWG art. 3 para. 1 lit. s, Swiss practice; whether it binds a free
  directory is UNVERIFIED), privacy notice under the nFADP (and the GDPR for visitors in the EU),
  terms, a voluntary accessibility statement (the BehiG binds the Confederation), in German,
  French and Italian.
- **Market.** German (about 60% of the population), French, Italian. The pages: `/ch` (`de-CH`),
  `/ch-fr` (`fr-CH`), `/ch-it` (`it-CH`), each indexed (section 2). Hospitals and clinics in every
  canton; nursing homes in Zürich, Bern, Geneva, Basel-Stadt, Basel-Landschaft and Jura;
  pharmacies in Basel-Landschaft and (those that vaccinate) Geneva.
- **Verdict.** Open with facility pages; practitioners' pages wait for the FOPH's answer on
  MedReg. Booking needs the DPIA and the professional-secrecy contract (StGB art. 321).

## Launch order

Ranked on four criteria: data (is there a register we may republish), legal friction (hosting,
booking and listing rules), size (practitioners, value of the market) and competition. "Directory"
means pages generated from open data, as in France; "claimed pages" means a practitioner creates
and verifies their own page, nobody else is listed (`features.directory = false`); "not yet" means
a blocker must be lifted first. Every market still goes through the checklist of section 4.

Paths follow section 2: `/{market}` for a market's main language, `/{market}-{language}` for its
other languages, and only `-{language}` segments where a market has no main language. Malta (`/mt-en`) and
Luxembourg (`/lu-fr`, `/lu-de`) are proposals: each has two or three official languages, and the
English or French interface comes first. Ireland, planned as `/ie-en`, opened under `/ie` (section 2). Finland's Swedish pages go under `/fi-sv`.

| #   | Market         | Path                         | Fast path                                                 | Why                                                                                                                                                                                                                                                                             |
| --- | -------------- | ---------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Austria        | `/at`                        | Open: directory (Vienna, Styria, Salzburg)                | Opened 2026-11-25 (#107): CC BY 4.0 lists of Vienna, Styria and Salzburg (10,377 doctors and dentists); German interface; no hosting certification; booking off                                                                                                                 |
| 2   | Switzerland    | `/ch`, `/ch-fr`, `/ch-it`    | Open: facilities (hospitals, homes, pharmacies)           | Opened 2026-11-27 (#154): the FOPH's hospital figures 2023 and six cantons' open lists (1,414 facilities), BFS places, German, French and Italian pages; no practitioner (MedReg bulk needs a FOPH agreement); booking off                                                      |
| 3   | Czechia        | `/cz`                        | Open: directory (places of care)                          | Opened 2026-11-26 (#131): NRPZS places of care under CC BY 4.0 (33,173 facilities), RÚIAN places; Czech interface; booking off                                                                                                                                                  |
| 4   | United Kingdom | `/gb`                        | Open: practice pages (four nations)                       | Opened 2026-11-25 (#125): NHS ODS, PHS and BSO practice lists under the OGL (about 31,000 practices), located by postcode; no clinician (GMC licence); booking off                                                                                                              |
| 5   | Poland         | `/pl`                        | Open: facilities (healthcare establishments)              | Opened 2026-11-27 (#164): RPWDL's healthcare entities under CC BY 4.0 (34,072 establishments), TERYT places, PRG points; Polish interface; no practitioner (practices wait for a legal opinion on III OSK 1052/21); booking off                                                 |
| 6   | Belgium        | `/be-fr`, `/be-nl`, `/be-de` | Claimed pages, opt-in only                                | DPA decision 149/2023 forbids listing practitioners who did not opt in; French exists, Dutch and German needed; Doctoranytime                                                                                                                                                   |
| 7   | Luxembourg     | `/lu-fr`, `/lu-de`           | Claimed pages                                             | French exists; the Collège médical charter bans paid priority, which fits; small; Doctena                                                                                                                                                                                       |
| 8   | Spain          | `/es`                        | Open: directory (health centres)                          | Opened 2026-11-26 (#148): REGCESS centres (114,795) reusable under the Ministry's notice, IGN places; Spanish interface; no coordinates (city precision); booking off                                                                                                           |
| 9   | Italy          | `/it`                        | Open: directory (pharmacies, parapharmacies, hospitals)   | Opened 2026-11-26 (#150): Ministry of Health lists under IODL 2.0 (29,002 places), ISTAT places; city precision; no health worker (Albo Unico); booking off                                                                                                                     |
| 10  | Ireland        | `/ie`                        | Open: facilities (pharmacies, nursing homes, hospitals)   | Opened 2026-11-27 (#171): the PSI's pharmacies and HIQA's nursing homes (re-use under PSI conditions), the HSE's 2020 hospitals and health centres (CC BY 4.0), CSO towns; city precision for registers without points; no practitioner (Medical Council register); booking off |
| 11  | Malta          | `/mt-en`                     | Directory, once confirmed                                 | Doctor and dentist registers under CC BY 4.0 in the national catalogue; English; tiny; many addresses withheld                                                                                                                                                                  |
| 12  | Germany        | `/de`                        | Open: facility pages (hospitals, pharmacies)              | Opened 2026-11-26 (#152): Destatis's directory of hospitals and clinics (3,823) and Thuringia's and Brandenburg's pharmacies (989), GV-ISys places; no practitioner register; booking off (C5, GeDIG)                                                                           |
| 13  | Estonia        | `/ee`                        | Open: providers and pharmacies                            | Opened 2026-11-27 (#165): the Health Board's providers under CC BY-NC-SA 3.0 (1,518) and Ravimiamet's pharmacies (469), EHAK places, ADS points; Estonian interface; licence numbers on every page; no health worker                                                            |
| 14  | Slovenia       | `/si`                        | Open: directory (personal doctors)                        | Opened 2026-11-27 (#167): ZZZS lists of personal doctors under CC BY 4.0 (2,881 doctors and dentists, with whether each takes new patients), GURS places; Slovenian interface; booking off                                                                                      |
| 15  | Latvia         | `/lv`                        | Open: partial directory (GP practices, pharmacies)        | Opened 2026-11-27 (#166): NVD GP practices with the Ministry of the Interior's addresses (293, naming their GPs), hospitals (66) and the State Agency of Medicines' pharmacies (814), all CC0; VZD places; Latvian; booking off                                                 |
| 16  | Netherlands    | `/nl`                        | Claimed pages                                             | BIG register is CC0 but one lookup at a time and without addresses; courts accepted ZorgkaartNederland; needs Dutch                                                                                                                                                             |
| 17  | Portugal       | `/pt`                        | Claimed pages                                             | Registers public by law (Lei 2/2013) but no licence; Doctoralia                                                                                                                                                                                                                 |
| 18  | Croatia        | `/hr`                        | Claimed pages, directory if HZZO confirms                 | HZZO lists have names and addresses, licence "not specified"                                                                                                                                                                                                                    |
| 19  | Cyprus         | `/cy`                        | Open: pharmacies, state hospitals, health centres         | Opened 2026-11-27 (#174): the Ministry of Health's lists on data.gov.cy under CC BY 4.0 (699: pharmacies, state hospitals and health centres), CYSTAT's census places; Greek interface; doctors' register unlicensed                                                            |
| 20  | Romania        | `/ro`                        | Claimed pages                                             | CNAS lists are CC BY 4.0 but carry no address or specialty                                                                                                                                                                                                                      |
| 21  | Denmark        | `/dk`                        | Claimed pages                                             | Lookup-only register; SOR could seed establishments                                                                                                                                                                                                                             |
| 22  | Norway         | `/no`                        | Open: establishments of care                              | Opened 2026-11-27 (#172): Enhetsregisteret's establishments under NLOD 2.0 (5,821: hospitals, GP offices, dental clinics, nursing homes, pharmacies), Kartverket's places and addresses; Bokmål interface; HPR still gated                                                      |
| 23  | Sweden         | `/se`                        | Open: pharmacies, health centres (Västra Götaland)        | Opened 2026-11-27 (#175): Läkemedelsverket's licensed pharmacies under CC BY 4.0 (every county) and Västra Götaland's health centres under CC0 1.0, SCB places; pharmacies at city precision; no hospital or practitioner list (HOSP, IVO and HSA are not open); booking off    |
| 24  | Lithuania      | `/lt`                        | Open: facility pages (licensed institutions)              | Opened 2026-11-27 (#170): VASPVT's licence register under CC BY 4.0 (6,208 activity addresses), Address Register places; Lithuanian interface; city precision; no health worker or pharmacy                                                                                     |
| 25  | Slovakia       | `/sk`                        | Claimed pages                                             | No licensed register                                                                                                                                                                                                                                                            |
| 26  | Hungary        | `/hu`                        | Claimed pages                                             | Lookup-only register                                                                                                                                                                                                                                                            |
| 27  | Bulgaria       | `/bg`                        | Claimed pages                                             | Lookup-only registers                                                                                                                                                                                                                                                           |
| 28  | Iceland        | `/is`                        | Claimed pages                                             | Lookup-only register; very small                                                                                                                                                                                                                                                |
| 29  | Liechtenstein  | `/li`                        | Claimed pages, with Switzerland                           | About 130 doctors                                                                                                                                                                                                                                                               |
| 30  | Finland        | `/fi`, `/fi-sv`              | Directory of public health service locations (open, #173) | The Finnish Service Catalogue (PTV) under CC0; booking waits for the Kanta question (Act 784/2021); Swedish later                                                                                                                                                               |
| 31  | Greece         | `/gr`                        | Not yet                                                   | Law 3418/2005 art. 17 bans indirect advertising; needs a Greek legal opinion first                                                                                                                                                                                              |

The realistic fast path:

- **Directory from open data:** Austria (open: Vienna, Styria, Salzburg), Czechia (open), Latvia
  (open: GP practices naming their GPs, pharmacies), Poland's practices (once a legal opinion
  allows them), then the small markets whose licence must be confirmed in writing (Malta, Estonia)
  or that cover one segment (Slovenia, open: the insurer's personal doctors). Each needs a
  legitimate-interest assessment and an art. 14 notice: an open licence settles reuse rights, not
  the GDPR.
- **Practice pages from open data:** the United Kingdom (open: GP practices, dental practices,
  pharmacies; clinicians need a GMC licence), Spain (open: every authorised centre of
  REGCESS's hospitals, health centres, practices, dental clinics and pharmacies; professionals
  need REPS or the colegios), Italy (open: pharmacies, parapharmacies, hospitals and
  accredited clinics of the Ministry of Health's lists; doctors need the Albo Unico) and Germany
  (open: the statistical offices' hospitals and clinics, two Länder's pharmacies; doctors need
  the KBV's or the chambers' licence), Switzerland (open: the FOPH's hospital sites and the
  cantons' nursing homes and pharmacies; professionals need MedReg), Poland (open: RPWDL's
  healthcare establishments; the practices of RPWDL wait for a legal opinion on III OSK 1052/21),
  Norway (open: the establishments of the register of legal entities; professionals need HPR),
  Ireland (open: the PSI's pharmacies, HIQA's nursing homes, the HSE's hospitals and health
  centres; doctors need the Medical Council's register),
  Finland (open: the public health service locations of the Finnish Service Catalogue;
  pharmacies and private providers have no open list), Lithuania (open: every activity
  address of a licensed institution; individuals have no open register), Cyprus (open: the
  Ministry of Health's lists of pharmacies, state hospitals and health centres; doctors need the
  Medical Council's register under a licence) and Sweden (open: Läkemedelsverket's licensed
  pharmacies, Västra Götaland's health centres; the other regions' health centres need their lists
  opened, professionals HOSP).
- **Claimed pages only:** Belgium
  (opt-in, never listed by default), Luxembourg, then the other markets. A
  claimed-pages market is worth opening only where Apercura can reach practitioners, so the ones
  with an existing interface language come first.
- **Not yet:** Greece; booking in Germany and in Finland.

Across all of them no HDS-like certification was found outside France; that is an absence of
evidence, not a confirmed negative. Hosting in the EEA (or Switzerland for Swiss data) under GDPR
or nFADP, with the existing application-level encryption, is the baseline everywhere except
Germany's §393 SGB V.

## Consequences

- The interface reads in five languages; France's pages are indexed in French
  (`/fr`), Austria's in German (`/at`), the UK's in British English (`/gb`),
  Czechia's in Czech (`/cz`), Spain's in Spanish (`/es`), Italy's in Italian (`/it`),
  Germany's in German (`/de`), Switzerland's in German, French and Italian (`/ch`, `/ch-fr`,
  `/ch-it`), Estonia's in Estonian (`/ee`), Poland's in Polish (`/pl`), Norway's in Norwegian Bokmål (`/no`), Ireland's in English (`/ie`) and Latvia's in Latvian (`/lv`), Finland's in Finnish
  (`/fi`), Lithuania's in Lithuanian (`/lt`) and Slovenia's in Slovenian (`/si`), every interface translation stays `noindex`.
- New markets plug in through an adapter, an ETL source and a path segment on
  apercura.org, without changing the French code paths.
- Only a handful of markets publish practitioners under a reuse licence
  (Austria's Vienna and Styria lists, Czechia, Poland, and partially Malta,
  Estonia, Slovenia, open with its personal doctors, and Latvia, whose GPs are named on their practices' pages); the United Kingdom, Spain, Italy, Germany, Switzerland, Ireland, and
  Poland (whose practices wait for a legal opinion), Finland (a national service catalogue) and
  Lithuania publish
  practices, centres, places and facilities, not people. Everywhere else a market opens
  with claimed pages only,
  so `features.directory` must be false by default for a new adapter.
- Belgium's DPA forbids listing practitioners who have not opted in: the
  French "every practitioner is listed" principle does not travel everywhere,
  and the adapter must be able to switch it off.
- Booking flows differ: Italy needs an explicit consent step for booking data,
  Estonia a licence number on every provider page, Finland a registered system
  connected to Kanta (booking only: Finland's directory opened without it).
- Health-data hosting must be re-contracted per market: an HDS contract covers
  France, not Germany's C5 requirement; no other market studied has an HDS-like
  certification, as far as could be found.

## See also

- [Medical systems by country](../reference/medical-systems-by-country.md): earlier, unverified research on France, Belgium, Germany and Switzerland.

## Sources

First round (November 2026):

1. KBV, Bundesarztregister: <https://www.kbv.de/html/bundesarztregister.php>; <https://www.verwaltungsdaten-informationsplattform.de/register/214>
2. KBV, SDAV record description: <https://update.kbv.de/ita-update/Stammdateien/SDAV/KBV_ITA_VGEX_Datensatzbeschreibung_SDAV.pdf>
3. 116117 search export, community tool: <https://github.com/nikbckm/116117-Arztsuche-Psychotherapie-Exporter>
4. DAK Arztsuche terms: <https://arztsuche.dak.de/dakarztsuche/nutzungsbedingungen.htm>
5. Lebenslange Arztnummer: <https://de.wikipedia.org/wiki/Lebenslange_Arztnummer>
6. KBV, BSNR: <https://hub.kbv.de/spaces/BASE1X0/pages/378506673/12.1.4+BSNR>; <https://reimbursement.institute/glossar/bsnr-betriebsstaettennummer/>
7. eFN: <https://flexikon.doccheck.com/de/Einheitliche_Fortbildungsnummer>; <https://aerztekammer-hamburg.org/wp-content/uploads/2025/04/FAQ_EFN.pdf>
8. §393 SGB V: <https://dejure.org/gesetze/SGB_V/393.html>
9. C5 and §393 SGB V: <https://www.srd-rechtsanwaelte.de/blog/cloud-nutzung-im-gesundheitswesen-393-sgb-v-und-c5-testat>
10. DDG replaces TMG: <https://www.ihk.de/osnabrueck/recht-und-fair-play/aktuelles/ddg-ersetzt-das-tmg-6220008>
11. Bundesärztekammer, advertising: <https://www.bundesaerztekammer.de/fileadmin/user_upload/_old-files/downloads/pdf-Ordner/Recht/Arzt-Werbung-Oeffentlichkeit.pdf>
12. HWG, product-related advertising: <https://www.omsels.info/die-verbote-oder-was-darf-ich-nicht/2-heilmittelwerbegesetz/bproduktbezogene-werbung>
13. BGH VI ZR 30/17 (Jameda): <https://www.aufrecht.de/beitraege-unserer-anwaelte/medienrecht/bgh-jameda-2018-urteil-analyse>
14. GMC, download the registers: <https://www.gmc-uk.org/registration-and-licensing/our-registers/download-our-registers>
15. GDC privacy notice: <https://www.gdc-uk.org/privacynotice>
16. NMC register search: <https://www.nmc.org.uk/registration/search-the-register/>
17. NHS ODS: <https://digital.nhs.uk/services/organisation-data-service>
18. NHS ODS GP data: <https://digital.nhs.uk/services/organisation-data-service/data-search-and-export/csv-downloads/gp-and-gp-practice-related-data>
19. NHS online connection agreement: <https://digital.nhs.uk/developer/guides-and-documentation/online-connection-agreement>
20. GMC number format: <https://www.datadictionary.wales.nhs.uk/WordDocuments/gmcregistrationnumber.htm>; <https://www.gponline.com/gmc-hand-physician-associates-seven-digit-reference-number-prefix/article/1851661>
21. NMC PIN format: <https://medicwatch.co.uk/check/nmc-pin>
22. ODS branch codes: <https://pcse.england.nhs.uk/help/practice-mergers-and-closures/general-queries>; <https://www.odsdatasearchandexport.nhs.uk/referenceDataCatalogue/GP-Branch-Surgeries_571324074.html>
23. Data (Use and Access) Act 2025 commencement: <https://privacymatters.dlapiper.com/2026/02/uk-commencement-of-the-data-protection-provisions-in-the-data-use-and-access-act/>
24. DSPT overview: <https://dsptready.co.uk/blog/nhs-data-security-protection-toolkit/>
25. SI 2015/17: <https://www.legislation.gov.uk/uksi/2015/17>
26. Advertising a practice (GMC guidance): <https://www.medicalprotection.org/uk/articles/advertising-your-practice>
27. Ministerio de Sanidad, REPS public search: <https://www.sanidad.gob.es/gabinete/notasPrensa.do?id=5916>
28. CGCOM colegiado number: <https://www.cgcom.es/servicios/registros-centrales/registro-de-colegiados/busqueda-de-colegiados/numero-de-colegiado>
29. Colegiado web service: <https://pai.gva.es/es/dades_publiques_metge_colegiat>
30. REGCESS and catalogues: <https://regcess.mscbs.es/regcessWeb/descargaManualDefinicionesInformacion.do>; <https://www.sanidad.gob.es/estadEstudios/estadisticas/bancoDatos.htm>
31. RD 311/2022 (ENS): <https://www.boe.es/buscar/act.php?id=BOE-A-2022-7191>
32. LOPDGDD: <https://boe.es/buscar/act.php?id=BOE-A-2018-16673>
33. LSSI FAQ: <https://lssi.digital.gob.es/lssi/la-ley/preguntas-frecuentes>
34. Medical advertising, CGCOM code: <https://comgranada.com/correcto-uso-de-la-publicidad-medica-y-bases-eticas-sobre-la-economia-y-honorarios-del-ejercicio-profesional/>
35. FNOMCeO search (now redirects to the Albo Unico, [IT1]): <https://portale.fnomceo.it/cerca-prof/>
36. Regional and ministry open data: <https://dati.regione.campania.it/catalogo/datasetdetail/medici-medicina-generale>; <https://www.dati.salute.gov.it/it/dataset/strutture-e-attivita-asl/>
37. DM 23/12/1976 (codice fiscale): <https://www.nonsolocap.it/docs/dm-23-12-1976/>
38. Garante, compendium on patient–practitioner platforms (2024): <https://www.garanteprivacy.it/documents/10160/0/Compendio+sul+trattamento+dei+dati+personali+attraverso+piattaforme+volte+a+mettere+in+contatto+i+pazienti+con+i+professionisti+sanitari+accessibili+via+web+e+app.pdf/7fc9ca53-f078-af9b-248d-a71dee74da07?version=2.0&download=true>
39. ACN cloud regulation: <https://www.acn.gov.it/portale/en/w/cloud-per-la-pa-da-oggi-in-vigore-il-regolamento-unico-per-le-infrastrutture-e-i-servizi-cloud>
40. Partita IVA on websites: <https://www.fiscozen.it/guide/partita-iva-sito-web/>
41. FNOMCeO, Code of Medical Ethics art. 56: <https://portale.fnomceo.it/wp-content/uploads/2023/08/Art.56_definitivo_acc.pdf>
42. Health advertising rules: <https://www.omceovr.it/professione/disposizioni/pubblicit%C3%A0-sanitaria>

Market study (#82), labelled by country, all checked on 2026-11-25:

- EU1. Eurostat, health personnel (hlth_rs_prs1, hlth_rs_prs2, hlth_rs_prsns): <https://ec.europa.eu/eurostat/databrowser/view/hlth_rs_prs2/default/table>
- DE1. Landesärztekammer Baden-Württemberg, website terms of use: <https://www.aerztekammer-bw.de/website-nutzungsbedingungen>
- DE2. KZBV, dentist search: <https://www.kzbv.de/patienten/zahnarztsuche/>
- DE3. Bundeszahnärztekammer, figures: <https://www.bzaek.de/ueber-uns/daten-und-zahlen/nachgezaehlt.html>
- DE4. §393 SGB V: <https://www.gesetze-im-internet.de/sgb_5/__393.html>
- DE5. §22 BDSG: <https://www.gesetze-im-internet.de/bdsg_2018/__22.html>
- DE6. Bundesnetzagentur, length of local numbers: <https://www.bundesnetzagentur.de/DE/Fachthemen/Telekommunikation/Nummerierung/ONRufnr/Laenge/L%C3%A4nge_ONRufnr_Basepage.html>
- DE7. Deutsche Post, addressing an envelope: <https://www.deutschepost.de/de/b/briefumschlag-richtig-beschriften.html>
- DE8. vzbv, Doctolib judgment: <https://www.vzbv.de/urteile/arzttermine-doctolib-wegen-irrefuehrung-von-gesetzlich-versicherten-verurteilt>
- DE9. vzbv, press release of 2 July 2026: <https://www.vzbv.de/pressemitteilungen/trotz-filter-doctolib-zeigt-kassenpatientinnen-kostenpflichtige-termine>
- DE10. Federal Ministry of Health, GeDIG FAQ: <https://www.bundesgesundheitsministerium.de/service/gesetze-und-verordnungen/guv-21-lp/gedig/gedig-faq>
- DE11. Bundesärztekammer, doctor statistics 2024: <https://www.bundesaerztekammer.de/baek/ueber-uns/aerztestatistik/2024>
- DE12. Destatis, press release 030/2026: <https://www.destatis.de/DE/Presse/Pressemitteilungen/2026/01/PD26_030_23526.html>
- GB1. GDC, the registers: <https://www.gdc-uk.org/about-us/what-we-do/the-registers>
- GB2. NHS Data Dictionary, GDC registration number: <https://archive.datadictionary.nhs.uk/DD%20Release%20October%202020/attributes/general_dental_council_registration_number.html>
- GB3. Data Security and Protection Toolkit: <https://www.dsptoolkit.nhs.uk/>
- GB4. TRUD, organisation reference data licence: <https://isd.digital.nhs.uk/trud/users/guest/filters/0/categories/5/items/242/licences>
- GB5. Open Government Licence v3.0: <https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/>
- GB6. Ofcom, National Telephone Numbering Plan: <https://www.ofcom.org.uk/siteassets/resources/documents/phones-telecoms-and-internet/information-for-industry/numbering/other/national-numbering-plan.pdf>
- GB7. Royal Mail, PAF Programmers' Guide: <https://www.poweredbypaf.com/wp-content/uploads/2015/02/Latest-Programmers_guide_Edition-7-Version-6.pdf>
- GB8. CQC, scope of registration (nursing care, introductory services): <https://www.cqc.org.uk/guidance-regulation/providers/registration/scope-registration/regulated-activities/nursing-care>
- GB9. GDC, register passes 47,000 dentists (19 January 2026): <https://www.gdc-uk.org/news-blogs/news/detail/2026/01/19/gdc-register-increases-to-over-47-000-dentists>
- GB10. NMC, registration data: <https://www.nmc.org.uk/about-us/reports-and-accounts/registration-statistics/>
- GB11. ODS Data Search and Export, reports and refresh time: <https://www.odsdatasearchandexport.nhs.uk/>; report URLs: <https://www.odsdatasearchandexport.nhs.uk/api/getReport?report=epraccur> (and `ebranchs`, `egdpprac`, `edispensary`), listed on <https://web.archive.org/web/20260916014300/https://digital.nhs.uk/services/organisation-data-service/data-search-and-export/csv-downloads/gp-and-gp-practice-related-data>
- GB12. ODS reference data catalogue, epraccur column specification, roles and update frequencies: <https://www.odsdatasearchandexport.nhs.uk/referenceDataCatalogue/565791179.html>; General Dental Practices: <https://www.odsdatasearchandexport.nhs.uk/referenceDataCatalogue/General-Dental-Practices_580652996.html>
- GB13. Public Health Scotland datasets (CKAN API, licence `uk-ogl`): <https://www.opendata.nhs.scot/dataset/gp-practice-contact-details-and-list-sizes>, <https://www.opendata.nhs.scot/dataset/dental-practices-and-patient-registrations>, <https://www.opendata.nhs.scot/dataset/dispenser-location-contact-details>, <https://www.opendata.nhs.scot/dataset/general-practitioner-contact-details>
- GB14. Business Services Organisation datasets (OpenDataNI CKAN API, licence `uk-ogl`): <https://www.opendatani.gov.uk/@business-services-organisation/gp-practice-list-sizes>, <https://www.opendatani.gov.uk/@business-services-organisation/general-dental-services-statistics>
- GB15. Code-Point Open (OS Downloads API): <https://api.os.uk/downloads/v1/products/CodePointOpen/downloads>
- GB16. OS Open Names (OS Downloads API): <https://api.os.uk/downloads/v1/products/OpenNames/downloads>
- GB17. ONS feature services, ward-to-region lookup and boundaries (2026): <https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/WD26_LAD26_CTYUA26_RGN26_CTRY26_UK_LU/FeatureServer>, <https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/LAD_DEC_2026_UK_BFC/FeatureServer>
- GB18. OSNI Open Data, Gazetteer, Place Names: <https://www.opendatani.gov.uk/@land-property-services/osni-open-data-gazetteer-place-names>
- GB19. ONS, geography licences (Northern Ireland postcode data, attribution statements): <https://www.ons.gov.uk/methodology/geography/licences>
- GB20. The Re-use of Public Sector Information Regulations 2015 (SI 2015/1415), regulation 8: <https://www.legislation.gov.uk/uksi/2015/1415/regulation/8>
- GB21. UK GDPR article 14, as amended by the Data (Use and Access) Act 2025: <https://www.legislation.gov.uk/eur/2016/679/article/14>
- GB22. Data Protection Act 2018, schedule 21, paragraphs 4 and 5: <https://www.legislation.gov.uk/ukpga/2018/12/schedule/21/paragraph/4>, <https://www.legislation.gov.uk/ukpga/2018/12/schedule/21/paragraph/5>
- GB23. ICO, data protection complaints and helpline: <https://ico.org.uk/make-a-complaint/data-protection-complaints/data-protection-complaints/>; postal address: <https://cy.ico.org.uk/about-the-ico/who-we-are/directions-head-office/>
- GB24. The Electronic Commerce (EC Directive) Regulations 2002, regulation 6: <https://www.legislation.gov.uk/uksi/2002/2013/regulation/6>
- GB25. The Public Sector Bodies (Websites and Mobile Applications) (No. 2) Accessibility Regulations 2018: <https://www.legislation.gov.uk/uksi/2018/952/contents>
- ES1. RD 640/2014 (REPS): <https://www.boe.es/buscar/act.php?id=BOE-A-2014-8712>
- ES2. Ministerio de Sanidad, legal notice: <https://www.sanidad.gob.es/avisoLegal/home.htm>
- ES3. Ley 37/2007 (reuse of public-sector information): <https://www.boe.es/buscar/act.php?id=BOE-A-2007-19814>
- ES4. REPS, 2024 report: <https://www.sanidad.gob.es/areas/profesionesSanitarias/registroEstatal/docs/Informe_2024_REPS_DGOP.pdf>
- ES5. Ley 2/1974 (professional colleges): <https://www.boe.es/buscar/act.php?id=BOE-A-1974-289>
- ES6. RD 311/2022 (ENS): <https://www.boe.es/buscar/act.php?id=BOE-A-2022-7191>
- ES7. RD 2296/2004 (numbering plan): <https://www.boe.es/eli/es/rd/2004/12/10/2296/con>
- ES8. UPU addressing guide, Spain: <https://www.upu.int/UPU/media/upu/PostalEntitiesFiles/addressingUnit/espEn.pdf>
- ES9. REGCESS, monthly extracts: <https://regcess.mscbs.es/regcessWeb/inicioDescargaCentrosAction.do>
- ES10. IGN, OGC API Features: <https://api-features.ign.es/collections>
- ES11. IGN licence (Orden FOM/2807/2015): <https://www.ign.es/resources/licencia/Condiciones_licenciaUso_IGN.pdf>
- ES12. Ley Orgánica 3/2018 (LOPDGDD), art. 19: <https://www.boe.es/eli/es/lo/2018/12/05/3/con>
- IT1. FNOMCeO, Albo Unico Nazionale: <https://albounico.fnomceo.it/>
- IT2. dati.gov.it catalogue, Milan GPs (and the Campania dataset `medici-medicina-generale`): <https://www.dati.gov.it/opendata/api/3/action/package_show?id=sanita-medici-di-medicina-generale>
- IT3. UPU addressing guide, Italy: <https://www.upu.int/UPU/media/upu/PostalEntitiesFiles/addressingUnit/itaEn.pdf>
- IT4. Ministero della Salute, Farmacie (checked 2026-11-26): <https://www.dati.salute.gov.it/it/dataset/farmacie/>; its JSON twin, which names the current file: <https://www.dati.salute.gov.it/page-data/it/dataset/farmacie/page-data.json>
- IT5. Ministero della Salute, Parafarmacie (checked 2026-11-26): <https://www.dati.salute.gov.it/it/dataset/parafarmacie/>
- IT6. Ministero della Salute, Posti letto per struttura ospedaliera 2023 (checked 2026-11-26): <https://www.dati.salute.gov.it/it/dataset/posti-letto-struttura-ospedaliera-2023/>
- IT7. Italian Open Data Licence v2.0: <https://www.dati.gov.it/iodl/2.0/>
- IT8. Istat, note legali (checked 2026-11-26): <https://www.istat.it/note-legali/>
- IT9. Istat, Confini delle unità amministrative a fini statistici (checked 2026-11-26): <https://www.istat.it/notizia/confini-delle-unita-amministrative-a-fini-statistici-al-1-gennaio-2018-2/>; the 2026 generalized archive: <https://www.istat.it/storage/cartografia/confini_amministrativi/generalizzati/2026/Limiti01012026_g.zip>
- IT10. dati.salute.gov.it, Note ("Contatta gli esperti") and Consultori familiari (checked 2026-11-26): <https://www.dati.salute.gov.it/it/pagina-opendata/note/>, <https://www.dati.salute.gov.it/it/dataset/consultori-familiari/>
- CH1. FOPH, MedReg: <https://www.bag.admin.ch/de/medizinalberuferegister-medreg>
- CH2. FOPH, access to MedReg through the standard interface: <https://www.bag.admin.ch/de/zugang-zum-medreg-via-standardschnittstelle>
- CH3. Registerverordnung MedBG (SR 811.117.3), and the user list and fee schedule linked from CH2: <https://www.lexfind.ch/tolv/250594/de>
- CH4. FOPH, GesReg: <https://www.bag.admin.ch/de/gesundheitsberuferegister-gesreg>
- CH5. opendata.swiss CKAN API: <https://ckan.opendata.swiss/api/3/action/package_search>
- CH6. Obsan, MedReg and PsyReg statistics: <https://ind.obsan.admin.ch/medpsyreg>
- CH7. admin.ch, legal notice: <https://www.admin.ch/gov/de/start/rechtliches.html>
- CH8. Refdata, Partner-refdatabase guide (2/2026): <https://www.refdata.ch/images/PDF_DE/Guide_Partner-refdatabase_DE.pdf>
- CH9. Refdata, disclaimer: <https://www.refdata.ch/de/disclaimer>
- CH10. Data Protection Act (SR 235.1): <https://www.fedlex.admin.ch/eli/cc/2022/491/de>
- CH11. Canton of Zurich innovation sandbox, data protection, professional secrecy and the cloud: <https://www.zh.ch/de/wirtschaft-arbeit/wirtschaftsstandort/innovation-sandbox/phase-ii/medizinische-dokumentation/2-datenschutz-berufsgeheimnis-und-die-cloud.html>
- CH12. FMH Code of Conduct (2023-11): <https://www.fmh.ch/files/pdf29/standesordnung---de---2023-11.pdf>
- CH13. FMH Code of Conduct, annex 2 (2023): <https://www.fmh.ch/files/pdf32/anhang-2---de---2023-11.pdf>
- CH14. FMH, doctor statistics: <https://www.fmh.ch/themen/aerztestatistik.cfm>
- CH15. Netzwoche, OneDoc takes over Medicosearch: <https://www.netzwoche.ch/news/2025-05-19/onedoc-uebernimmt-medicosearch>
- AT1. ÄrzteG 1998 §27: <https://www.ris.bka.gv.at/NormDokument.wxe?Abfrage=Bundesnormen&Gesetzesnummer=10011138&Paragraf=27>
- AT2. Österreichische Ärzteliste: <https://www.aerzteliste-online.at/>
- AT3. Gesundheitsberuferegister: <https://gbr-public.ehealth.gv.at/>
- AT4. Österreichisches Hebammengremium, register: <https://hebammen.at/gremium/hebammenregister/>
- AT5. Österreichische Zahnärztekammer, dentist search: <https://www.zahnaerztekammer.at/patientinnen/zahnaerztinnensuche>
- AT6. data.gv.at search API (Vienna, Styria, Salzburg datasets): <https://www.data.gv.at/api/hub/search/search?q=%C3%84rzte>
- AT7. Gesundheitstelematikgesetz 2012: <https://www.ris.bka.gv.at/GeltendeFassung.wxe?Abfrage=Bundesnormen&Gesetzesnummer=20008120>
- AT8. ÄrzteG 1998 §53: <https://www.ris.bka.gv.at/NormDokument.wxe?Abfrage=Bundesnormen&Gesetzesnummer=10011138&Paragraf=53>
- AT9. Austrian Medical Chamber, facts and figures: <https://www.aerztekammer.at/daten-fakten>
- AT10. Ärzte Standorte Wien: <https://www.data.gv.at/katalog/dataset/fdcaabe5-0efd-4701-8fd9-49935c0d9cff>; Stadt Wien, terms of use: <https://data.wien.gv.at/nutzungsbedingungen>
- AT11. Niedergelassene Ärzte Steiermark: <https://www.data.gv.at/katalog/dataset/b0a8ca10-3968-11e2-81c1-0800200c9a66>; Land Steiermark, terms of use: <https://data.steiermark.at/cms/ziel/95633648/DE/>
- AT12. Ärzte Land Salzburg: <https://www.data.gv.at/katalog/dataset/8bd69af0-d42a-4777-beb6-1e8e87145a23>; the Land's catalogue entry: <https://service.salzburg.gv.at/ogd/client/showDetail/8bd69af0-d42a-4777-beb6-1e8e87145a23>
- AT13. Land Salzburg, Open Government Data, terms ("Rechtliches und Netiquette"): <https://www.salzburg.gv.at/themen/statistik/ogd/rechtliches-und-netiquette>
- AT14. Zahnärzte Land Salzburg: <https://service.salzburg.gv.at/ogd/client/showDetail/90dd469f-9c41-49c4-aa86-cdf02ebaa1e0>
- AT15. Statistik Austria, Gemeinden – Schwerpunkte (OGDEXT_GEM_MP_1): <https://data.statistik.gv.at/web/meta.jsp?dataset=OGDEXT_GEM_MP_1>
- AT16. Informationsweiterverwendungsgesetz 2022: <https://www.ris.bka.gv.at/NormDokument.wxe?Abfrage=Bundesnormen&Gesetzesnummer=20011973&Paragraf=1>
- LI1. Liechtensteinische Ärztekammer, find a doctor: <https://www.aerztekammer.li/arzt-finden>
- LI2. Liechtensteinische Ärztekammer, imprint: <https://www.aerztekammer.li/impressum>
- BE1. SPF Santé publique, databases of health professions: <https://www.health.belgium.be/nl/professionals/gezondheidsprofessionals/menselijke-gezondheid/gezondheidszorgberoepen/databanken-statistieken-gezondheidszorgberoepen>
- BE2. INAMI, search a care provider: <https://webappsa.riziv-inami.fgov.be/silverpages/Home/Search/>
- BE3. eHealth, CoBRHA: <https://www.ehealth.fgov.be/ehealthplatform/fr/service-cobrha-common-base-registry-for-healthcare-actor>
- BE4. Departement Zorg, open data: <https://www.departementzorg.be/nl/open-data>
- BE5. Autorité de protection des données, decision 149/2023: <https://www.autoriteprotectiondonnees.be/publications/decision-quant-au-fond-n-149-2023.pdf>
- BE6. Ordre des médecins, opinion a166020 on e-reputation: <https://ordomedic.be/fr/avis/telematique/internet/e-reputation-evaluation-des-medecins-sur-des-plates-formes-accessibles-par-internet>
- NL1. BIG-register, about: <https://www.bigregister.nl/over-het-big-register>
- NL2. data.overheid.nl, BIG-register systeemkoppeling: <https://data.overheid.nl/dataset/big-register-systeemkoppeling>
- NL3. CIBG, LRZa: <https://www.cibg.nl/lrza>
- NL4. BIG-register, search from your own system: <https://www.bigregister.nl/zoek-zorgverlener/zoeken-eigen-systeem>
- NL5. Besluit elektronische gegevensverwerking door zorgaanbieders: <https://wetten.overheid.nl/BWBR0040238>
- LU1. Agence eSanté, directory of professionals: <https://www.esante.lu/portal/en/annuaire-434-628.html>
- LU2. Collège médical, registered members: <https://collegemedical.lu/fr/documentation/inscrits>
- LU3. Collège médical, charter on information and advertising (2021): <https://archives.collegemedical.lu/Doc/z-charte-cm-communication-et-publicite-deontologie.pdf>
- IE1. Medical Council, check the register: <https://www.medicalcouncil.ie/public-information/check-the-register/>
- IE2. Information Commissioner, case RPSI/22/04: <https://assets.oic.ie/media/286382/0eb868fb-3bbb-4257-ba9c-e3c06b3fd280.pdf>
- IE3. NMBI, the register: <https://www.nmbi.ie/Registration/The-Register-and-Divisions>
- IE4. Dental Council, registers: <https://www.dentalcouncil.ie/about-us/dental-registers>
- IE5. Medical Council, Guide to Professional Conduct and Ethics (2024): <https://www.medicalcouncil.ie/news-and-publications/publications/guide-to-professional-conduct-and-ethics-for-registered-medical-practitioners-2024.pdf>
- IE6. PSI, information about the public registers (Register of Pharmacies extract): <https://www.psi.ie/information-and-resources/information-about-our-public-registers>
- IE7. PSI, Terms of Use (re-use of public sector information): <https://www.psi.ie/terms-use>
- IE8. HIQA, disclaimer (re-use): <https://www.hiqa.ie/disclaimer>; register export: <https://www.hiqa.ie/centre/export/older_persons_register.csv?_format=csv>
- IE9. GeoHive, Hospitals – HSE Ireland: <https://www.arcgis.com/home/item.html?id=feb34881088341bbbf80d86af6a4f333>; Health Centres – HSE Ireland: <https://www.arcgis.com/home/item.html?id=c2e825ef881b4e7daca59b0faa232b72>
- IE10. data.gov.ie, open data licence: <https://data.gov.ie/pages/opendatalicence>
- IE11. Pharmacy Act 2007: <https://www.irishstatutebook.ie/eli/2007/act/20/enacted/en/print>; Health Act 2007: <https://www.irishstatutebook.ie/eli/2007/act/23/enacted/en/print>
- IE12. PSI, advertising guidance (2011): <https://www.thepsi.ie/sites/default/files/2024-07/Advertising_Guidance_2011_November.pdf>; Code of Conduct (2019): <https://www.thepsi.ie/sites/default/files/2024-06/PSI%27s%20Code%20of%20Conduct%202019.pdf>
- IE13. Data Protection Act 2018: <https://www.irishstatutebook.ie/eli/2018/act/7/enacted/en/print>; S.I. No. 68 of 2003: <https://www.irishstatutebook.ie/eli/2003/si/68/made/en/print>
- IE14. Tailte Éireann, Counties – National Statutory Boundaries – 2019 – Generalised 20m: <https://www.arcgis.com/home/item.html?id=7ef9c5102d61424295e98505a00251ea>; Centres of Population – National Placenames Gazetteer: <https://www.arcgis.com/home/item.html?id=b0693f23738d45c7a328a03821d6f845>; CSO, Census 2022 Built Up Areas: <https://www.arcgis.com/home/item.html?id=2c859a48a4dd482e8811191773b7ec51>
- DK1. Styrelsen for Patientsikkerhed, Autorisationsregistret: <https://stps.dk/sundhedsfaglig/autorisation/autorisationsregistret>
- DK2. BEK 997 of 28/08/2024: <https://www.retsinformation.dk/eli/lta/2024/997>
- DK3. NSP, Autorisation: <https://www.nspop.dk/display/web/Autorisation>
- DK4. SOR files: <https://sor-filer.sundhedsdata.dk/>
- DK5. Sundhedsdatastyrelsen, use of SOR data: <https://sundhedsdatastyrelsen.dk/data-og-registre/nationale-sundhedsregistre/sundhedsvaesenets-organisationsregister/brug-sor-data>
- DK6. VEJ 9319 of 26/06/2013, marketing of health services: <https://www.retsinformation.dk/api/pdf/152739>
- DK7. Datatilsynet, 2013 decision on a review portal: <https://www.datatilsynet.dk/afgoerelser/historiske-afgoerelser/2013/feb/klage-over-gengivelse-af-disciplinaernaevnsafgoerelser-paa-internetportal>
- DK8. PLO, Min Læge app: <https://laeger.dk/foreninger/plo/digital-praksis/min-laege-appen>
- SE1. Socialstyrelsen, HOSP extracts: <https://legitimation.socialstyrelsen.se/ansok-om-intyg/>
- SE2. Socialstyrelsen, licence check: <https://legitimation.socialstyrelsen.se/ansok-om-intyg/legitimationskontroll-for-arbete-eller-studier-inom-sverige/>
- SE3. SOU 2021:39: <https://www.regeringen.se/rattsliga-dokument/statens-offentliga-utredningar/2021/05/sou-202139/>
- SE4. IVO, Vårdgivarregistret: <https://www.ivo.se/vard-omsorgsgivare/anmal-verksamhet-register/vardgivarregistret/>
- SE5. IMY, fines against Apoteket and Apohem: <https://www.imy.se/en/news/administrative-fines-against-apoteket-and-apohem-for-transferring-personal-data-to-meta/>
- SE6. Läkarförbundet, marketing rules: <https://slf.se/rad-och-stod/etik/lakarforbundets-marknadsforingsregler/>
- SE7. Kry, Min Doktor acquisition: <https://www.kry.se/press/nyheter/kry-forbattrar-tillganglighet-och-vardutbud-genom-forvarv-av-min-doktor/>
- SE8. Konkurrensverket, report 2022:3: <https://www.konkurrensverket.se/globalassets/dokument/informationsmaterial/rapporter-och-broschyrer/rapportserie/rapport_2022-3.pdf>
- SE9. Läkemedelsverket, "Apotek med tillstånd" (dataset and its CC BY 4.0 distribution): <https://catalog.lakemedelsverket.se/store/1/resource/36>; <https://catalog.lakemedelsverket.se/store/1/resource/37>; the search and export: <https://www.lakemedelsverket.se/sv/handel-med-lakemedel/apotek/sok-apotek-som-har-tillstand>
- SE10. Västra Götalandsregionen, "Vårdcentraler i Vårdval vårdcentral" (CC0 1.0): <https://vgregion.entryscape.net/store/7/resource/46>; <https://vgregion.entryscape.net/store/7/resource/48>
- SE11. SCB, Digitala gränser (CC0): <https://www.scb.se/hitta-statistik/regional-statistik-och-kartor/regionala-indelningar/digitala-granser/>
- SE12. Lag (2002:562) om elektronisk handel och andra informationssamhällets tjänster: <https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/lag-2002562-om-elektronisk-handel-och-andra_sfs-2002-562/>
- SE13. Lag (2018:1937) om tillgänglighet till digital offentlig service: <https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/lag-20181937-om-tillganglighet-till-digital_sfs-2018-1937/>
- SE14. Marknadsföringslag (2008:486): <https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/marknadsforingslag-2008486_sfs-2008-486/>
- SE15. Läkemedelslag (2015:315), ch. 12: <https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/lakemedelslag-2015315_sfs-2015-315/>
- FI1. LVV, registers of professionals: <https://lvv.fi/en/healthcare-and-social-welfare/registers-of-professionals>
- FI2. Valtioneuvosto, JulkiTerhikki in 2026: <https://valtioneuvosto.fi/en/-/152634019/small-changes-to-julkiterhikki-and-julkisuosikki-at-new-year-2026>
- FI3. LVV open data: <https://lvv.fi/yhteystiedot/avoin-data>
- FI4. Act 784/2021: <https://www.finlex.fi/fi/laki/ajantasa/2021/20210784>
- FI5. Kuntoutusyrittäjät, appointment data in Kanta (secondary): <https://kuntoutusyrittajat.fi/artikkeli/ajanvaraustiedot-tallennetaan-kantaan-lokakuun-alussa/>
- FI6. Lääkäriliitto, marketing of medical services: <https://julkaisut.laakariliitto.fi/laakarin-etiikka/laakari-potilas-ja-kolmas-osapuoli/laakaripalvelujen-markkinointi/>
- FI7. avoindata.suomi.fi, Suomi.fi-palvelutietovaranto (CKAN `package_show`: `license_id` `cc-zero-1.0`, "All PTV content is free to use via PTV Open API"), read 2026-11-27: <https://avoindata.suomi.fi/data/fi/dataset/palvelutietovaranto>
- FI8. Suomi.fi for service developers, using PTV data ("Tietoja voi hakea PTV:n OUT-rajapinnan kautta ilman erillistä tunnistautumista tai käyttölupaa"): <https://kehittajille.suomi.fi/palvelut/palvelutietovaranto/ptv-tietojen-hyodyntaminen-ja-integraatiot>; the open API, version 11: <https://api.palvelutietovaranto.suomi.fi/api/v11>
- FI9. Statistics Finland, statistical areas (CC BY 4.0): <https://avoindata.suomi.fi/data/fi/dataset/kuntapohjaiset-tilastointialueet>; terms of use: <https://stat.fi/en/about-us/get-to-know-statistics-finland/legislation/terms-of-use>; correspondence tables: <https://data.stat.fi/api/classifications/v2/correspondenceTables/kunta_1_20260101%23hyvinvointialue_1_20260101/maps>
- FI10. PTV API and architecture reform (version 12, API key; version 11 switched off in April 2027): <https://kehittajille.suomi.fi/services/servicecatalogue/api-and-architecture-reform>; API key instructions: <https://kehittajille.suomi.fi/palvelut/palvelutietovaranto/ptv-tietojen-hyodyntaminen-ja-integraatiot/tekninen-dokumentaatio-integraation-toteuttajalle-versio-12/api-avaimen-kayttoohje-ptv-rajapintaversio-12>
- FI11. Fimea, open data and its licence (CC BY 4.0, medicines only): <https://fimea.fi/tietoa_fimeasta/avoin-data>
- FI12. THL, SOTE organisation register on the national code server (no licence found): <https://koodistopalvelu.kanta.fi/codeserver/pages/classification-view-page.xhtml?classificationKey=421>
- FI13. Act 741/2023 on the supervision of social and health care, §§ 14 and 53 (Finlex open data): <https://opendata.finlex.fi/finlex/avoindata/v1/akn/fi/act/statute-consolidated/2023/741/fin@>; <https://www.finlex.fi/fi/lainsaadanto/2023/741>
- FI14. Act 917/2014 on electronic communications services: <https://www.finlex.fi/fi/lainsaadanto/2014/917>
- NO1. Helsedirektoratet, HPR: <https://www.helsedirektoratet.no/statistikk-registre-og-rapporter/helsedata-og-helseregistre/helsepersonellregisteret-hpr>
- NO2. Norsk helsenett, HPR public API: <https://utviklerportal.nhn.no/informasjonstjenester/helsepersonellregisteret/helsepersonellregisteret-offentlig-api/docs/hpr-offentlig-apimd>
- NO3. Norsk helsenett, Helsepersonellregisteret: <https://www.nhn.no/tjenester/helsepersonellregisteret>
- NO4. Helsepersonelloven §13: <https://lovdata.no/lov/1999-07-02-64/§13>
- NO5. Normen for suppliers: <https://ehelse.no/normen/normen-for-leverandorer>
- NO6. Personvernnemnda, PVN-2018-14 (Legelisten.no): <https://personvernnemnda.no/2018/08/26/pvn-2018-14-behandling-av-personopplysninger-pa-nettstedet-legelisten-no/>
- NO7. Dr.Dropin: <https://www.drdropin.no/en/lege>
- NO8. Enhetsregisteret API documentation ("License: Norsk lisens for offentlige data (NLOD)", full files, 10,000-result limit): <https://data.brreg.no/enhetsregisteret/api/dokumentasjon/no/index.html>
- NO9. Brønnøysundregistrene, the service description ("Dataene i tjenesten er lisensiert med Norsk lisens for offentlige data (NLOD)"): <https://www.brreg.no/bruke-data-fra-bronnoysundregistrene/apne-data/beskrivelse-av-tjenesten-data-fra-enhetsregisteret/>
- NO10. NLOD 2.0 (§ 3 exemptions, § 5 attribution): <https://data.norge.no/nlod/no/2.0>, <https://data.norge.no/nlod/en/2.0>
- NO11. Matrikkelen – Adresse, Geonorge metadata (CC BY 4.0): <https://kartkatalog.geonorge.no/metadata/matrikkelen-adresse/f7df7a18-b30f-4745-bd64-d0863812350c>
- NO12. Administrative enheter kommuner, Geonorge metadata (CC BY 4.0): <https://kartkatalog.geonorge.no/metadata/administrative-enheter-kommuner/041f1e6e-bdbc-4091-b48f-8a5990f3cc5b>
- NO13. Ehandelsloven §§ 5 and 8: <https://lovdata.no/dokument/NL/lov/2003-05-23-35>
- NO14. Forskrift om universell utforming av IKT-løsninger §§ 4 and 4e: <https://lovdata.no/dokument/SF/forskrift/2013-06-21-732>
- IS1. Starfsleyfaskrá heilbrigðisstarfsfólks: <https://island.is/starfsleyfaskra>
- IS2. Embætti landlæknis, the register is open to all: <https://island.is/s/landlaeknir/frett/starfsleyfaskra-er-oellum-opin>
- IS3. Health Personnel Act 34/2012: <https://www.althingi.is/lagas/nuna/2012034.html>
- PT1. Ordem dos Médicos, registered doctors: <https://ordemdosmedicos.pt/area-medica>
- PT2. Ordem dos Enfermeiros, register search: <https://www.ordemenfermeiros.pt/pesquisa-de-enfermeiros-registados/>
- PT3. Ordem dos Médicos Dentistas, professional address in the search: <https://www.omd.pt/2021/04/domicilio-profissional-site/>
- PT4. Lei 2/2013, art. 23: <https://pgdlisboa.pt/leis/lei_mostra_articulado.php?artigo_id=1873A0023&ficha=1&nid=1873&nversao=&pagina=1&so_miolo=S&tabela=leis>
- PT5. ERS, provider search: <https://www.ers.pt/pt/prestadores/servicos/pesquisa-de-prestadores/>
- PT6. SNS Transparência catalogue API: <https://transparencia.sns.gov.pt/api/explore/v2.1/catalog/datasets>
- PT7. Regulamento 707/2016 (Código Deontológico): <https://www.pgdlisboa.pt/leis/lei_mostra_articulado.php?nid=2649&tabela=leis&ficha=1&pagina=1&so_miolo=S>
- PT8. ERS, health advertising FAQ: <https://www.ers.pt/pt/prestadores/perguntas-frequentes/faqs/perguntas-frequentes-sobre-publicidade-em-saude/>
- PT9. OMD, figures 2025: <https://www.omd.pt/observatorio/numeros/no2025/>
- GR1. Panhellenic Medical Association, national register: <https://pis.gr/106946/>
- GR2. data.gov.gr, doctors of the Thesprotia association: <https://data.gov.gr/dataset/eggegrammenoi-iatroi-ston-iatriko-syllogo-thesprotias>
- GR3. Law 3418/2005, art. 17 (private copy): <https://www.lawspot.gr/nomothesia/n-3418-2005/arthro-17-nomos-3418-2005-diafimisi-paroysia-iatron-sta/>
- CY1. Cyprus Medical Council, members register: <https://www.gov.cy/moh-cmc/en/documents/members-register/>
- CY2. GESY provider search: <https://www.gesy.org.cy/provider-search>
- CY3. data.europa.eu search of the Cyprus catalogue: <https://data.europa.eu/api/hub/search/search?q=doctors>
- CY4. KDP 100/91, Code of Medical Ethics: <http://www.cylaw.org/KDP/data/1991_1_100.pdf>
- CY5. Κατάλογος Ιδιωτικών Φαρμακείων (Pharmaceutical Services, CC BY 4.0): <https://www.data.gov.cy/el/dataset/katalogos-idiotikon-farmakeion>
- CY6. Κατάλογος Κρατικών Νοσοκομείων Κύπρου (Ministry of Health, CC BY 4.0): <https://www.data.gov.cy/el/dataset/katalogos-kratikon-nosokomeion-kyproy>
- CY7. Κατάλογος Κρατικών Κέντρων Υγείας Κύπρου (Ministry of Health, CC BY 4.0): <https://www.data.gov.cy/el/dataset/katalogos-kratikon-kentron-ygeias-kyproy>
- CY8. CYSTAT, census 2021, population by district, municipality/community and parish (CC BY 4.0): <https://www.data.gov.cy/el/dataset/katoikies-noikokyria-idrymata-kai-plithysmos-poy-katagrafikan-kata-eparhia-dimokoinotita>; PxWeb table 1891164G: <https://cystatdb.cystat.gov.cy/pxweb/el/8.CYSTAT-DB/8.CYSTAT-DB__Population__Census%20of%20Population%20and%20Housing%202021__Population__Population%20-%20Place%20of%20Residence/1891164G.px/>
- CY9. Cyprus Post, postcodes by municipality, community and district, with LAU codes (CC BY 4.0): <https://www.data.gov.cy/el/dataset/tahydromikoi-kodikes-ana-dimo-koinotita-kai-eparhia>
- MT1. Cap. 464, Health Care Professions Act: <https://legislation.mt/eli/cap/464/eng/pdf>
- MT2. Medical Council, registers: <https://medicalcouncil.gov.mt/en/resources/registers/>
- MT3. Council for Nurses and Midwives, registers: <https://nursesandmidwivescouncil.gov.mt/en/registration-menu/registers-held-by-the-council-for-nurses-and-midwives/>
- MT4. data.europa.eu, "Medical Practitioners (Principal)" (CC BY 4.0): <https://data.europa.eu/api/hub/search/datasets/95c63bf6-095b-47bc-938c-dc3192ee2d96>
- MT5. Medical Council, code of ethics on advertising: <https://medicalcouncil.gov.mt/wp-content/uploads/2024/04/26-codeofethicsonadvertisement.pdf>
- PL1. Centralny Rejestr Lekarzy: <https://rejestr.nil.org.pl/>
- PL2. NIL, about the register: <https://nil.org.pl/rejestry/centralny-rejestr-lekarzy>
- PL3. dane.gov.pl, RPWDL dataset 728 (API): <https://api.dane.gov.pl/1.4/datasets/728>
- PL4. Act on medical activity, art. 14 (commercial consolidation): <https://sip.lex.pl/akty-prawne/dzu-dziennik-ustaw/dzialalnosc-lecznicza-17709549/art-14>
- PL5. prawo.pl, advertising in the 2025 Code of Medical Ethics: <https://www.prawo.pl/zdrowie/reklama-lekarzy-w-nowym-kodeksie-etyki,533455.html>
- PL6. judykatura.pl, NSA III OSK 1052/21 (secondary): <https://judykatura.pl/wyrok-nsa-portal-o-znanych-lekarzach-musi-usunac-dane-osobowe/>
- PL7. Wielkopolska Medical Chamber, template complaint to the DPA: <https://wil.org.pl/wp-content/uploads/2025/01/2024_WIL-wzor-pisma-do-UODO.pdf>
- PL8. NIPiP, numbers of nurses and midwives: <https://nipip.pl/LICZBA-PIELEGNIAREK-POLOZNYCH-ZAREJESTROWANYCH-ZATRUDNIONYCH/>
- PL9. dane.gov.pl, RPWDL dataset page: <https://dane.gov.pl/pl/dataset/728,rejestr-podmiotow-wykonujacych-dziaalnosc-lecznicza>
- PL10. Act of 15 April 2011 on medical activity, consolidated text Dz.U. 2026 poz. 156 (Sejm ELI API): <https://api.sejm.gov.pl/eli/acts/DU/2026/156/text.pdf>
- PL11. dane.gov.pl API, RPWDL resources (resource 70070, the CSV export): <https://api.dane.gov.pl/1.4/datasets/728/resources>
- PL12. Act of 11 August 2021 on open data and the re-use of public sector information, art. 12 and 15 (Dz.U. 2023 poz. 1524): <https://api.sejm.gov.pl/eli/acts/DU/2023/1524/text.pdf>
- PL13. dane.gov.pl, Rejestr Aptek, dataset 1925 (API): <https://api.dane.gov.pl/1.4/datasets/1925>
- PL14. GUS, eTERYT, full files: <https://eteryt.stat.gov.pl/eTeryt/rejestr_teryt/udostepnianie_danych/baza_teryt/uzytkownicy_indywidualni/pobieranie/pliki_pelne.aspx>
- PL15. dane.gov.pl, PRG, dataset 726 (API): <https://api.dane.gov.pl/1.4/datasets/726>; the archive: <https://opendata.geoportal.gov.pl/prg/granice/00_jednostki_administracyjne.zip>
- PL16. Geodetic and Cartographic Law, art. 40a and 40c (Dz.U. 2026 poz. 1389): <https://isap.sejm.gov.pl/isap.nsf/DocDetails.xsp?id=WDU19890300163>
- PL17. Poczta Polska, the official list of postcodes (sold): <https://www.poczta-polska.pl/dla-biznesu/oferta/uslugi-pozostale/pocztowe-numery-adresowe/>
- PL18. UODO, contact: <https://uodo.gov.pl/pl/p/kontakt>
- PL19. Act of 4 April 2019 on digital accessibility, consolidated text Dz.U. 2023 poz. 1440: <https://api.sejm.gov.pl/eli/acts/DU/2023/1440/text.pdf>
- PL20. Pharmaceutical Law, art. 94a (consolidated text Dz.U. 2026 poz. 612): <https://isap.sejm.gov.pl/isap.nsf/DocDetails.xsp?id=WDU2001001266>
- PL21. NSA, III OSK 1052/21 (26 January 2022): <https://orzeczenia.nsa.gov.pl/doc/BAC6845041>
- CZ1. Czech Medical Chamber, list of doctors: <https://www.lkcr.cz/seznam-lekaru>
- CZ2. NZIP, NRZP login guide: <https://www.nzip.cz/clanek/2877-narodni-registr-zdravotnickych-pracovniku-nr-zp-navod-pro-prihlaseni>
- CZ3. NZIP, NRPZS open data (licence): <https://www.nzip.cz/data/1823-narodni-registr-poskytovatelu-zdravotnich-sluzeb-otevrena-data>
- CZ4. NRPZS places of care (CSV): <https://datanzis.uzis.gov.cz/data/NR-01-NRPZS/NR-01-06/Otevrena-data-NR-01-06-nrpzs-mista-poskytovani-zdravotnich-sluzeb.csv>
- CZ5. NRPZS: <https://nrpzs.uzis.cz/>
- CZ6. Czech Medical Chamber, ethics code: <https://www.lkcr.cz/doc/cms_library/13-sp-c-10-eticky-kodex-clk-101313.pdf>
- CZ7. ÚOOÚ, 2013 inspection of ZnanyLekarz: <https://uoou.gov.cz/cinnost/ochrana-osobnich-udaju/ukoncene-kontroly/kontroly-za-rok-2013/kontrola-spolecnosti-znanylekarz>
- CZ8. ČÚZK, Podmínky poskytování prostorových dat ČÚZK: <https://www.cuzk.gov.cz/Predpisy/Podminky-poskytovani-prostor-dat-a-sitovych-sluzeb/Podminky-poskytovani-prostorovych-dat-CUZK.aspx>; RÚIAN state files: <https://vdp.cuzk.gov.cz/vymenny_format/soucasna/>
- CZ9. SÚKL, Podmínky užití otevřených dat: <https://opendata.sukl.gov.cz/podminky-uziti-otevrenych-dat>
- SK1. Slovak Medical Chamber, register of doctors: <https://lekom.sk/register-lekarov-slk>
- SK2. NCZI, national register of health workers: <https://www.nczisk.sk/registre/narodne-administrativne-registre/narodny-register-zdravotnickych-pracovnikov/Pages/default.aspx>
- SK3. ÚDZS, provider codes: <https://www.udzs-sk.sk/urad/kody-poskytovatelov-zdravotnej-starostlivosti-a-zdravotnickych-pracovnikov/>
- HU1. OKFŐ, register search: <https://kereso.okfo.gov.hu/>
- HU2. NEAK, contracted providers: <https://www.neak.gov.hu/letoltheto/altfin_dok/szerzodott_szolgaltatok>
- SI1. Zdravniška zbornica Slovenije: <https://www.zdravniskazbornica.si/>
- SI2. Zdravniška zbornica Slovenije, legal notice: <https://www.zdravniskazbornica.si/pravno-obvestilo>
- SI3. podatki.gov.si, named lists of personal doctors (ZZZS): <https://podatki.gov.si/dataset/poimenski-seznami-zdravnikov-ki-so-lahko-osebni-zdravniki>
- SI4. ZZZS, lists of doctors who can be personal doctors (checked 2026-11-27): <https://zavarovanec.zzzs.si/izbira-in-zamenjava-osebnega-zdravnika/seznami-zdravnikov/>; the address the portal names, redirected there: <https://zavarovanec.zzzs.si/wps/portal/portali/azos/ioz/ioz_izvajalci>
- SI5. GURS, Register prostorskih enot, web feature service: <https://ipi.eprostor.gov.si/wfs-si-gurs-rpe/wfs>; GURS, public access and terms: <https://www.e-prostor.gov.si/dostopi/javni-dostop/>
- SI6. Zakon o elektronskem poslovanju na trgu (ZEPT), arts. 5 and 12: <https://pisrs.si/pregledPredpisa?id=ZAKO4600>
- SI7. Zakon o varstvu osebnih podatkov (ZVOP-2, Uradni list RS 163/22), arts. 4, 73, 86 and 92: <https://pisrs.si/pregledPredpisa?id=ZAKO7959>
- SI8. Informacijski pooblaščenec, opinions 07121-1/2021/526, 07121-1/2022/1036, 0712-1/2019/21 and 07121-1/2026/1009 (on <https://www.ip-rs.si/>); filing a complaint: <https://www.ip-rs.si/varstvo-osebnih-podatkov/pravice-posameznika/vložitev-prijave>
- SI9. Zakon o dostopnosti spletišč in mobilnih aplikacij (ZDSMA), art. 2, and the ZDPSI (Uradni list RS 14/23), on <https://pisrs.si/>
- SI10. Zakon o zdravstveni dejavnosti (ZZDej), arts. 75.a and 88; Zakon o zdravniški službi (ZZdrS); Kodeks zdravniške etike (2016), arts. 60, 62 and 63; ZMed-1, arts. 3(31) and 57; ZVPot-1, art. 36; on <https://pisrs.si/>
- SI11. Zakon o pacientovih pravicah (ZPacP), art. 1; Zakon o zbirkah podatkov s področja zdravstvenega varstva (ZZPPZ), arts. 1 and 3; on <https://pisrs.si/>
- SI12. podatki.gov.si, Seznam izvajalcev lekarniške dejavnosti (Ministry of Health): <https://podatki.gov.si/dataset/seznam-izvajalcev-lekarniske-dejavnosti>
- SI13. ZZZS, lists for providers (partner.zzzs.si): <https://partner.zzzs.si/>
- HR1. Croatian Medical Chamber, directory of doctors: <https://portal.hlk.hr/imenik-lijecnika/>
- HR2. Zakon o liječništvu: <https://www.zakon.hr/z/405/zakon-o-lijecnistvu>
- HR3. HZZO, contracted primary care: <https://hzzo.hr/zdravstvena-zastita/zdravstvena-zastita-pokrivena-obveznim-zdravstvenim-osiguranjem/ugovoreni>
- HR4. data.gov.hr, contracted primary care: <https://data.gov.hr/ckan/dataset/ugovoreni-sadr-aji-primarne-zdravstvene-za-tite>
- HR5. Information Commissioner, Otvorena dozvola: <https://pristupinfo.hr/objavljena-hrvatska-dozvola-licenca-za-otvorene-podatke/>
- HR6. Zakon o podacima i informacijama u zdravstvu (NN 14/2019): <https://narodne-novine.nn.hr/clanci/sluzbeni/2019_02_14_269.html>
- HR7. Croatian Medical Chamber, 2019 rulebook on informing the public: <https://www.hlk.hr/EasyEdit/UserFiles/Pravilnici/2019-2020/2-pravilnik-o-nacinu-isticanja-naziva-i-obavjestavanja-javnosti-o-radu-pruzatelja-zdr-usluga-3122019-stupio-na-snagu-13122019.pdf>
- RO1. Registrul medicilor din România: <https://regmed.cmr.ro/registrul-medicilor>
- RO2. data.gov.ro, Lista furnizori (CNAS): <https://data.gov.ro/dataset/lista-furnizori>
- RO3. data.gov.ro API, package metadata: <https://data.gov.ro/api/3/action/package_show?id=lista-furnizori>
- RO4. Colegiul Medicilor, code of ethics (April 2026): <https://www.cmr.ro/wp-content/uploads/2026/04/codul-de-deontologie-medicala-al-colegiului-medicilor-din-romania-actualizat-aprilie-2026.pdf>
- BG1. Bulgarian Medical Association, eBLS register: <https://blsbg.eu/>
- BG2. NHIF, contracted partners: <https://reports.nhif.bg/nhif_reports/nhif_partners/>
- BG3. data.egov.bg, terms of use: <https://data.egov.bg/help/view/19/47>
- BG4. Code of professional ethics of doctors: <https://lex.bg/laws/ldoc/1598070784>
- BG5. Superdoc: <https://superdoc.bg/za-nas>
- EE1. MEDRE open data, providers: <https://medre.tehik.ee/api-common/public/open-data/data/description>
- EE2. MEDRE open data, GP lists: <https://medre.tehik.ee/api-common/public/open-data/lists/description>
- EE3. andmed.eesti.ee, providers and licences: <https://andmed.eesti.ee/api/datasets/slug/tervishoiuteenuse-osutajate-ning-tegevuslubade-andmestik>
- EE4. andmed.eesti.ee, GP lists: <https://andmed.eesti.ee/api/datasets/slug/perearsti-nimistute-andmed>
- EE5. Reklaamiseadus (Advertising Act): <https://www.riigiteataja.ee/akt/109012025015>
- EE6. andmed.eesti.ee, the Health Board's dataset and its distribution's licence (`CC_BY_NC_SA_3.0`, "jurisdiktsiooniga sidumata"), read 2026-11-27: <https://andmed.eesti.ee/datasets/tervishoiuteenuse-osutajate-ning-tegevuslubade-andmestik>; the file: <https://medre.tehik.ee/api-common/public/companies/open-data>
- EE7. andmed.eesti.ee, Ravimiameti tegevuslubade register (`CC0_1.0`): <https://andmed.eesti.ee/datasets/ravimiameti-tegevuslubade-register>; the register's search and "Apteekide koondandmed": <https://rkav.tehik.ee/rkav/faces/pages/tegevuslubaForm/tegevuslubaOtsing.xhtml>
- EE8. Maa- ja Ruumiamet, haldus- ja asustusjaotus ("Haldus- ja asustusüksuste andmed on avaandmed", credit with the date): <https://geoportaal.maaruum.ee/est/ruumiandmed/haldus-ja-asustusjaotus-p119.html>; its open data licence: <https://geoportaal.maaruum.ee/opendata-licence>
- EE9. ADS metadata record (CC0 1.0): <https://metadata.geoportaal.ee/geonetwork/srv/api/records/b0bd266e-b4c6-45db-b7ea-f47486b6258b>; the addresses and postcodes extract: <https://geoportaal.maaruum.ee/est/ruumiandmed/aadressiandmed/aadressid-ja-posti-sihtnumbrid-p582.html>
- EE10. Infoühiskonna teenuse seadus (InfoTS), § 4, redaction in force since 2026-08-18: <https://www.riigiteataja.ee/akt/111072026089>; the Advertising Act's redaction in force since 2026-03-16 (§ 22): <https://www.riigiteataja.ee/akt/106032026008>
- EE11. Toodete ja teenuste ligipääsetavuse seadus (LPS), § 2: <https://www.riigiteataja.ee/akt/115062022001>
- LV1. Health Inspectorate, register of practitioners: <https://registri.vi.gov.lv/rap>
- LV2. data.gov.lv, patients per GP practice (NVD): <https://data.gov.lv/dati/api/3/action/package_show?id=gimenes-arsta-prakse-registreto-pacientu-skaits>
- LV3. data.gov.lv, institution addresses: <https://data.gov.lv/dati/api/3/action/package_show?id=vkcp-igis-arstniecibas-iestazu-adreses>
- LV4. Reklāmas likums: <https://likumi.lv/doc.php?id=163>
- LV5. data.gov.lv, register of pharmaceutical businesses (ZVA): <https://data.gov.lv/dati/api/3/action/package_show?id=farmaceitiskas-darbibas-uznemumu-registrs>; export <https://dati.zva.gov.lv/fdu-registrs/export/fdu_register.csv>
- LV6. NVD, GPs by territory (all rights reserved): <https://www.vmnvd.gov.lv/lv/gimenes-arsti-atbilstosi-teritorijam>; contracted institutions: <https://www.vmnvd.gov.lv/lv/ligumiestazu-saraksts-profesionaliem>
- LV7. data.gov.lv, address register open data (VZD): <https://data.gov.lv/dati/lv/dataset/varis-atvertie-dati>; VZD's terms of use: <https://www.vzd.gov.lv/lv/par-datu-izmantosanas-noteikumiem>
- LV8. Ārstniecības likums, section 11: <https://likumi.lv/ta/id/44108-arstniecibas-likums>
- LV9. Cabinet Regulation No. 378 (17.05.2011), advertising of medicines: <https://likumi.lv/doc.php?id=230392>
- LT1. VASPVT, public licence search: <https://licencijavimas.vaspvt.gov.lt/License/PublicSpecialistIndex>
- LT2. get.data.gov.lt, specialist competences: <https://get.data.gov.lt/datasets/gov/vaspvt/specialistu_kompetencijos/:ns>
- LT3. get.data.gov.lt, institution licences: <https://get.data.gov.lt/datasets/gov/vaspvt/licencijos/:ns>
- LT4. data.gov.lt, institution licence data: <https://data.gov.lt/dataset/sveikatos-prieziuros-istaigu-licenciju-duomenys/>
- LT5. Reklamos įstatymas, art. 15: <https://www.infolex.lt/ta/116413:str15>
- LT6. Ellex, medical-services advertising (secondary): <https://ellex.legal/lt/medicinos-paslaugu-reklama/>
- LT7. data.gov.lt, VASPVT "Sveikatos priežiūros įstaigų licencijų duomenys" (dataset 1623): <https://data.gov.lt/datasets/1623/>
- LT8. data.gov.lt, VLK "Gydymo įstaigų, vaistinių ir kitų įmonių sąrašas" (dataset 1386): <https://data.gov.lt/datasets/1386/>
- LT9. data.gov.lt, Address Register, settlements as text (dataset 1287): <https://data.gov.lt/datasets/1287/>
- LT10. data.gov.lt, Address Register, settlement boundaries (dataset 1347): <https://data.gov.lt/datasets/1347/>
- LT11. data.gov.lt, Address Register, address points (dataset 1351): <https://data.gov.lt/datasets/1351/>
- LT12. get.data.gov.lt, Address Register in the data store: <https://get.data.gov.lt/datasets/gov/rc/ar/:ns>
- LT13. Informacinės visuomenės paslaugų įstatymas (No. X-614): <https://e-seimas.lrs.lt/portal/legalAct/lt/TAD/TAIS.277491>
- LT14. Valstybinė duomenų apsaugos inspekcija: <https://vdai.lrv.lt/>
- LT15. data.gov.lt, datasets of the State Medicines Control Agency (VVKT): <https://data.gov.lt/orgs/69/datasets/>
- LT16. The data store's model descriptions (manifest): <https://github.com/atviriduomenys/manifest>

Possibly outdated: the ICO is still revising its guidance after the Data (Use
and Access) Act; the C5:2026 criteria catalogue is new; the Italian VAT
consolidated text applies from 2027; some regional Italian datasets are stale.
