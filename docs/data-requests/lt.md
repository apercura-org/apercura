# Lithuania: data we could not import yet

Lithuania's directory (`/lt`) is built from the licence register of health-care institutions that
the State Accreditation Service for Health Care Activities (Valstybinė akreditavimo sveikatos
priežiūros veiklai tarnyba prie SAM, VASPVT) publishes daily on data.gov.lt under CC BY 4.0
([`docs/data-import.md`](../data-import.md#lithuania)): every activity address of a licensed
institution, its kind read from the services licensed there, placed in the counties,
municipalities and settlements of the Address Register (VĮ Registrų centras, CC BY 4.0) at its
settlement's point. A page is an institution's activity address, under the institution's
registered name; no health worker and no pharmacy is listed. This file lists every other
candidate found on 27 November 2026, why it is not imported, and whom to ask, so that requests can
be sent.

## Imported

| Source                                                                                                                                                                                                                                                                 | Publisher           | Licence                                                          | Credit printed                                                                                                                                                |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Sveikatos priežiūros įstaigų licencijų duomenys](https://data.gov.lt/datasets/1623/) (daily; models `Istaiga`, `IstaigosVeiklosAdresas`, `Licencija`, `IstaigosPaslauga`, `PaslauguNustatymas`, `Paslauga`)                                                           | VASPVT              | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/deed.lt) | `Šaltinis: Valstybinė akreditavimo sveikatos priežiūros veiklai tarnyba prie SAM, „Sveikatos priežiūros įstaigų licencijų duomenys“ (data.gov.lt), CC BY 4.0` |
| Address Register: [settlements](https://data.gov.lt/datasets/1287/) (monthly), [settlement boundaries](https://data.gov.lt/datasets/1347/) (yearly), counties, municipalities and elderships, through the [data store](https://get.data.gov.lt/datasets/gov/rc/ar/:ns) | VĮ Registrų centras | CC BY 4.0                                                        | `Šaltinis: VĮ Registrų centras, Lietuvos Respublikos adresų registras (data.gov.lt), CC BY 4.0 (gyvenamųjų vietovių taškus apskaičiavo Apercura)`             |

Columns that are never read into a row: the legal entity code (`ja_kodas`), the seat addresses
(`Istaiga.adresas`, `Licencija.ja_buveines_adresas`), the licence and order numbers and dates. An
individual enterprise's or a small partnership's registered name can name its owner: the page
prints it as registered, legal form abbreviated, and an individual enterprise's premises number is
left out of its street.

## Not imported, and why

| Candidate                                                                                                                             | What it would add                                                                         | Why not now                                                                                                                                                                                                                                                                                                                          | Whom to ask, for what                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [VLK, "Gydymo įstaigų, vaistinių ir kitų įmonių sąrašas"](https://data.gov.lt/datasets/1386/) (CC BY 4.0, yearly; data of 2026-03-28) | Whether a place is contracted with the compulsory health insurance fund; pharmacy outlets | No address on any record. Its open records cover 2,917 of the 2,988 legal entities with a live activity address, and the contract dates are empty on 6,986 of the 10,179 open treatment records, so it cannot say which places are contracted. Its 2,452 open pharmacy outlets have no address. Its institution ids are not VASPVT's | Valstybinė ligonių kasa (VLK): a list of contracted places with their activity address (or VASPVT's address code), the contract's start and end, and the fund's identifier of the institution |
| Pharmacies (licences of the State Medicines Control Agency, Valstybinė vaistų kontrolės tarnyba, VVKT)                                | Every pharmacy and branch with its address                                                | Not on data.gov.lt: the agency's open datasets cover medicines only. A pharmacist's extended practice licensed by VASPVT names 59 addresses, a partial list that would mislead, so it is not imported either                                                                                                                         | VVKT: its register of pharmacy licences (name, activity address, licence status) as open data under CC BY 4.0, like VASPVT's                                                                  |
| A kind of institution in VASPVT's register                                                                                            | The kind as VASPVT knows it, rather than read from the licensed services                  | The register has no such field; the import derives it (`ltKindOfServices`), which can misfile an institution with an unusual set of services                                                                                                                                                                                         | VASPVT: a field naming the kind of institution (hospital, primary care centre, outpatient clinic, dental clinic…) per institution or activity address                                         |
| Postcodes and phone numbers of the activity addresses                                                                                 | A complete postal address; a number to call                                               | VASPVT's activity addresses are free text without postcode; no phone is published                                                                                                                                                                                                                                                    | VASPVT: the postcode of each activity address (the Address Register code is already there), and a public phone per institution where it has one                                               |
| [Address points of the Address Register](https://data.gov.lt/datasets/1351/) (CC BY 4.0)                                              | A map pin at the building, and exact distances                                            | The open file is a JSON of 25 August 2021 and the data store's model returns no row; the current points are published by Registrų centras outside data.gov.lt, where the terms could not be read. Pages are at their settlement's point meanwhile                                                                                    | VĮ Registrų centras (atviriduomenys@registrucentras.lt): a current export of the address points on data.gov.lt under CC BY 4.0, or the data store's model filled                              |
| VASPVT's public licence search of individuals                                                                                         | Named doctors, nurses, midwives and oral-care specialists                                 | Lookup only, no reuse licence; the open competences dataset is pseudonymised                                                                                                                                                                                                                                                         | Nobody for now: a decision of the project, after a legitimate-interest assessment                                                                                                             |

## How to ask

The publishers are state institutions: data may be requested for reuse under the Law on the Right
to Obtain Information and Data from State and Municipal Institutions and Bodies (Teisės gauti
informaciją ir duomenis iš valstybės ir savivaldybių institucijų ir įstaigų įstatymas), which
transposes the Open Data Directive (EU) 2019/1024 (UNVERIFIED on the day: the article and the
deadline to answer were not read; read the consolidated text on e-tar.lt before sending).
data.gov.lt also takes requests to open data ("Poreikiai", one per dataset, answered by the
publisher on the portal), which is where an existing request about the address points already
waits.

Suggested request, to VLK (adapt for VVKT and VASPVT):

> Laba diena,
>
> {{PUBLISHER_NAME}} tvarko nemokamą, nekomercinį sveikatos priežiūros įstaigų katalogą
> (apercura.org/lt), sudarytą iš atvirų VASPVT licencijų duomenų (CC BY 4.0). Norėtume pacientams
> parodyti, ar įstaigos veiklos vieta turi sutartį su teritorine ligonių kasa.
>
> Prašome atverti, pagal Teisės gauti informaciją ir duomenis iš valstybės ir savivaldybių
> institucijų ir įstaigų įstatymą, sutartis su ligonių kasomis turinčių įstaigų veiklos vietų
> sąrašą: įstaigos juridinio asmens kodą, veiklos vietos adresą (arba Adresų registro kodą),
> sutarties pradžios ir pabaigos datas, su CC BY 4.0 licencija data.gov.lt portale.
>
> Pagarbiai,
> {{SENDER_NAME}}

The letter is a draft: a native speaker reviews it before it is sent, once the legal entity
exists (see [`README.md`](README.md#how-to-send)).
