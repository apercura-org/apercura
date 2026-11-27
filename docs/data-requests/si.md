# Slovenia: what is imported, what is not, and whom to ask

> Prepared 2026-11-27 for issue #167. Not legal advice: every licence below was read on
> podatki.gov.si (the dataset's licence and conditions) and on the publisher's own pages that day.

Slovenia opened (`/si`) with doctors: the family doctors, children's and school doctors,
gynaecologists and dentists of the health insurer's daily lists of the doctors who can be chosen
as a personal doctor, with whether each still takes new patients
([data import](../data-import.md#slovenia), [ADR 0002](../adr/0002-multi-country.md#slovenia-si)).
No other specialist, no pharmacy and no hospital is listed.

## Imported

| List                                                                                                   | Publisher                                         | Terms                                                                         | Credit printed                                                                                                                  |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Poimenski seznami zdravnikov, ki so lahko osebni zdravniki: general practice, gynaecologists, dentists | Zavod za zdravstveno zavarovanje Slovenije (ZZZS) | Priznanje avtorstva (CC BY 4.0); "Ni omejitev (navedba vira)"; free of charge | `Vir: Zavod za zdravstveno zavarovanje Slovenije (ZZZS), Poimenski seznami zdravnikov, ki so lahko osebni zdravniki, CC BY 4.0` |
| Register prostorskih enot (regions, municipalities, settlements, postal areas, streets)                | Geodetska uprava Republike Slovenije (GURS)       | CC BY 4.0; GURS's terms: its name, the kind of data, the date of its state    | `Vir: Geodetska uprava Republike Slovenije, Register prostorskih enot, stanje {date}`                                           |

Read into a row: the ZZZS doctor number, the doctor's name, each practice's provider name, street,
postcode and post office, the ZZZS activity, and whether the doctor still takes new patients
(`DA`/`NE`) with the list's date. Never read: the ZZZS regional unit, the employment share, the
number of registered patients and the capitation figures, the trainee flag and the obligation to
accept newborns. The lists have no e-mail, phone, private address or gender.

## Not imported, and why

| Candidate                                                                              | What it would add                                | Why not now                                                                                                                                                                      | Whom to ask, for what                                                                 |
| -------------------------------------------------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| The Medical Chamber's register of doctors and dentists (Zdravniška zbornica Slovenije) | Every doctor and dentist, with their specialties | Its legal notice (`zdravniskazbornica.si/pravno-obvestilo`) forbids republication without permission                                                                             | The Chamber: permission to republish names, specialties and places of work            |
| ZZZS's monthly detailed lists of active doctors (partner.zzzs.si)                      | Doctors of other activities                      | CC BY 4.0 too, but built around patient counts per doctor, which a page does not need                                                                                            | Nobody for now                                                                        |
| ZZZS's fourth workbook (additional practices for adults without a personal doctor)     | Practices taking adults without a doctor         | Names no doctor                                                                                                                                                                  | Nobody: a decision of the project                                                     |
| Seznam izvajalcev lekarniške dejavnosti na primarni ravni (Ministry of Health)         | 355 pharmacies with names and addresses          | CC BY 4.0, XLSX, updated as needed (last on 1 June 2026); not in this opening: Slovenia's pages and URLs are doctors' (`/si/zdravnik/…`), a facility needs its own page handling | The Ministry of Health: how often the list is updated (a follow-up, licence verified) |
| An open register of providers (NIJZ, RIZDDZ)                                           | Every provider and practice                      | Not published on podatki.gov.si (searched on 27 November 2026)                                                                                                                   | NIJZ: publication of the register of providers as open data                           |
| Municipalities' own lists of practices                                                 | Local practices                                  | Uneven, local, of unclear terms; the ZZZS lists already cover the personal doctors                                                                                               | Nobody                                                                                |

## The download addresses

The open data catalogue's resource is an HTML page. That page (since moved to
`https://zavarovanec.zzzs.si/izbira-in-zamenjava-osebnega-zdravnika/seznami-zdravnikov/`) links
the four workbooks of the day at addresses that change with every publication: TYPO3 download links
with a `stdatoteke` id and a `cHash`. The site's `robots.txt` has `Disallow: /*cHash`, an SEO rule
against non-speaking URLs. The import fetches only what the catalogue points to: the page once,
then the three workbooks that name doctors, one after the other with a 2-second pause, with the
ETL's identifying user agent, once a week. ZZZS should still be asked for a stable address and
for its acknowledgement of the weekly download.

The lists give the provider's address (the seat named by `Ulica` and `Kraj`), which is not always
where the doctor sees patients (the ambulanta). The pages print it as the provider's address.

## How to ask

The requests are plain requests to the publisher: the lists are already under CC BY 4.0, so
nothing needs a re-use licence. Write to the contact the dataset names on podatki.gov.si (read it
on the day), in English, or in Slovenian once a native speaker has translated the letter:

> Subject: Poimenski seznami zdravnikov, ki so lahko osebni zdravniki – stable addresses of the
> files
>
> Dear Sir or Madam,
>
> Apercura (apercura.org) is a free, open source directory of health practitioners, without
> advertising or ratings. For Slovenia it publishes, with the credit your licence asks for, the
> family doctors, children's and school doctors, gynaecologists and dentists of the dataset
> "Poimenski seznami zdravnikov, ki so lahko osebni zdravniki" (CC BY 4.0 on podatki.gov.si): the
> doctor's name and number, the provider's name and address, the activity and whether the doctor
> still accepts insured persons, with the date of the list. It publishes no other field.
>
> The dataset's resource is the page of the lists, whose download links change with each
> publication and carry a cHash, which your robots.txt disallows. Our import reads the page and
> the three workbooks that name doctors once a week, one file at a time. We would be grateful if
> you could:
>
> 1. give a stable address for each of the four files, or publish them as resources of the
>    dataset on podatki.gov.si;
> 2. confirm that a weekly download of the files, as described, is acceptable to you;
> 3. confirm that the credit "Vir: Zavod za zdravstveno zavarovanje Slovenije (ZZZS), Poimenski
>    seznami zdravnikov, ki so lahko osebni zdravniki, CC BY 4.0" is the one you wish;
> 4. tell us whether the lists could also give the address of the practice (ambulanta) where it
>    differs from the provider's seat.
>
> Yours faithfully,

To the Medical Chamber (Zdravniška zbornica Slovenije), through the contact its site names, only
if specialists other than gynaecologists are ever wanted: permission to republish, from its
register of doctors and dentists, each one's name, specialty and place of work, with a credit and
the removal of any page on request. To the Ministry of Health: how often the list of pharmacies
is updated, before deciding on pharmacies. To NIJZ: whether the register of providers can be
published as open data.

Record every answer in the Slovenia section of
[ADR 0002](../adr/0002-multi-country.md#slovenia-si) and here.
