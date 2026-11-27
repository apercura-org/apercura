# Switzerland: what is imported, what is not, and whom to ask

> Prepared 2026-11-27 for issue #154. Not legal advice: every licence below was read on
> opendata.swiss (the `rights` of each distribution) and on the publisher's own terms that day.

Switzerland opened (`/ch`, `/ch-fr`, `/ch-it`) with facilities only: the hospital and clinic sites
of the Federal Office of Public Health's figures and the cantons' open lists of hospitals, nursing
homes and pharmacies ([data import](../data-import.md#switzerland),
[ADR 0002](../adr/0002-multi-country.md#switzerland-ch)). No health professional is listed. The
requests for the registers of people, prepared before the opening, still stand:
[`ch-medreg.md`](ch-medreg.md) (FOPH), [`ch-fmh.md`](ch-fmh.md) (FMH) and
[`ch-refdata.md`](ch-refdata.md) (Refdata).

## Imported

| List                                                                                   | Publisher                                         | Terms                                                                      | Credit printed                                                                                                                            |
| -------------------------------------------------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Kennzahlen der Schweizer Spitäler 2023 (`kzp23_data.xlsx`)                             | Bundesamt für Gesundheit (BAG)                    | Open use. Must provide the source.                                         | `Quelle: © Bundesamt für Gesundheit (BAG), Kennzahlen der Schweizer Spitäler 2023` (and its French and Italian wording)                   |
| Spitäler und Kliniken (web feature service, `SPITAL_SPITKLIN_VW_8200`)                 | Gesundheitsamt des Kantons Bern                   | Open use; the canton's terms: free use, the source is mandatory            | `Spitäler und Kliniken © Gesundheitsamt des Kantons Bern`                                                                                 |
| Standorte der Leistungserbringung in den Bereichen Alter und Behinderung (homes layer) | Amt für Integration und Soziales des Kantons Bern | as above                                                                   | `Standorte der Leistungserbringung in den Bereichen Alter und Behinderung © Amt für Integration und Soziales des Kantons Bern`            |
| DAS_HOPITAUX_CLINIQUES, DAS_EMS, GEO_SANTE_VACCINATION_PHARM                           | République et canton de Genève (SITG)             | Open use; SITG's conditions (19 May 2026), level A, commercial use allowed | `Source : Portail des données SITG (État de Genève), téléchargé en date du {date} ; données compilées par Apercura`                       |
| Apotheken (10320), Alters- und Pflegeheime (10310)                                     | Kanton Basel-Landschaft, Amt für Gesundheit       | Open use. Must provide the source.                                         | `Quelle: Kanton Basel-Landschaft, Amt für Gesundheit (data.bl.ch)`                                                                        |
| Spitäler (SPTL), Alters- und Pflegeheime (APFH)                                        | Kanton Basel-Stadt                                | Open use. Must provide the source. (CC BY 4.0 on geo.bs.ch)                | `Quelle: Kanton Basel-Stadt (geo.bs.ch), CC BY 4.0`                                                                                       |
| Alters- und Pflegeheime Kanton Zürich (`KTZH_00003102_00006486.csv`)                   | Kanton Zürich, Gesundheitsdirektion               | Open use                                                                   | `Quelle: Kanton Zürich, Gesundheitsdirektion, Alters- und Pflegeheime Kanton Zürich`                                                      |
| Institutions de soins et de santé (SSA_19_04)                                          | République et Canton du Jura                      | Open use. Must provide the source. (level A)                               | `© Géodonnées de la République et Canton du Jura`                                                                                         |
| Amtliches Gemeindeverzeichnis; Amtliches Ortschaftenverzeichnis mit PLZ                | Bundesamt für Statistik; swisstopo                | Open use; swisstopo's free geodata terms (with the source)                 | `Quelle: BFS – Amtliches Gemeindeverzeichnis der Schweiz`, `© swisstopo, Amtliches Ortschaftenverzeichnis mit Postleitzahl und Perimeter` |

Fields never read into a row: e-mail addresses (Bern's homes, Basel-Landschaft's homes, Jura's
institutions: some name a person), the responsible pharmacist's surname and first name of
Basel-Landschaft's pharmacies, the editor's user name of Jura's file, websites, and the FOPH's
figures (costs, staff, cases). A care-of or attention marker in a name (`c/o …`, `a.c.a. sig. …`)
and what follows it are dropped (7 names of the 2023 figures).

## Not imported, and why

| Candidate                                                                                                                         | What it would add                                          | Why not now                                                                                                                 | Whom to ask, for what                                                                                                                                |
| --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Kennzahlen der Schweizer Spitäler 2024                                                                                            | The 2024 sites (openings, closures, renamings)             | Its distributions on opendata.swiss read "Open use. Use for commercial purposes requires permission of the data owner."     | The FOPH, Sektion Datenmanagement und Statistik (KUV-DMS@bag.admin.ch): permission for a free public directory, or the 2023 terms for later editions |
| MedReg, PsyReg, GesReg (bulk data)                                                                                                | Every doctor, dentist, pharmacist, psychotherapist…        | Consulted one by one; bulk access needs an agreement with the FOPH (RegV MedBG art. 11), per-person data                    | [`ch-medreg.md`](ch-medreg.md)                                                                                                                       |
| Refdata GLN partner data                                                                                                          | GLNs of practices and practitioners                        | Not open data; consent of each partner                                                                                      | [`ch-refdata.md`](ch-refdata.md)                                                                                                                     |
| doctorfmh.ch                                                                                                                      | Named doctors with their specialty                         | The FMH's terms; per-person data                                                                                            | [`ch-fmh.md`](ch-fmh.md)                                                                                                                             |
| OpenStreetMap                                                                                                                     | Pharmacies and practices of every canton                   | ODbL (share-alike) and of uneven provenance: never a source of facilities or points                                         | Nobody                                                                                                                                               |
| Geneva's full list of pharmacies                                                                                                  | Every pharmacy of Geneva (only those that vaccinate today) | Not published as open data (SITG lists the vaccinating ones)                                                                | The canton's pharmacist (Service du pharmacien cantonal): publication of the licensed pharmacies on SITG                                             |
| Pharmacies and nursing homes of the other 20 cantons                                                                              | The two kinds everywhere                                   | No canton-wide open list found on opendata.swiss on 27 November 2026 (Vaud, Fribourg, Ticino, Valais, Lucerne, St. Gallen…) | Each canton's pharmacist and social or health department: publication on opendata.swiss with "Open use"                                              |
| Stadt Zürich's lists of hospitals and private homes                                                                               | Departments of the city's hospitals, private homes         | Departments, not sites, and a contact e-mail per row; the canton's list already holds the homes                             | Nobody for now                                                                                                                                       |
| Bern's day centres (`ILV_STOALTER_VW_7972`), Basel-Stadt's day centres, Jura's psychiatric outpatient centres and sheltered flats | Day care and outpatient psychiatry                         | Not a kind of facility the market lists                                                                                     | Nobody: a decision of the project                                                                                                                    |

## How to ask

The FOPH is a federal office: the Federal Act on Data Protection and the Freedom of Information Act
(BGÖ) govern access to its documents, but no Swiss law gives a right to re-use a federal dataset
under other terms than those it is published under. A request is a plain permission request. Write
to the contact the dataset names (Office fédéral de la santé publique, section gestion de données et
statistique, KUV-DMS@bag.admin.ch, read on 27 November 2026):

> Betreff: Kennzahlen der Schweizer Spitäler 2024 – Nutzung für ein kostenloses Verzeichnis
>
> Sehr geehrte Damen und Herren
>
> Apercura (apercura.org) ist ein kostenloses, quelloffenes Verzeichnis von Gesundheits-
> einrichtungen ohne Werbung und ohne Bewertungen. Für die Schweiz veröffentlicht es die
> Standorte der Spitäler und Kliniken aus den «Kennzahlen der Schweizer Spitäler 2023» mit
> Quellenangabe (Name, Adresse, Spitaltyp, Aktivitätstyp), keine Kennzahlen und keine Personen.
>
> Die Ausgabe 2024 ist auf opendata.swiss mit «Kommerzielle Nutzung nur mit Bewilligung des
> Datenlieferanten» gekennzeichnet. Wir bitten Sie um die Bewilligung, die Standortangaben der
> Ausgabe 2024 und der folgenden Ausgaben unter denselben Bedingungen wie die Ausgabe 2023 zu
> verwenden, oder um die Bedingungen einer solchen Bewilligung.
>
> Freundliche Grüsse

Record every answer in the Switzerland section of
[ADR 0002](../adr/0002-multi-country.md#switzerland-ch) and here.
