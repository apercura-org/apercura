# ADR 0002: Multi-country foundation (DE, GB, ES, IT)

- Status: accepted (foundation only; no market other than France is open)
- Date: 2026-11-22
- Issue: #45

## Context

Apercura publishes a page for every health practitioner registered in France,
built from French open data (Annuaire Santé, FINESS, Ameli), and lets patients
book online. The product should later serve Germany, the United Kingdom, Spain
and Italy. Each of those markets differs in ways the code cannot guess: where
the practitioner data comes from and under which licence, how practitioners are
identified, which rules apply to hosting health data, which legal notices a site
must carry, how phone numbers and addresses are written.

Two things must not be confused:

- an **interface locale** is a language of the interface (`fr`, `en`, `de`,
  `es`, `it`); anyone can read the French directory in German;
- a **market** is a country whose practitioners are listed, with its own
  registry, rules and domain.

This ADR sets the foundation for markets without opening any. The interface is
translated now; markets open one at a time, each after the research listed
below has been verified.

## Decision

### 1. Interface locales now, markets later

`apps/web/src/i18n/locales.ts` lists the five interface locales. French is the
default (no prefix), English is the source catalog (British English, the
language of the UK market), German, Spanish and Italian live under `/de`, `/es`
and `/it` with translated route segments (`docs/public-site.md`).

Until a market opens, every non-French page is `noindex`, absent from the
sitemaps and announced by no hreflang (`INDEXABLE_LOCALES = ["fr"]`). A locale
becomes indexable only with its market, because a German page of a French
directory is not what a German searching for a doctor near Munich expects.

### 2. One domain per market

Each market gets its own domain, with its language as the default locale and
the other languages as prefixed alternatives, through next-intl's `domains`
routing. Planned shape, once a second market opens:

```ts
// apps/web/src/i18n/routing.ts (future)
defineRouting({
	locales: LOCALES,
	defaultLocale: "fr",
	localePrefix: "as-needed",
	domains: [
		{ domain: "apercura.fr", defaultLocale: "fr", locales: ["fr", "en"] },
		{ domain: "apercura.de", defaultLocale: "de", locales: ["de", "en"] },
		{ domain: "apercura.co.uk", defaultLocale: "en", locales: ["en"] },
		{ domain: "apercura.es", defaultLocale: "es", locales: ["es", "en"] },
		{ domain: "apercura.it", defaultLocale: "it", locales: ["it", "en"] },
	],
});
```

Domain names are placeholders: none of them is registered yet.

What changes with it:

- `APP_URL` becomes one origin per market (`MARKET_ORIGINS`); the proxy's
  canonical-host redirect checks the request host against that list instead of
  a single origin.
- Canonical URLs, Open Graph, JSON-LD and email links take the origin of the
  page's market (`siteOrigin(market)`), never of the request.
- Sitemaps and robots.txt are served per domain and list only that market's
  indexable pages.
- hreflang links pages that are really translated, across domains only when
  both pages describe the same practitioner (a German page of a French
  practitioner is not an alternate of a French page in a German market).
- The data model already carries `country` on `directory.practitioners` and
  `directory.suppressions`, and the unique key is
  `(country, id_scheme, national_id)`, so two markets never collide.

Until then the single-domain configuration stays as it is.

### 3. `CountryAdapter`

`packages/core/src/country` (`@apercura/core/country`) defines one interface
for everything that differs per market. Adapters are pure: no network, no
database. France is the only implementation and only wraps the code the app
already uses, so behaviour is unchanged.

| Member               | France (v1)                                                               |
| -------------------- | ------------------------------------------------------------------------- |
| `defaultLocale`      | `fr`                                                                      |
| `defaultTimeZone`    | `Europe/Paris`                                                            |
| `timeZones`          | Paris and the 8 overseas zones                                            |
| `timeZoneOf(region)` | `timeZoneForDepartment` (INSEE department code, throws if unknown)        |
| `registries`         | Annuaire Santé (RPPS), FINESS+, Ameli, under the Licence Ouverte 2.0      |
| `practitionerId`     | RPPS, 11 digits with a Luhn check digit (`isValidRpps`)                   |
| `taxonomy`           | `FR_PROFESSIONS`, `listingSlugFor`, `isListingSlug`                       |
| `phone`              | `toE164Fr`, `formatPhoneFr` (`+33` and the overseas codes)                |
| `address`            | 5-digit postcode, `street` then `postcode city`                           |
| `legalPages`         | mentions légales (LCEN), privacy (GDPR art. 13–14), terms, RGAA statement |
| `healthDataHosting`  | HDS (Code de la santé publique, art. L1111-8)                             |
| `features`           | directory, booking and e-identity claim (Pro Santé Connect)               |

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
   republication. Without one, the market opens with claimed pages only
   (`features.directory = false`).
