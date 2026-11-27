# Legitimate-interest assessment: naming Latvia's GPs on GP practice pages

Status: **draft of 27 November 2026, to be reviewed by a lawyer qualified in Latvia and by the
data protection officer before the Latvian pages are promoted.** Issue
[#166](https://github.com/apercura-org/apercura/issues/166). Template: the ICO's three-part test
(purpose, necessity, balancing), the one the EDPB's guidelines 1/2024 on article 6(1)(f) follow.

## The processing

The Latvian directory (`/lv`) publishes one page per GP practice contracted by the National
Health Service (Nacionālais veselības dienests, NVD), at the address the Ministry of the
Interior's Information Centre publishes for the institution. Each page names the practice's GPs.

|               |                                                                                                                                                                                                                                                                                                              |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Data subjects | GPs (ģimenes ārsti) under contract with the NVD whose practice has a published address: 304 people in the list of March 2026                                                                                                                                                                                 |
| Data          | First name and family name of each GP; the practice's name as the NVD publishes it (often the GP's own name: "Ilzes Paraugas ģimenes ārsta prakse"); the practice's address, which is a place of business                                                                                                    |
| Not processed | The GP's identifier, the patient counts by age group, any private address, e-mail address or phone number, personal identity number, date of birth, photograph, rating or review. The identifier and the counts are in the file but are never read into a row (`packages/etl/src/sources/lv/nvd.ts`, tested) |
| Source        | NVD, "Ģimenes ārsta praksē reģistrēto pacientu skaits", quarterly, CC0 1.0 on data.gov.lv (verified 27 November 2026)                                                                                                                                                                                        |
| Recipients    | The public and search engines; the hosting provider in the EEA (processor)                                                                                                                                                                                                                                   |
| Retention     | As long as the NVD's list names the GP at that practice: a GP's name leaves the page at the first import of a new quarter that no longer gives it; a practice the list no longer gives is removed after two such imports                                                                                     |
| Code          | `packages/etl/src/sources/lv/practices.ts`, `packages/etl/src/merge-lv.ts`; rendering in `apps/web/src/app/[locale]/praticien/[slug]/page.tsx`                                                                                                                                                               |

## 1. Purpose test: is there a legitimate interest?

- **Patients choose their GP.** In Latvia a patient registers with a GP of their choice whose
  practice serves their territory; the NVD publishes the list of practices and their GPs as open
  data so that patients can make that choice. A patient asks "which GP can I register with near
  me, and where is the practice?": the GP's name is the very thing they choose.
- **Public interest in open health-service data.** The NVD's dataset is published for reuse,
  under CC0, by the public body that contracts the GPs. Reusing it to make it findable by place,
  in Latvian, with the address on a map, serves the same public interest it was published for.
- **Apercura's own interest** (a free, neutral directory) is legitimate and lawful: no
  advertising, no paid ranking, no reviews, no sale of data.

The interest is specific, real and present. A licence that allows reuse is not by itself a legal
basis under the GDPR (ADR 0002, section 4): this assessment is.

## 2. Necessity test: is naming the GPs necessary?

- **The practice alone would not do.** About half the practices are named after their GP
  anyway; for the others ("Vesela ģimene", a polyclinic with twenty GPs), the patient chooses a
  GP, not a company. Without the names, a patient could not tell which practice is the GP they
  were told about, nor check that the GP still practises there.
- **The minimum is kept.** First and family name only, as the NVD publishes them. The NVD's
  identifier of the GP (an eleven-digit number) and the patient counts are left out: a page does
  not need them, and the counts would invite ranking practices by size, which Apercura never
  does.
- **No less intrusive way.** There is no published list of practices without GPs' names; asking
  each GP for consent first would leave patients without the directory and would require
  collecting contact details the NVD does not publish.

## 3. Balancing test: do the GPs' interests override it?

| Factor                  | Assessment                                                                                                                                                                                                                                                                                                                                               |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nature of the data      | Professional data in a professional capacity: a GP's name and the address of their practice, a place of business open to the public. No special category (art. 9), no data about patients.                                                                                                                                                               |
| Reasonable expectations | A GP under contract with the NVD is published by the NVD, in this dataset, every quarter, for patients to choose a GP. Being found under one's name by patients is the purpose of that publication; a neutral directory repeating it is within what a GP can expect.                                                                                     |
| Source                  | A public authority's own open publication, kept current: the pages follow every new quarter, so an outdated name does not linger.                                                                                                                                                                                                                        |
| Impact                  | Low. No ranking, no ratings, no reviews, no paid placement, no comparison of practices by size; pages in alphabetical order. Search engines index the pages, as they index the NVD's own site.                                                                                                                                                           |
| Safeguards              | Objection at any time without giving a reason, through the removal form on every page (art. 21): the page is hidden at once, deleted after a light check, and the practice's key is kept in `directory.suppressions` so no import brings it back. Rectification at the source (NVD) or through the report form. A claimed practice manages its own page. |
| Vulnerable people       | None identified: the data subjects are professionals.                                                                                                                                                                                                                                                                                                    |
| Children                | Not concerned.                                                                                                                                                                                                                                                                                                                                           |

Weighing these, the interests of patients and the public in finding a GP by name and place
prevail over the GPs' interests, which the safeguards protect, provided the conditions below
hold.

## Conditions (reviewed with every change to the Latvian import)

1. Only first and family names are shown; the GP's identifier and patient counts are never
   stored (`packages/etl/test/lv-integration.test.ts` checks it).
2. No ranking, rating, review or paid placement on any Latvian page.
3. The article 14 information is public: the privacy page (`/lv/privatums`, section "GPs named
   on GP practice pages"), the data page (`/lv/dati`) and a notice with the objection link on
   every page.
4. Objections are honoured at once and permanently (suppressions).
5. The import reads only the NVD's current quarter; a GP who leaves a practice leaves its page.

## Article 14 information

Given publicly, not individually: the NVD publishes no contact details of the GPs, and collecting
them to write to each GP would mean processing more personal data than the directory needs
(article 14(5)(b), disproportionate effort, with the public measures above). The founder may also
inform the Latvian Association of Family Physicians (Latvijas Ģimenes ārstu asociācija) and the
Rural Family Doctors' Association when the pages open (to decide).

## Open points for the lawyer

- Confirm article 14(5)(b) with public notice for about 300 GPs, and whether informing the
  family doctors' associations is expected.
- Confirm that the Latvian Personal Data Processing Law (Fizisko personu datu apstrādes likums)
  adds no condition for reusing a public authority's open data about professionals.
- Confirm that a directory page naming a GP is not "advertising of medical treatment" under the
  Medical Treatment Law, section 11 (ADR 0002, "Latvia").
- Pharmacies owned by a sole trader (individuālais komersants) may carry a person's name in the
  State Agency of Medicines' register; the page prints the pharmacy's own name and drops the
  sole trader's legal name where it can (`pharmacyName`), and the same objection applies.
