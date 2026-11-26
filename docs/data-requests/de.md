# Germany: data we could not import yet

Germany's directory (`/de`) is built from the directory of hospitals and of prevention and
rehabilitation clinics that the statistical offices of the Bund and the Länder publish every year
(Statistisches Bundesamt, "Verzeichnis der Krankenhäuser und Vorsorge- oder
Rehabilitationseinrichtungen"), and from the pharmacy lists of Thuringia and Brandenburg, placed in
the Länder, Kreise and Gemeinden of Destatis's municipalities' directory (GV-ISys)
([`docs/data-import.md`](../data-import.md#germany)). A page is a facility, under its name in the
source. This file lists every other candidate found on 26 November 2026, why it is not imported,
and whom to ask, so that requests can be sent. The requests for the registers of doctors are
[`de-kbv.md`](de-kbv.md) and [`de-aerztekammern.md`](de-aerztekammern.md).

The search covered Destatis and the statistical portal (statistikportal.de), GovData, the Länder's
geoportals and the GDI-DE catalogue, the BKG's open data, the G-BA's quality reports and the
Bundes-Klinik-Atlas.

## Imported

| Dataset                                                                                                                                                            | Publisher                                                       | Licence                                                                            | Attribution                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| [Verzeichnis der Krankenhäuser und Vorsorge- oder Rehabilitationseinrichtungen](https://www.statistikportal.de/de/veroeffentlichungen/krankenhausverzeichnis) 2024 | Statistisches Bundesamt (Destatis), for the statistical offices | "Vervielfältigung und Verbreitung, auch auszugsweise, mit Quellenangabe gestattet" | `© Statistisches Bundesamt (Destatis), 2026`                                                                              |
| [GV-ISys: alle politisch selbständigen Gemeinden](https://www.destatis.de/DE/Themen/Laender-Regionen/Regionales/Gemeindeverzeichnis/_inhalt.html), 31.12.2025      | Statistisches Bundesamt (Destatis)                              | The same note                                                                      | `© Statistisches Bundesamt (Destatis), 2026`                                                                              |
| [Apotheken in Thüringen](https://registry.gdi-de.org/id/de.th.csw/259ef2fc-1c82-40cc-99c6-f5b9b1d3dbeb)                                                            | Thüringer Landesamt für Verbraucherschutz, through the GDI-Th   | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/deed.de)                   | `© GDI-Th`                                                                                                                |
| [Standorte der Apotheken im Land Brandenburg](https://registry.gdi-de.org/id/de.bb.metadata/62474539-faa4-4d28-a7ab-74375cf826b4)                                  | LAVG Brandenburg, through the LGB                               | [dl-de/by-2-0](https://www.govdata.de/dl-de/by-2-0)                                | `© Landesamt für Arbeitsschutz, Verbraucherschutz und Gesundheit Brandenburg, dl-de/by-2-0 (Daten geändert)`, dataset URI |

Columns of the directory that are read but never stored: e-mail and web addresses, the operator's
name, the beds and the pseudonymous hospital id. Brandenburg's hospital pharmacies are left out.

## Not imported, and why

| Candidate                                                                                                                                    | What it would add                                                                   | Why not now                                                                                                                                                                                                        | Whom to ask                                                                                              |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| [Apotheken Saarland](https://registry.gdi-de.org/id/de.sl/0aa5051b-19fe-48e3-b5b9-588b0d821f4f) (WFS, 295 pharmacies, CC BY 4.0, `© GDI-SL`) | Saarland's pharmacies                                                               | Digitised by the Geodatenzentrum from the Apothekerkammer's website on 8 March 2021 and not updated since: pages would list pharmacies closed since; its ids are the GIS server's row numbers                      | Geodatenzentrum Saarland (MUKMAV, Referat E/6) for an update; the Apothekerkammer des Saarlandes         |
| The other Länder's pharmacies (about 16,000)                                                                                                 | Every public pharmacy                                                               | No open list found: the chambers' searches (and aponet.de) are not licensed for reuse; some cities publish theirs (Rostock, Kiel, Erkrath) but a city is not a Land, and several are OpenStreetMap extracts (ODbL) | Each Land's supervising authority (the Landesamt or ministry that licenses pharmacies), one request each |
| [Bundes-Klinik-Atlas](https://bundes-klinik-atlas.de) export                                                                                 | Each site's InEK site number (a stable id), coordinates, cases per treatment, staff | Its terms require the G-BA's and IQTIG's permission for reuse; the InEK site directory is not open either                                                                                                          | Bundesministerium für Gesundheit and the G-BA, for a reuse licence of the site list                      |
| G-BA quality reports (Qualitätsberichte der Krankenhäuser)                                                                                   | Departments, procedures and staff by site                                           | Reuse is limited to the purposes of the G-BA's rules (Regelungen zum Qualitätsbericht) and needs an application                                                                                                    | G-BA, Abteilung Qualitätssicherung                                                                       |
| KBV, 116117 Arztsuche; the chambers' doctor searches                                                                                         | Named doctors, their specialty and practice                                         | Per-person data; no reuse licence (ADR 0002, "Germany")                                                                                                                                                            | `de-kbv.md`, `de-aerztekammern.md`                                                                       |
| Postcode areas (PLZ polygons)                                                                                                                | Placing a site by postcode, a postcode search                                       | Deutsche Post's postcode areas are licensed; OpenStreetMap's are ODbL                                                                                                                                              | Nobody: GV-ISys gives the postcode of each Gemeinde's seat, which the places keep                        |
| Coordinates of each hospital site                                                                                                            | A map pin and exact distances                                                       | The directory publishes none; geocoding with the BKG's geocoder needs a licence for bulk use; Thuringia's and Brandenburg's pharmacies have theirs                                                                 | BKG (Dienstleistungszentrum) about the geocoder's terms                                                  |
| Emergency pharmacies (Notdienst) and opening hours                                                                                           | Which pharmacy is open tonight                                                      | Published by the chambers, not licensed for reuse                                                                                                                                                                  | The Landesapothekerkammern                                                                               |

## How to ask

Data held by a federal or Land body is reused under the Datennutzungsgesetz (DNG, 16 July 2021),
which transposes the Open Data Directive (EU) 2019/1024; its § 1(2) gives no right to have data
made available, only rules on the reuse of what is. Access may be requested under the
Informationsfreiheitsgesetz of the Bund (IFG, § 7: an answer within a month) or the Land's own law
where it has one (Saarland: SIFG; Thuringia: ThürTG; Brandenburg: AIG). UNVERIFIED on the day, like
the terms of the G-BA's quality reports and of the BKG's geocoder above: read the current texts on
gesetze-im-internet.de, the Land's legal portal or the publisher's page before sending.

Suggested request, to a Land's supervising authority for its list of pharmacies:

> Betreff: Bitte um Bereitstellung des Apothekenverzeichnisses als offene Daten
>
> Sehr geehrte Damen und Herren,
>
> Apercura (apercura.org) ist ein kostenloses, quelloffenes Verzeichnis von Gesundheits-
> einrichtungen. In Deutschland veröffentlicht es die Krankenhäuser und Vorsorge- oder
> Rehabilitationseinrichtungen aus dem Verzeichnis der Statistischen Ämter des Bundes und der
> Länder sowie die Apotheken der Länder, die ihr Verzeichnis als offene Daten bereitstellen
> (Thüringen, Brandenburg), mit Quellenangabe, ohne Bewertungen und ohne Werbung; jede Seite kann
> von der Einrichtung berichtigt oder entfernt werden.
>
> Wir bitten Sie, das Verzeichnis der öffentlichen Apotheken Ihres Landes (Name, Anschrift,
> Telefon, Haupt- oder Filialapotheke; ohne personenbezogene Angaben der Inhaberinnen und Inhaber)
> in einem offenen Format (CSV, GeoJSON) und mit regelmäßiger Aktualisierung unter der Datenlizenz
> Deutschland – Namensnennung – 2.0 oder CC BY 4.0 bereitzustellen, wie es Thüringen und
> Brandenburg tun.
>
> Für Rückfragen stehen wir gern zur Verfügung.
>
> Mit freundlichen Grüßen

Record every answer in the Germany section of [ADR 0002](../adr/0002-multi-country.md#germany-de)
and here.
