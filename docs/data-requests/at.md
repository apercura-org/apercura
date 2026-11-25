# Austria: practitioner data we could not import yet

Austria's directory (`/at`) is built from every official list whose licence allows it
([`docs/data-import.md`](../data-import.md#austria)): Vienna, Styria and Salzburg, about 10,400
doctors and dentists. This file lists every other candidate found on 25 November 2026, why it is
not imported, and whom to ask, so that re-use requests can be sent.

The search covered data.gv.at (which harvests the open-data portals of every Land and city), the
nine Länder portals, the Ärztekammern and the social insurance. Searches on data.gv.at: Ärzte,
Ärztinnen, Arzt, Ordination, Kassenarzt, Vertragsärzte, Vertragspartner, Allgemeinmedizin,
Fachärzte, Primärversorgung, Hausarzt, Zahnärzte, Gesundheitseinrichtungen, niedergelassene,
Ärztekammer, Ambulatorien, Wahlärzte.

## Imported

| Dataset                                                                                                         | Publisher                                            | Licence   | Attribution                                                       |
| --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | --------- | ----------------------------------------------------------------- |
| [Ärzte Standorte Wien](https://www.data.gv.at/katalog/dataset/fdcaabe5-0efd-4701-8fd9-49935c0d9cff)             | Stadt Wien (data from the Ärztekammer für Wien)      | CC BY 4.0 | `Datenquelle: Stadt Wien – data.wien.gv.at`                       |
| [Niedergelassene Ärzte Steiermark](https://www.data.gv.at/katalog/dataset/b0a8ca10-3968-11e2-81c1-0800200c9a66) | Land Steiermark                                      | CC BY 4.0 | `Datenquelle: CC-BY-4.0: Land Steiermark - data.steiermark.gv.at` |
| [Ärzte Land Salzburg](https://www.data.gv.at/katalog/dataset/8bd69af0-d42a-4777-beb6-1e8e87145a23)              | Land Salzburg (list of the Ärztekammer für Salzburg) | CC BY 4.0 | `Datenquelle: Land Salzburg – data.salzburg.gv.at`                |
| [Zahnärzte Land Salzburg](https://www.data.gv.at/katalog/dataset/90dd469f-9c41-49c4-aa86-cdf02ebaa1e0)          | Land Salzburg (list of the Zahnärztekammer)          | CC BY 4.0 | `Datenquelle: Land Salzburg – data.salzburg.gv.at`                |

## Not imported, and why

| Candidate                                                                                                                                                                                                                        | What it is                                                              | Obstacle                                                                                                                                                                               | Whom to ask                                                                                                                                                                                                                                              |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Österreichische Ärzteliste ([aerzteliste-online.at](https://www.aerzteliste-online.at/))                                                                                                                                         | The national list of every doctor (ÄrzteG § 27), public part by law     | Lookup website only, no bulk file and no reuse licence; automated extraction would ignore the site's terms                                                                             | Österreichische Ärztekammer, [aerztekammer.at](https://www.aerztekammer.at/)                                                                                                                                                                             |
| Arztsuche of the Ärztekammern of Niederösterreich, Oberösterreich, Tirol, Vorarlberg, Kärnten, Burgenland                                                                                                                        | Each chamber's doctor search (its Land's part of the Ärzteliste)        | Lookup websites only, no licence                                                                                                                                                       | [arztnoe.at](https://www.arztnoe.at/), [aekooe.at](https://www.aekooe.at/), [aektirol.at](https://www.aektirol.at/), [arztinvorarlberg.at](https://www.arztinvorarlberg.at/), [aekktn.at](https://www.aekktn.at/), [aekbgld.at](https://www.aekbgld.at/) |
| ÖGK Vertragspartnersuche                                                                                                                                                                                                         | Doctors with a contract with the Österreichische Gesundheitskasse       | Lookup website only, no licence                                                                                                                                                        | Österreichische Gesundheitskasse, [gesundheitskasse.at](https://www.gesundheitskasse.at/)                                                                                                                                                                |
| Zahnärztinnensuche                                                                                                                                                                                                               | The dentists' national search                                           | Lookup website only, no licence                                                                                                                                                        | Österreichische Zahnärztekammer, [zahnaerztekammer.at](https://www.zahnaerztekammer.at/)                                                                                                                                                                 |
| Gesundheitsberuferegister                                                                                                                                                                                                        | Nursing and allied health professions                                   | Lookup website only; other professions than the ones the market lists                                                                                                                  | Gesundheit Österreich GmbH, [goeg.at](https://goeg.at/)                                                                                                                                                                                                  |
| [Niedergelassene ÄrztInnen (Linz)](https://www.data.gv.at/katalog/dataset/7ea79ffe-64a9-42ec-a82c-608a2c2e6f54)                                                                                                                  | Stadt Linz, yearly CSV (2005–2025) and PDF, CC BY 4.0                   | Counts per specialty only (men, women, with or without a contract): no names or addresses                                                                                              | Stadt Linz, Stadtforschung, `bst@mag.linz.at` (dataset contact)                                                                                                                                                                                          |
| [Ärzte Engerwitzdorf](https://www.data.gv.at/katalog/dataset/a6011b0d-eeb8-40c4-9f5c-c226dfbff09a)                                                                                                                               | 12 doctors of one Gemeinde (Upper Austria), CSV, CC BY 4.0              | Last updated 11 January 2022: publishing four-year-old addresses would break the accuracy principle (GDPR art. 5(1)(d)); too small to justify a source module                          | Gemeinde Engerwitzdorf, `gemeinde@engerwitzdorf.gv.at` (dataset contact): ask for a current file                                                                                                                                                         |
| [Sachverständige Ärzte für Führerscheinuntersuchungen im Burgenland](https://www.data.gv.at/katalog/dataset/38c9526f-be35-4cfb-869f-eae33c6716bd)                                                                                | 91 doctors approved for driving-licence examinations, CSV, CC BY 4.0    | Published for another purpose (finding an examiner), with no specialty and no sign that the address is a practice open to patients: a directory page would say more than the list does | Land Burgenland, Abteilung 8; the Ärztekammer für Burgenland for a real list                                                                                                                                                                             |
| [Liste der ermächtigten Ärztinnen und Ärzte in Österreich](https://www.data.gv.at/katalog/dataset/25dbdd12-8096-4674-b69a-a90300bcad4e)                                                                                          | Doctors authorised for occupational-health examinations, XML, CC BY 4.0 | The distribution (`www1.arbeitsinspektion.gv.at/xml-trees/xml_aerzte.php`) now redirects to the labour inspectorate's home page: nothing to download                                   | Arbeitsinspektion (BMASGPK, Abteilung VIII/A/4): ask for the file back                                                                                                                                                                                   |
| [Primärversorgung Standorte Wien](https://www.data.gv.at/katalog/dataset/32a796c7-ef87-4240-9e5d-5684e23c7fde), [Primärversorgungseinrichtungen OÖ](https://www.data.gv.at/katalog/dataset/ae713281-871e-4653-84e6-133f726c05cf) | Primary care units (PVE), CC BY 4.0                                     | Places, not people: they could name the practice of doctors already listed (a later enrichment), they list nobody                                                                      | -                                                                                                                                                                                                                                                        |
| Selbständige Ambulatorien Land Salzburg, Ambulatorien Linz                                                                                                                                                                       | Outpatient clinics, CC BY 4.0                                           | Places, not people (same as above)                                                                                                                                                     | -                                                                                                                                                                                                                                                        |

Niederösterreich, Oberösterreich, Tirol, Vorarlberg, Kärnten and Burgenland publish no doctors
list on their portals (all harvested by data.gv.at). Their doctors can still claim a page.

## How to ask

Public bodies and bodies governed by public law, the Ärztekammern among them, may be asked to
make documents they hold available for re-use: the Open Data Directive (EU) 2019/1024, in Austria
the [Informationsweiterverwendungsgesetz 2022](https://www.ris.bka.gv.at/NormDokument.wxe?Abfrage=Bundesnormen&Gesetzesnummer=20011973&Paragraf=1)
(IWG 2022) for federal matters, and the Länder's own re-use laws for theirs. The public part of
the Ärzteliste is published by law (ÄrzteG § 27), so the request is about the form (one file,
regularly updated) and the licence (CC BY 4.0, as Vienna, Styria and Salzburg already do with
their parts), not about new data. A body may refuse where data protection restricts access; the
request should say what Apercura publishes and how objections are handled.

Suggested request (German), to send to each chamber and to the ÖGK:

> Betreff: Antrag auf Weiterverwendung der öffentlichen Ärzteliste (IWG 2022)
>
> Sehr geehrte Damen und Herren,
>
> Apercura (apercura.org) ist ein kostenloses, quelloffenes Verzeichnis von Ärztinnen und Ärzten.
> In Wien, der Steiermark und Salzburg veröffentlichen wir bereits die Listen, die diese Länder
> unter CC BY 4.0 als Open Government Data bereitstellen, mit Quellenangabe, einem
> Widerspruchsrecht nach Art. 21 DSGVO auf jeder Seite und ohne Bewertungen.
>
> Wir ersuchen Sie, den öffentlichen Teil der Ärzteliste nach § 27 ÄrzteG 1998 für Ihr
> Bundesland (Name, akademische Grade, Fach, Ordinationsadresse, Kassenverträge) als Datei in
> einem maschinenlesbaren Format (CSV oder JSON), regelmäßig aktualisiert, unter einer offenen
> Lizenz (CC BY 4.0) zur Weiterverwendung bereitzustellen, nach dem
> Informationsweiterverwendungsgesetz 2022 bzw. der Richtlinie (EU) 2019/1024.
>
> Gerne erläutern wir Ihnen unsere Verarbeitung (Interessenabwägung, Datenschutzerklärung,
> Löschung auf Wunsch).
>
> Mit freundlichen Grüßen

Record every answer in the Austria section of [ADR 0002](../adr/0002-multi-country.md#austria-at)
and here.
