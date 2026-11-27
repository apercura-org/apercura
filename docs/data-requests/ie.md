# Ireland: what is imported, what is not, and whom to ask

> Prepared 2026-11-27 for issue #171. Not legal advice: every licence below was read that day on
> the publisher's own page, the workbook's own terms sheet or the GeoHive item's `licenseInfo`.

Ireland opened (`/ie`) with facilities only: the retail pharmacy businesses of the Pharmaceutical
Society of Ireland's register, HIQA's designated centres for older people (nursing homes) and the
HSE's hospitals and health centres on GeoHive ([data import](../data-import.md#ireland),
[ADR 0002](../adr/0002-multi-country.md#ireland-ie)). No health professional is listed. The request
for the register of doctors, prepared before the opening, still stands:
[`ie-medical-council.md`](ie-medical-council.md).

## Imported

| List                                                                                         | Publisher                                           | Terms                                                                                                                                                                  | Credit printed                                                                                                               |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Register of Pharmacies, retail pharmacy businesses (`Extract_of_Pharmacies_0.xlsx`, monthly) | Pharmaceutical Society of Ireland (PSI)             | Re-use of public sector information, free of charge in any format, under the conditions of the workbook's "Terms & Conditions of Use" sheet and the PSI's Terms of Use | `Source: Pharmaceutical Society of Ireland, Register of Pharmacies. © Pharmaceutical Society of Ireland.`                    |
| Register of designated centres for older people (`older_persons_register.csv`, live export)  | Health Information and Quality Authority (HIQA)     | Re-use of public sector information, free of charge in any format, "subject to the latest PSI licence" (HIQA's disclaimer)                                             | `Source: Health Information and Quality Authority, register of designated centres for older people. © HIQA.`                 |
| Hospitals – HSE Ireland (GeoHive item `feb34881088341bbbf80d86af6a4f333`, March 2020)        | Health Service Executive (Health Atlas), on GeoHive | CC BY 4.0 (the item's `licenseInfo`)                                                                                                                                   | `Source: Health Service Executive, Health Atlas Ireland, Hospitals – HSE Ireland (March 2020), via GeoHive, CC BY 4.0.`      |
| Health Centres – HSE Ireland (GeoHive item `c2e825ef881b4e7daca59b0faa232b72`, March 2020)   | Health Service Executive (Health Atlas), on GeoHive | CC BY 4.0                                                                                                                                                              | `Source: Health Service Executive, Health Atlas Ireland, Health Centres – HSE Ireland (March 2020), via GeoHive, CC BY 4.0.` |
| Counties – National Statutory Boundaries – 2019 – Generalised 20m                            | Tailte Éireann                                      | CC BY 4.0                                                                                                                                                              | `© Tailte Éireann, Counties – National Statutory Boundaries, CC BY 4.0.`                                                     |
| Census 2022 Built Up Areas (the towns, with their population)                                | Central Statistics Office and Tailte Éireann        | CC BY 4.0                                                                                                                                                              | `Source: CSO and Tailte Éireann, Census 2022 Built Up Areas, CC BY 4.0 (towns' points computed by Apercura).`                |
| Centres of Population – National Placenames Gazetteer (other names of the towns' localities) | Tailte Éireann                                      | CC BY 4.0                                                                                                                                                              | `© Tailte Éireann, Centres of Population – National Placenames Gazetteer, CC BY 4.0.`                                        |

### The PSI's and HIQA's re-use conditions

The PSI's workbook carries its terms on a second sheet, read on 27 November 2026 (copy "correct at:
02.11.2026"), word for word:

> The PSI complies with the Regulations on the re-use of Public Sector Information and it
> encourages the re-use of the information that it produces. All of the information featured on
> the website of the PSI is the copyright of the PSI unless otherwise indicated. You may re-use the
> information on the website free of charge in any format. Re-use includes copying, issuing copies
> to the public, publishing, broadcasting and translating into other languages. […] Information and
> documents obtained from this website may be reproduced and/or re-used subject to the latest PSI
> licence available at Data.Gov.ie. Generally re-use is subject to the following conditions. You
> must:
>
> - Acknowledge the source and copyright of the PSI in cases where you supply the information to others
> - Reproduce the information accurately
> - Not use the information in a misleading way
> - Not use the information for the principal purpose of advertising or promoting a particular product or service
> - Not use the information for, or in support of, illegal, immoral, fraudulent, or dishonest purpose

The PSI's [Terms of Use](https://www.psi.ie/terms-use) repeat the five conditions; the register's
page adds "Copyright of these Registers will continue to rest with the PSI" and that the PSI's
monthly open datasets are on data.gov.ie "for reuse and redistribution". HIQA's
[disclaimer](https://www.hiqa.ie/disclaimer) says "You may re-use the information on this website
free of charge in any format" and points to the same PSI licence.

**Why Apercura's use fits the advertising condition.** Apercura lists every registered retail
pharmacy business the same way, from the register, in a free directory that carries no
advertising, sells no placement, ranking or badge, and recommends no pharmacy, product or service;
its principal purpose is to tell people where the registered facilities are. Each page credits the
PSI and links to its register. The condition would be breached by a page or a feature that promotes
one pharmacy or product with the register's data (sponsored results, paid upgrades, affiliate
links): the project's [product brief](../../PRODUCT.md) excludes all three, and this section must be
re-read before any such feature is considered for Ireland.

Fields never read into a row:

- PSI: `RPB Owner` (the company owning the pharmacy, at times a sole trader's name). The
  superintendent pharmacist is not in the extract and is never looked up.
- HIQA: `Person_in_Charge`, `Person_in_Charge_Phone`, `Management_Contacts`, the registered
  provider's address and phone, the registration conditions and dates, the Chief Inspector's notes,
  and the registered provider itself unless it is the HSE or a company with a CRO number whose name
  names no member (an individual, partners "trading as", or a body "with A, B as members" are never
  stored). The CRO number decides, and is not stored.
- HSE: every field but the facility's name, kind, address and point. The HSE's GP layer
  (`GeneralPractitionersHSEIreland`: doctors' surnames and first names) and its 2020 pharmacies
  layer (the PSI's register is current) are not read at all.
- Eircodes are printed as part of a published address, never used to place or locate a facility:
  the Eircode database and its coordinates are licensed, not open data.

## Not imported, and why

| Candidate                                                              | What it would add                                     | Why not now                                                                                                                                                                                                                                           | Whom to ask, for what                                                                                                                                                                            |
| ---------------------------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A current HSE list of hospitals and health centres                     | Openings, closures and renamings since March 2020     | None published as open data: the GeoHive layers were last edited in April 2020; the HSE's 2017 "List of Hospitals in Ireland" (data.ehealthireland.ie) is older and did not answer; the CSO's 2026 "Distance to Services" gives distances, not a list | The HSE's Health Atlas Ireland team (via GeoHive) or the HSE service directory (service.directory@hse.ie, from the 2017 dataset's metadata, UNVERIFIED): a refresh of the layers under CC BY 4.0 |
| Register of Medical Practitioners                                      | Every doctor, with specialty                          | Not downloadable; no practice address; RPSI/22/04 ordered a fresh decision                                                                                                                                                                            | [`ie-medical-council.md`](ie-medical-council.md)                                                                                                                                                 |
| HSE GP layer (`GeneralPractitionersHSEIreland`, 6,608 rows, CC BY 4.0) | GP practices with phone and website                   | One row per doctor, named; a March 2020 snapshot; practices would need a merge the layer does not support                                                                                                                                             | Nobody for now: a practice-level layer without names would fit                                                                                                                                   |
| HIQA's register of designated centres for persons with disabilities    | 1,837 residential homes                               | No addresses (small homes in the community) and named company directors                                                                                                                                                                               | Nobody: these homes are not meant to be found on a map                                                                                                                                           |
| Mental Health Commission's register of approved centres                | 67 approved centres                                   | Web pages only, no licence read                                                                                                                                                                                                                       | The Mental Health Commission: a downloadable register under the PSI terms or CC BY 4.0                                                                                                           |
| Dental Council registers                                               | Dentists                                              | People only, published annually on paper or CD                                                                                                                                                                                                        | The Dental Council, under S.I. No. 376 of 2021                                                                                                                                                   |
| Eircode (ECAD)                                                         | Address-level points for pharmacies and nursing homes | Licensed database (Eircode, operated under contract to the Department), not open data                                                                                                                                                                 | Nobody: the towns' points are enough for a directory                                                                                                                                             |
| OpenStreetMap                                                          | Points of pharmacies and practices                    | ODbL (share-alike) and of uneven provenance: never a source of facilities or points                                                                                                                                                                   | Nobody                                                                                                                                                                                           |

## How to ask

The HSE, the PSI and HIQA are public sector bodies under the European Union (Open Data and Re-use
of Public Sector Information) Regulations 2021 (S.I. No. 376 of 2021): a request for re-use
follows the procedure of [`ie-medical-council.md`](ie-medical-council.md) (regulation 6, 20 working
days, an appeal to the Information Commissioner). For the HSE's layers, the ask is not a right to
re-use (they are CC BY 4.0) but a refresh:

> Subject: Request for re-use — updated Health Atlas layers of hospitals and health centres
>
> Dear Sir or Madam,
>
> Apercura (apercura.org) is a free, open-source directory of health facilities in Europe, without
> advertising or reviews. For Ireland it publishes the HSE's hospitals and health centres from the
> Health Atlas layers on GeoHive ("Hospitals – HSE Ireland", "Health Centres – HSE Ireland", CC BY
> 4.0), with the credit the licence asks for. Those layers say they were provided in March 2020.
>
> Under the European Union (Open Data and Re-use of Public Sector Information) Regulations 2021, we
> ask for the current version of these two lists (name, kind, address and location of each
> facility; no person), in the same format and under the same licence, or for the place where the
> HSE publishes them now.
>
> Yours faithfully,

Record every answer in the Ireland section of
[ADR 0002](../adr/0002-multi-country.md#ireland-ie) and here.
