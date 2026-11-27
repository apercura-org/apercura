# Latvia: data we could not import yet

Latvia's directory (`/lv`) is built from three lists the national open data portal (data.gov.lv)
publishes under CC0 1.0, the National Health Service's quarterly list of GPs and their
practices, the Ministry of the Interior's Information Centre's addresses of medical institutions
and the State Agency of Medicines' register of pharmacies, placed in the State Land Service's
address register (CC BY 4.0) ([`docs/data-import.md`](../data-import.md#latvia)). A page is a GP
practice (naming its GPs), a hospital or a pharmacy. This file lists every other candidate found
on 27 November 2026, why it is not imported, and whom to ask, so that requests can be sent.

The search covered data.gov.lv (every dataset of the NVD, the State Agency of Medicines, the
Health Inspectorate, the Centre for Disease Prevention and Control, the Emergency Medical Service,
the Central Statistical Bureau and the State Land Service), the NVD's and the Health
Inspectorate's websites and likumi.lv.

## Imported

| Dataset                                                                                                                                                 | Publisher                                                                                  | Licence                                                                                                                                                                                        | Credit printed                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| [Ģimenes ārsta praksē reģistrēto pacientu skaits](https://data.gov.lv/dati/lv/dataset/gimenes-arsta-prakse-registreto-pacientu-skaits), quarter 2026_03 | Nacionālais veselības dienests                                                             | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)                                                                                                                                  | `Avots: Nacionālais veselības dienests, data.gov.lv (CC0 1.0)`                                                                |
| [VKCP IĢIS – ārstniecības iestāžu adreses](https://data.gov.lv/dati/lv/dataset/vkcp-igis-arstniecibas-iestazu-adreses), resource of 7 March 2024        | Iekšlietu ministrijas Informācijas centrs (data kept by the State Fire and Rescue Service) | CC0 1.0                                                                                                                                                                                        | `Avots: Iekšlietu ministrijas Informācijas centrs, data.gov.lv (CC0 1.0)`                                                     |
| [Farmaceitiskās darbības uzņēmumu reģistrs](https://data.gov.lv/dati/lv/dataset/farmaceitiskas-darbibas-uznemumu-registrs), daily export                | Zāļu valsts aģentūra                                                                       | CC0 1.0                                                                                                                                                                                        | `Avots: Zāļu valsts aģentūra, data.gov.lv (CC0 1.0)`                                                                          |
| [Valsts adrešu reģistra atvērtie dati](https://data.gov.lv/dati/lv/dataset/varis-atvertie-dati) (municipalities, towns, parishes, centroids)            | Valsts zemes dienests                                                                      | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/); [VZD's terms](https://www.vzd.gov.lv/lv/par-datu-izmantosanas-noteikumiem): name the source, link the licence, say what was changed | `Izmantoti Valsts adrešu reģistra informācijas sistēmas dati (Valsts zemes dienests, CC BY 4.0), apvienoti ar citiem avotiem` |

Columns that are in the files but never stored: the GP's identifier and the patient counts by
age group (NVD); the pharmacy's manager, responsible person, e-mail, owner's company number,
owner's address, web address and conditions (State Agency of Medicines).

## Not imported, and why

| Candidate                                                                                                                                                                                       | What it would add                                                             | Why not now                                                                                                                                                                                     | Whom to ask                                                                                                                                        |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| The addresses of the other GP practices (804 of the 1,098 institutions of March 2026, with 876 GPs)                                                                                             | Three quarters of Latvia's GP practices                                       | Not in the Ministry of the Interior's list, whose only resource dates from March 2024 and holds 404 lines of GP practices (353 institutions); the NVD's quarterly dataset has no address column | The NVD (add the practice's address, and its phone, to the CC0 dataset); the Ministry of the Interior's Information Centre (refresh the VKCP list) |
| [Ģimenes ārsti atbilstoši teritorijām](https://www.vmnvd.gov.lv/lv/gimenes-arsti-atbilstosi-teritorijam), the NVD's lists of GPs by territory (XLSX, updated 5 November 2026)                   | Every practice's address, phone, territory and hours                          | The NVD's website says "publicētā satura visas tiesības aizsargātas": no reuse licence                                                                                                          | The NVD, to publish these lists on data.gov.lv under CC0 like its other datasets                                                                   |
| [Līgumiestāžu saraksts](https://www.vmnvd.gov.lv/lv/ligumiestazu-saraksts-profesionaliem), the NVD's lists of contracted institutions (dentistry, reimbursed medicines, pharmacies, psychiatry) | Contracted outpatient and dental institutions                                 | Same website terms: all rights reserved                                                                                                                                                         | The NVD, as above                                                                                                                                  |
| [Ārstniecības iestāžu reģistrs](https://registri.vi.gov.lv/), the Health Inspectorate's register of medical institutions                                                                        | Every institution, outpatient clinics and dentists included, with addresses   | A lookup only, "visas tiesības aizsargātas"; no bulk download                                                                                                                                   | Veselības inspekcija, for an open-data publication of the register (without the persons' data)                                                     |
| [Ārstniecības personu reģistrs](https://registri.vi.gov.lv/rap), the register of medical practitioners                                                                                          | Specialists and dentists                                                      | A lookup only, all rights reserved; it names people, so it would need its own assessment                                                                                                        | Veselības inspekcija                                                                                                                               |
| NVD's datasets of visits by institution (`ambulatoro-pakalpojumu-dati…`, `zobarstniecibas-pakalpojumu-dati…`, `kompensejamo-medikamentu…aptieku-griezuma`)                                      | Institution codes and names of outpatient and dental providers and pharmacies | Statistics without addresses: a page could not be placed                                                                                                                                        | —                                                                                                                                                  |
| Phones of GP practices and hospitals                                                                                                                                                            | A number to call                                                              | Neither the NVD's dataset nor the Ministry's list gives one                                                                                                                                     | The NVD (in the dataset above)                                                                                                                     |

## How to ask

Data held by a public body is accessed and reused under the Freedom of Information Law
(Informācijas atklātības likums), which transposes the Open Data Directive (EU) 2019/1024; a
request is answered within 15 working days (section 12, UNVERIFIED on the day: read the current
text on likumi.lv before sending). Latvia's open data policy publishes public bodies' datasets on
data.gov.lv, most of them under CC0 1.0, as the NVD already does.

Suggested request, to the NVD (its e-address on latvija.gov.lv, or the e-mail its contact page gives on the day):

> Temats: Lūgums papildināt atvērto datu kopu ar ģimenes ārstu prakšu adresēm
>
> Labdien!
>
> Apercura (apercura.org) ir bezmaksas, atvērtā pirmkoda veselības aprūpes iestāžu katalogs.
> Latvijā tas publicē ģimenes ārstu prakses no Nacionālā veselības dienesta atvērto datu kopas
> “Ģimenes ārsta praksē reģistrēto pacientu skaits” (CC0 1.0), ar avota norādi, bez vērtējumiem
> un bez reklāmas; jebkuru lapu var labot vai dzēst.
>
> Šobrīd varam parādīt tikai tās prakses, kuru adrese ir Iekšlietu ministrijas Informācijas
> centra datu kopā (2024. gada dati), t.i., aptuveni ceturto daļu. Lūdzam papildināt Jūsu datu
> kopu ar katras prakses darbības vietas adresi un tālruni (bez pacientu skaita, ja tas
> nepieciešams), vai publicēt vietnē data.gov.lv sarakstus “Ģimenes ārsti atbilstoši
> teritorijām” ar CC0 1.0 licenci, tāpat kā Jūsu citas datu kopas.
>
> Labprāt atbildēsim uz jautājumiem.
>
> Ar cieņu,

Record every answer in the Latvia section of [ADR 0002](../adr/0002-multi-country.md#latvia-lv)
and here.
