# Italy: data we could not import yet

Italy's directory (`/it`) is built from the open data of the Ministry of Health (Ministero della
Salute), published on dati.salute.gov.it under the Italian Open Data Licence v2.0
([`docs/data-import.md`](../data-import.md#italy)): the pharmacies open to the public with their
branches and dispensaries, the parapharmacies, and the hospitals and accredited private clinics of
the yearly hospital bed counts, placed in ISTAT's regions, provinces and municipalities (CC BY 4.0)
at their municipality's point. A page is a place, under its own name; no health worker is listed.
This file lists every other candidate found on 26 November 2026, why it is not imported, and whom
to ask, so that requests can be sent. The request for the register of doctors and dentists (the
FNOMCeO's Albo unico) is [`it-fnomceo.md`](it-fnomceo.md).

The search covered the ministry's portal (dati.salute.gov.it), the national catalogue
(dati.gov.it), ISTAT's boundaries and legal notes, and the FNOMCeO's Albo unico.

## Imported

| Dataset                                                                                                                                                                                         | Publisher              | Licence                                                      | Attribution                                                                                                                                     |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| [Farmacie](https://www.dati.salute.gov.it/it/dataset/farmacie/) (daily CSV, `FRM_FARMA_5_<YYYYMMDD>.csv`)                                                                                       | Ministero della Salute | [IODL 2.0](https://www.dati.gov.it/iodl/2.0/)                | `Fonte: Ministero della Salute, Farmacie, IODL 2.0, aggiornato al {date}`                                                                       |
| [Parafarmacie](https://www.dati.salute.gov.it/it/dataset/parafarmacie/) (daily CSV, `FRM_PFARMA_7_<YYYYMMDD>.csv`)                                                                              | Ministero della Salute | IODL 2.0                                                     | `Fonte: Ministero della Salute, Parafarmacie, IODL 2.0, aggiornato al {date}`                                                                   |
| [Posti letto per struttura ospedaliera 2023](https://www.dati.salute.gov.it/it/dataset/posti-letto-struttura-ospedaliera-2023/) (yearly CSV)                                                    | Ministero della Salute | IODL 2.0                                                     | `Fonte: Ministero della Salute, Posti letto per struttura ospedaliera, IODL 2.0, aggiornato al {date}`                                          |
| [Confini delle unità amministrative a fini statistici al 1° gennaio 2026](https://www.istat.it/notizia/confini-delle-unita-amministrative-a-fini-statistici-al-1-gennaio-2018-2/) (generalized) | Istat                  | CC BY 4.0 ([legal notes](https://www.istat.it/note-legali/)) | `Fonte: Istat, Confini delle unità amministrative a fini statistici al 1° gennaio 2026, CC BY 4.0 (centroidi dei comuni calcolati da Apercura)` |

The date is that of the file the last Italian import read (its `Last-Modified`), else the day of
that import. Columns of the shop lists that are never read into a row: the owner's VAT number
(`p_iva`, `partita_iva`), which for a sole trader identifies the person, and the local health
unit's pharmacy code (`cod_farmacia_asl`). The published company name, which often names the
pharmacists, is not stored: a page keeps the place's own name. The lists' coordinates are read
but, by default, not stored (below).

## Not imported, and why

| Candidate                                                                                                                                                                                                           | What it would add                                             | Why not now                                                                                                                                                                                                                        | Whom to ask, for what                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [FNOMCeO, Albo unico nazionale](https://albounico.fnomceo.it/)                                                                                                                                                      | Named doctors and dentists, their specialties and Ordine      | Commercial reuse forbidden by its terms; per-person data                                                                                                                                                                           | FNOMCeO: [`it-fnomceo.md`](it-fnomceo.md)                                                                                                                                                       |
| Regional open lists of family doctors and paediatricians (MMG, PLS), e.g. [Milan's and Campania's on dati.gov.it](https://www.dati.gov.it/opendata/api/3/action/package_show?id=sanita-medici-di-medicina-generale) | Named GPs and paediatricians with their practice address      | Personal data; licences vary from region to region (CC BY 4.0, CC BY-SA 3.0 IT) and some lists are stale; not imported by choice                                                                                                   | Nobody for now: a decision of the project, after a legitimate-interest assessment per list                                                                                                      |
| Coordinates of the pharmacies and parapharmacies without OpenStreetMap                                                                                                                                              | A map pin and exact distances for about 26,000 places         | The ministry says "Alcune coordinate geografiche pubblicate sono state reperite tramite © OpenStreetMap contributors" without saying which; OpenStreetMap is ODbL, share-alike. Places are at their municipality's point meanwhile | The ministry, the expert named on each dataset's page: which coordinates come from OpenStreetMap (a column per line), or a statement that the published coordinates are reusable under IODL 2.0 |
| Phone numbers of the pharmacies                                                                                                                                                                                     | A number to call                                              | Not in the ministry's lists; the regional pharmacy registers and Federfarma's "farmacie di turno" are not open data                                                                                                                | The regions' pharmaceutical services; Federfarma, for a licence                                                                                                                                 |
| "Strutture di ricovero pubbliche e equiparate" and "Case di cura accreditate" (2022, on dati.salute.gov.it)                                                                                                         | Staff counts per hospital and accredited clinic               | Older than the bed counts (2023) and not needed for a page; not read for this opening                                                                                                                                              | Nobody: the same portal and licence                                                                                                                                                             |
| ["Consultori familiari"](https://www.dati.salute.gov.it/it/dataset/consultori-familiari/) (2019)                                                                                                                    | Family counselling centres, with phone and website            | A kind of place of its own, with data of 2019; a later step                                                                                                                                                                        | The expert named on the dataset's page: whether a newer edition is planned                                                                                                                      |
| ["Strutture e attività ASL"](https://www.dati.salute.gov.it/it/dataset/strutture-e-attivita-asl/)                                                                                                                   | The facilities and activities of the local health units (ASL) | Counts per local health unit rather than places with an address; not read in detail                                                                                                                                                | Nobody: the same portal and licence                                                                                                                                                             |
| The outpatient facilities of the national health service (model STS.11: clinics, laboratories, outpatient centres)                                                                                                  | Every outpatient facility of the SSN with its address         | Not found as open data on dati.salute.gov.it or dati.gov.it                                                                                                                                                                        | The ministry's Direzione generale della digitalizzazione, del sistema informativo sanitario e della statistica: whether the STS.11 facility list can be published under IODL 2.0                |

## How to ask

The Ministry of Health is a public administration: its data may be requested for reuse under
D.Lgs. 36/2006, as amended by D.Lgs. 200/2021, which transposes the Open Data Directive (EU)
2019/1024, and accessed under D.Lgs. 33/2013, article 5(2) (generalised civic access). Both give
30 days to answer (UNVERIFIED on the day for this request: the deadlines were read for
[`it-fnomceo.md`](it-fnomceo.md); read the consolidated texts on normattiva.it before sending).

The portal names no general open-data address: its notes say that each dataset page gives the
e-mail address of the ministry official to write to for requests and questions about the data
("Contatta gli esperti", read on 26 November 2026), and technical problems with downloads go to its
help desk. Write to the expert of each dataset concerned (Farmacie and Parafarmacie for the
coordinates).

Suggested request, about the coordinates' provenance (adapt for the STS.11 facilities):

> Oggetto: Dataset "Farmacie" e "Parafarmacie": provenienza e riutilizzo delle coordinate
> geografiche
>
> Gentili Signore e Signori,
>
> Apercura (apercura.org) è un elenco gratuito e open source di strutture sanitarie. In Italia
> pubblica le farmacie, le parafarmacie e le strutture ospedaliere dei dataset del Ministero della
> Salute (licenza IODL 2.0), citando la fonte e la data di aggiornamento, senza recensioni né
> pubblicità, e su ogni pagina offre la possibilità di chiederne la rimozione.
>
> Le pagine dei dataset "Farmacie" e "Parafarmacie" indicano che "alcune coordinate geografiche
> pubblicate sono state reperite tramite © OpenStreetMap contributors". Poiché i dati di
> OpenStreetMap sono distribuiti con licenza ODbL, che impone di condividerli allo stesso modo, oggi
> collochiamo ogni struttura nel centro del suo comune. Vi chiediamo di indicarci quali coordinate
> provengono da OpenStreetMap (per esempio con un campo per ogni riga), oppure di confermarci che le
> coordinate pubblicate possono essere riutilizzate alle sole condizioni della IODL 2.0.
>
> Restiamo a disposizione per ogni chiarimento.
>
> Distinti saluti

Record every answer in the Italy section of [ADR 0002](../adr/0002-multi-country.md#italy-it) and
here.