3. Sign a hosting contract that meets the market's health-data rules.
4. Write the adapter, the ETL source and the taxonomy; add the legal pages the
   market requires.
5. Add the domain, then make the market's locale indexable on that domain only.

## What is known per market

Research of November 2026, from the sources listed at the end. Most points come
from official pages or their summaries; anything not confirmed by a primary or
reliable source is marked **UNVERIFIED**.

### Germany (DE)

- **Registry.** No open national register of practitioners. The KBV's
  Bundesarztregister is not public; only the Kassenärztliche Vereinigungen (KV)
  and health insurers can use it [1]. Single records can be looked up on
  arztsuche.116117.de and gesund.bund.de [1]. KBV publishes statistics, and its
  SDAV master file has no names or addresses [2]. No published terms allow
  bulk reuse of the 116117 search; similar portals forbid it [3][4]. The
  Landesärztekammern searches were not checked (**UNVERIFIED**). Consequence:
  no directory from open data; a licence or claimed pages only.
- **Identifiers.** LANR, 9 digits: 6 for the doctor, a check digit (digits 1–6
  weighted alternately 4 and 9, then `(10 − sum mod 10) mod 10`), 2 for the
  specialty group; the pseudo-LANR `999999900` must be accepted separately [5].
  BSNR (practice), 9 digits, the first two the KV region, no check digit [6].
  eFN (continuing education), 15 digits ending with a Luhn check digit [7].
- **Health data.** §393 SGB V (since 1 July 2024): processing of social and
  health data for statutory health insurance providers and their processors
  must happen in Germany, the EU or an equivalent country, and the processor
  needs a current BSI C5 attestation, Type 2 since 1 July 2025 [8][9]. A
  booking platform working for contracted doctors is likely in scope (our
  reading, **UNVERIFIED**). GDPR art. 9 and §22 BDSG apply (**UNVERIFIED**
  details).
- **Formats.** `Europe/Berlin`; phone `+49`, trunk prefix `0`, variable length;
  5-digit postcode, street before house number (**UNVERIFIED** as sourced).
- **Legal pages.** Impressum under §5 DDG (which replaced the TMG on 14 May
  2024); regulated professions add their chamber, legal title and professional
  rules [10].
- **Professional advertising.** MBO-Ä §27 allows factual information only [11];
  the HWG can apply to the choice of a doctor [12]. BGH VI ZR 30/17 (2018): a
  directory may list doctors without their consent only as a neutral
  intermediary; Jameda lost for showing paying competitors on non-paying
  doctors' profiles [13]. Apercura's identical free pages and absence of paid
  ranking fit that line.

### United Kingdom (GB)

- **Registry.** GMC List of Registered Medical Practitioners: bulk download for
  a yearly fee, republication needs a separate licence and GMC approval, no free
  API [14]. GDC (dentists): no bulk route found [15]. NMC (nurses, midwives):
  free single search only [16]. NHS ODS publishes GP practices, branches and
  PCNs under the Open Government Licence (CSV, API, TRUD) [17][18]. The NHS
  Service Search API requires onboarding and a connection agreement [19].
  Consequence: practices are open data, individual clinicians are not.
- **Identifiers.** GMC reference number, 7 digits (a check digit only on old
  numbers; an `A` prefix for physician and anaesthesia associates) [20]. NMC
  PIN `\d{2}[A-Z]\d{4}[A-Z]` [21]. ODS GP practice code: a letter and 5 digits;
  branch codes vary by date [22]. GDC number format: **UNVERIFIED**.
- **Health data.** UK GDPR and the Data Protection Act 2018, amended by the
  Data (Use and Access) Act 2025 (main provisions in force since 5 February
  2026) [23]. The NHS Data Security and Protection Toolkit is required only to
  access NHS patient data or systems [24]. No HDS-like hosting certification
  (**UNVERIFIED** as a negative).
- **Formats.** `Europe/London`; phone `+44`, trunk prefix `0`; alphanumeric
  postcode (`SW1A 1AA`) (**UNVERIFIED** as sourced).
- **Legal pages.** Company name, place of registration, number and registered
  office on the website (SI 2015/17, regs 24–25) [25]; a privacy notice.
- **Professional advertising.** GMC Good medical practice (2024): accurate,
  not misleading, within the CAP/ASA codes [26].

### Spain (ES)

- **Registry.** REPS (Registro Estatal de Profesionales Sanitarios, Ministerio
  de Sanidad) offers a free public search since October 2022: name,
  qualifications and workplaces [27]; no bulk or open-data download found. The
  CGCOM searches colegiados by name or number, with a web service for public
  bodies [28][29]. Centres: the REGCESS register has a monthly download, and
  hospital and primary-care catalogues are downloadable [30].
