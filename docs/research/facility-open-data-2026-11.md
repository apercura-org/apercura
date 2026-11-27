# Open facility data: 33 European countries (issue #168)

> **Research, not a decision.** This is the study of 27 November 2026 for issue #168: which
> European countries publish their health facilities under a licence that allows republication.
> It is kept as it was written, with one change: names of people quoted from the datasets as
> examples, and the details of the local files and tools used to read them, were left out before
> publishing. A point marked **UNVERIFIED** stays unverified: check it against the primary source
> before relying on it. Markets opened since then record what was verified in
> [ADR 0002](../adr/0002-multi-country.md), "What is known per market" (Lithuania: #170).

Research of 2026-11-27. The question: for each country, is there an official dataset of health facilities that is published under a licence allowing republication? That means an explicit CC BY, CC0, ODbL or national open licence, or a statutory reuse right with clear terms. Facilities are hospitals, clinics, outpatient centres, pharmacies, nursing homes, GP or dental practices as institutions, and registers of licensed providers. Germany, Italy and Switzerland were opened on this basis.

## Method

- Primary sources only: national open-data portals (through their CKAN, uData or DCAT APIs where possible) and the publishers' own sites.
- **VERIFIED** means the file or API answer was downloaded and opened. **UNVERIFIED** means only the catalogue, a landing page or a search result was read, or the host did not answer.
- A licence is quoted only where its text, or the portal's licence field, was read. "No licence stated" is never read as open.
- No CAPTCHA, login or block was bypassed. Hosts that refused (403, 429, timeout, empty reply) are named.
- The advertising and data-protection notes are mostly **UNVERIFIED**: law texts and authority decisions were not read this round. "No decision found" is a negative, not a proof.

### Verdict scale

- **OPEN-DATA DIRECTORY POSSIBLE**: at least one current national source, under an explicit open licence, with addresses, covering a meaningful share of facilities.
- **PARTIAL**: an open source exists but is regional, a single category, stale or without addresses; or a good national list exists but its licence still has to be confirmed or negotiated.
- **NOT POSSIBLE**: no official, licensed, machine-readable list today.

The verdicts were harmonised to this scale. Croatia's research notes said "possible, licence to be pinned down". It is graded **PARTIAL** here because the HZZO files state no licence.

## Verdicts at a glance

| Country                     | Verdict                  | Best open source                                                   | Licence                                           |
| --------------------------- | ------------------------ | ------------------------------------------------------------------ | ------------------------------------------------- |
| Lithuania (lt)              | POSSIBLE                 | VASPVT health-care licences, daily                                 | CC BY 4.0                                         |
| Ireland (ie)                | POSSIBLE                 | PSI pharmacies, HIQA nursing homes, HSE GeoHive layers (2020)      | PSI re-use licence; CC BY 4.0                     |
| Ukraine (ua)                | POSSIBLE                 | NHSU contracted care sites and pharmacies, weekly                  | CC BY 4.0                                         |
| Norway (no)                 | POSSIBLE                 | Brønnøysund establishment register by NACE                         | NLOD 2.0                                          |
| Finland (fi)                | POSSIBLE (public sector) | PTV national service catalogue                                     | CC0                                               |
| Cyprus (cy)                 | POSSIBLE (small)         | Private pharmacies list; state hospitals and health centres        | CC BY 4.0                                         |
| Denmark (dk)                | PARTIAL                  | SOR, nightly, 101,121 rows                                         | none stated ("frit tilgængelige")                 |
| Croatia (hr)                | PARTIAL                  | HZZO contracted providers; Zagreb layers                           | none on HZZO; Otvorena dozvola on Zagreb          |
| Belgium (be)                | PARTIAL                  | Flanders care points; Wallonia care homes; AFMPS pharmacies        | Flemish free reuse; CC BY; AFMPS needs permission |
| Netherlands (nl)            | PARTIAL                  | IGJ pharmacy register; RIVM emergency hospitals                    | CC0; public domain                                |
| Sweden (se)                 | PARTIAL                  | Läkemedelsverket licensed pharmacies                               | CC BY 4.0                                         |
| Malta (mt)                  | PARTIAL                  | Medicines Authority licensed pharmacies                            | CC BY 4.0                                         |
| North Macedonia (mk)        | PARTIAL                  | MoH e-health institution register (2019); MALMED pharmacies (2021) | CC0                                               |
| Bulgaria (bg)               | PARTIAL                  | NZIS public registers (opendata.his.bg)                            | none stated                                       |
| Moldova (md)                | PARTIAL                  | AMDM pharmacy licensing register                                   | CC BY-SA 4.0 per site footer, to confirm          |
| Slovakia (sk)               | PARTIAL                  | Trnava and Banská Bystrica regional layers                         | CC BY                                             |
| Hungary (hu)                | PARTIAL                  | NEAK contracted providers                                          | reuse by request and agreement                    |
| Romania (ro)                | PARTIAL                  | CNAS provider lists (no addresses)                                 | CC BY 4.0                                         |
| Greece (gr)                 | PARTIAL                  | MoH hospital contacts, 4 of 7 regions                              | CC BY                                             |
| Turkey (tr)                 | PARTIAL                  | İzmir pharmacies and health facilities                             | CC BY 4.0                                         |
| Serbia (rs)                 | PARTIAL                  | RFZO private pharmacies (host unreachable); Zrenjanin              | SODL 1.0                                          |
| Portugal (pt)               | NOT POSSIBLE nationally  | municipal pharmacy lists only                                      | CC BY                                             |
| Luxembourg (lu)             | NOT POSSIBLE             | Carte sanitaire hospital inventory, 10–15 sites                    | CC0                                               |
| Iceland (is)                | NOT POSSIBLE             | none                                                               | —                                                 |
| Liechtenstein (li)          | NOT POSSIBLE             | none                                                               | —                                                 |
| Bosnia and Herzegovina (ba) | NOT POSSIBLE             | none                                                               | —                                                 |
| Albania (al)                | NOT POSSIBLE             | none                                                               | —                                                 |
| Kosovo (xk)                 | NOT POSSIBLE             | none                                                               | —                                                 |
| Montenegro (me)             | NOT POSSIBLE             | none                                                               | —                                                 |
| Andorra (ad)                | NOT POSSIBLE             | none (OSM only)                                                    | —                                                 |
| Monaco (mc)                 | NOT POSSIBLE for now     | data.gouv.mc in maintenance (503), re-check                        | —                                                 |
| San Marino (sm)             | NOT POSSIBLE             | none                                                               | —                                                 |
| Vatican (va)                | NOT POSSIBLE             | one pharmacy                                                       | —                                                 |

## Ranked shortlist

Ranked by licence certainty first, then national coverage, freshness, effort and risk. Effort: S = one or two clean files; M = several sources, filtering or geocoding; L = joins, requests or fragile hosts. Counts are estimates from the files read.

### Open now

1. **Lithuania (lt).** VASPVT licences (data.gov.lt dataset 1623, CC BY 4.0, daily), plus VLK contracted list (dataset 1386, CC BY 4.0) for pharmacy outlets and contract status. About 4,350 licensed institutions at about 8,200 activity addresses; the VLK list adds about 2,450 pharmacy outlets, which have no addresses. Effort **M**: join `adreso_id` to the address register for coordinates; import slowly because the portal answers 429. Risks: individual-enterprise names carry the owner's name; pharmacy addresses need another source.
2. **Ireland (ie).** PSI pharmacy register (2,003, monthly, PSI re-use licence); HIQA nursing homes (548, live CSV, same licence); HSE GeoHive hospitals (132) and health centres (921), CC BY 4.0 with coordinates. About 3,600 facilities. Effort **S–M**: geocode from Eircode; English only. Risks: the HSE layers are a March 2020 snapshot; the PSI licence forbids use "for the principal purpose of advertising or promoting a particular product or service", which a free neutral directory meets but must keep meeting; drop HIQA person-in-charge names and the GP layer's doctor names.
3. **Ukraine (ua).** NHSU contracted care sites and NHSU reimbursement pharmacies on data.gov.ua (CC BY 4.0, weekly, coordinates). About 14,250 care sites and 17,600 pharmacies, about 31,800 in all: the largest open set in this study. Effort **M**. Risks: martial law since 24 February 2022, and Cabinet resolution No. 263 lets data holders close datasets at short notice; occupied and front-line oblasts are missing or thin; publishing hospital locations in wartime is a sensitivity the founder should weigh; sole-proprietor names are personal data; the MOZ licence register's site footer says CC BY-NC-ND, so do not use it.
4. **Norway (no).** Brønnøysund establishment register (underenheter), NLOD 2.0, filtered by NACE code. About 600 hospital sites, 950 nursing homes and 9,000 practices; the DMP list of 1,070 pharmacies has no stated licence and no street addresses. Effort **M**: NACE codes are noisy, because this is a business register, not a licence register. Risks: sole-trader names; the pharmacy list's licence is unconfirmed.
5. **Finland (fi).** PTV national service catalogue (CC0, API, coordinates). About 3,800 public health locations: health centres, hospitals and wellbeing-county services. Effort **M**. Risks: no community pharmacies or private clinics; THL's SOTE register would add about 15,000 private units but states no licence and contains sole-trader names.
6. **Cyprus (cy).** Pharmaceutical Services private-pharmacy list (CC BY 4.0, 664 rows), plus the Ministry of Health's state hospitals (about 10) and health centres (about 40). About 715 facilities. Effort **S**. Risks: the pharmacy file names each pharmacist and gives a home phone number, so drop both columns; the hospital file's licence was read in the catalogue only.

### One request away (national data exists, licence to confirm)

7. **Denmark (dk).** SOR nightly CSV: 136 hospitals, 1,884 GP practices, 1,971 specialist practices, 1,607 dental practices, 563 pharmacies and branches, 811 nursing homes, with coordinates. About 7,000 care facilities after filtering. Effort **S** once cleared. Blocker: no licence text, only "frit tilgængelige"; ask sorpost@sundhedsdata.dk for written confirmation. The agency becomes Digital Sundhed Danmark on 1 December 2026, so URLs may move. Practices are often named after the doctor.
8. **Croatia (hr).** HZZO contracted providers (October 2026, addresses): 2,275 GP teams, about 800 dental teams, about 1,200 pharmacies, about 60 hospitals, outpatient specialists; plus Zagreb's pharmacies (247) and institutions (47) under Otvorena dozvola with coordinates. About 5,000 facilities. Effort **M** (geocoding). Blocker: ask HZZO to tag its data.gov.hr datasets "Otvorena dozvola", or get a firm reading of the ZPPI reuse right. GP rows name the doctor.
9. **Belgium (be).** Flanders care points (5,516, Flemish free reuse licence) and Wallonia care homes (857, CC BY) are open now; AFMPS pharmacies (4,799 with coordinates) need prior permission to reproduce. About 6,400 open now, about 11,000 with AFMPS. Effort **M**. Risks: no open hospital list for Wallonia and Brussels; three languages.

### Single category or regional (worth it only as small add-ons)

10. **Netherlands (nl).** IGJ pharmacy register (1,866 sites, CC0, weekly) and RIVM hospitals with an emergency department (about 80, public domain). Effort **S**. The register names each site's pharmacist; the LRZa provider register has no bulk file.
11. **Sweden (se).** Läkemedelsverket licensed pharmacies (1,451, CC BY 4.0), plus about 200 Västra Götaland health centres (CC0, catalogue only). Effort **S**. No national clinic or hospital list.
12. **North Macedonia (mk).** MoH e-health register (3,757 active institutions, 2019) and MALMED pharmacies (1,170, 2021), CC0. Effort **S**, but stale: needs a refresh request. Mojibake; doctor names inside private-practice names.
13. **Malta (mt).** Licensed pharmacies (261, CC BY 4.0, API, coordinates). Effort **S**. Pharmacies only.
14. **Slovakia (sk).** Trnava (1,930 facilities, 243 pharmacies) and Banská Bystrica (3,256, 271) regional layers, CC BY, coordinates. About 5,700 of about 16,000 nationally. Effort **M**. Only 2 of 8 regions.
15. **Bulgaria (bg).** NZIS registers at opendata.his.bg: 3,306 pharmacies, 593 hospital records, 39,180 outpatient records. Effort **M**. Blocker: no licence stated; data.egov.bg returns 403 to automated access.
16. **Moldova (md).** AMDM pharmacy register (1,873 units with addresses), CC BY-SA 4.0 per the agency's site footer. Effort **M**. Confirm the licence in writing; share-alike.
17. **Turkey (tr).** İzmir pharmacies (2,072) and health facilities (CC BY 4.0). Effort **S** for İzmir. City only; strict health-advertising rules; KVKK.
18. **Hungary (hu).** NEAK lists: 157 hospitals at 308 sites, 6,358 GP practices. Reuse needs a request form, an agreement and possibly a fee.
19. **Romania (ro).** CNAS 2026 provider lists (CC BY 4.0) have no addresses; joining the trade register gives registered offices, not premises. Effort **L**.
20. **Greece (gr).** MoH hospital contacts (CC BY), 4 of 7 regions, partly from 2016. Effort **M–L**.
21. **Serbia (rs).** Clean portal licence (SODL 1.0), but rfzo.rs and zdravlje.gov.rs refused connections; only Zrenjanin (67) verified. Effort **L**.

Not possible today: Portugal, Luxembourg, Iceland, Liechtenstein, Bosnia and Herzegovina, Albania, Kosovo, Montenegro, Andorra, Monaco (re-check data.gouv.mc), San Marino, Vatican.

### Requests worth sending

- Denmark: sorpost@sundhedsdata.dk, written confirmation that SOR may be republished, with attribution.
- Croatia: HZZO, tag the contracted-provider datasets "Otvorena dozvola".
- Belgium: AFMPS, permission to reproduce the pharmacy list.
- Finland: THL, a licence for the SOTE organisation register.
- Norway: DMP, a licence for the pharmacy list.
- Moldova: AMDM, written confirmation of CC BY-SA 4.0 for the licensing register.
- North Macedonia: Ministry of Health and MALMED, a current export.
- Portugal: ERS, access to the SRER establishment register.

# Country findings

The sections below are the research notes per country, grouped as they were researched.

## Ireland (ie)

**Verdict: OPEN-DATA DIRECTORY POSSIBLE.** There are two current national registers, both under an explicit re-use licence:

- pharmacies: PSI, about 2,000, monthly;
- nursing homes: HIQA, 548.

Hospitals, health centres and GPs are covered by HSE layers on GeoHive under CC BY 4.0. That data is a March 2020 snapshot, but it is coordinate-rich.

- **PSI Register of Pharmacies (retail pharmacy businesses).**
  - Publisher: Pharmaceutical Society of Ireland (statutory regulator, Pharmacy Act 2007).
  - URL: https://www.psi.ie/sites/default/files/document/Extract_of_Pharmacies_0.xlsx, linked from https://www.psi.ie/information-and-resources/information-about-our-public-registers
  - Licence: the workbook's second sheet says, verbatim:
    - "The PSI complies with the Regulations on the re-use of Public Sector Information and it encourages the re-use of the information that it produces. … You may re-use the information on the website free of charge in any format. Re-use includes copying, issuing copies to the public, publishing, broadcasting and translating into other languages."
    - Conditions: "Acknowledge the source and copyright of the PSI…", "Reproduce the information accurately", "Not use the information in a misleading way", "Not use the information for the principal purpose of advertising or promoting a particular product or service".
    - The page itself says "Copyright of these Registers will continue to rest with the PSI" and points to the site's Terms of Use and "the latest PSI licence available at Data.Gov.ie".
    - The aggregate PSI statistics on data.gov.ie are CC-BY-4.0.
  - Format and frequency: XLSX, monthly snapshot ("updated monthly"). The copy read was "correct at: 02.11.2026".
  - Fields: Registration Number, Trading Name, Street 1–3, Town, Eircode, County, RPB Owner. RPB Owner is the owning company, occasionally a sole trader's name. No coordinates; geocode from the Eircode.
  - Rows: 2,003. **VERIFIED.**
- **HIQA Register of designated centres for older people (nursing homes).**
  - Publisher: Health Information and Quality Authority (Chief Inspector, s.41 Health Act 2007).
  - URL: https://www.hiqa.ie/centre/export/older_persons_register.csv?_format=csv, linked from https://www.hiqa.ie/areas-we-work/older-peoples-services
  - Licence: https://www.hiqa.ie/disclaimer says, verbatim: "HIQA complies with the regulations on the Re-use of Public Sector Information and encourages re-use of the information that it produces. … You may re-use the information on this website free of charge in any format. Information and documents obtained from this website may be reproduced and or re-used subject to the latest PSI licence available at www.psi.gov.ie."
  - Format and frequency: CSV, live export.
  - Fields: Centre_ID, Centre_Title, Centre_Address (with Eircode), County, Maximum_Occupancy, Centre_Phone, Registration_Provider and its address and phone, registration dates, conditions, URL. Person names: Person_in_Charge, Management_Contacts. Drop these. No coordinates.
  - Rows: 548. **VERIFIED.**
  - The disability register (https://www.hiqa.ie/centre/export/disability_register.csv?_format=csv, 1,837 rows, VERIFIED) has **no addresses**, because these are small residential homes. It also lists company directors. Do not use it.
- **HSE Health Atlas layers on GeoHive: Hospitals, Pharmacies, Health Centres, GPs.**
  - Publisher: HSE (Health Atlas), published by GeoHive (Tailte Éireann).
  - URLs:
    - Hospitals: https://www.arcgis.com/home/item.html?id=feb34881088341bbbf80d86af6a4f333
    - Pharmacies: id d884dbfdb7764c6094965830c9a5b879
    - Health Centres: id c2e825ef881b4e7daca59b0faa232b72
    - GPs: id 01cb04a1fab34c72a746dc660622fe73
    - Feature services: https://services1.arcgis.com/eNO7HHeQ3rUcBllm/arcgis/rest/services/{HospitalsHSEIreland|PharmaciesHSEIreland|HealthCentresHSEIreland|GeneralPractitionersHSEIreland}/FeatureServer/0
  - Licence: the item licenceInfo says, verbatim: "This GeoHive content is published as open data, it is licenced under a Creative Commons Attribution 4.0 International (CC BY 4.0) licence".
  - Format: ArcGIS REST / GeoJSON.
  - Date: "This data was provided by the Health Atlas in March 2020", so it is **stale**. The items were touched 2025-12-18.
  - Fields:
    - Hospitals: name, category, subcategory (Community, General/Acute, Private General, Maternity…), address1–4, Eircode, lon/lat.
    - Pharmacies: name and address are run together in address1.
    - Health Centres: name, address, Eircode. The lat/lon fields are swapped, but the geometry is fine.
    - GPs: ServiceName, **GPSurname, GPFirstname**, address, Eircode, phone, website, coordinates.
  - Rows: hospitals 132, pharmacies 1,996, health centres 921, GPs 6,608 (doctor-level rows). **VERIFIED.**
  - The older "List of Hospitals in Ireland" CSV on data.ehealthireland.ie (CC BY 4.0, last updated 2017 per the search snippet) could not be reached (connection refused). It has been dropped from the data.gov.ie API. **UNVERIFIED.**
- Not open:
  - The Mental Health Commission register of approved centres (67 centres) is web pages only. **UNVERIFIED**, no licence read.
  - No dental-practice register: the Dental Council registers people only.
- **Blocking:** none found.
  - The Medical Council's professional-conduct guide limits doctors' own advertising to factual information. It binds doctors, not a neutral directory.
  - No Data Protection Commission decision against health directories was found (UNVERIFIED negative).
  - Strip the person-in-charge and GP names, or treat them as practitioner data.

## Netherlands (nl)

**Verdict: PARTIAL.** Two national sources are open:

- pharmacies: the IGJ register, CC0, weekly, about 1,900 sites;
- acute hospital locations: the RIVM emergency-department survey, Public Domain Mark, about 80.

The central register of all providers (LRZa, about 285,000 providers) is a search portal with no bulk file and no licence. Nursing homes, GP practices and clinics therefore have no open list.

- **IGJ "Register van gevestigde apothekers".**
  - Publisher: Inspectie Gezondheidszorg en Jeugd (art. 61(5) Geneesmiddelenwet).
  - URL: https://www.igj.nl/documenten/2017/08/17/register-van-gevestigde-apothekers. The current file was https://www.igj.nl/site/binaries/site-content/collections/documents/2017/08/17/register-van-gevestigde-apothekers/apothekersregister20261126.csv
  - Licence: https://www.igj.nl/service/copyright says, verbatim: "Tenzij anders vermeld, is op de inhoud van deze website de Creative Commons zero verklaring (CC0) van toepassing. … Dit houdt in dat hergebruik van de inhoud van deze site is toegestaan".
  - Format and frequency: CSV (`;`, UTF-8) and PDF, "wekelijks geactualiseerd". The file read was dated 26-11-2026.
  - Fields: KvKnr, Vestigingsnummer, Officiëlenaam, Bezoekadres, Postcode, Plaats. Person data: BIGregistratienr, Vrl (initials), Tussenvg., Achternaam of the established pharmacist. No coordinates; geocode via BAG/PDOK.
  - Rows: 2,200 (pharmacist × site), 1,866 distinct establishments. **VERIFIED.**
- **RIVM "Vragenlijst aanbod SEH's en Acute Verloskunde 2026".**
  - Publisher: RIVM.
  - URL: https://data.rivm.nl/meta/srv/api/records/afbdf4b9-00f0-4d4e-a67e-fd3bbc8c833c/attachments/Antwoorden%20vragenlijst%202026%20tbv%20data.rivm.nl.zip. Earlier years are on data.overheid.nl (e.g. `83959-rivm-vragenlijst-aanbod-seh---s-en-acute-verloskunde-2024`).
  - Licence: the data.overheid.nl licence field is `http://creativecommons.org/publicdomain/mark/1.0/`. The RIVM catalogue says "Public Domain, noConditionsApply".
  - Format and frequency: XLSX in ZIP, yearly (dated 7-7-2026).
  - Fields: Naam ziekenhuis, Plaats, Adres, Postcode, ED/obstetrics offer, opening hours. No coordinates, no person names.
  - Rows: about 79 hospital locations. **VERIFIED.**
- **LRZa / Zorgaanbiedersportaal (CIBG).**
  - URL: https://zoeken.zorgaanbiedersportaal.nl/
  - The public search is an Angular app on `/api/v1/Zoeken`, `/Organisatie`, `/Vestiging`, `/Locatie`. No bulk download, no API terms and no licence were found. It is described elsewhere as "open data", but that could not be confirmed on a primary page.
  - Not usable without a written licence from CIBG. **UNVERIFIED** (portal JS read; no data pulled).
- **Zorginzicht "Openbare data"** (Zorginstituut Nederland).
  - Yearly Excel quality files per sector, including nursing homes (verpleeghuiszorg 2022–2025), hospitals and treatment centres, and GGZ.
  - URL: https://www.zorginzicht.nl/openbare-data
  - No licence text was found on the sector pages, and the files were not opened. **UNVERIFIED.**
- Provincie Zuid-Holland "Voorzieningen voor de samenlevingsatlas" (Public Domain Mark, 207,070 points across 6 provinces) has **no names**, only category and point. Useless for pages. VERIFIED by WFS sample.
- **Blocking:**
  - Dutch case law accepts review and directory sites (Zorgkaart) as a neutral intermediary. No Autoriteit Persoonsgegevens decision against facility directories was found (UNVERIFIED negative).
  - The IGJ CSV carries the BIG number and name of the responsible pharmacist. Treat these as practitioner data or drop them.

## Belgium (be)

**Verdict: PARTIAL**, close to possible.

- Open and licensed: Flanders (about 5,500 care points, free re-use model licence) and Wallonia (857 elderly-care homes, CC BY).
- National pharmacy list (4,799 with coordinates): published by the AFMPS/FAGG, but its website notice demands prior authorisation for reproduction. Ask for a written licence. Our reading, UNVERIFIED: the federal reuse law of 4 May 2016, as amended, should make it reusable.
- No open source found: hospitals in Wallonia and Brussels, and anything from Brussels.

- **Flanders: "Zorgvoorzieningen erkend door het Departement Zorg (gezondheidszorg en woonzorg) via POI-service".**
  - Publisher: Departement Zorg (Vlaamse overheid). The data comes from the federal CoBRHA register.
  - Metadata: https://metadata.vlaanderen.be/srv/api/records/9531f406-ca7c-4987-9e8b-37de471a57b3. Data: https://geo.api.vlaanderen.be/POI/ogc/features/collections/POI/items?f=application%2Fjson&limit=10000&filter=PRODUCT=%27GezondheidszorgEnWoonzorg%27 (also WFS, and download.vlaanderen.be product 573).
  - Licence: the metadata says "Modellicentie voor gratis hergebruik" (https://data.vlaanderen.be/id/licentie/modellicentie-gratis-hergebruik/v1.0). Attribution, verbatim: `Bronvermeldingsvoorschrift: "Bron: VAZG"`. Every record also carries LICTYPE `Modellicentie_Gratis_Hergebruik`.
  - Format and frequency: GeoJSON, WFS, SHP, GML, CSV; monthly.
  - Fields: NAAM, ALTNAAM, STRAAT, HUISNUMMER, BUSNUMMER, POSTCODE, GEMEENTE, TELEFOON, EMAIL, POITYPE, a link to the CoBRHA record, WGS84 point. No person names seen.
  - Rows: 5,516 features. Among them:
    - assisted-living groups 965;
    - woonzorgcentra 808;
    - short-stay 493;
    - day-care 324;
    - general hospitals 98 (plus about 90 hospital services each: ED, maternity…);
    - psychiatric hospitals 43;
    - mental-health centres 90;
    - home-nursing services 87.
  - **VERIFIED.**
- **Wallonia: "Etablissements pour aînés (hors territoire de la Communauté germanophone)" (ETAB_AINES_31370).**
  - Publisher: AViQ – Direction des Aînés, republished on ODWB.
  - URL: https://www.odwb.be/explore/dataset/etab-aines-31370/
  - Licence: ODWB field "CC BY" (https://creativecommons.org/licenses/by/4.0/).
  - Format: CSV, JSON, GeoJSON. Updated 2026-11-17, but the internal `date_trans` is 2023-10-13, so check freshness.
  - Fields: nom_et, type_et (MR/RS/CJ), adresse, cpostal, localite, tel, mail, INAMI number, BCE number, operator name, bed counts, gps_lat/gps_lon. Person names: nom_dir (director) and nom_repr_po. Drop both.
  - Rows: 857. **VERIFIED.**
  - AViQ also publishes the same list as XLSX (https://www.aviq.be/fr/liste-des-maisons-de-repos-incl-maisons-de-repos-et-de-soins-et-court-sejour-residences-services-et, 30-10-2026). Its licence was not read.
- **National: AFMPS/FAGG list of pharmacies open to the public.**
  - Publisher: Federal Agency for Medicines and Health Products.
  - URL: https://www.afmps-fagg.be/sites/default/files/content/INSP/OFFICINES/pharmacies_pub.json (also `pharmacies_pub_fr.xls` and PDF), linked from https://www.afmps-fagg.be/fr/humain/medicaments/medicaments/distribution/pharmacies_ouvertes_au_public
  - Licence: **not open as stated.** https://www.afmps-fagg.be/fr/disclaimer says, verbatim: "toute reproduction partielle ou complète de ce site sous quelque forme que ce soit, est soumise à autorisation préalable de l'AFMPS. Exception est faite pour les usages scolaires et pédagogiques non commerciaux."
  - Format: JSON, XLS, PDF; frequently refreshed (the JSON has a `date` field).
  - Fields: authorisation_number, state (300 "closed_temporarily"), name (often the pharmacist's own name), street, number, postal_code, city, Lambert 2008 X/Y, authorisation holder and operator with CBE numbers.
  - Rows: 4,799. **VERIFIED** (data); licence blocking until AFMPS grants permission.
- **Federal hospital list (SPF Santé publique).** Accreditation and contact details in Excel are given out through a "DBI" request form on https://www.health.belgium.be/en/professionals/health-professionals/human-health/healthcare-organization/healthcare-institutions. There is no open file and no licence was found. **UNVERIFIED.**
- City-level CC BY lists exist on ODWB (Namur, Verviers), but they are too small to matter.
- **Blocking:**
  - Belgian rules on health-care advertising (Code of medical deontology; law of 22 April 2019 on quality of practice) bind practitioners. They are not a bar to neutral facility pages.
  - No APD/GBA decision against facility directories was found (UNVERIFIED negative).
  - The AFMPS reproduction clause is the real blocker for pharmacies.

## Luxembourg (lu)

**Verdict: NOT POSSIBLE** as a directory. The only open facility data is the hospital inventory in the Carte sanitaire: about 4 hospital groups and about 10–15 sites, as PDF and CSV tables. No open pharmacy, practice or care-home list was found on data.public.lu.

- **Carte sanitaire 2025.**
  - Publisher: Observatoire national de la santé.
  - URL: https://data.public.lu/datasets/carte-sanitaire-2025/ (earlier: `carte-sanitaire`, `-2021`, `-2023`)
  - Licence: data.public.lu field `cc-zero` (2025, 2012–2019) and `cc-by` (2021, 2023).
  - Format: PDF plus CSV tables (activity figures); about every two years.
  - Fields: hospital names and sites in the PDF fascicule 1; the CSVs are statistics. No coordinates.
  - Rows: about 10–15 sites. **UNVERIFIED** (catalogue only).
- data.public.lu searches for pharmacie, hôpital, maisons de soins, médecins and CIPA returned nothing relevant. The only medical list was "Centres aéro-médicaux et médecins agréés" (odc-by, aviation). The pharmacy list lives on pharmacie.lu, a trade body site with no licence.
- **Blocking:** none specific. The market is too small to justify the work.

## Denmark (dk)

**Verdict: PARTIAL**, likely possible after one email. SOR is the national register of health-care units. It is published nightly as a free, login-free CSV of about 101,000 rows, covering:

- hospitals: 136;
- GP practices: 1,884;
- specialist practices: 1,971;
- dental practices: 1,607;
- pharmacies: 230, plus 333 branches;
- nursing homes: 811;
- physiotherapy clinics: 3,768;
- and more.

Coordinates and addresses are included. No licence text was found: the site only says "frit tilgængelige". The Danish Reuse Act (lov om videreanvendelse af den offentlige sektors informationer) should allow reuse of documents made public, but that is our reading, UNVERIFIED. Ask sorpost@sundhedsdata.dk for written confirmation.

- **SOR (Sundhedsvæsenets Organisationsregister).**
  - Publisher: Sundhedsdatastyrelsen, which becomes Digital Sundhed Danmark on 1 December 2026, so URLs may move.
  - URLs: https://sor-filer.sundhedsdata.dk/sor2_produktion/V1_00/data/SorEntity_daily.csv and `Sor_complete.zip` (with Geolocations.csv and history); docs at https://sor-filer.sundhedsdata.dk/sor2_produktion/V1_00/docs/SOR2-CSV-dokumentation.html
  - Licence: **none stated.** The landing page (https://sor-filer.sundhedsdata.dk/) says, verbatim: "SOR og SHAK data er frit tilgængelige og kan downloades fra denne side til manuel behandling (csv fil formatet) eller indlæsning i eget it-system". The docs say "Der kræves ikke brugernavn og password. Data er frit tilgængeligt på produktionsmiljøet via https."
  - Format and frequency: CSV (`;`, 73 MB) and XML, nightly (01:00–04:30).
  - Fields: SorId, EntityName, EntityTypeName, parent and owner (CVR), ShakId, ProviderId (ydernummer), PharmacyId, phone, website, email, EAN location number, postal, visiting and activity addresses with ETRS89/UTM32 coordinates, up to 8 specialities.
  - Person names: GP and specialist units are often named after the doctor (the practice name is the doctor's title and full name). There are 18,565 rows of type "privat" (private owners).
  - The file also contains non-care units (kommune, administrative, COVID test, cosmetic, alternative-medicine clinics) that must be filtered out.
  - Rows: 101,121. **VERIFIED.**
- No separate open pharmacy or nursing-home list was needed, since SOR covers both. data.europa.eu (datavejviser) has only statistics for sygehuse, plejehjem and apoteker.
- **Blocking:**
  - The executive order on health-care marketing (markedsføring af sundhedsydelser) binds providers' own advertising.
  - No Datatilsynet decision against facility directories was found (UNVERIFIED negative).
  - The open question is the missing licence statement.

## Iceland (is)

**Verdict: NOT POSSIBLE** from open data. Both official lists are web pages only, with no open licence found:

- the Directorate of Health's register of health-care operators (Rekstraraðilaskrá, published since November 2023 under law 41/2007);
- the Icelandic Medicines Agency's list of pharmacies (about 70 pharmacies and branches, on island.is).

- **Rekstraraðilaskrá (embætti landlæknis).** Searchable on the Directorate's site or island.is; no download and no licence. **UNVERIFIED.**
- **Lyfjastofnun "Öll apótek og lyfsölur".** https://island.is/s/lyfjastofnun/apotek returned HTTP 403 to automated fetch, so it was not pursued. **UNVERIFIED.**
- data.europa.eu (open-data-iceland, geoportal-is) has health districts and the Reykjavík city theme. There is no facility list.
- **Blocking:** island.is blocks automated access. No open licence; the market is small.

## Liechtenstein (li)

**Verdict: NOT POSSIBLE.**

- There are 6 public pharmacies, 1 Landesspital, a few clinics and care homes.
- The only official lists are the Amt für Gesundheit's narcotics-licence PDFs:
  - https://www.llv.li/serviceportal2/amtsstellen/amt-fuer-gesundheit/betriebe.pdf, with GLN, address and responsible person;
  - `btm_verzeichnis.pdf`, for practitioners.
- No licence was found for either PDF.
- opendata.li (CKAN, `terms_by`) carries only health accounts and statistics. **UNVERIFIED** (catalogue only).
- **Blocking:** the market is tiny. The data is person-centred (responsible pharmacist).

## Malta (mt)

**Verdict: PARTIAL.** The national register of licensed pharmacies is open (CC BY 4.0, API, with coordinates). No open list of hospitals, health centres or care homes was found. The government's roughly 10 health centres and 3–4 hospitals could be added by hand from gov.mt pages, licence not read.

- **"Licensed Pharmacies in Malta and Gozo".**
  - Publisher: Medicines Authority.
  - URL: API https://data.gov.mt/Pharmacy/V1/Pharmacy. Catalogue: http://data.europa.eu/88u/dataset/0dfe65b7-626f-49ef-ab09-6a6ab8a4db72, harvested from portal.data.gov.mt.
  - Licence: distribution licence `https://creativecommons.org/licenses/by/4.0/`. This was read on the data.europa.eu record harvested from data.gov.mt; the national portal's API did not answer.
  - Format: JSON (OData-style `value` array). Modified 2026-11-18; frequency not stated.
  - Fields: ID, Type, Licence_No, Pharmacy_Name, Pharmacy_Address, Locality, Post_Code, Telephone_No, Lattitude, Longitude. No person names.
  - Rows: 261:
    - community pharmacies: 240;
    - inpatient (hospital) pharmacies: 11;
    - government pharmacies: 6;
    - other: 4.
  - **VERIFIED.**
- Also on data.gov.mt, all CC BY 4.0, type "WEB" pointing to the councils' online registers: Medical Practitioners (Principal, Specialist, Provisional, Temporary), Dental Surgeons, Pharmacy Technicians. These are practitioner registers, outside this facility brief, but worth a separate look. **UNVERIFIED.**
- **Blocking:** none found. The Medical Council's ethics code limits doctors' own advertising.

## Finland (fi)

**Verdict: OPEN-DATA DIRECTORY POSSIBLE (public facilities).** The national service
catalogue (PTV) is CC0, with addresses and coordinates for every public health-centre,
hospital, dental and maternity-clinic location. It does not cover private clinics or
community pharmacies. THL's SOTE organisation register would add about 15,000
private health units, but it carries no reuse licence, so it is PARTIAL until THL
states one.

- **Suomi.fi-palvelutietovaranto (PTV): service locations**. VERIFIED.
  - Publisher: Digi- ja väestötietovirasto (DVV).
  - Dataset: https://avoindata.suomi.fi/data/dataset/palvelutietovaranto
  - API: https://api.palvelutietovaranto.suomi.fi/api/v11/ServiceChannel/type/ServiceLocation?page=N
  - Licence: catalogue field "Creative Commons CCZero 1.0" (http://creativecommons.org/publicdomain/zero/1.0/), stated on the dataset page above. The description adds: "tietoja voi hyödyntää vapaasti ja maksutta avoimen rajapinnan kautta" (the data may be used freely and at no cost through the open API).
  - Format and update: JSON/REST, no key needed; the catalogue gives "weekly", the API is live.
  - Fields: names in fi/sv/en; addresses with street, number, postcode, post office and municipality code; latitude and longitude in ETRS-TM35FIN, for example `6988237.637 / 299501.513` with `coordinateState: Ok`; phones, emails, web pages, service hours; linked services, for example "Lääkärin tai hoitajan vastaanotto" or "Radiologian palvelut"; `responsibleSoteOrganization`; organisation id. There are no person names on location records.
  - Rows: 38,182 service locations across all sectors. A name-keyword pass (terveysasema, sairaala, hammashoito, neuvola and so on) gives at least **about 3,800** health and care locations. Filtering on service class or `responsibleSoteOrganization` would be exact.
- **THL SOTE-organisaatiorekisteri** (OID 1.2.246.537.6.202). VERIFIED download; **licence not found**.
  - Publisher: THL, via the national code server (koodistopalvelu.kanta.fi).
  - Page: https://koodistopalvelu.kanta.fi/codeserver/pages/classification-view-page.xhtml?classificationKey=421
  - Excel publication: https://koodistopalvelu.kanta.fi/codeserver/pages/publication-view-page.xhtml?distributionKey=11597&versionKey=501&returnLink=fromVersionPublicationList, with the file at `…/codeserver/pages/download?name=sote.xlsx&pKey=pubfiles0`. It downloads with no login.
  - Licence: no licence or terms of use appear on the classification page, the publication page or the server. The footer "Copyright © 2026 Elisa Oyj" covers the software. The page says "Julkaisut estetty: Ei" (publications not blocked).
  - Format and update: XLSX of 38 MB, published daily at 05:00.
  - Fields: OID, short and long name, parent unit, hierarchy level, validity dates, street address, postcode, post office, phone, sector (public or private), unit-type flags (health or social operating unit), municipality, Y-tunnus (business ID), Soteri service area.
  - Person names: **yes**. Sole traders appear under their own names.
  - Rows: 172,082 in total and 111,857 with no end date. Of those, 14,887 are flagged health operating units (`Terv.toimintayksikkö = T`), almost all private, and 11,902 of them have a street address.
  - Use: needs THL's written confirmation of a licence. The FI rows of the summary table assume it is not usable until then.
- **Fimea open data**. VERIFIED catalogue only.
  - Licence: CC BY 4.0 (https://www.fimea.fi/tietoa_fimeasta/avoin-data).
  - It covers medicines only. **No list of community pharmacies** is published there. Fimea's site lists hospital pharmacies and medicine centres as HTML pages, with no licence found.
- **Lupa- ja valvontavirasto: professionals dataset** (https://avoindata.suomi.fi/data/dataset/sosiaali-ja-terveydenhuollon-ammattihenkilot). CC BY 4.0, but it holds aggregate counts only, no names or units. Not usable for a directory.
- **Blocking**:
  - Advertising: health-care marketing must be factual. Private providers fall under the supervision act 741/2023, and pharmacy marketing is supervised by Fimea. UNVERIFIED, not read for this note.
  - DPA: no decision of the Finnish data protection authority against health directories was found (UNVERIFIED negative).

## Norway (no)

**Verdict: OPEN-DATA DIRECTORY POSSIBLE.** The Brønnøysund register publishes every
establishment, with its NACE code and address, under NLOD 2.0. That covers hospitals,
nursing homes, medical and dental practices and pharmacies. The medicines agency
(DMP) publishes the official list of pharmacy licences, but without a licence or
street addresses. It is best used only to confirm which pharmacies hold a licence,
until DMP states a licence.

- **Enhetsregisteret: underenheter (establishments)**. VERIFIED.
  - Publisher: Brønnøysundregistrene.
  - API: https://data.brreg.no/enhetsregisteret/api/underenheter?naeringskode=<code>. Bulk download: https://data.brreg.no/enhetsregisteret/api/underenheter/lastned (UNVERIFIED path, documented on the API docs page).
  - Licence: API documentation https://data.brreg.no/enhetsregisteret/api/dokumentasjon/no/index.html says "License: Norsk lisens for offentlige data (NLOD)", linking to https://data.norge.no/nlod/no/2.0. The data.norge.no record lists NLOD 2.0 on two distributions and "Ikke oppgitt" (not given) on the main API distribution.
  - Format and update: JSON, CSV and XLSX; the full set is refreshed daily ("Hele datasett oppdateres en gang i døgnet").
  - Fields: org number, name, NACE code and description, location address (street, postcode, place, municipality number), parent entity, start date. No coordinates.
  - Person names: **yes**. Sole-trader names contain the person's name.
  - Counts by NACE (SN2025) on 2026-11-27:

    | NACE code | Category                 | Count                                         |
    | --------- | ------------------------ | --------------------------------------------- |
    | 86.101    | hospitals                | 314                                           |
    | 86.102    | psychiatric institutions | 291                                           |
    | 86.210    | general medical practice | 13,443 (includes holding companies, so noisy) |
    | 86.221    | specialist medical       | 3,014                                         |
    | 86.230    | dental                   | 5,896                                         |
    | 87.102    | nursing homes            | 956                                           |
    | 87.300    | care                     | 197                                           |
    | 47.730    | pharmacies               | 1,149                                         |

  - Caveat: this is a business register, not a health licence register. NACE codes are self-declared.
- **DMP "Landets apotek"**. VERIFIED; **licence not found**.
  - Publisher: Direktoratet for medisinske produkter.
  - Page: https://www.dmp.no/tilvirkning-import-og-salg/apotekdrift/apotekoversikt
  - File: https://www.dmp.no/globalassets/documents/tilvirkning-import-og-salg/apotekdrift/apotektillatelser/landets-apotek-1.xlsx
  - Licence: no reuse statement was found on dmp.no. NLOD is the national default for open data, but DMP does not cite it.
  - Format and update: XLSX, updated "jevnlig" (regularly); the sheet is dated 18.09.2026.
  - Fields: pharmacy id, name, **postcode and place only (no street)**, municipality and number, county, owner, owner org number (joinable to Brreg for the address), licence type, status, opening date.
  - Person names: **yes**. The column "Apoteker/driftsansvarlig" gives the pharmacist's name.
  - Rows: 1,070.
- Not found as open data: Helsedirektoratet's fastlege (GP list) data and Norsk Helsenett's Adresseregister (restricted to health-network members). data.norge.no has no facility list beyond the above.
- **Blocking**:
  - Advertising: health personnel marketing must be "forsvarlig, nøktern og saklig" (sound, sober and factual) under helsepersonelloven §13. UNVERIFIED wording.
  - DPA: no Datatilsynet decision against health directories was found (UNVERIFIED negative).
  - Do not republish pharmacist names from the DMP file.

## Sweden (se)

**Verdict: PARTIAL.** The national list of licensed pharmacies is open (CC BY 4.0,
1,451 pharmacies, street addresses). There is no national open list of health
centres, hospitals or clinics. The IVO provider register is not public, and HSA and
1177 data are restricted. Some regions publish their health centres as CC0 (Västra
Götaland checked). A pharmacy-first launch, as in Germany, is possible.

- **Läkemedelsverket: "Apotek med tillstånd"**. VERIFIED.
  - Publisher: Läkemedelsverket (Swedish Medical Products Agency).
  - Dataset: https://catalog.lakemedelsverket.se/store/1/resource/36 (harvested to dataportal.se).
  - Search page: https://www.lakemedelsverket.se/sv/handel-med-lakemedel/apotek/sok-apotek-som-har-tillstand
  - Export used: https://www.lakemedelsverket.se/api/pharmacy/exporttoxlsx (the page's own "export to Excel" endpoint, called with no filter, as the page instructs: "Sök utan filter för att se alla apotek med tillstånd").
  - Licence: distribution record https://catalog.lakemedelsverket.se/store/1/resource/37 gives `license = http://creativecommons.org/licenses/by/4.0/`, with access rights PUBLIC.
  - Format and update: XLSX, "Databasen uppdateras dagligen" (updated daily).
  - Fields: county, municipality, pharmacy name, visiting address, postcode, town, licence holder, holder org number, licence case number, valid-from date, GLN. No coordinates.
  - Person names: none; the holders are companies.
  - Rows: 1,451 (Stockholm 310, Skåne 190, Västra Götaland 184 and so on).
  - The same dataset has a second distribution, OTC retail outlets (CC BY 4.0), which are not health facilities.
- **Västra Götalandsregionen: "Vårdcentraler i Vårdval vårdcentral"**. UNVERIFIED (catalogue only).
  - Dataset: https://vgregion.entryscape.net/store/7/resource/46; CSV at https://vgregion.entryscape.net/store/7/resource/47
  - Licence: distribution field `http://creativecommons.org/publicdomain/zero/1.0/`.
  - Update: irregular.
  - Fields: id, HSA-id, clinic name, company, street, number, postcode, town.
  - Rows: one region, about 200 health centres (estimate).
- **Kolada** (api.kolada.se/v3/ou) lists organisational units (vårdcentraler, care homes) with title and municipality only, no addresses. Not enough for a directory.
- **IVO vårdgivarregistret**: not public. Data is available only by an access-to-documents request, case by case and for a fee (https://www.ivo.se/kontakt/ta-del-av-handlingar/). UNVERIFIED for the "no public search" part, which was read on a secondary page.
- **Blocking**:
  - Advertising: health-care marketing falls under marknadsföringslagen and patientsäkerhetslagen; no directory-specific rule was found (UNVERIFIED).
  - DPA: no IMY decision against health directories was found (UNVERIFIED negative).

## Lithuania (lt)

**Verdict: OPEN-DATA DIRECTORY POSSIBLE.** The health-care licensing authority
(VASPVT) publishes every licensed institution and every licensed activity address,
CC BY 4.0, updated daily. The national health insurance fund (VLK) adds its
contracted institutions and pharmacies, also CC BY 4.0, but without addresses.

- **VASPVT: "Sveikatos priežiūros įstaigų licencijų duomenys"**. VERIFIED.
  - Publisher: Valstybinė akreditavimo sveikatos priežiūros veiklai tarnyba prie SAM.
  - Dataset: https://data.gov.lt/datasets/1623/
  - CSV per model: `https://data.gov.lt/datasets/1623/versions/1652/dynamic-resource/<Model>/csv/download/`, where Model is `Istaiga`, `IstaigosVeiklosAdresas`, `Licencija`, `IstaigosPaslauga`, `Paslauga` and so on.
  - Licence: portal field "Licencija: Creative Commons Attribution 4.0" (https://creativecommons.org/licenses/by/4.0/deed.lt), on the dataset page above.
  - Format and update: CSV, JSON, JSONL and RDF; "Atnaujinama: Kasdien" (updated daily).
  - Fields:
    - Institution: legal-entity code and name, legal form, licence number and date, personal or public health flag.
    - Activity address: free-text address plus an `adreso_id` from the national address register, which can be joined for coordinates (UNVERIFIED join).
    - Licence: number, dates, revocation date, status, seat address.
    - Services and profiles per address.
  - Person names: **yes**. Individual enterprises are named after their owner.
  - Rows: 4,131 institutions; 9,731 activity addresses; 6,290 licences, 5,002 of them unrevoked. Those unrevoked licences cover 4,346 institutions and 8,177 activity addresses.
- **VLK: "Gydymo įstaigų, vaistinių ir kitų įmonių sąrašas"**. VERIFIED.
  - Publisher: Valstybinė ligonių kasa prie SAM.
  - Dataset: https://data.gov.lt/datasets/1386/; CSV at https://data.gov.lt/datasets/1386/versions/1639/dynamic-resource/Istaiga/csv/download/
  - Licence: "Creative Commons Attribution 4.0", on the dataset page.
  - Update: yearly ("Kasmet").
  - Fields: code, legal-entity code, name, parent, flags (treatment, pharmacy, optics, dental, orthopaedic), municipality code, territorial fund, contract dates. **No address.**
  - Rows: 23,212 in total; 16,333 open ("iki" in the future), of which 10,179 are treatment and 2,452 are pharmacy outlets.
  - Use: useful for pharmacy names and SAM contract status, but needs a separate address source.
- Pharmacy licences from the medicines agency (VVKT) were not found on data.gov.lt. Its four datasets cover medicines only (https://data.gov.lt/orgs/69/datasets/).
- data.gov.lt rate-limits (HTTP 429). A slow import is needed.
- **Blocking**:
  - Advertising: Lithuanian law restricts advertising of personal health-care services, and a factual directory should fall outside it. UNVERIFIED, law text not read.
  - DPA: no VDAI decision against directories was found (UNVERIFIED negative).
  - Strip owner names from individual-enterprise names, or treat them as facility names (policy decision).

## Portugal (pt)

**Verdict: NOT POSSIBLE nationally (PARTIAL only at municipal level).**

- dados.gov.pt and SNS Transparência (149 datasets) publish health statistics by
  institution, not lists of facilities with addresses.
- The ERS register of establishments (SRER) is a legally public search on ers.pt, not a bulk open dataset.
- INFARMED publishes no current pharmacy list with a licence.

- **SNS Transparência (Opendatasoft)**. VERIFIED catalogue and sample.
  - Catalogue: https://transparencia.sns.gov.pt/api/explore/v2.1/catalog/datasets
  - No licence field is set (`license: None`) on the datasets checked.
  - "Certificação de Unidades de Saúde" (acreditacao-de-unidades-de-saude, 3,876 rows) holds region, institution, unit name, unit type and certification phase. No address.
  - "Unidades Funcionais" holds aggregate counts only.
- **dados.gov.pt** (uData API https://dados.gov.pt/api/1/datasets/?q=…). VERIFIED catalogue.
  - INE datasets are CC BY but contain only counts ("Estabelecimentos de saúde (N.º)", "Farmácias … (N.º)").
  - Municipal pharmacy lists exist under CC BY, for example Câmara Municipal de Cascais "Farmácias" (slug `farmacias-2`) and Águeda "Farmácias" (slug `farmacias`). Local only; UNVERIFIED contents.
- **ERS SRER**: Regulamento 66/2015 requires ERS to make the register's elements available on its portal. Only a search exists, and there is no bulk file or licence. A LADA access request would be the route (UNVERIFIED).
- **INFARMED**: only a 2004 PDF and old thematic Excel lists were found, for example "Lista de Estabelecimentos Hospitalares Públicos e Privados" (2019). Licence not found; UNVERIFIED.
- **Blocking**: advertising of health practices is regulated by Decreto-Lei 238/2015 and supervised by ERS. Factual information is allowed (UNVERIFIED). No CNPD decision against directories was found (UNVERIFIED negative).

## Cyprus (cy)

**Verdict: OPEN-DATA DIRECTORY POSSIBLE (small, pharmacy-led).** The Pharmaceutical
Services publish all private pharmacies under CC BY 4.0 with addresses. The Ministry
of Health publishes the state hospitals, with coordinates, and the state health
centres. No list of private clinics or GESY providers is open.

- **"Κατάλογος Ιδιωτικών Φαρμακείων" (List of Private Pharmacies)**. VERIFIED.
  - Publisher: Φαρμακευτικές Υπηρεσίες, Υπουργείο Υγείας (Pharmaceutical Services, Ministry of Health).
  - Dataset: https://www.data.gov.cy/el/dataset/katalogos-idiotikon-farmakeion
  - CSV: https://www.data.gov.cy/sites/default/files/Κατάλογος%20Ιδιωτικών%20Φαρμακείων%202024-2025.csv (an XLS is also offered).
  - Licence: dataset page "Άδεια Χρήσης: Creative Commons Attribution 4.0 International (CC BY 4.0)".
  - Format, coverage and update: CSV (UTF-8) and XLS; temporal coverage 2024 to 2025; data.europa.eu shows the record modified 2024-10-25. No update frequency is stated.
  - Fields: district, registration number, **pharmacist surname and first name** (pharmacies are identified by their owner), address, additional address info, town or community, postcode, pharmacy phone, **house telephone number** (personal data, must not be republished). No coordinates.
  - Rows: 664.
- **"Κατάλογος Κρατικών Νοσοκομείων Κύπρου" (state hospitals)**. UNVERIFIED (catalogue only).
  - Publisher: Ministry of Health.
  - Page: https://www.data.gov.cy/dataset/κατάλογος-κρατικών-νοσοκομείων-κύπρου, CSV resource 3f22360a-783c-43ed-87fe-0fca2e91661f.
  - Format and update: CSV, XLSX and HTML; file of 1.7 KB dated 2018-03-13.
  - Fields: name, address, phone, website, X/Y coordinates.
  - Rows: about 8 to 10. Licence: not read (the portal default is CC BY 4.0).
- **"Κατάλογος Κρατικών Κέντρων Υγείας" (state health centres)**. UNVERIFIED.
  - Page: https://data.gov.cy/el/resource/kentra-ygeias-kyproy
  - Fields: name, phone, fax. **No address.**
  - Rows: about 40 (estimate).
- data.gov.cy is now Drupal; the CKAN API (`/api/3/action`) no longer answers, and site search could not be queried automatically. Discovery was done through data.europa.eu.
- **Blocking**: medical advertising is restricted for doctors and pharmacies (UNVERIFIED). There is a personal-data risk because pharmacies are listed under pharmacists' names with home phone numbers. Show only the pharmacy, address and business phone.

## Greece (gr)

**Verdict: PARTIAL.** data.gov.gr holds Ministry of Health hospital contact lists,
CC BY, but they are split by health region (4 of 7 regions present) and partly date
from 2016. Some regions publish primary-care units with coordinates. There is no
national open list of pharmacies, private clinics or EOPYY-contracted providers.

- **"Στοιχεία επικοινωνίας νοσοκομείων" (hospital contact details)**. VERIFIED, 1st health region file.
  - Publisher: Υπουργείο Υγείας (Ministry of Health).
  - Dataset: https://data.gov.gr/dataset/4257dc57-dc24-47b6-b8f5-b44cd878f5b3 (slug `eto1xeia-ett1ko1vwvias-voookoueiwv`).
  - Licence: CKAN field `cc-by`, "Creative Commons Attribution" (http://www.opendefinition.org/licenses/cc-by).
  - Format and update: XLS and XLSX, one file per health region (1st, 2nd, 3rd and 7th only). The 7th region's file is named `7-11-03-2016.xls`. No update frequency is stated.
  - Fields: hospital, hospital unit, address with postcode (free text), switchboard, fax, email. No coordinates and no person names.
  - Rows: the 1st region (Attica) has 18 hospitals and 26 units with addresses. National total about 130 public hospitals (estimate).
- **5th health region (Thessaly and Central Greece): "Στοιχεία επικοινωνίας δομών ΠΦΥ" (primary-care units)**. VERIFIED.
  - Dataset: https://data.gov.gr/el/dataset/stoicheia-epikoinonias-domon-protovathmias-frontidas-ygeias-kentra-ygeias-perifereiaka-iatreia
  - Licence: data.europa.eu shows "Creative Commons Attribution 4.0 International"; the CKAN licence field is empty.
  - Format and update: XLSX, modified 2026-04-17.
  - Fields: unit name, type, region, regional unit, municipality, address, lat/lon, postcode, phone, email.
  - Rows: 361 (45 health centres, 291 regional surgeries and others).
  - Similar regional datasets exist for the 6th region (geodata), the 7th region (Crete) and Crete's WMS layers. UNVERIFIED.
- Pharmacies: the Ministry dataset `minhealth_pharmacies` holds counts only. Municipal and regional layers exist (Naxos, Rethymno, Crete). No national register.
- **Blocking**: doctors' advertising is restricted by the Code of Medical Ethics, law 3418/2005 article 17 (UNVERIFIED). No HDPA decision against directories was found (UNVERIFIED negative).

## Croatia (hr)

**Verdict: PARTIAL** (graded down from "possible" in the research notes: national lists exist, but the licence must be pinned down first).
HZZO publishes current national lists of every contracted provider: GPs, paediatricians,
gynaecologists, dentists, outpatient specialists, hospitals, pharmacies, labs and home nursing.
They are dated October 2026 and carry addresses. The licence is the open question. The copies on
data.gov.hr have no licence field ("License not specified"), and HZZO's own page shows no reuse
terms. The Croatian Open Licence (Otvorena dozvola, CC BY-equivalent) applies only where a
dataset states it. Zagreb's city datasets do state it. Fix: ask HZZO to tag its data.gov.hr
datasets "Otvorena dozvola", or rely on the ZPPI reuse right (see below).

- **HZZO, "Ugovoreni sadržaji zdravstvene zaštite u RH"**
  - Page: https://hzzo.hr/zdravstvena-zastita/zdravstvena-zastita-pokrivena-obveznim-zdravstvenim-osiguranjem/ugovoreni
  - Files, all XLSX/XLS, refreshed monthly or quarterly (filenames end `_102026` = October 2026):
    - GP list: `web_opca_102026.xlsx`. VERIFIED: 2,275 rows. Fields: regional office, health-centre/concessionaire code and name, activity, doctor code, **doctor surname and first name**, ownership (public/private), insured count, practice address (settlement, street, number, municipality). No coordinates.
    - Outpatient specialists "s adresama", October 2026. VERIFIED: 3 sheets, about 496 + 68 + 182 rows. Fields: institution or private-practice code and name (private practices are named after the doctor), location, street, activity.
    - Pharmacies: `Popis ugovorenih ljekarni u RH_1.xls`. Downloaded (293 KB BIFF). Pharmacy names are visible in the raw strings, but no xls parser was available, so the columns are **UNVERIFIED**.
    - Hospitals: `adresar bolnica.xls`, plus a beds and units workbook dated February 2026.
  - Licence: none stated on the page. The data.gov.hr mirrors are stale (2023) and have `license_id = None`. Examples: https://data.gov.hr/ckan/dataset/adresar-zdravstvenih-ustanova-privatnih-praksi and https://data.gov.hr/ckan/dataset/lokacije-ordinacija-primarne-zdravstvene-za-tite (its `hzzo-net.hr/hackathon` CSV did not answer).
  - Statutory route: the ZPPI (Zakon o pravu na pristup informacijama, NN 25/13, 85/15, 69/22) makes published public-sector information reusable. The standard licences are set in the Pravilnik NN 67/17. Summary of the Information Commissioner (https://pristupinfo.hr/objavljena-hrvatska-dozvola-licenca-za-otvorene-podatke/): "Jedina obveza korisnika jest da pri uporabi informacija koje sadrže otvorenu dozvolu navede izvor". The default-reuse reading for files without a licence statement is **UNVERIFIED**.
  - Estimated rows: about 2,275 GP teams, about 800 dental teams, about 1,200 pharmacies (UNVERIFIED) and about 60 hospitals.
- **Grad Zagreb, "Geoportal – ljekarne"**
  - URL: https://data.gov.hr/ckan/dataset/geoportal-ljekarne. CSV, GeoJSON and KML through ArcGIS.
  - Licence: "Otvorena dozvola (OD)" (`open-license`, https://data.gov.hr/id/licence/otvorena-dozvola-rh), read from the CKAN API.
  - VERIFIED: 247 rows. Fields: X/Y (WGS84), name, address, phone, email, web, source. No person names.
- **Grad Zagreb, "Geoportal – zdravstvene ustanove"**
  - URL: https://data.gov.hr/ckan/dataset/geoportal-zdravstvene-ustanove. Licence "Otvorena dozvola (OD)".
  - VERIFIED: 47 rows (polyclinics, hospitals, emergency units) with X/Y, name, address, phone, fax, email, web.
- **Ministarstvo zdravstva:** the only facility lists on data.gov.hr (organisation `ministarstvo-zdravstva`) are transplant centres, tissue banks and MPO units. They are "Otvorena dozvola" but tiny.
- **Blocking:** health institutions and private practices may only "inform", not advertise. This comes from the Zakon o zdravstvenoj zaštiti and the chamber codes (**UNVERIFIED**, not read this round). No AZOP decision against health directories was found (UNVERIFIED negative). The GP list names doctors, so pages should show the practice, not the person.

## Bulgaria (bg)

**Verdict: PARTIAL (excellent statutory public registers, no explicit reuse licence).**
The Ministry of Health's NZIS runs public registers with a JSON API at https://opendata.his.bg.
They cover hospitals, outpatient facilities and hospices, and pharmacies. The site and the API
state no licence. data.egov.bg (the national portal, where the regional RZI registers are also
published under "РМС 103/2015") answered **HTTP 403** to automated requests. That block
was not bypassed, so its licence fields are **UNVERIFIED**. A reuse right would rest on the
ZDOI's reuse chapter (Закон за достъп до обществена информация, гл. 4а), which was **UNVERIFIED**
this round. A short written request to the Ministry of Health or NZIS for a CC BY statement
would make Bulgaria fully open.

- **NZIS, "Публичен регистър на Разрешенията за търговия на дребно с лекарствени продукти (Регистър Аптеки)"**
  - URL: https://opendata.his.bg/pharmacies/. The data file is the one the page itself loads: https://opendata.his.bg/pharmacies/data.json.
  - Licence: none stated. Updated continuously (latest change 2026-11-20).
  - VERIFIED: 4,057 records, 3,306 of them active and latest. Fields: permit numbers and dates, company name, EIK, company and pharmacy EKATTE, town, pharmacy address, `a_gps` (empty in every active record), pharmacy type, **responsible pharmacist first and family name and UIN**, cancellation data, status.
- **NZIS, "Публичен регистър на лечебните заведения за болнична помощ"**
  - URL: https://opendata.his.bg/hospitals/. API: `https://registries.his.bg/api/v1/hospital/getHospitalForApiV1?start=0&length=1000&searchText=&searchStatus=`, with details from `getHospitalByNumberForApiV1?number=`.
  - Licence: none stated.
  - VERIFIED: 593 records (statusCode 1: 389, statusCode 2: 204; meaning not checked). The list gives number, name, EIK, type code and bed count. Details add phone, email, beds by type and addresses (text). No coordinates.
- **NZIS, "Публичен регистър на лечебните заведения за извънболнична помощ и хосписите (ЛЗИБПХ)"**
  - URL: https://opendata.his.bg/lzibph/. API: `https://registries.his.bg/api/V1/outpatientcare/getOutpatientCareWithFilterForApiV1?start=&length=`, with details from `getOutpatientCareByNumberForApiV1?number=`.
  - Licence: none stated.
  - VERIFIED: `recordsTotal` 39,180 (this includes deleted ones). Details give type (GP, dental, group practice, medical centre…), status, address (district, municipality, full text), activities, and the **owners' and medical staff's names** with their professions. No coordinates. A bulk pull means 39k detail calls; the terms of use say nothing either way.
- **BDA (ИАЛ), "Регистър на издадените разрешения за търговия на дребно с лекарствени продукти"**
  - URL: https://www.bda.bg/images/stories/documents/registers/Register_Apteki/20261123_Registar_apteki.xls. Downloaded, 5.5 MB XLS dated 2026-11-23. Columns not parsed (BIFF); the NZIS JSON above holds the same register.
  - Licence: none found.
- **RZI regional registers on data.egov.bg** (Montana 2019, Yambol, Razgrad, Varna, Silistra, Burgas…). Example: https://data.egov.bg/data/resourceView/ad5385f7-3a38-432a-926d-fc36596926ec. CSV with manager names. **UNVERIFIED** (403); patchy and often stale.
- **Blocking:** the Закон за лечебните заведения and the medical ethics code restrict facility advertising (**UNVERIFIED**). No KZLD decision against directories was found (UNVERIFIED negative). The registers mix company data with named individuals (sole-trader pharmacists, solo-practice owners), so pages should show facility names only.

## Hungary (hu)

**Verdict: PARTIAL (good national lists, but reuse means a request and an agreement under the Nah. tv.).**
NEAK publishes current lists of contracted providers. NEAK's own reuse notice
(https://www.neak.gov.hu/felso_menu/rolunk/kozerdeku_adatok/kozadatok_igenylese/kozadatok_tovabbi_felhasznalas_celjabol-torteno_rendelkezesre_bocsatasa/tajekoztato-a-kozadatok-ujrahasznositasarol)
rests on the 2023. évi CI. törvény. It says "A közadatok további felhasználás céljából történő
rendelkezésre bocsátásáért a NEAK díjat állapít meg" and that reuse starts with "az erre
rendszeresített adatkérő lap kitöltésével". That means a request form, an agreement under §69
and possibly a fee. No open licence was found on the published files. A formal reuse request
to NEAK is the path; it is cheap but slow.

- **NEAK, "Szerződött szolgáltatók"**
  - URL: https://www.neak.gov.hu/letoltheto/altfin_dok/szerzodott_szolgaltatok, monthly.
  - Inpatient list (`.../Fekvobeteg-szakellato_intezmenyek_xlsx`). VERIFIED: 2,913 department rows, 157 institutions, 308 sites. Fields: county, NEAK code, institution name, seat address and phone, department code and name, specialty, site postcode, town and address. No coordinates, no person names.
  - GP practices (`.../Haziorvosi_szolgalatok_xls`, really XLSX). VERIFIED: 6,358 rows. Fields: county, practice code, type, NEAK code, provider (company) name, postcode, town, address, phone, served settlements (KSH codes), district, **GP's name**.
  - Also listed: dental surgeries (XLS) and outpatient institutions (`Jarobeteg-szakellato_intezmenyek` 202607, XLSX), not opened.
  - Licence: none on the files; reuse goes through the Nah. tv. procedure quoted above.
- **EESZT "törzspublikáció"** (a monthly REST JSON of funded providers) is cited by the third-party repo ZoliQua/Praxisterkep. It was not opened and its licence was not read (**UNVERIFIED**).
- **Pharmacies:** the OGYÉI or NEAK pharmacy list was not checked this round (**UNVERIFIED**).
- **Blocking:** the Eütv. and chamber ethics rules limit advertising by providers (**UNVERIFIED**). No NAIH decision against health directories was found (UNVERIFIED negative). The GP list names doctors.

## Romania (ro)

**Verdict: PARTIAL (open licence, but the current national lists have no addresses).**
CNAS publishes current lists of every contracted provider on data.gov.ro under CC BY 4.0:
hospitals, GPs, dentists, pharmacies, paraclinical, rehab, home care, sanatoria and ambulances.
Their columns are only contract number, fiscal code (CUI), provider type, name and county CAS;
there is no address. Addresses could come from a join with the ONRC trade-register dataset
(also CC BY 4.0, registered office only). The Ministry's pharmacy list with addresses dates
from 2019.

- **CNAS, "Lista furnizori"**
  - URL: https://data.gov.ro/dataset/lista-furnizori, published yearly (snapshots at 31 March; latest 31.03.2026).
  - Licence: "Creative Commons Attribution 4.0" (`CC-BY-4.0`, https://creativecommons.org/licenses/by/4.0/), from the CKAN API.
  - VERIFIED, SANATORII 2026 (17 rows): Numar contract, Cod fiscal furnizor, Tip furnizor, Nume furnizor, Cod CAS, Nume CAS.
  - FARM 2026 (346 KB) and MF 2026 (1.6 MB) were downloaded. Their raw strings show the same layout: CUI plus name, and GP practices named "CMI DR. …", which are **person names**.
  - Rows: about 7,000 pharmacies and about 11,000 GP practices (UNVERIFIED estimates). No addresses and no coordinates.
  - Same data, 2025 edition: https://data.gov.ro/dataset/denumire-furnizori-de-servicii-medicale-pe-specialitati-si-judete (CC BY 4.0).
- **Ministerul Sănătății, "Situatia farmaciilor – 2019"**
  - URL: https://data.gov.ro/dataset/situatia-farmaciilor-2019. Licence "OGL-ROU-1.0" (https://data.gov.ro/pages/licence). 47 XLS, one per county; not updated since 2019.
  - VERIFIED, Bucharest sector 1: DENUMIRE, FORM.JUR., JUD/SECT, LOCALITATE, URBAN/RURAL, ADRESA, DATA INFIINTARII, **FARMACIST SEF** (person name), suspension data. No coordinates. Stale.
- **ONRC, "Firme înregistrate la Registrul Comerțului"**
  - URL: https://data.gov.ro/dataset/firme-07-08-2025. Licence "Creative Commons Attribution 4.0". CSV, `OD_FIRME.CSV` 656 MB.
  - Description: "informații despre profesioniști, sediul social, starea firmei și activitățile autorizate". This allows a CUI join to registered offices, though not to the pharmacy's own premises. Not downloaded (size): **UNVERIFIED** fields.
- **Ministerul Sănătății, "Spitale (unități – paturi) la 31.XII.2024"**
  - URL: https://data.gov.ro/dataset/spitale-unitati-paturi. CC BY 4.0.
  - VERIFIED: aggregates by county only, not a list.
- **Blocking:** the CMR deontology code restricts doctors' advertising (**UNVERIFIED**). No ANSPDCP decision against directories was found (UNVERIFIED negative).

## Slovakia (sk)

**Verdict: PARTIAL (regional open data only).**
There is no national open list of providers. The NCZI registers on data.slovensko.sk are
statistics, and ŠÚKL has no open pharmacy list. Licences for health facilities are issued by
the 8 self-governing regions (VÚC) through the shared eVÚC system, and several regions publish
those records as open data with coordinates and opening hours. Openly licensed: Trnava (TTSK)
and Banská Bystrica (BBSK) under CC BY, and Žilina (ŽSK) under an open-use statement. Prešov
(PSK) defers to the eVÚC source terms. Nitra (NSK) publishes a CSV without a licence. Košice
(KSK), Bratislava (BSK) and Trenčín (TSK) showed no licence. Because the eVÚC schema is shared,
asking the remaining regions or the eVÚC operator for CC BY is realistic.

- **TTSK, "Zdravotnícke zariadenia v TTSK"** (ArcGIS item 217f47baebc64d4398db32cd4a281cca, https://opendata.trnava-vuc.sk/datasets/217f47baebc64d4398db32cd4a281cca_0/explore; also in the national catalogue as `data.gov.sk/set/df4f36dc-…`)
  - Licence (ArcGIS item `licenseInfo`): "Creative Commons Attribution 4.0 International (CC BY 4.0), eVUC". The catalogue gives the frequency as DAILY_2.
  - VERIFIED: 1,930 features. Fields: ID, district, municipality, facility type, name (operator in brackets), **professional representative's name**, insurers, address, latitude/longitude, phone, email, opening hours per day.
- **TTSK, "EVUC Lekárne TTSK (aktualizované)"** (item 7b5f88d39eb94da292f6e957d8245845). CC BY 4.0, same statement.
  - VERIFIED: 243 pharmacies. Fields: type, name, address, coordinates, phone, hours, operator and IČO, email.
- **BBSK, "Zdravotnícke zariadenia"** (item d15b09a04fb74996bfb0dcd9d9a64e3e) and **"Lekárne"** (item a82de9e420844bab862dcf968a0abc57)
  - Licence (`licenseInfo`): "CC BY".
  - VERIFIED: 3,256 facilities and 271 pharmacies. Fields: name, type, insurers, address split into parts, municipality code, contacts. The pharmacy layer names the **professional representative**.
- **ŽSK, "Zdravotnícke zariadenia ŽSK"** (item 924f3a7e423a4f65b47c38e4b4fa0055)
  - Licence: "Používateľ má právo údaje voľne využívať, kopírovať, publikovať a zdieľať bez obmedzení, aj na komerčné účely."
  - VERIFIED: only 10 rows, the region's own polyclinics and hospitals, with the director's name.
- **PSK, "eVÚC – Lekárne / Ostatné zdravotnícke zariadenia / Všeobecní lekári… v PSK"** (items 9df285d8…, 93a5a700…, 6481eb46…)
  - Licence text: "Platia podmienky použitia pôvodného zdroja. Pri použití uveďte: „eVÚC – …; spracovanie: Prešovský samosprávny kraj, Geoportál PSK“". The source terms are not stated. **UNVERIFIED**, not opened.
- **NSK, "Zdravotnícke zariadenia v Nitrianskom kraji"** (https://www.unsk.sk/Files/ShowFile/93971, catalogue `data.gov.sk/set/1f266c1e-…`)
  - Licence: none in the catalogue.
  - VERIFIED: CSV, 2,158 rows (1,933 legal persons and **225 natural persons by name**). Fields: applicant address, facility type, specialty, operating address. No coordinates.
- **Blocking:** under Act 578/2004 providers may not advertise beyond factual information (**UNVERIFIED**). No ÚOOÚ decision against directories was found (UNVERIFIED negative). Several layers name the "odborný zástupca" (professional representative).

## Turkey (tr)

**Verdict: PARTIAL (city level only, İzmir under CC BY 4.0; no national open list).**
The Ministry of Health and TİTCK publish no open, licensed list of facilities or pharmacies.
There is no working national open-data portal. İzmir Metropolitan Municipality publishes
pharmacies and health institutions under CC BY 4.0. Istanbul's (İBB) health-institutions
dataset exists, but the portal timed out from here, and its description reportedly says it is
fee-based and no longer updated.

- **İzmir BB, "Nöbetçi Eczaneler ve Eczane Listesi"**
  - URL: https://acikveri.bizizmir.com/dataset/nobetci-eczaneler-ve-eczane-listesi. CSV: https://openfiles.izmir.bel.tr/111324/docs/eczane-listesi.csv, with XLSX and an API (`https://openapi.izmir.bel.tr/api/ibb/eczaneler`). Metadata updated 2026-11-25.
  - Licence (https://acikveri.bizizmir.com/tr/license): "Bu site altında yer alan tüm materyaller aksi belirtilmedikçe CC BY 4.0 uluslararası lisansı ile İzmir Büyükşehir Belediyesi tarafından lisanslanmıştır … Veriler atıf vermek kaydıyla ticari amaç da dahil olmak üzere kopyalanabilir, düzenlenebilir, dağıtılabilir."
  - VERIFIED: 2,072 pharmacies. Fields: lat/lon, name, phone, address, area, IDs. No person names.
- **İzmir BB, "Sağlık Kurumları"**
  - URL: https://acikveri.bizizmir.com/dataset/saglik-kurumlari. 13 API layers: hospitals, family health centres (ASM), dental centres, polyclinics, medical centres, labs, emergency stations, TB dispensaries… Same CC BY 4.0. Metadata updated 2026-10-15.
  - VERIFIED, hospitals layer: 80 rows with district, neighbourhood, street, door number, lat/lon, name. Other layers not opened.
- **İBB, "İstanbul Sağlık Kurum ve Kuruluşları Verileri"**
  - URL: https://data.ibb.gov.tr/dataset/istanbul-saglik-kurum-ve-kuruluslari-verisi. "İBB Açık Veri Lisansı".
  - Fields (from search results): facility name, category, district, neighbourhood, address, lat/lon. Last updated 2024–2025. The description, from the search result, reads "Bu veri seti ücrete tabii olduğundan portalda güncellenmeyecektir".
  - **UNVERIFIED**: the portal did not answer (timeout).
- **Context (factual):** advertising by health institutions and professionals is banned. Only factual "tanıtım ve bilgilendirme" is allowed, under the Sağlık Hizmetlerinde Tanıtım ve Bilgilendirme Faaliyetleri Hakkında Yönetmelik (2011) and the private-hospital regulations (**UNVERIFIED** text). Health data is special-category under the KVKK (Law 6698). KVKK decisions on doctor-review platforms were not checked (**UNVERIFIED**). Turkey is not in the EEA, so GDPR adequacy does not apply. Access to some foreign sites is blocked by court orders, which matters for hosting but not for the data.

## Andorra (ad)

**Verdict: NOT POSSIBLE (from official open data).**
No national open-data portal answered: opendata.ad and dadesobertes.ad did not resolve. The
Ministry of Health keeps the "Registre de centres, serveis i establiments sanitaris i
sociosanitaris" (Reglament of 11 December 2013), but the govern.ad page publishes no list or
file (a fetch of https://www.govern.ad/ca/tematiques/salut/assistencia-sanitaria/centres-serveis-i-establiments-sanitaris;
**UNVERIFIED**, the page was truncated). SAAS runs the public facilities (one hospital and a
few primary-care centres). The only bulk source is OpenStreetMap (ODbL, through HDX), which is
crowd-sourced, not official.

- **Blocking:** none identified. The market is tiny (about 10 health centres and about 50 pharmacies, UNVERIFIED).

## Monaco (mc)

**Verdict: NOT POSSIBLE (now); re-check data.gouv.mc.**
The Opendatasoft portal https://data.gouv.mc returned 503 ("Site en maintenance"), so no
dataset or licence could be read. No official list of pharmacies or establishments with a
reuse licence was found. The market is tiny: CHPG, a few clinics, about 20 pharmacies (Loi
n° 1.518 of 23.12.2021 on pharmacy; UNVERIFIED count).

- **Blocking:** Monaco's own data-protection law (Loi 1.565 of 2024, which replaced Loi 1.165) and Order of Physicians rules (**UNVERIFIED**).

## San Marino (sm)

**Verdict: NOT POSSIBLE.**
No open-data portal was found (dati.gov.sm did not resolve). The ISS (Istituto per la Sicurezza
Sociale) lists its handful of pharmacies (Cailungo, Città, Borgo Maggiore, Serravalle,
Fiorentino…) and its single hospital on HTML pages
(https://www.iss.sm/on-line/home/servizi-generali-e-amministrativi/servizi-comuni-afferenti-al-direttore-attivita-sanitarie/uoc-farmaceutica---farmacie.html),
with no licence (**UNVERIFIED**). Italy's Ministry of Health datasets do not cover San Marino.

- **Blocking:** none identified. Fewer than 15 facilities in total.

## Vatican (va)

**Verdict: NOT POSSIBLE / not meaningful.**
There is no open-data portal. Health care is the Direzione di Sanità ed Igiene and the single
Farmacia Vaticana; patients otherwise use Rome. Nothing to import.

- **Blocking:** not applicable.

## Ukraine (ua)

**Verdict: OPEN-DATA DIRECTORY POSSIBLE.** The National Health Service of Ukraine (NHSU, НСЗУ) publishes two weekly national files under CC BY 4.0, both with coordinates:

- every provider contracted under the Programme of Medical Guarantees (PMG), down to each care site;
- every pharmacy contracted under the reimbursement programme "Доступні ліки" (Affordable Medicines).

Together they cover about 14,250 care sites and about 17,600 pharmacies on government-held territory. The Ministry of Health (MOZ) licence register adds private licensees, but its licence terms conflict (see below).

- **NHSU: providers contracted under the PMG.**
  - Publisher: Національна служба здоров'я України.
  - Dataset: https://data.gov.ua/dataset/46fa40f9-875b-41ee-8d6f-be2cc3e40ace (API id `a1d554df-be4b-4d3f-8063-dd0db4d83ff5`).
  - Files:
    - `pmg_legal_entity_info.csv`: https://data.gov.ua/dataset/46fa40f9-875b-41ee-8d6f-be2cc3e40ace/resource/ca4792f5-322f-4482-938e-b12cf14c516e/download/pmg_legal_entity_info.csv
    - `pmg_legal_entity_divisions_info.csv`: https://data.gov.ua/dataset/46fa40f9-875b-41ee-8d6f-be2cc3e40ace/resource/d98f7120-59fd-47f6-a5a5-e7f220bebc53/download/pmg_legal_entity_divisions_info.csv
  - Licence: the portal field says `cc-by` "Creative Commons Attribution". The page footer says "Весь контент доступний за ліцензією Creative Commons Attribution 4.0, якщо не зазначено інше". Both are on the dataset page above.
  - Format and frequency: CSV, UTF-8, "Щотижня" (weekly). The divisions file was last modified on 2026-10-29.
  - Fields, entities file: `legal_entity_edrpou`, `legal_entity_name`, `care_type` (primary, specialised, emergency), `property_type`, email, website, phone, `legal_entity_owner_name`, registration address, KOATUU code, `lat`, `lng`.
  - Fields, divisions file: `division_name`, `division_type` (outpatient clinic "амбулаторія", rural health post "ФАП", branch, place of activity), phone, email, oblast, raion, hromada, settlement, KOATUU code, full address, `lat`, `lng`.
  - Person names: `legal_entity_owner_name` is the head of each entity. 974 entities are sole proprietors (ФОП), so their name is a natural person's name.
  - Rows: 4,223 legal entities (2,427 municipal, 974 sole proprietors, 712 private, 109 state). 14,250 divisions, of which 7,035 are outpatient clinics and 1,611 are rural health posts. Only 14 divisions lack coordinates.
  - **VERIFIED.**
- **NHSU: pharmacies contracted under the reimbursement programme.**
  - Publisher: NHSU.
  - Dataset: https://data.gov.ua/dataset/d0f0755f-ce75-4d6b-8310-6e4ddf320c11 (API id `3503ea5a-456d-4780-905b-b74e7d8f09cf`).
  - File: `reimbursement_legal_entity_divisions_info.csv`, https://data.gov.ua/dataset/d0f0755f-ce75-4d6b-8310-6e4ddf320c11/resource/0a385ec9-f85e-499c-980e-37accb04d8d5/download/reimbursement_legal_entity_divisions_info.csv
  - Licence: `cc-by`, same portal footer (CC BY 4.0).
  - Format and frequency: CSV, about 40 MB, weekly. Last modified 2026-11-04.
  - Fields: legal entity EDRPOU code, name, property type and registered address; `division_name`, `division_type` ("Аптека" or "Аптечний пункт"), phone, oblast, hromada, settlement, address, KOATUU code, `lng`, `lat`, the programmes served.
  - Person names: sole-proprietor pharmacies carry the owner's name.
  - Rows: 17,611 unique pharmacy sites (15,796 pharmacies, 1,815 pharmacy points) run by 2,313 legal entities. Coverage of the front-line oblasts is thin: Donetsk 59, Kherson 68. Luhansk and Crimea are absent.
  - **VERIFIED.**
- **MOZ: licence register for medical practice** (Ліцензійний реєстр МОЗ з медичної практики).
  - Publisher: Міністерство охорони здоров'я України.
  - Page: https://moz.gov.ua/uk/licenzijnij-reyestr
  - File: https://moz.gov.ua/storage/uploads/b96a20f8-fff3-49f7-b9b9-c1d021ddde10/%D0%9B%D0%A0-11.11.2026.xlsx ("Актуальний перелік на 11 Листопада 2026").
  - Licence: conflicting.
    - The page says the file is published "на виконання Закону України «Про доступ до публічної інформації» та постанови Кабінету Міністрів України від 21.10.2015 № 835". That makes it statutory open data, which may be freely reused with attribution under Art. 10-1 of that law. The law text could not be fetched: zakon.rada.gov.ua served a bot check.
    - The site footer says "Всі матеріали на цьому сайті розміщені на умовах ліцензії Creative Commons Attribution-NonCommercial-NoDerivatives 4.0 International". NoDerivatives is a problem for building pages from the data.
    - According to Open Data Watchdog (wd.clarity-project.info, secondary), the dataset has been off data.gov.ua since about 2024-01-05.
  - Format and frequency: XLSX, 22 MB, updated roughly monthly (2026-10-02, then 2026-11-11).
  - Fields: licensee name, ownership form, EDRPOU code (masked for individuals), oblast, raion, postcode, address, decision, decision dates, licence validity, branch number, branch name and address, list of works (specialties), date of liquidation.
  - Person names: sole-proprietor licensees appear by full name, with their registered (often home) address, down to the flat number.
  - Rows: 136,361. These are decisions multiplied by branches, historical rows included. No coordinates.
  - **VERIFIED** (header and first rows opened).
- **State Service on Medicines and Drugs Control (Держлікслужба): pharmacy licence register.**
  - Only 9 datasets of this publisher are listed on data.gov.ua today. The only licensing one covers narcotics licensees (https://data.gov.ua/dataset/78786206-1186-4993-9d7e-ce7deedbdb6a, CC BY).
  - The retail pharmacy licence register is not there.
  - **UNVERIFIED** whether it was withdrawn under martial law. The NHSU pharmacy file above covers most retail pharmacies in any case.
- **Blocking and context.**
  - Martial law has been in force since 24 February 2022 and is still extended.
  - Under CMU Resolution No. 263 of 12 March 2022 (in force, version of 22 May 2026, per its zakon.rada.gov.ua record), ministries and agencies that hold open data may "частково та/або повністю припинити" access to published datasets. On that basis the data.gov.ua portal was suspended in 2022. It was later restored, and the Ministry of Digital Transformation withdrew data for the occupied and front-line oblasts. Some registers (the EDR among others) stayed closed.
  - The NHSU health datasets are live and updated weekly as of November 2026, so they are not currently restricted. Some could be closed again at short notice.
  - Publishing hospital coordinates in an active war is a sensitivity to weigh, even though the NHSU publishes them itself.
  - The Law on Advertising, Art. 21, restricts the advertising of medicines and treatment methods. A neutral free directory is not advertising (our reading, **UNVERIFIED**).
  - No decision of the data protection authority (the Parliament Commissioner for Human Rights) against directories was found (not searched in depth).
  - Sole-proprietor rows are personal data.

## Serbia (rs)

**Verdict: PARTIAL.** The portal licence is clean. Every dataset on data.gov.rs carries the Serbian Open Data Licence (`sodl`, SODL 1.0), whose terms are set by Art. 26 of the Law on Electronic Government. But no national dataset of health institutions with addresses is on the portal.

- The one national list, the Republic Health Insurance Fund (RFZO) list of private pharmacies, is hosted on rfzo.rs, which refused connections from here.
- The Ministry of Health list (zdravlje.gov.rs) returned 403.
- The public network exists only as a decree, with names and no addresses.

- **RFZO: private pharmacies and their branches under contract with the fund.**
  - Publisher: Републички фонд за здравствено осигурање.
  - Dataset: https://data.gov.rs/sr/datasets/spisak-privatnikh-apoteka-i-njikhovikh-ogranaka-sa-kojima-je-rfzo-sklopio-ugovore/
  - File: https://www.rfzo.rs/download/dzu/privapo/apo1-1.xlsx
  - Licence: `sodl`, "Српска лиценца за отворене податке". The portal publishes no text of its own. The terms come from the Law on Electronic Government (Sl. glasnik RS 27/2018), Art. 26: "Slobodna licenca omogućava slobodnu ponovnu upotrebu, u komercijalne ili nekomercijalne svrhe, koja uključuje umnožavanje, distribuciju … prilagođavanje i povezivanje sa drugim podacima". It requires citing "naziv organa …, datum preuzimanja, adresu … kao i jasnu oznaku svih izmena". This was read through paragraf.rs and a search summary, and the law text itself was not fetched. SODL_1_0 was added to the EU licence vocabulary on 2026-06-17 (hub.data.gov.rs).
  - Format and frequency: XLSX, "irregular". Metadata date 2026-10-20.
  - Fields (from the description): row number, RFZO branch, pharmacy name, branch details.
  - Rows: unknown.
  - **UNVERIFIED**: rfzo.rs gave "Empty reply from server" on every request.
- **City of Zrenjanin: health institutions and pharmacies.**
  - Dataset: https://data.gov.rs/sr/datasets/zdravstvene-ustanove-i-apoteke/
  - File: https://data.gov.rs/s/resources/zdravstvene-ustanove-i-apoteke/20220211-174243/zrenjanin-zdravstveneustanove-tac.csv (there is also a GeoJSON).
  - Licence: `sodl`. Frequency: irregular.
  - Fields: WKT point, name, address, phone, website, layer (state or private pharmacy, state or private institution, dental, ophthalmology, gynaecology).
  - Rows: 67 (one city only).
  - **VERIFIED.**
- **Decree on the Plan of the Network of Health Institutions** (Уредба о Плану мреже здравствених установа).
  - Publisher: Government of Serbia.
  - Text: https://pravno-informacioni-sistem.rs/SlGlasnikPortal/eli/rep/sgrs/vlada/uredba/2020/11/7 (Sl. glasnik 5/2020, last amended by 73/2026).
  - Licence: regulations are excluded from copyright under the Serbian copyright law, Art. 6 (from memory, **UNVERIFIED**).
  - Content: public institutions only, with names, seats and capacities. No street addresses or coordinates.
  - **UNVERIFIED** (not downloaded).
- **The Batut institute and the Ministry of Health.**
  - The Batut institute has only 4 datasets on data.gov.rs (diabetes, equipment, ICD-10). None is a list of institutions.
  - https://www.zdravlje.gov.rs/tekst/333549/zdravstvene-ustanove.php returned HTTP 403. **UNVERIFIED.**
- **Blocking.** The Law on Health Care restricts health institutions' advertising of health services (**UNVERIFIED**, not read). No decision of the data protection commissioner against directories was found (not searched in depth). There is no sanctions issue.

## Bosnia and Herzegovina (ba)

**Verdict: NOT POSSIBLE** from open data today. Health is run by the two entities (and the cantons in the Federation), plus Brčko District. No machine-readable list of facilities with a reuse licence was found.

- **BiH open data portal (IDDEEA).** https://odp.iddeea.gov.ba/ is a JavaScript application, and no health dataset could be seen. **UNVERIFIED** negative.
- **ASKVA register of certified health institutions (Republika Srpska).**
  - File: https://www.askva.org/fileadmin/Sertifikacija/Planovi_i_registri/ASKVA_registar_sertfikovanih_ZU_oktobar_2024.pdf
  - Format: PDF.
  - Fields: name, unit, address, decision number and date.
  - Coverage: certified institutions only.
  - Licence: none found. **UNVERIFIED.**
- **Pharmacy register of Republika Srpska (2014).**
  - Publisher: Ministry of Health and Social Protection of Republika Srpska.
  - File: https://www.vladars.net/sr-SP-Cyrl/Vlada/Ministarstva/MZSZ/PAO/Documents/Registar%20apoteka%20Republike%20Srpske%20-%20revidiran%2001.09.2014.%20godine.pdf
  - Format: PDF, from 2014.
  - Fields: address, phone, director, and pharmacists with their licence numbers (person names).
  - Licence: none found. **UNVERIFIED.**
- **Federation of BiH.** The federal and cantonal ministries keep pharmacy registers under the Law on Pharmacy Activity (fbihvlada.gov.ba). No published dataset was found. **UNVERIFIED.**
- **Blocking.** The fragmented competences mean at least three or four sources would need licences. No open licence was found anywhere. No decision of the data protection agency (AZLP) was checked.

## Albania (al)

**Verdict: NOT POSSIBLE** today.

- The Mandatory Health Insurance Fund (FSDKSH) lists about 72 contracted pharmacies by name only, under "©2019 Fondi i Sigurimit të Detyrueshëm të Kujdesit Shëndetësor", with no licence statement.
- No list of hospitals or health institutions was found.
- opendata.gov.al renders in JavaScript, and nothing could be searched there.
- Law 33/2022 "Për të dhënat e hapura dhe ripërdorimin e informacionit të sektorit publik" could in principle ground a reuse request. Its terms were not read.

- **FSDKSH contracted pharmacies.**
  - Page: https://fsdksh.gov.al/farmacite/
  - Format: HTML.
  - Fields: name and a link to a page per pharmacy. No address on the list page.
  - Rows: about 72.
  - Licence: only "©2019 FSDKSH".
  - **UNVERIFIED** (page read in a browser-style fetch, nothing downloaded).
- **Open data portal.** https://opendata.gov.al/ (portal shell only, the API returned nothing). **UNVERIFIED** negative.
- **Blocking.** No reuse licence. The law is the only route (a request under Law 33/2022). The DPA (IDP) was not checked.

## Moldova (md)

**Verdict: PARTIAL.**

- **Pharmacies are usable.** The Medicines and Medical Devices Agency (AMDM) publishes its full pharmacy licensing register, 1,873 units with activity addresses, as a JSON feed behind an "Export Excel" button. The AMDM site footer says its materials are under CC BY-SA 4.0, but the register sits on a separate host with no licence statement, so the licence needs a written confirmation.
- **The rest is thin.** The National Health Insurance Company (CNAM) list of contracted providers on the national portal gives names only (2024), with no address and "License Not Specified". The portal's About page grants a general reuse right.
- **Not covered:** Transnistria.

- **AMDM: licensing register of pharmaceutical activity** (Registrul de Licențiere al Activității Farmaceutice).
  - Publisher: Agenția Medicamentului și Dispozitivelor Medicale.
  - Page: https://registru.licentiere.amdm.synology.me/ (linked from amdm.gov.md).
  - Data: https://registru.licentiere.amdm.synology.me/api/data (the public JSON feed behind the page's "Export Excel" button, no login).
  - Licence: amdm.gov.md footer: "Toate materialele de pe acest site sunt disponibile sub licența" CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/deed.ro), next to "© Toate drepturile rezervate 2026 AMDM". It was read at https://amdm.gov.md/ro/page/farmacii_subventionate. The register host itself states no licence. CC BY-SA would also impose share-alike on the derived data.
  - Format and frequency: JSON or Excel, live.
  - Fields: legal form, licence holder name, legal address, IDNO, licence series and number, validity date, enterprise type (community pharmacy, branch, hospital pharmacy, warehouse "DF"), municipality or raion, locality, sector, street, block. No coordinates.
  - Person names: holder names of 43 sole proprietorships (Întreprinderea Individuală).
  - Rows: 1,873 units (1,872 with a licence still valid), from 256 holders. 248 are public medical institutions (IMSP).
  - **VERIFIED.**
- **CNAM: medical institutions contracted by CNAM** (Instituțiile medico-sanitare contractate de către CNAM).
  - Publisher: Compania Națională de Asigurări în Medicină.
  - Dataset: https://dataset.gov.md/ro/dataset/4692-institutiile-medico-sanitare-contractate-de-catre-cnam
  - File: https://dataset.gov.md/dataset/6a284a2f-37b4-4996-8f68-f66e19fc2fd9/resource/34920c77-3d99-446d-9489-f0729fb36cd6/download/lista-psm-contractati_cnam-2024.xlsx
  - Licence: `notspecified`. The About page (https://dataset.gov.md/about) says "Orice persoană fizică sau juridică poate reutiliza documentul … în conformitate cu Condiţiile de accesare şi reutilizare a informaţiilor din sectorul public". It allows copying, publishing, adapting and commercial use. The underlying law is Law 305/2012, apparently replaced by Law 109/2025 on open data (**UNVERIFIED**).
  - Format and frequency: XLSX. Last update 2024-04-11.
  - Fields: number, provider name, type of care, territory (one sheet). No address.
  - Rows: about 430.
  - **VERIFIED.**
- **Ministry of Health lists.** It published accredited public and private institutions in 2014 (`10419-…`, `10422-…`). They are stale. **UNVERIFIED.**
- **Blocking.** Transnistria is outside government control. No DPA (NCPDP) decision against directories was checked. The CC BY-SA share-alike would apply.

## North Macedonia (mk)

**Verdict: PARTIAL.** The licensing is the best in this group: CC0 on every relevant dataset. The Ministry of Health's register of every institution in the national e-health system covers hospitals, health centres, private practices, labs and pharmacies, with addresses. But the newest file is from September 2019, and the pharmacy register is from February 2021, even though the catalogue records were touched in October 2026. A launch needs fresher data, which means a request to the ministry or its e-health system (the mojtermin.mk map is the source system).

- **Register of institutions in the national e-health system** (Регистар на установи во Националниот систем за електронски евиденции во здравството).
  - Publisher: Министерство за здравство.
  - Dataset: https://data.gov.mk/dataset/12b1928c-00e2-4291-870a-b4a0d143a13d
  - File: https://data.gov.mk/dataset/12b1928c-00e2-4291-870a-b4a0d143a13d/resource/34c39e35-5e1c-48a7-895b-8a0106d32e56/download/-.xlsx (2019; a 2018 CSV also exists).
  - Licence: `cc-zero` "Creative Commons CCZero", on the CKAN record (API `package_show`).
  - Format and frequency: XLSX. Stated as QUARTERLY, but the last file is from 2019-09-20.
  - Fields: id, full and short name, institution kind, type (general medicine, dentistry, pharmacies, gynaecology, specialist, labs, university clinics), municipality, settlement, Health Insurance Fund (ФЗОМ) network flag, address, email, phone, flags (active, immunisation, laboratory level), EDB tax number, ФЗОМ code. No coordinates.
  - Person names: 663 private health institutions (ПЗУ) carry a doctor's name in their own name, the doctor's title and full name after the institution form.
  - Encoding: the strings are double-encoded UTF-8 and need repairing.
  - Rows: 5,098 (3,757 active). By type: 1,518 general medicine, 1,349 pharmacies, 1,275 dentistry.
  - **VERIFIED.**
- **Register of pharmacies** (Регистар на аптеки во РМ).
  - Publisher: Агенција за лекови и медицински средства (MALMED).
  - Dataset: https://data.gov.mk/dataset/d84c31d9-e749-4b17-9faf-a5b4db3e7a70
  - Files:
    - inside the ФЗОМ network: https://data.gov.mk/dataset/d84c31d9-e749-4b17-9faf-a5b4db3e7a70/resource/ba8d56d3-4690-4a5a-bb8c-bd618fc8cff8/download/registar-na-apteki-vnatre-vo-mreza-na-fzo-11.02.2021.csv
    - outside the network: https://data.gov.mk/dataset/d84c31d9-e749-4b17-9faf-a5b4db3e7a70/resource/5738d81f-b248-4832-9997-89bb93eec11a/download/registar-na-apteki-nadvor-od-mreza-na-fzo-11.02.2021.csv
  - Licence: `cc-zero`.
  - Format and frequency: CSV (UTF-16), stated as yearly. Last file 2021-02-12.
  - Fields: name, address, municipality, company registration number, tax number, ФЗОМ code, in-network flag. No coordinates.
  - Rows: 837 in the network and 333 outside, 1,170 in all (some marked "затворена", closed).
  - Live source: https://lekovi.zdravstvo.gov.mk/pharmacies
  - **VERIFIED.**
- **Register of doctors, pharmacists and other health workers** (`lekari.csv`, 2018 and 2019, CC0). These are practitioners, not facilities, so they are noted only. https://data.gov.mk/dataset/ce6cb7b1-c09f-49f8-b69b-d149bd9c2018 **UNVERIFIED** (not opened).
- **Blocking.** The data is stale, and its current accuracy is unknown. The Law on Health Care restricts the advertising of health services (**UNVERIFIED**). No decision of the data protection agency (АЗЛП) was checked. Doctors' names inside the names of private institutions are personal data.

## Kosovo (xk)

**Verdict: NOT POSSIBLE.**

- The pharmacy agency (AKPPM) publishes PDF lists of licensed pharmacies: pharmacy, licence number, renewal date, responsible pharmacist (a person name), with no address. The newest found is from 2022-06-10, and none carries a licence.
- opendata.rks-gov.net timed out on every request.

- **AKPPM licensed pharmacies.**
  - File: https://akppm.rks-gov.net/CMS/Medias/LISTAT%20E%20BARNATOREVE%2010.06.2022.pdf
  - Format: PDF.
  - Rows: about 860 to 870 (secondary sources: 873 in November 2022, 857 in August 2024).
  - Licence: none found. **UNVERIFIED.**
- **Ministry of Health private institutions.** About 1,000 are licensed (Radio Free Europe, secondary). No list was found. **UNVERIFIED.**
- **Blocking.** There is no open licence. The open data portal was unreachable. Recognition and sanctions are not an issue for data reuse.

## Montenegro (me)

**Verdict: NOT POSSIBLE** today.

- The Health Insurance Fund (FZOCG) and the Ministry of Health publish lists: contracted private pharmacies by municipality (list of 2026-06-20) and contracted private institutions with addresses. No reuse licence was found on gov.me or fzocg.me.
- data.gov.me timed out on every request.
- The Law on Free Access to Information has reuse provisions that might ground a request (**UNVERIFIED**).

- **FZOCG contracts with private pharmacies.** Page: https://fzocg.me/ugovori-sa-privatnim-apotekama/ (format HTML and PDF). Licence: none found. **UNVERIFIED.**
- **Ministry of Health: private institutions under contract with the Fund.** Page: https://mzdravlja.gov.me/rubrike/pzu (format HTML). Fields: name, address, specialty. Licence: gov.me shows only "©Copyright 2026. Vlada Crne Gore". **UNVERIFIED.**
- **List of public health institutions.** File: https://wapi.gov.me/download/c6cc1e36-e041-4ffe-873e-3a52c02a6bad?version=1.0 (with directors' names). **UNVERIFIED.**
- **Blocking.** There is no licence, and the open data portal was unreachable.
