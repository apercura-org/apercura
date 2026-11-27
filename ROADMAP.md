# Roadmap

What Apercura does today is described in the [README](./README.md) and in [`docs/`](./docs).
This file lists what comes next, roughly in order of expected value. Nothing here is a promise
or a date; the work in progress is tracked in the
[issues](https://github.com/apercura-org/apercura/issues).

Every module below plugs into an extension point that already exists, or adds one. A new module
ships behind its own feature flag (`apps/web/src/server/features.ts`), off by default until it
is ready.

## Launch status

Production is live on [apercura.fr](https://apercura.fr), with TLS, backups, monitoring and
alerts, deployed in [#34](https://github.com/apercura-org/apercura/issues/34). Online booking is on.
It moves to [apercura.org/fr](https://apercura.org/fr), every market on one domain, apercura.fr
redirecting ([#81](https://github.com/apercura-org/apercura/issues/81),
[the switch](./docs/deploy-vps.md#moving-production-to-apercuraorg)).

To keep costs down at launch, it runs on an interim host in the European Economic Area that is
**not HDS-certified**. Moving to an HDS-certified host is the first priority once the first users
and results are in, and it must happen before booking grows: Clever Cloud HDS by default,
Scalingo as the alternative ([`docs/deploy-clever-cloud.md`](./docs/deploy-clever-cloud.md),
[`docs/deploy-scalingo.md`](./docs/deploy-scalingo.md)). Then set `PUBLIC_HDS_HOST`.

The [launch checklist](./docs/launch-checklist.md) has the details of each step.

## Founder-only actions

What is left before and after launch is not code. Each item below needs the founder: a
signature, an account, a contract, a paid service or a manual test. This list replaces issues
#32, #33 and #34.

### Hosting

- Move production to the HDS-certified host and set `PUBLIC_HDS_HOST` (see above).

### Legal ([#33](https://github.com/apercura-org/apercura/issues/33))

- Create the legal entity (association or company) and fill in the publisher facts.
- Have a lawyer review every legal text, then set `LEGAL_TEXTS_REVIEWED` in
  `apps/web/src/lib/legal.ts`.
- Finish the DPIA ([`docs/legal/dpia-draft.md`](./docs/legal/dpia-draft.md)), appoint the DPO
  ([`docs/legal/dpo-appointment.md`](./docs/legal/dpo-appointment.md)) and keep the record of
  processing.
- Sign the article 28 processing agreement with practitioners
  ([`docs/legal/processor-agreement-draft.md`](./docs/legal/processor-agreement-draft.md)).
- Have the conventionnement wording reviewed (arrêté du 30 mai 2018, article 5,
  `{{CONVENTIONNEMENT_WORDING}}`).
- Sign the HDS hosting contract, with written confirmation of the HDS scope of each service.
- Search and file the "Apercura" trademark (INPI, EUIPO).
- Estonia: send the Health Board the letter of
  [`docs/data-requests/ee.md`](./docs/data-requests/ee.md) asking it to confirm that Apercura's
  reuse of the MEDRE open data fits CC BY-NC-SA 3.0 (non-commercial, share-alike, the credit,
  self-hosted instances). The market opened without waiting for the answer; follow it.
- Norway: send the Norwegian Medical Products Agency (DMP) the letter of
  [`docs/data-requests/no.md`](./docs/data-requests/no.md) asking for a licence for its list of
  pharmacies ("Landets apotek", none stated); the market opened from the register of legal
  entities without it.
- **Deadline 31 March 2027.** Finland: order a key for version 12 of the Finnish Service
  Catalogue's API (PTV self-service, free, the organisation's contact details) and have `etl:fi`
  moved to it. DVV switches version 11 off in April 2027 (its roadmap, read 2026-11-27, gives no
  day yet): after that the weekly Finnish import fails and the pages stop being refreshed
  ([`docs/data-requests/fi.md`](./docs/data-requests/fi.md#ptv-version-12)).
- Finland: send THL the letter of [`docs/data-requests/fi.md`](./docs/data-requests/fi.md#how-to-ask)
  asking for a licence for the SOTE organisation register (private providers).
- Cyprus: send the two letters of [`docs/data-requests/cy.md`](./docs/data-requests/cy.md): to
  the Ministry of Health and the State Health Services Organisation (ΟΚΥπΥ), asking for updated
  lists of state hospitals and health centres with addresses on data.gov.cy (the files date from
  2018), and to the Pharmaceutical Services, asking them to confirm that the list's ΑΜ is the
  pharmacy's registration number and to add a pharmacy name. The market opened without the
  answers.

### Accessibility ([#32](https://github.com/apercura-org/apercura/issues/32))

The automated part is done: no axe violation across the 224 end-to-end tests, a keyboard focus
test, reflow at 390 px and a Lighthouse CI score of 100. What is left is manual:

- A screen reader pass (VoiceOver on macOS and iOS, NVDA on Windows) over search, the
  practitioner page, booking, `/rdv` and the pro agenda.
- The RGAA 4.1 self-assessment
  ([`docs/accessibility/rgaa-self-assessment.md`](./docs/accessibility/rgaa-self-assessment.md)),
  then the published accessibility statement.

### Operations ([#34](https://github.com/apercura-org/apercura/issues/34))

- Register with Pro Santé Connect: iSC account, Datapass, sandbox, then production, with the
  redirect URI `{APP_URL}/api/auth/callback/psc`.
- Buy the other domains (apercura.health, apercura.eu) and redirect them to apercura.org.
- Submit the domain to the HSTS preload list once every subdomain is served over HTTPS for good.
- Order an external penetration test.
- Keep an off-site copy of the backups (an S3 bucket), if it is not set up yet.
- Test a restore regularly with `scripts/verify-backup.sh`.
- Follow up in Google Search Console and Bing Webmaster Tools.

## Next modules

1. **Embeddable booking widget** for the practitioner's own website, plus a "Book on Apercura"
   button.
2. **SMS reminders**, as a second `NotificationChannel` next to e-mail. Sending SMS costs money,
   so it needs a funding decision first.
3. **AI help for the page editor**: suggested presentation text and page layouts, built only
   from the practitioner's structured data, triggered by the practitioner, off without a key
   (`AiProvider`). It never invents a title, a diploma or a specialty, and never receives patient
   data. Medic Remplacement had a bio and headline generator that worked this way, one locale
   at a time.
4. **Pages managed by their structure**: health centres, multi-professional practices (MSP) and
   clinics edit their own establishment page and the agendas they host.
5. **Locum marketplace**, described in its own section below.
6. **Two-way calendar sync** with Google and Microsoft calendars. The private `.ics` feed exists
   today; this adds the other direction.
7. **Waiting list** and "earlier slot available" alerts for patients.
8. **Optional patient accounts**: booking history, booking for relatives. Booking without an
   account stays the default.
9. **Claim by post** (a code mailed to the registry address), and optional **end-to-end
   encryption** of free-text notes, sealed to the practice's public key.
10. **Give the enriched directory back** as open data (Licence Ouverte), geocoded and
    deduplicated.
11. **More countries**, one `CountryAdapter` each, in the order of the
    [International launch](#international-launch) section below
    ([ADR 0002](./docs/adr/0002-multi-country.md)). Medic Remplacement already covered Belgium
    (INAMI numbers), Switzerland (GLN) and Germany (Approbation), and its notes live on in
    [`docs/reference/medical-systems-by-country.md`](./docs/reference/medical-systems-by-country.md).
12. **Teleconsultation**, with a video provider that meets the same hosting requirements as the
    rest of the booking data.
13. **Home visits, next steps.** Self-employed nurses already book home visits
    ([#75](https://github.com/apercura-org/apercura/issues/75)): a service area of communes, the
    patient's address encrypted and shown to the practice only, a fixed travel time kept free
    between a visit and the practice, and once between two visits. Still to come:
    - **Travel time from the distance** between consecutive visits (commune centres first, then
      the practice's own route), instead of one fixed buffer;
    - **Other professions that visit patients**: physiotherapists, midwives and general
      practitioners, with their own presets.

## International launch

Every market lives on apercura.org under its own path
([#81](https://github.com/apercura-org/apercura/issues/81), paths as in ADR 0002 section 2). The order below comes from the market study
in [ADR 0002](./docs/adr/0002-multi-country.md#launch-order) (#82, 2026-11-25), which records the
sources and what is still UNVERIFIED. No market opens before its checklist is done.

Every market needs, on top of its own items:

- the points marked UNVERIFIED for that market checked with a primary source or a local lawyer,
  and the answer recorded in the ADR;
- a `CountryAdapter` (identifier, taxonomy, phone, address, time zones), an ETL source when there
  is open data, and the market's path and languages;
- its legal pages (legal notice, privacy notice with the art. 14 notice when pages come from a
  registry, terms) and a lawyer's review;
- a hosting contract that meets the market's health-data rules, and the DPIA updated;
- a legitimate-interest assessment and an easy opt-out when pages are generated from a registry.

### 1. Austria (`/at`): open, directory from open data

Done in [#107](https://github.com/apercura-org/apercura/issues/107): `/at` in German, built weekly by
`etl:at` from the CC BY 4.0 lists of Vienna, Styria and Salzburg (10,377 doctors and dentists),
with the attributions on the data sources page, the Impressum and Datenschutzerklärung, claims by
documents, no booking ([data import](./docs/data-import.md#austria), [ADR 0002](./docs/adr/0002-multi-country.md#austria-at)).
Left:

- Send the re-use requests of [`docs/data-requests/at.md`](./docs/data-requests/at.md) to the
  chambers of the six other Länder, the national chamber and the ÖGK (founder).
- Check the medical chamber's guideline on advertising against ÄrzteG §53, the DSB's stance on
  directories, and have an Austrian lawyer review the Impressum and Datenschutzerklärung.
- Booking in Austria once the Gesundheitstelematikgesetz question is answered.
- Enrich the practices with the primary care units of Vienna and Upper Austria (CC BY 4.0).

### 2. Switzerland (`/ch`, `/ch-fr`, `/ch-it`): open, directory of facilities

Done in [#154](https://github.com/apercura-org/apercura/issues/154): `/ch` in German, `/ch-fr` in
French and `/ch-it` in Italian, each indexed with the others as hreflang alternates, built monthly
by `etl:ch` from the FOPH's "Kennzahlen der Schweizer Spitäler 2023" (every hospital and clinic
site) and the cantons' open lists: hospitals (Bern, Geneva, Basel-Stadt, Jura), nursing homes
(Zürich, Bern, Geneva, Basel-Stadt, Basel-Landschaft, Jura) and pharmacies (Basel-Landschaft, and
Geneva's that vaccinate), about 1,400 pages, placed in the BFS cantons, districts and communes by
swisstopo's postcode directory, listed per canton too, each list credited in its publisher's
words, an Impressum and a privacy notice under the revised FADP, claims by documents, no booking
([data import](./docs/data-import.md#switzerland),
[ADR 0002](./docs/adr/0002-multi-country.md#switzerland-ch)). Facilities only: no health
professional is listed. Left:

- Ask the FOPH for the 2024 figures and later editions under the 2023 terms
  ([`docs/data-requests/ch.md`](./docs/data-requests/ch.md)); ask the other cantons to publish
  their pharmacies and nursing homes as open data.
- Write to the FOPH (MedReg standard interface, Registerverordnung MedBG art. 11) to ask whether a
  free public-interest directory may use and republish the register.
- Decide on a Swiss representative (nFADP art. 14) and write the DPIA (art. 22); have a Swiss
  lawyer review the Impressum, Datenschutzerklärung and terms in their three languages.
- Verify claims through MedReg and GesReg lookups and the GLN; contract with practitioners for
  professional secrecy (StGB art. 321).
- Check FMH annex 2 point 3.7 and the cantonal rules on advertising before practitioners' pages.

### 3. Czechia (`/cz`): open, directory of places of care

Done in [#131](https://github.com/apercura-org/apercura/issues/131): `/cz` in Czech, built weekly by
`etl:cz` from the National Register of Healthcare Providers (NRPZS, ÚZIS ČR, CC BY 4.0, monthly
CSV): one page per place of care of general practitioners, paediatricians, dentists,
gynaecologists, specialists (listed by field of care), pharmacies, home care agencies,
physiotherapists, clinical psychologists, speech therapists and midwives, located by the
register's coordinates and placed in RÚIAN's districts and municipalities (ČÚZK, CC BY 4.0), with
the attributions on the data sources page, a GDPR privacy notice with the article 14 information,
claims by documents, no booking ([data import](./docs/data-import.md#czechia),
[ADR 0002](./docs/adr/0002-multi-country.md#czechia-cz)). Left:

- Have a native speaker review the Czech interface, and a Czech lawyer the legal notice, privacy
  notice and terms; check the Czech Medical Chamber's ethics code on third-party listings.
- Send the requests of [`docs/data-requests/cz.md`](./docs/data-requests/cz.md) (founder): the
  Czech Medical Chamber's member list, SÚKL's pharmacy list (opening hours), the insurers'
  contracted providers.
- Hospitals and polyclinics (the same file): pages that tell a ward or a multi-field centre apart.

### 4. United Kingdom (`/gb`): open, practice pages from NHS open data

Done in [#125](https://github.com/apercura-org/apercura/issues/125): `/gb` in British English, built
weekly by `etl:gb` from the NHS organisation data under the Open Government Licence (ODS for
England and Wales, Public Health Scotland, the Business Services Organisation in Northern
Ireland): about 31,000 GP practices, dental practices and pharmacies, located by postcode
(Code-Point Open), listed by region and nation, local authority and town, with the attributions
on the data sources page, a UK GDPR privacy notice, claims by documents, no booking
([data import](./docs/data-import.md#united-kingdom), [ADR 0002](./docs/adr/0002-multi-country.md#united-kingdom-gb)).
Practices only: no clinician is listed. Left:

- Send the requests of [`docs/data-requests/gb.md`](./docs/data-requests/gb.md) (founder): the
  GMC's republication licence for named doctors, Land & Property Services for Northern Irish
  postcodes, the BSO for the district and coordinates of each GP practice, NHS England for
  websites and opening hours (Organisation Data Terminology API onboarding).
- Have a lawyer qualified in the UK review the legal notice, privacy notice and terms; check
  whether a UK representative or ICO registration (data protection fee) is needed for the
  publisher.
- Confirm with the CQC (and the devolved regulators) that a pure booking site is out of scope
  before booking opens in the UK.

### 5. Poland (`/pl`): open, directory of healthcare establishments

Done in [#164](https://github.com/apercura-org/apercura/issues/164): `/pl` in Polish, built weekly
by `etl:pl` from RPWDL, the register of entities performing medical activity (Centrum e-Zdrowia,
dane.gov.pl, CC BY 4.0, daily): one page per healthcare establishment (zakład leczniczy) of the
healthcare entities (podmioty lecznicze), about 34,000 hospitals, primary care and specialist
clinics, dental clinics, hospices, care homes, sanatoria, laboratories and rehabilitation
centres at about 61,000 places of care, placed in TERYT's voivodeships, powiats and gminas (GUS)
at their gmina's interior point (computed from GUGiK's State Register of Boundaries; city
precision, no map pin), listed per voivodeship too, with RPWDL's attribution stating the time the
data was produced and obtained, a legal notice and terms under the 2002 e-services act, a privacy
notice with the article 14 information (UODO), claims by documents, no booking
([data import](./docs/data-import.md#poland),
[ADR 0002](./docs/adr/0002-multi-country.md#poland-pl)).

**Decision (2026-11-27): establishments only, no practitioner.** The register's other part, the
individual and group practices of doctors, dentists, nurses, midwives and physiotherapists
(praktyki zawodowe), is not imported. Listing named practitioners without their consent is the
question of the Supreme Administrative Court's case III OSK 1052/21 (ZnanyLekarz), sent back to the
lower court in 2022 and still open: practices wait for a Polish legal opinion. A sole trader who
runs an establishment is never named from the entity's name, and the establishment's name drops
theirs where the register gives it. Left:

- Have a native speaker review the Polish interface, and a Polish lawyer the legal notice, privacy
  notice, terms (the 14-day complaint deadline, the NFZ helpline number quoted), accessibility
  statement and data page, and the reasoning that the factual pages have no "features of
  advertising" (Act on medical activity art. 14 ust. 1).
- Write the legitimate-interest assessment for the establishments named after a sole trader or
  partners, and check the name minimisation on a sample of the real file.
- A Polish legal opinion on III OSK 1052/21 (listing without consent, the balancing it asks for)
  before any page of a praktyka zawodowa; claimed pages only until then.
- Pharmacies: the Rejestr Aptek (dane.gov.pl, CC BY 4.0; location and opening hours are not
  advertising under art. 94a Prawo farmaceutyczne) is published only as a legacy binary XLS, and
  names owners and managers: a reader for it, the owners' and managers' minimisation, and the
  request of [`docs/data-requests/pl.md`](./docs/data-requests/pl.md) for a CSV again.
- Set the `LEGAL_*` operator facts of the Polish legal notice.
- Warsaw's districts as places, once the register codes most units by district (two thirds carry
  the city's code only today).

### 6. Belgium (`/be-fr`, `/be-nl`, `/be-de`) and Luxembourg (`/lu-fr`, `/lu-de`): claimed pages

- Belgium: no page for a practitioner who has not opted in (DPA decision 149/2023); never ask
  patients for their national register number. Dutch interface (`nl`) for Flanders.
- Luxembourg: check the Collège médical charter (no priority placement) and the rule on
  directories for other health professions.

### 7. Spain (`/es`): open, directory of health centres

Done in [#148](https://github.com/apercura-org/apercura/issues/148): `/es` in Spanish, built weekly
by `etl:es` from the monthly extracts of the General Register of health centres, services and
establishments (REGCESS, Ministerio de Sanidad, reuse under Ley 37/2007 citing the source and its
date): one page per hospital, health centre or local surgery, doctor's practice (listed by
specialty), other health professional's practice, polyclinic, dental clinic and pharmacy (about
115,000), placed by INE code in the IGN's provinces and municipalities (CC BY 4.0) at their
municipality's point (city precision: the register publishes no coordinates), with the
attributions on the data sources page, a GDPR and LOPDGDD privacy notice with the article 14
information, claims by documents, no booking ([data import](./docs/data-import.md#spain),
[ADR 0002](./docs/adr/0002-multi-country.md#spain-es)). Left:

- Have a native speaker review the Spanish market texts, and a Spanish lawyer the aviso legal,
  privacy notice and terms (LSSI, LOPDGDD); decide whether home-visit practices registered at a
  person's address should show their street.
- Send the requests of [`docs/data-requests/es.md`](./docs/data-requests/es.md),
  [`es-reps.md`](./docs/data-requests/es-reps.md) and
  [`es-cgcom.md`](./docs/data-requests/es-cgcom.md) (founder); verify claims against the college
  registers (Ley 2/1974 art. 10).
- Exact locations (a geocoder whose terms allow bulk use), opening hours, and the centre types
  left out (mental health centres, opticians, diagnostics).

### 8. Italy (`/it`): open, directory of pharmacies and hospitals

Done in [#150](https://github.com/apercura-org/apercura/issues/150): `/it` in Italian, built weekly
by `etl:it` from the open data of the Ministry of Health (dati.salute.gov.it, IODL 2.0, cited with
the date of its data): one page per pharmacy (with its branches and dispensaries), parapharmacy,
hospital and accredited private clinic (about 29,000), placed by ISTAT code in ISTAT's regions,
provinces and municipalities (CC BY 4.0) at their municipality's point (city precision: the
ministry says some of its coordinates come from OpenStreetMap), listed by region too, with the
attributions on the data sources page, a GDPR and Codice privacy notice with the article 14
information, claims by documents, no booking ([data import](./docs/data-import.md#italy),
[ADR 0002](./docs/adr/0002-multi-country.md#italy-it)). Places only: no health worker is listed.
Left:

- Decide whether to keep the lists' coordinates (`--register-coordinates`, address precision),
  and ask the ministry which of them come from OpenStreetMap.
- Have a native speaker review the Italian market texts, and an Italian lawyer the note legali,
  privacy notice and terms (D.Lgs. 70/2003, Codice privacy).
- Send the requests of [`docs/data-requests/it.md`](./docs/data-requests/it.md) and
  [`it-fnomceo.md`](./docs/data-requests/it-fnomceo.md) (founder): the coordinates' provenance,
  the outpatient facilities of the SSN (STS.11), the FNOMCeO's Albo unico.
- Booking only with an explicit consent step (Garante, 2024 compendium) and the DPIA; regional GP
  open data (Milan, Campania) only after a GDPR assessment.

### 9. Ireland (`/ie`): open, directory of facilities

Done in [#171](https://github.com/apercura-org/apercura/issues/171): `/ie` in English (locale
`en-IE`), built weekly by `etl:ie` from the Pharmaceutical Society of Ireland's register of retail
pharmacy businesses and HIQA's register of designated centres for older people (re-use under the
publishers' PSI conditions, credited with their copyright) and the HSE's Health Atlas hospitals and
health centres on GeoHive (CC BY 4.0, a March 2020 snapshot, said so on every page and the data
page): about 3,600 pages, placed in Tailte Éireann's 26 counties and the CSO's Census 2022 towns by
the town their list writes, never by Eircode, at the town's point (city precision) or the HSE's
point; a legal notice under S.I. No. 68 of 2003, a privacy notice under the GDPR and the Data
Protection Act 2018 with the article 14 information, claims by documents, no booking
([data import](./docs/data-import.md#ireland),
[ADR 0002](./docs/adr/0002-multi-country.md#ireland-ie)). Facilities only: no health professional
is listed. Left:

- Have a lawyer qualified in Ireland review the legal notice, privacy notice, terms and
  accessibility statement (S.I. No. 68 of 2003, Data Protection Act 2018, Consumer Rights Act
  2022), and a native speaker the Irish-English copy.
- Keep the PSI's condition met: never use the register "for the principal purpose of advertising or
  promoting a particular product or service" (no sponsored result, paid upgrade or affiliate link on
  Irish pharmacy pages; [`docs/data-requests/ie.md`](./docs/data-requests/ie.md)).
- Ask the HSE for current hospital and health centre layers, and file the re-use request to the
  Medical Council under the Open Data and PSI Regulations 2021
  ([`ie-medical-council.md`](./docs/data-requests/ie-medical-council.md)) (founder).
- An Irish-language interface (`/ie-ga`, locale `ga-IE`): Irish is an official language; the
  Official Languages Act 2003 binds public bodies only, so it is a choice, not a duty.

### 10. Small open-data markets

- Malta (doctors and dentists, CC BY 4.0): written confirmation from the Medical Council.
- Slovenia opened (section 15).
- Latvia (`/lv`): open, see below.

#### Latvia (`/lv`): open, GP practices, hospitals and pharmacies

Done in [#166](https://github.com/apercura-org/apercura/issues/166): `/lv` in Latvian, built weekly
by `etl:lv` from three CC0 1.0 lists of data.gov.lv: the National Health Service's quarterly list
of GPs and their practices, joined by institution code to the Ministry of the Interior's addresses
of medical institutions (293 GP practices naming their 304 GPs; the others have no published
address), the hospitals of that list (66) and the State Agency of Medicines' pharmacies and
branches (814), placed in the State Land Service's towns and parishes (CC BY 4.0) at their
published point, with every source credited on each page, a legal notice, a privacy notice with
the article 14 notice for the GPs, a written legitimate-interest assessment
([`docs/legal/lia-latvia-gps.md`](./docs/legal/lia-latvia-gps.md)), terms, an accessibility
statement, claims by documents, no booking ([data import](./docs/data-import.md#latvia),
[ADR 0002](./docs/adr/0002-multi-country.md#latvia-lv)). Left:

- **Native and lawyer review:** have a native speaker review the Latvian interface and market
  texts (`apps/web/messages/lv.json`), and a lawyer qualified in Latvia the legal notice
  (Informācijas sabiedrības pakalpojumu likums, s. 4), privacy notice, terms and accessibility
  statement, and the legitimate-interest assessment for naming GPs (article 14(5)(b), the
  advertising rules of the Medical Treatment Law, s. 11).
- Send the request of [`docs/data-requests/lv.md`](./docs/data-requests/lv.md) (founder): the
  NVD's practices' addresses and phones as open data, which would list the other three quarters
  of the GP practices; ask the Ministry of the Interior's Information Centre to refresh its 2024
  list.
- Decide whether to inform the family doctors' associations when the pages open (assessment,
  "Article 14 information").
- An objection on a multi-GP practice removes the whole page: a per-GP objection (drop one name,
  keep the practice) is a follow-up.

### 11. Germany (`/de`): open, facility pages; booking later

Done in [#152](https://github.com/apercura-org/apercura/issues/152): `/de` in German, built
monthly by `etl:de` from the statistical offices' yearly directory of hospitals and of prevention
and rehabilitation clinics (Destatis, reproduction with the source: about 3,800 hospital sites and
clinics, hospitals listed apart from psychiatric and children's hospitals by their departments)
and the pharmacy lists of Thuringia (CC BY 4.0) and Brandenburg (dl-de/by-2-0, about 1,000),
placed in Destatis's Kreise and Gemeinden (GV-ISys) at their Gemeinde's centre (city precision:
the directory publishes no coordinates; pharmacies at their address), with the attributions on the
data sources page, an Impressum (DDG § 5), a privacy notice with the article 14 information,
claims by documents, no booking ([data import](./docs/data-import.md#germany),
[ADR 0002](./docs/adr/0002-multi-country.md#germany-de)). Left:

- Have a native speaker review the German market texts, and a German lawyer the Impressum,
  Datenschutzerklärung and terms (DDG, MStV, DSGVO, BDSG).
- Pharmacies of the other Länder: send the requests of
  [`docs/data-requests/de.md`](./docs/data-requests/de.md) (Saarland's open list dates from 2021);
  Land listings ("Krankenhäuser in Bayern") would need a migration like Italy's region listings.
- Practitioners: the requests of [`de-kbv.md`](./docs/data-requests/de-kbv.md) and
  [`de-aerztekammern.md`](./docs/data-requests/de-aerztekammern.md) (founder); claimed pages
  until then.
- Booking only with a host holding a BSI C5 Type 2 attestation, after a legal opinion on §393
  SGB V (processor or controller, establishment in Germany) and once the GeDIG rules for private
  booking platforms are known.

### 12. Estonia (`/ee`): open, directory of providers and pharmacies

Done in [#165](https://github.com/apercura-org/apercura/issues/165): `/ee` in Estonian, built
weekly by `etl:ee` from the Health Board's register of healthcare providers and their activity
licences (Terviseamet, MEDRE open data, CC BY-NC-SA 3.0, republished under the same licence:
1,518 providers) and the State Agency of Medicines' general pharmacies (Ravimiamet,
CC0 1.0: 469), placed in the Land and Spatial Development Board's counties,
municipalities and settlements (EHAK) and located at their address points (ADS, CC0 1.0), every
provider page printing its activity licence numbers as the Advertising Act (§ 22(3)) requires,
with a legal notice (InfoTS § 4), a privacy notice with the article 14 information, claims by
documents, no booking ([data import](./docs/data-import.md#estonia),
[ADR 0002](./docs/adr/0002-multi-country.md#estonia-ee)). Providers only: the health workers
the register names with each provider are not listed. Left:

- Send the letter to the Health Board (founder, above) and follow its answer on the NC and SA
  terms.
- Have a native speaker review the Estonian interface and legal texts, and a lawyer admitted in
  Estonia the legal notice, privacy notice (legitimate-interest assessment for the sole traders
  listed under their own names) and terms.
- Russian: widely spoken in Estonia; an `ru-EE` interface under `/ee-ru` (its catalog, its route
  segments, search words) is a follow-up of its own.
- Named health workers (the register's `tootajad`) and the family doctors' lists (`nimistud`):
  only after a legitimate-interest assessment, the article 14 notice, opt-out handling and a
  reading of how the NC and SA terms apply to personal data
  ([`docs/data-requests/ee.md`](./docs/data-requests/ee.md)).
- Listings by specialist field (a cardiology listing rather than "specialist care") and by
  county (`/ee/haiglad/harju-maakond` would need a migration like Italy's region listings).

### 13. Norway (`/no`): open, directory of establishments of care

Done in [#172](https://github.com/apercura-org/apercura/issues/172): `/no` in Norwegian Bokmål,
built weekly by `etl:no` from the Brønnøysund Register Centre's Central Coordinating Register for
Legal Entities (Enhetsregisteret, NLOD 2.0: 5,821 establishments under health and pharmacy
industry codes, kept when they read as a place of care, no sole proprietorship and no practice
named after a person), placed in Kartverket's counties and municipalities and located at the
cadastre's addresses (Matrikkelen – Adresse, CC BY 4.0), every page printing NLOD's credit, with a
legal notice (ehandelsloven § 8), a privacy notice with the article 14 information and
Datatilsynet, claims by documents, no booking ([data import](./docs/data-import.md#norway),
[ADR 0002](./docs/adr/0002-multi-country.md#norway-no)). Left:

- Have a native speaker review the Norwegian interface and legal texts, and a lawyer admitted in
  Norway the legal notice, privacy notice and terms, and confirm the reading of helsepersonelloven
  § 13 (factual pages) and of NLOD § 3 (no sole proprietorships).
- Send the letter to DMP (founder, above); with a licence, print each pharmacy's licence.
- Nynorsk (`/no-nn`) and Northern Sámi (`/no-se`) interfaces, and the municipalities' Sámi, Kven
  and Finnish official names.
- Physiotherapists, psychologists, chiropractors, home nursing and health stations (SN2025 86.950,
  86.930, 86.941, 86.942): mostly sole proprietorships, so the same filters and a review of what
  they keep.
- The practices left out because their owner is a company and their name carries no care word
  (2,471 in November 2026): a licence register (HPR, Helsedirektoratet's lists) would tell the
  clinics among them from the holding companies.
- Named practitioners: only from HPR under an agreement with Helsedirektoratet, after a
  legitimate-interest assessment.

### 13. Finland (`/fi`): open, directory of public health service locations

Done in [#173](https://github.com/apercura-org/apercura/issues/173): `/fi` in Finnish, built
weekly by `etl:fi` from the Finnish Service Catalogue (Suomi.fi-palvelutietovaranto, PTV, DVV,
CC0 1.0, read through its open API): 3,752 public health service locations of the wellbeing
services counties, the City of Helsinki, Åland, HUS and other public organisers (hospitals and
their units, emergency clinics, health centres, dental clinics, maternity and child health
clinics, mental health and substance abuse services, rehabilitation, laboratories and imaging),
placed in Statistics Finland's municipalities, wellbeing services counties and regions (CC BY
4.0) and located at the catalogue's own points, with a legal notice (Act 917/2014), a privacy
notice with the article 14 information, claims by documents, no booking
([data import](./docs/data-import.md#finland),
[ADR 0002](./docs/adr/0002-multi-country.md#finland-fi)). Places, not people. Left:

- Order the version 12 API key and move the fetch by 31 March 2027, before version 11 is
  switched off in April 2027 (founder, above).
- Have a native speaker review the Finnish interface and legal texts, and a lawyer admitted in
  Finland the legal notice (confirm § 176 of Act 917/2014), privacy notice and terms.
- Booking: only once it is settled whether a booking tool must be a registered class A or B
  system connected to Kanta (Act 784/2021); ask THL or Kanta's services. The directory does not
  depend on it.
- Swedish: Finland's other national language; an `sv-FI` interface under `/fi-sv` (its catalog,
  its legal texts, route segments and search words, the catalogue's Swedish names), like `/ch-fr`.
- Pharmacies (no open list: ask Fimea) and private providers (THL's SOTE organisation register,
  once licensed, after a legitimate-interest assessment for the sole traders named after
  themselves) ([`docs/data-requests/fi.md`](./docs/data-requests/fi.md)).
- The 127 named health locations whose services carry no health class (some Tyks wards): classify
  every location by its name alone; service hours on the pages.

### 14. Lithuania (`/lt`): open, directory of licensed institutions

Done in [#170](https://github.com/apercura-org/apercura/issues/170): `/lt` in Lithuanian, built
weekly by `etl:lt` from the licence register of health-care institutions of the State
Accreditation Service for Health Care Activities (VASPVT, CC BY 4.0, daily): every activity address
of a licensed institution, its kind read from the services licensed there (hospitals, primary
care, medical centres, dental clinics, mental health, rehabilitation, nursing, laboratories,
optometrists), about 6,200 pages, placed in the Address Register's counties,
municipalities and settlements by VASPVT's address text, at the settlement's point (city
precision), listed per county too, with the Lithuanian credits on the data sources page, a legal
notice, a privacy notice with the article 14 information for the owners an institution's name may
name, claims by documents, no booking ([data import](./docs/data-import.md#lithuania),
[ADR 0002](./docs/adr/0002-multi-country.md#lithuania-lt)). Institutions only: no health worker
and no pharmacy is listed. Left:

- Have a native speaker review the Lithuanian interface and market texts, and a Lithuanian lawyer
  the legal notice, privacy notice and terms (Law on Information Society Services, GDPR and the
  Law on Legal Protection of Personal Data, the Law on Advertising, art. 15).
- Send the requests of [`docs/data-requests/lt.md`](./docs/data-requests/lt.md) (founder): VLK's
  contracted places with addresses, VVKT's pharmacies, a kind and a postcode in VASPVT's register,
  current address points from Registrų centras.
- Confirm with VASPVT what licence status `2` means (read as suspended, not imported).

### 15. Slovenia (`/si`): open, directory of personal doctors

Done in [#167](https://github.com/apercura-org/apercura/issues/167): `/si` in Slovenian, built
weekly by `etl:si` from the health insurer's daily lists of the doctors who can be chosen as a
personal doctor (ZZZS, "Poimenski seznami zdravnikov, ki so lahko osebni zdravniki", CC BY 4.0 on
podatki.gov.si): one page per doctor (about 2,900 family doctors, children's and school doctors,
gynaecologists and dentists), each practice with its ZZZS activities and whether the doctor still
takes new patients, with the date of the list; placed in GURS's statistical regions and
municipalities (Register of Spatial Units, CC BY 4.0) at their street's or settlement's point (city
precision: the lists publish no coordinates), with the attributions on the data sources page, a
legal notice (ZEPT art. 5), a GDPR privacy notice with the article 14 information, claims by
documents, no booking ([data import](./docs/data-import.md#slovenia),
[ADR 0002](./docs/adr/0002-multi-country.md#slovenia-si)). Left:

- Have a Slovenian lawyer review the legal notice, privacy notice (the legitimate-interest
  assessment for named doctors, the article 14 notice), terms and data page in Slovenian; ask
  whether ZVOP-2 applies to a publisher established in France (its article 4) and whether a
  representative is needed.
- Have a native speaker proofread the Slovenian catalog (`messages/si.json`).
- Send the requests of [`docs/data-requests/si.md`](./docs/data-requests/si.md) (founder): ZZZS
  for a stable address of the files (the download links carry a `cHash` that its `robots.txt`
  disallows), its acknowledgement of the weekly download and the attribution wording; the
  Medical Chamber's permission to use its register, only if specialists are ever wanted.
- Decide on pharmacies (the Ministry of Health's list, CC BY 4.0) as a follow-up: a facility in a
  market of doctors' pages needs its own page handling.
- Booking stays off.

### 14. Cyprus (`/cy`): open, directory of pharmacies, state hospitals and health centres

Done in [#174](https://github.com/apercura-org/apercura/issues/174): `/cy` in Greek (`el-CY`),
built monthly by `etl:cy` from the Ministry of Health's open lists on data.gov.cy (CC BY 4.0: 658
private pharmacies of the Pharmaceutical Services, named after their address since the list
names only the pharmacist, whose name and house telephone are never read; 8 state hospitals; 33
state health centres), placed in the five districts and the 404 municipalities and communities
of CYSTAT's 2021 census with Cyprus Post's postcodes and centres, every page printing its credit,
with a legal notice (Law 156(I)/2004), a privacy notice with the article 14 information and the
Commissioner for Personal Data Protection, claims by documents, no booking
([data import](./docs/data-import.md#cyprus), [ADR 0002](./docs/adr/0002-multi-country.md#cyprus-cy)).
Left:

- Have a native Greek speaker review the Greek interface and legal texts, and a lawyer admitted in
  Cyprus the legal notice (confirm the citation of Law 156(I)/2004, section 8), the privacy notice
  and the terms; confirm the reading of article 45 of the Code of Medical Ethics (listings
  "uniform for all") and of the pharmacies' advertising rules.
- An English interface, `/cy-en` (`en-CY`), as Switzerland's languages, and a Turkish one.
- Map pins for the pharmacies and health centres: they sit at their municipality's or
  community's centre, as no open address points cover the island (the Department of Lands and
  Surveys' cover about 4%).
- The two health centres left out ("Δευτεράς/ Ανθούπολης", "Παλαιοχωρίου": their name fits no
  single place), and the 2018 state lists' staleness: the letter above.
- The twenty municipalities of the 2024 local-government reform as a listing level.
- Private clinics, doctors and dentists, when an open source exists (the Medical Council's
  register states no licence).

### Later

The Netherlands, Portugal, Croatia, Romania, Denmark, Sweden, Slovakia,
Hungary, Bulgaria, Iceland and Liechtenstein open with claimed pages when there is demand.
Croatia (HZZO) becomes a directory if its publisher confirms an open licence, and Cyprus adds
its doctors if the Medical Council's register is published under one. Booking in Finland waits for a ruling on whether a booking site is a registered system
connected to Kanta, and Greece for a legal opinion on Law 3418/2005 art. 17.

## Practitioner tools

Smaller additions to the pro area, most of them inherited from Medic Remplacement:

- ~~**Page statistics**: views per day (an aggregated daily counter, no visitor tracking and no
  cookie), bookings per week, and a checklist of what is missing from the page with a completion
  score.~~ Done (#92): `/pro/statistiques`, counted for claimed pages only, kept 13 months.
- ~~**Share kit**: the page link and a printable QR code for the waiting room or the door plate.~~
  Done (#92): `/pro/partager`, with the QR code as SVG and PNG, an A4 or A5 poster to print and
  a "Find me on Apercura" badge without script or cookie.
- ~~**"I am this practitioner" contact path and admin alerts**~~. Done (#92): a public form for
  those who cannot claim online, stored encrypted for the admin queue, and batched email alerts
  of new claims and requests.
- **Opening hours**, entered by the practitioner for each place and shown on the page, then
  published in the JSON-LD (`openingHoursSpecification`, which `src/lib/structured-data.ts`
  already accepts). Not taken from the booking agenda: its weekly windows
  (`care.availability_rules`) are when patients may book online, sometimes for a few
  appointment types or between two dates, not when the practice is open (phone hours,
  appointments booked elsewhere, walk-ins). Published as opening hours, they would tell search
  engines a practice is closed when it is only not bookable online
  ([#91](https://github.com/apercura-org/apercura/issues/91)).
- **In-app notifications**: a bell in the pro area for new bookings, pending requests and claim
  decisions, in addition to the e-mails. Booking e-mails already go through an outbox, so this is
  a second reader of the same events.
- **Blog or guides**: articles for patients ("how to find a midwife", "what a sector 2 fee
  means"), written as content files, not hard-coded pages.

## Locum marketplace

Apercura already models locums: an activity with the `locum` practice kind gets a public page
that says "locum doctor" and shows no patient booking. The marketplace adds the other half: a
practice that needs a replacement finds a locum, and a locum finds missions. It is a B2B module
between verified professionals; patients never see it.

This was the core of Medic Remplacement, the project Apercura replaces. Its code is not reused
(it was a different stack and data model), but its scope and rules are recorded here so the
module can be rebuilt without it.

### Scope

| Feature             | What it does                                                                                                                                                                                                                                                                                                          |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Missions**        | A practice posts a replacement need: title, specialty, dates, daily rate, place, description. Status `open`, `filled`, `cancelled` or `expired`. A mission that starts within 48 hours is flagged urgent automatically.                                                                                               |
| **Applications**    | A locum applies with a message; the practice accepts or declines. Status `pending`, `accepted` or `rejected`. Accepting one application fills the mission.                                                                                                                                                            |
| **Alerts**          | A locum sets criteria (specialties, a home location with a radius in km, default 50, between 1 and 500, a minimum daily rate) and channels (e-mail, in-app). A new mission that matches notifies them; an urgent mission says so. Locums without criteria are matched on their profile (specialty and travel radius). |
| **Availability**    | A per-day calendar: the locum marks days as available or not, with an optional note. One row per locum and day.                                                                                                                                                                                                       |
| **Direct booking**  | A practice asks a locum for given dates, with or without a mission; the locum confirms or declines. Status `pending`, `confirmed`, `rejected` or `cancelled`, with a cancellation deadline.                                                                                                                           |
| **Messaging**       | One conversation per practice and locum pair.                                                                                                                                                                                                                                                                         |
| **Favourites**      | A practice keeps a list of locums it has worked with.                                                                                                                                                                                                                                                                 |
| **History**         | Past missions for both sides.                                                                                                                                                                                                                                                                                         |
| **Marketplace hub** | Three tabs for the locum: "For you" (matching their alerts), "All missions", "My applications".                                                                                                                                                                                                                       |

### How it fits Apercura

- **Identity**: both sides are verified practitioners. A practice is an Apercura organization;
  a locum is a claimed practitioner page with a `locum` activity. No separate "cabinet" or
  "doctor" account type as in Medic Remplacement.
- **Places**: missions use the `places` table and PostGIS (`ST_DWithin` on `geography`), not the
  in-memory distance filter Medic Remplacement used.
- **Time**: mission and booking dates are civil dates in the site's time zone, not instants.
- **Notifications**: matching runs as a job over the outbox, not inside the request that creates
  the mission, so posting a mission stays fast however many locums match.
- **Data**: the marketplace holds no patient data, so it stays out of the `care` schema and its
  encryption and audit trail.
- **Countries**: missions carry a country, and the rules for replacements differ by country and
  profession (in France, a locum contract and a declaration to the Ordre). The module shows those
  rules; it does not handle the paperwork.

### Not carried over

- **Ratings between practices and locums, and the "Top locum" badge** (10 missions or more with
  an average rating of 4.5 or more in Medic Remplacement). Public ratings and rankings of
  practitioners conflict with the professional codes of conduct (`R.4127-19-1` for doctors).
  If feedback between professionals comes back, it stays private between the two parties and is
  reviewed with the Ordres first.

## Never

These are product decisions, not missing features:

- patient reviews, ratings or stars on practitioner pages;
- paid ranking, sponsored results or advertising;
- trackers or a cookie banner;
- artificial urgency ("only 2 slots left").
