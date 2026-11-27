# Finland: what is imported, what is not, and whom to ask

> Prepared 2026-11-27 for issue #173. Not legal advice: every licence below was read on
> avoindata.suomi.fi (the dataset's `license_id`, through its CKAN API), on the publishers' own
> pages and on Finlex's open data that day. Have a native speaker write the Finnish version of the
> letter before sending.

Finland opened (`/fi`) with public health service locations only: the health centres, hospitals and
their units, emergency clinics, dental clinics, maternity and child health clinics, mental health
and substance abuse services, rehabilitation units, laboratories and imaging units that the
wellbeing services counties, the City of Helsinki, Åland, HUS and other public organisers describe
in the national Finnish Service Catalogue ([data import](../data-import.md#finland),
[ADR 0002](../adr/0002-multi-country.md#finland-fi)). No health professional, no community pharmacy
and no private clinic is listed.

## Imported

| Dataset                                                                                                                                                                         | Publisher                                                                      | Licence (as published)                                                                                                                                                                                           | Credit printed                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Suomi.fi-palvelutietovaranto (PTV), its open API version 11 (avoindata `palvelutietovaranto`)                                                                                   | Digi- ja väestötietovirasto (DVV); the content by the organisers describing it | CC0 1.0 (`license_id` `cc-zero-1.0`; "All PTV content is free to use via PTV Open API"; "Tietoja voi hakea PTV:n OUT-rajapinnan kautta ilman erillistä tunnistautumista tai käyttölupaa", kehittajille.suomi.fi) | `Lähde: Suomi.fi-palvelutietovaranto, Digi- ja väestötietovirasto (CC0 1.0)` |
| Kuntapohjaiset tilastointialueet: `kunta4500k_2026` (WFS) and the classification server's correspondence tables of municipalities to wellbeing services counties and to regions | Tilastokeskus (Statistics Finland)                                             | CC BY 4.0 (avoindata `kuntapohjaiset-tilastointialueet`; terms of use: "give at least Statistics Finland as the source")                                                                                         | `Lähde: Tilastokeskus, kuntapohjaiset tilastointialueet 2026`                |

CC0 asks for no credit: Apercura names the catalogue anyway. Fields never read into a row: the
locations' e-mail addresses, free-text descriptions and service hours (left out of the snapshot
when it is written), the organisations' business ids. A location is named as the catalogue names
it; the catalogue names no person on a location.

## Not imported, and why

| Candidate                                                                                                                                                  | What it would add                                                                                                           | Why not now                                                                                                                                                                                                                                                                            | Whom to ask, for what                                                                                                              |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Community pharmacies (Fimea)                                                                                                                               | Community pharmacies and their branches                                                                                     | Fimea's open data (CC BY 4.0) covers medicines only: the basic register of medicinal products, supply disruptions, interchangeable products, Lääke75+ and the risk medicine classification. Its pages of granted pharmacy licences are HTML without a licence and name the pharmacists | Fimea: publication of the pharmacies' list (name, address, opening hours, without the pharmacist) as open data under CC BY 4.0     |
| Private providers: THL's SOTE organisation register (koodistopalvelu.kanta.fi, OID 1.2.246.537.6.202), the providers' register of Lupa- ja valvontavirasto | About 14,887 health operating units, almost all private                                                                     | No licence or terms of use on the classification, its publication or the server; sole traders appear under their own names                                                                                                                                                             | THL: a licence for the SOTE organisation register ([How to ask](#how-to-ask)); then a legitimate-interest assessment for the names |
| JulkiTerhikki (Lupa- ja valvontavirasto)                                                                                                                   | Licensed health professionals                                                                                               | A search of one person at a time; the register is given out only on request or permit; its CC BY 4.0 open data is aggregate counts                                                                                                                                                     | Nobody for now: Finland lists places, not people                                                                                   |
| Service locations whose services carry no health class                                                                                                     | 127 of the 2,104 locations named as health centres, hospitals, dental clinics or neuvolas (some wards of Tyks, for example) | The import reads the services of the health care class `P5` and its subclasses; these locations link only services classified elsewhere                                                                                                                                                | Nobody: a later import may read every location and classify by name alone                                                          |
| Swedish names and an `sv-FI` interface (`/fi-sv`)                                                                                                          | Finland's other national language                                                                                           | PTV gives Swedish names for bilingual organisers, but a Swedish catalog, Swedish legal texts and search words are a follow-up of their own (ROADMAP.md)                                                                                                                                | Nobody                                                                                                                             |
| Service hours                                                                                                                                              | Opening hours of each location                                                                                              | In the API, left out of the opening's snapshot                                                                                                                                                                                                                                         | Nobody: a later improvement                                                                                                        |

## PTV version 12

The catalogue's version 12 search API is final in production since November 2026 and needs an API
key, ordered free of charge by the user organisation in PTV's self-service
(`palvelutietovaranto.suomi.fi/self-service`), with its contact details; versions 11 OUT and IN
are switched off in April 2027. Ordering the key (once the legal entity exists) and moving
`etl:fi` to version 12 before then is a founder action in ROADMAP.md. The data stays CC0.

## How to ask

Send the letter below to THL (Terveyden ja hyvinvoinnin laitos, the Finnish Institute for Health
and Welfare), which keeps the SOTE organisation register, by e-mail to its registry
(`kirjaamo@thl.fi`, UNVERIFIED: check on thl.fi the day it is sent), from the publisher's address
(`{{CONTACT_EMAIL}}`), once the legal entity exists ([README](README.md#how-to-send)). It asks
under the Open Data Directive (EU) 2019/1024 and the Finnish act on the openness of government
activities (621/1999) and the act on information management in public administration (906/2019)
(UNVERIFIED: not read this session) for a licence, not for data: the file is public. **The opening
does not wait for it**: the register is not imported until a licence is stated. ROADMAP.md lists
sending it as a founder action.

### Letter (English; send in Finnish)

**Subject: Licence for the re-use of the SOTE organisation register (OID 1.2.246.537.6.202)**

Terveyden ja hyvinvoinnin laitos, PL 30, 00271 Helsinki (UNVERIFIED)

Dear Sir or Madam,

{{PUBLISHER_NAME}}, {{PUBLISHER_ADDRESS}}, publishes Apercura (apercura.org/fi), a free,
non-profit and open-source (AGPL-3.0) directory of health service locations, without advertising,
ratings or paid ranking. In Finland it lists the public health service locations of the Finnish
Service Catalogue (CC0 1.0).

THL publishes the SOTE organisation register (SOTE-organisaatiorekisteri, OID
1.2.246.537.6.202) on the national code server, koodistopalvelu.kanta.fi, as a daily Excel file
that can be downloaded without logging in. We found no licence or terms of use for it on the
classification's page, its publication page or the server.

We ask you:

1. Under which licence or terms may the register be re-used and republished? A standard open
   licence (CC BY 4.0, as THL uses for other open data) would let us list the private health care
   units that the Finnish Service Catalogue does not describe.
2. If a licence covers it, which credit should a page print?
3. Some units of sole traders are named after the person. We would list units, not people, and
   would leave out or minimise those names; is there a field or rule that tells a person's name
   apart that you would recommend?

We would use only a unit's name, kind, address, municipality and public phone, never a personal
identity code, and would remove any unit on request.

Contact: {{CONTACT_EMAIL}}.

Yours faithfully,

{{PUBLICATION_DIRECTOR}}, for {{PUBLISHER_NAME}}

## Sources (checked 2026-11-27)

- PTV dataset: <https://avoindata.suomi.fi/data/fi/dataset/palvelutietovaranto> (CKAN
  `package_show?id=palvelutietovaranto`: `license_id` `cc-zero-1.0`).
- Using PTV data: <https://kehittajille.suomi.fi/palvelut/palvelutietovaranto/ptv-tietojen-hyodyntaminen-ja-integraatiot>.
- API key of version 12: <https://kehittajille.suomi.fi/palvelut/palvelutietovaranto/ptv-tietojen-hyodyntaminen-ja-integraatiot/tekninen-dokumentaatio-integraation-toteuttajalle-versio-12/api-avaimen-kayttoohje-ptv-rajapintaversio-12>.
- API and architecture reform (version 11 switched off in April 2027): <https://kehittajille.suomi.fi/services/servicecatalogue/api-and-architecture-reform>.
- Statistics Finland's statistical areas: <https://avoindata.suomi.fi/data/fi/dataset/kuntapohjaiset-tilastointialueet>; terms of use: <https://stat.fi/en/about-us/get-to-know-statistics-finland/legislation/terms-of-use>.
- Fimea's open data and licence: <https://fimea.fi/tietoa_fimeasta/avoin-data>.
- THL's SOTE organisation register: <https://koodistopalvelu.kanta.fi/codeserver/pages/classification-view-page.xhtml?classificationKey=421>.
