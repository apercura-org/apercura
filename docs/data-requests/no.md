# Norway: what is imported, what is not, and whom to ask

> Prepared 2026-11-27 for issue #172. Not legal advice: every licence below was read on the
> publisher's own page, its API documentation or Geonorge's metadata catalogue that day, and the
> laws on Lovdata. Have a native speaker proofread the Norwegian letter before sending.

Norway opened (`/no`) with establishments of care only: the establishments (underenheter) of the
Brønnøysund Register Centre's Central Coordinating Register for Legal Entities registered under a
health or pharmacy industry code, kept when they read as a place of care
([data import](../data-import.md#norway), [ADR 0002](../adr/0002-multi-country.md#norway-no)). No
person is listed: sole proprietorships, named after their owner, are left out, and so are
companies named after a doctor or dentist.

## Imported

| Dataset                                                              | Publisher             | Licence (as published)                                              | Credit printed                                                                                                                 |
| -------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Enhetsregisteret: underenheter and enheter (full files, gzipped CSV) | Brønnøysundregistrene | NLOD 2.0 (the API documentation and brreg.no's service description) | `Inneholder data under Norsk lisens for offentlige data (NLOD) tilgjengeliggjort av Brønnøysundregistrene; endret av Apercura` |
| Matrikkelen – Adresse (the national CSV, EPSG:4258)                  | Kartverket            | CC BY 4.0 (the Geonorge metadata record)                            | `Adresser: © Kartverket, CC BY 4.0`                                                                                            |
| Administrative inndelinger: fylker og kommuner (`kommuneinfo` API)   | Kartverket            | Open data; the municipalities' dataset CC BY 4.0                    | `Fylker og kommuner: © Kartverket, CC BY 4.0`                                                                                  |

NLOD 2.0 § 5 asks the licensee to name the licensor as the licensor specifies, else with the
licence's default sentence, to link to the licence and the source, and to say that the data was
changed: Brønnøysundregistrene specifies no wording, so every Norwegian page and the data page
(`/no/data`) print the default sentence with "endret av Apercura". NLOD § 3 does not cover personal
data without a lawful basis for its disclosure and further processing.

The Health Personnel Act (helsepersonelloven, § 13, verified on Lovdata) asks that "markedsføring
av helse- og omsorgstjenester skal være forsvarlig, nøktern og saklig", and its second paragraph
applies the same to an undertaking that provides health and care services: the pages print facts
from the registers (name, address, phone, registered industry, owner), no ratings, no promotion,
no paid ranking. The Ministry may set rules by regulation (third paragraph); none on directories
was found (UNVERIFIED negative).

## Not imported

| Data                                                                                          | Where                                       | Licence                                | Why not, and what it would take                                                                                                                                                                                                                                 |
| --------------------------------------------------------------------------------------------- | ------------------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sole proprietorships (enkeltpersonforetak) under the listed codes (15,474 in November 2026)   | Enhetsregisteret                            | NLOD 2.0                               | Named after their owner, a person: NLOD § 3 does not cover personal data without a lawful basis, and listing them needs a legitimate-interest assessment, the article 14 notice, opt-out and minimisation. Not planned for now.                                 |
| Companies named after a doctor or dentist (1,220)                                             | Enhetsregisteret                            | NLOD 2.0                               | The same: the name identifies a person.                                                                                                                                                                                                                         |
| Practices owned by a company without a care word in their name (2,471)                        | Enhetsregisteret                            | NLOD 2.0                               | Most are holding, consulting or locum companies, or a doctor's own company at a home address; a few are real clinics under a brand ("Dr.Dropin"). A licence register (HPR, Helsedirektoratet's lists) would tell them apart.                                    |
| Physiotherapy, psychologists, chiropractors, home nursing, health stations                    | Enhetsregisteret (86.950, 86.930, 86.941…)  | NLOD 2.0                               | Mostly sole proprietorships; a follow-up with the same filters (ROADMAP.md).                                                                                                                                                                                    |
| The pharmacies' licences ("Landets apotek", 1,070 rows, with the pharmacist's name)           | Direktoratet for medisinske produkter (DMP) | none stated on dmp.no                  | No licence, no street addresses, and the responsible pharmacist's name. The register's 47.730 establishments cover the same pharmacies. A licence would let the pages print each pharmacy's licence (see the letter below); the pharmacist would never be read. |
| The register of health personnel (HPR)                                                        | Helsedirektoratet, run by Norsk helsenett   | none; access through Maskinporten only | Named persons, and Helsedirektoratet refuses "videreformidling av HPR-data uten rettslig behandlingsgrunnlag".                                                                                                                                                  |
| The GP lists (fastlegeordningen) and Norsk helsenett's address register                       | Helsedirektoratet, Norsk helsenett          | not open data                          | Not published for reuse.                                                                                                                                                                                                                                        |
| Interfaces in Nynorsk and Northern Sámi, and the municipalities' Sámi, Kven and Finnish names | -                                           | -                                      | Follow-ups (ROADMAP.md).                                                                                                                                                                                                                                        |

## How to ask

Send the letter below to the Norwegian Medical Products Agency (Direktoratet for medisinske
produkter, DMP), at the contact address dmp.no gives for the pharmacy list ("Apotekoversikt"),
from the publisher's address (`{{CONTACT_EMAIL}}`), once the legal entity exists
([README](README.md#how-to-send)). It asks for a licence for the list "Landets apotek", NLOD 2.0
as the government's default for open data, and offers to read only the licence fields (never the
pharmacist's name). **The opening does not wait for the answer**: the pages list pharmacies from
the register of legal entities. ROADMAP.md lists sending it as a founder action.

### Brev (norsk bokmål)

**Emne: Lisens for viderebruk av «Landets apotek» (apotekoversikten)**

Til Direktoratet for medisinske produkter

{{PUBLISHER_NAME}} ({{PUBLISHER_ADDRESS}}) driver Apercura (apercura.org/no), en gratis,
ikke-kommersiell katalog med åpen kildekode (AGPL-3.0) over helsetjenester i Norge, uten reklame
og uten betalt rangering. Katalogen viser apotek, sykehus, legekontorer, tannklinikker og
sykehjem med navn, adresse og telefon, hentet fra Enhetsregisteret under Norsk lisens for
offentlige data (NLOD).

Direktoratet publiserer oversikten «Landets apotek» (regnearket `landets-apotek-1.xlsx` på
dmp.no). Vi fant ingen lisens for viderebruk på siden. Vi ber derfor om:

1. at direktoratet bekrefter hvilken lisens oversikten er tilgjengeliggjort under, og helst
   merker den med NLOD 2.0, som er regjeringens anbefalte lisens for åpne offentlige data; eller
2. tillatelse til å bruke feltene apotek-id, apotekets navn, postnummer, poststed, kommune,
   tillatelsestype, status og åpningsdato, med kreditering slik direktoratet ønsker.

Vi vil ikke lese eller publisere navnet på apoteker eller driftsansvarlig, og heller ikke
innehaverens navn når innehaveren er en person. Opplysningene brukes bare til å vise at et apotek
har tillatelse, på apotekets egen side.

Kontakt: {{CONTACT_EMAIL}}.

Med vennlig hilsen

{{PUBLICATION_DIRECTOR}}, for {{PUBLISHER_NAME}}

### Letter (English)

**Subject: A licence to re-use "Landets apotek" (the list of pharmacies)**

To the Norwegian Medical Products Agency (Direktoratet for medisinske produkter)

{{PUBLISHER_NAME}} ({{PUBLISHER_ADDRESS}}) runs Apercura (apercura.org/no), a free,
non-commercial, open-source (AGPL-3.0) directory of health services in Norway, without
advertising or paid ranking. It shows pharmacies, hospitals, GP offices, dental clinics and
nursing homes with their name, address and phone, taken from the Central Coordinating Register
for Legal Entities under the Norwegian Licence for Open Government Data (NLOD).

The Agency publishes the list "Landets apotek" (the spreadsheet `landets-apotek-1.xlsx` on
dmp.no). We found no licence for its re-use on the page. We therefore ask:

1. that the Agency confirm the licence the list is published under, ideally marking it NLOD 2.0,
   the government's recommended licence for open public data; or
2. permission to use the fields pharmacy id, name, postcode, post town, municipality, licence
   type, status and opening date, credited as the Agency wishes.

We will not read or publish the name of the pharmacist or the person responsible, nor the
holder's name when the holder is a person. The data would only show, on a pharmacy's own page,
that it holds a licence.

Contact: {{CONTACT_EMAIL}}.

Yours faithfully,

{{PUBLICATION_DIRECTOR}}, for {{PUBLISHER_NAME}}

## Sources (checked 2026-11-27)

- Enhetsregisteret API documentation ("License: Norsk lisens for offentlige data (NLOD)", the
  full files, the 10,000-result limit of the search):
  <https://data.brreg.no/enhetsregisteret/api/dokumentasjon/no/index.html>
- Brønnøysundregistrene, the service description ("Dataene i tjenesten er lisensiert med Norsk
  lisens for offentlige data (NLOD)"):
  <https://www.brreg.no/bruke-data-fra-bronnoysundregistrene/apne-data/beskrivelse-av-tjenesten-data-fra-enhetsregisteret/>
- NLOD 2.0 (§ 3 exemptions, § 5 attribution): <https://data.norge.no/nlod/no/2.0>,
  <https://data.norge.no/nlod/en/2.0>
- Matrikkelen – Adresse, metadata (CC BY 4.0):
  <https://kartkatalog.geonorge.no/metadata/matrikkelen-adresse/f7df7a18-b30f-4745-bd64-d0863812350c>
- Administrative enheter kommuner, metadata (CC BY 4.0):
  <https://kartkatalog.geonorge.no/metadata/administrative-enheter-kommuner/041f1e6e-bdbc-4091-b48f-8a5990f3cc5b>;
  the API: <https://ws.geonorge.no/kommuneinfo/v1/>
- DMP, Apotekoversikt: <https://www.dmp.no/tilvirkning-import-og-salg/apotekdrift/apotekoversikt>
- Helsepersonelloven § 13: <https://lovdata.no/dokument/NL/lov/1999-07-02-64>
- Ehandelsloven §§ 5 and 8: <https://lovdata.no/dokument/NL/lov/2003-05-23-35>
- Forskrift om universell utforming av IKT-løsninger §§ 4 and 4e:
  <https://lovdata.no/dokument/SF/forskrift/2013-06-21-732>
- Personopplysningsloven: <https://lovdata.no/dokument/NL/lov/2018-06-15-38>; Datatilsynet:
  <https://www.datatilsynet.no/>
