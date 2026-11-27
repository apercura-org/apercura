# Sweden: what is imported, what is not, and whom to ask

> Prepared 2026-11-27 for issue #175. Not legal advice: every licence below was read in the
> publisher's own metadata catalogue (DCAT records of catalog.lakemedelsverket.se and
> vgregion.entryscape.net, harvested by dataportal.se) or on the publisher's page that day, and the
> laws on riksdagen.se. Have a native speaker proofread the Swedish letter before sending.

Sweden opened (`/se`) with facilities only: every licensed community pharmacy (öppenvårdsapotek) of
the Swedish Medical Products Agency's register, and the health centres (vårdcentraler) of Västra
Götaland, the only region found to publish them under an open licence
([data import](../data-import.md#sweden), [ADR 0002](../adr/0002-multi-country.md#sweden-se)). No
person is listed: the licence holders are companies, and a holder whose organisation number is a
person's identity number (a sole trader) is never printed.

## Imported

| Dataset                                                             | Publisher                      | Licence (as published)                                                                         | Credit printed                                                               |
| ------------------------------------------------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Apotek med tillstånd (the search page's export to Excel, no filter) | Läkemedelsverket               | CC BY 4.0 (distribution `resource/37` of dataset `resource/36` in the agency's DCAT catalogue) | `Apotek med tillstånd: © Läkemedelsverket, CC BY 4.0; bearbetat av Apercura` |
| Vårdcentraler i Vårdval vårdcentral (CSV, SWEREF 99 TM points)      | Västra Götalandsregionen       | CC0 1.0 (distributions `resource/48`, `50`, `54` of dataset `resource/46`)                     | `Vårdcentraler: Västra Götalandsregionen, CC0 1.0`                           |
| Digitala gränser: län och kommuner (ArcView shape, SWEREF 99 TM)    | Statistiska centralbyrån (SCB) | CC0 1.0 (the page: "Vi använder licensen CC0 för dessa data")                                  | `Län och kommuner: Källa: SCB, CC0 1.0` (SCB's suggested "Källa: SCB")       |

CC BY 4.0 § 3(a) asks for the creator's name, a copyright notice, the licence and a link to it, a
link to the material where practicable, and a note that it was modified: Läkemedelsverket gives no
wording of its own, so every pharmacy page and the data page (`/se/data`) print the credit above
with "bearbetat av Apercura" (closed pharmacies are left out, several GLNs read as one, holders who
are persons dropped). CC0 asks for nothing; the region and SCB are credited anyway. Each run reads
the two lists' licences from the catalogues again, and a list whose licence changed is left out.

Pages are factual. The Marketing Act (marknadsföringslagen, 2008:486, verified on riksdagen.se: 3 §
marketing is "reklam och andra åtgärder i näringsverksamhet som är ägnade att främja avsättningen
av och tillgången till produkter", 5 § good marketing practice, 10 § no misleading statements)
applies to traders who market products, and the
Medicinal Products Act (läkemedelslagen, 2015:315, ch. 12, 1 § and 2 §, verified on riksdagen.se)
bans marketing prescription medicines to the public and asks that any marketing of medicines be
"aktuell, saklig och balanserad". A pharmacy page names no medicine, prints no offer or price and
ranks nothing; no paid placement exists. The Swedish Medical Association's rules (factual, correct
and dignified, no claim of greater skill) bind doctors, not a directory; health centre pages print
only the region's facts. No rule specific to health directories was found (UNVERIFIED negative).

## Not imported

| Data                                                                             | Where                                                 | Licence                                     | Why not, and what it would take                                                                                                                                                                                                                                                                                |
| -------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pharmacies "stängt för allmänheten" (closed to the public) of the same register  | Läkemedelsverket                                      | CC BY 4.0                                   | Licensed, but a patient cannot walk in (dose-dispensing and care-home pharmacies): left out and counted.                                                                                                                                                                                                       |
| Retail outlets of non-prescription medicines (the dataset's second distribution) | Läkemedelsverket                                      | CC BY 4.0                                   | Shops and petrol stations, not health facilities.                                                                                                                                                                                                                                                              |
| Pharmacies' street-address points                                                | Lantmäteriet, Belägenhetsadress Nedladdning           | CC BY 4.0 with special terms, via Geotorget | Ordering needs a Geotorget account and accepting Lantmäteriet's terms for address data; until then a pharmacy is located at its municipality's point (city precision, no map pin). A founder action (ROADMAP.md).                                                                                              |
| Health centres of the other twenty regions                                       | Each region (1177's directory, HSA)                   | none open                                   | Not published under an open licence. Region Blekinge's catalogue on dataportal.se lists health centres, dental clinics and hospitals under CC BY 4.0, but its portal (oppnadata.regionblekinge.se) did not resolve on 27 November 2026 and its hospital file is dated 2022. The letter below asks each region. |
| Hospitals, dental clinics, specialist clinics, care homes                        | IVO's register of care providers (vårdgivarregistret) | not open data                               | Released only on request as public documents, case by case and for a fee; it names sole traders. A request would give a copy, not a licence to republish; not planned.                                                                                                                                         |
| The national directory of care units behind 1177 (HSA, Inera)                    | Inera                                                 | not open data                               | Access by agreement for connected care providers only.                                                                                                                                                                                                                                                         |
| Licensed health professionals (HOSP)                                             | Socialstyrelsen                                       | not public                                  | Named persons; extracts go to employers by e-mail. A public search proposed in SOU 2021:39 was not found enacted (UNVERIFIED).                                                                                                                                                                                 |
| Vårdbetyg's open dataset of health centres (CC BY 4.0)                           | vardbetyg.se (a private site)                         | CC BY 4.0                                   | No addresses, and its scores come from the national patient survey, whose own terms were not checked: not a source of facilities.                                                                                                                                                                              |
| Kolada's organisational units (vårdcentraler, care homes)                        | RKA (api.kolada.se)                                   | open                                        | A title and a municipality only, no address: not enough for a page.                                                                                                                                                                                                                                            |
| Interfaces in Finnish, Meänkieli, Sámi and English for Sweden                    | -                                                     | -                                           | Follow-ups (ROADMAP.md).                                                                                                                                                                                                                                                                                       |

## How to ask

Send the letter below to each of the twenty regions other than Västra Götaland (registrator or the
open data contact on its site), from the publisher's address (`{{CONTACT_EMAIL}}`), once the legal
entity exists ([README](README.md#how-to-send)). It asks the region to publish the list of health
centres of its primary care choice scheme (vårdval) as open data, as Västra Götalandsregionen does
under CC0 1.0, or to send it as a public document (allmän handling) with a statement that it may be
re-used. A region's list of the providers it contracts with is a public document (tryckfrihetsförordningen,
2 ch.), and the Open Data Act (lag 2022:818 om den offentliga sektorns tillhandahållande av data)
sets the conditions of its re-use, though it does not oblige a region to publish. **The opening
does not wait for the answers**: a region's list joins the import (`packages/etl/src/sources/se`)
once it is open. ROADMAP.md lists sending it as a founder action.

### Brev (svenska)

**Ämne: Begäran om vårdcentralerna i vårdvalet som öppna data**

Hej,

{{PUBLISHER_NAME}} driver Apercura (apercura.org), en kostnadsfri och reklamfri vårdkatalog med
öppen källkod. På `apercura.org/se` listar vi i dag alla apotek med tillstånd från
Läkemedelsverket (CC BY 4.0) och vårdcentralerna i Västra Götalandsregionens vårdval, som regionen
publicerar som öppna data under CC0 1.0.

Vi vill gärna lista vårdcentralerna i er region på samma sätt. Vi ber därför att regionen

1. publicerar förteckningen över de vårdcentraler (hälsocentraler) som ingår i regionens vårdval
   som öppna data, med en öppen licens (CC0 1.0 eller CC BY 4.0), eller
2. lämnar ut förteckningen som allmän handling (tryckfrihetsförordningen 2 kap.) i ett
   maskinläsbart format, och meddelar om och på vilka villkor den får vidareutnyttjas enligt lag
   (2022:818) om den offentliga sektorns tillhandahållande av data.

Vi behöver bara uppgifter om enheterna: namn, HSA-id, vårdgivare (bolag eller regionens egen
verksamhet), besöksadress, postnummer, postort och gärna koordinater. Vi behöver inga uppgifter om
enskilda personer, och vi publicerar inga sådana.

Tack på förhand.

Med vänliga hälsningar\
{{PUBLICATION_DIRECTOR}}\
{{PUBLISHER_NAME}}, {{PUBLISHER_ADDRESS}}\
{{CONTACT_EMAIL}}