- **Identifiers.** National colegiado number, 9 digits `XXYYZZZZZ` (current
  college, college of first registration, sequence), no documented check digit
  [28]. REPS identifier format: **UNVERIFIED**.
- **Health data.** The Esquema Nacional de Seguridad (RD 311/2022) binds private
  suppliers only when they serve the public sector [31]; the claim that health
  data always requires category ALTA is **UNVERIFIED**. LOPDGDD, additional
  provision 17, sets the legal bases for health data [32].
- **Formats.** `Europe/Madrid` and `Atlantic/Canary`; phone `+34`, 9 digits, no
  trunk prefix; 5-digit postcode whose first two digits are the province
  (**UNVERIFIED** as sourced).
- **Legal pages.** LSSI-CE art. 10 _aviso legal_: name, NIF, address, contact,
  registry details, and for regulated professions the college and number [33].
- **Professional advertising.** CGCOM Code of Medical Ethics (2022), arts.
  89–91: strictly informative advertising, no celebrities or real patients;
  art. 93 discourages advertising prices [34].

### Italy (IT)

- **Registry.** FNOMCeO runs a free public search of the albo (doctors and
  dentists), with no bulk access found [35]. No national open list of
  individual doctors; some regions publish GP (MMG) and paediatrician (PLS)
  lists as open data, often stale; the Ministry of Health publishes aggregates
  per ASL under IODL 2.0 [36].
- **Identifiers.** Codice fiscale, 16 characters with a mod-26 check character
  (DM 23/12/1976); _omocodia_ replaces digits with letters, so validation must
  accept those substitutions [37]. FNOMCeO albo numbers and regional GP codes:
  **UNVERIFIED**.
- **Health data.** GDPR and the Codice privacy (D.lgs. 196/2003 as amended by
  D.lgs. 101/2018). The Garante's 2024 compendium on platforms connecting
  patients and practitioners: booking is an administrative service, the platform
  is controller for accounts and history, and a DPIA is required [38]. ACN cloud
  qualification (QC1–QC4) applies to suppliers of the public administration
  only [39]. Electronic health record (FSE) integration: not researched.
- **Formats.** `Europe/Rome`; phone `+39`, the leading `0` of landlines is
  kept; 5-digit CAP followed by the city and province code (`00184 Roma RM`)
  (**UNVERIFIED** as sourced).
- **Legal pages.** The partita IVA must appear on the website (DPR 633/72 art.
  35; the rule moves to the VAT consolidated text, art. 68, from 1 January 2027)
  [40]; a privacy policy.
- **Professional advertising.** Code of Medical Ethics art. 56: truthful
  information on titles, activity, services and fees [41]; Law 145/2018
  (c. 525, as amended in 2023) forbids offers, discounts and promotions [42].

## Consequences

- The interface reads in five languages today; only French pages are indexed.
- New markets plug in through an adapter, an ETL source and a domain, without
  changing the French code paths.
- Germany, the United Kingdom and Italy have no open register of individual
  practitioners that allows republication: opening them needs a licence or a
  claimed-pages-only product. Spain needs the same check for REPS.
- Health-data hosting must be re-contracted per market: an HDS contract covers
  France, not Germany's C5 requirement.

## Sources

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
35. FNOMCeO search: <https://portale.fnomceo.it/cerca-prof/>
36. Regional and ministry open data: <https://dati.regione.campania.it/catalogo/datasetdetail/medici-medicina-generale>; <https://www.dati.salute.gov.it/it/dataset/strutture-e-attivita-asl/>
37. DM 23/12/1976 (codice fiscale): <https://www.nonsolocap.it/docs/dm-23-12-1976/>
38. Garante, compendium on patient–practitioner platforms (2024): <https://www.garanteprivacy.it/documents/10160/0/Compendio+sul+trattamento+dei+dati+personali+attraverso+piattaforme+volte+a+mettere+in+contatto+i+pazienti+con+i+professionisti+sanitari+accessibili+via+web+e+app.pdf/7fc9ca53-f078-af9b-248d-a71dee74da07?version=2.0&download=true>
39. ACN cloud regulation: <https://www.acn.gov.it/portale/en/w/cloud-per-la-pa-da-oggi-in-vigore-il-regolamento-unico-per-le-infrastrutture-e-i-servizi-cloud>
40. Partita IVA on websites: <https://www.fiscozen.it/guide/partita-iva-sito-web/>
41. FNOMCeO, Code of Medical Ethics art. 56: <https://portale.fnomceo.it/wp-content/uploads/2023/08/Art.56_definitivo_acc.pdf>
42. Health advertising rules: <https://www.omceovr.it/professione/disposizioni/pubblicit%C3%A0-sanitaria>

Possibly outdated: the ICO is still revising its guidance after the Data (Use
and Access) Act; the C5:2026 criteria catalogue is new; the Italian VAT
consolidated text applies from 2027; some regional Italian datasets are stale.
