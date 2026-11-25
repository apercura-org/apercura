# United Kingdom: data we could not import yet

The UK's directory (`/gb`) is built from every NHS organisation list whose licence allows it
([`docs/data-import.md`](../data-import.md#united-kingdom)): GP practices (with their branch
surgeries), dental practices and pharmacies of England, Wales, Scotland and Northern Ireland,
about 31,000 practices, all under the Open Government Licence v3.0 (OGL). The OGL "does not
cover personal data", so the UK pages list practices, never clinicians. This file lists every
other candidate found on 25 November 2026, why it is not imported, and whom to ask, so that
requests can be sent.

The search covered ODS Data Search and Export (NHS England), opendata.nhs.scot (Public Health
Scotland, CKAN), OpenDataNI (CKAN), the OS Downloads API, the ONS Open Geography portal and
the regulators' registers (GMC, GDC, NMC).

## Imported

| Dataset                                                                                                                                                 | Publisher                              | Licence | Attribution                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ODS reports `epraccur`, `ebranchs`, `egdpprac`, `edispensary` ([ODS Data Search and Export](https://www.odsdatasearchandexport.nhs.uk/))                | NHS England, Organisation Data Service | OGL     | `Contains information from NHS England, Organisation Data Service, licensed under the Open Government Licence v3.0.`                                   |
| [GP Practice Contact Details and List Sizes](https://www.opendata.nhs.scot/dataset/gp-practice-contact-details-and-list-sizes)                          | Public Health Scotland                 | OGL     | `Contains public sector information from Public Health Scotland, licensed under the Open Government Licence v3.0.`                                     |
| [Dental Practices and Patient Registrations](https://www.opendata.nhs.scot/dataset/dental-practices-and-patient-registrations)                          | Public Health Scotland                 | OGL     | as above                                                                                                                                               |
| [Dispenser Location Contact Details](https://www.opendata.nhs.scot/dataset/dispenser-location-contact-details)                                          | Public Health Scotland                 | OGL     | as above                                                                                                                                               |
| [GP Practice List Sizes](https://www.opendatani.gov.uk/@business-services-organisation/gp-practice-list-sizes) (Reference File)                         | Business Services Organisation (BSO)   | OGL     | `Contains public sector information from the Business Services Organisation, licensed under the Open Government Licence v3.0.`                         |
| [Dentist and Surgery List](https://www.opendatani.gov.uk/@business-services-organisation/general-dental-services-statistics) (Dental Surgery List only) | Business Services Organisation (BSO)   | OGL     | as above                                                                                                                                               |
| Code-Point Open, OS Open Names                                                                                                                          | Ordnance Survey                        | OGL     | `Contains OS data © Crown copyright and database right 2026.` (and the Royal Mail and National Statistics statements of Code-Point Open)               |
| Local Authority Districts (ward-to-region lookup, boundaries)                                                                                           | Office for National Statistics         | OGL     | `Source: Office for National Statistics licensed under the Open Government Licence v.3.0. Contains OS data © Crown copyright and database right 2026.` |
| OSNI Open Data – Gazetteer – Place Names                                                                                                                | Land & Property Services (OSNI)        | OGL     | `Contains public sector information from Land & Property Services (OSNI), licensed under the Open Government Licence v3.0.`                            |

## Not imported, and why

| Candidate                                                                                                                                     | What it is                                                                          | Obstacle                                                                                                                                                                                                                                 | Whom to ask                                                                                                                                                    |
| --------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [GMC List of Registered Medical Practitioners](https://www.gmc-uk.org/registration-and-licensing/our-registers/download-our-registers) (LRMP) | Every licensed doctor, with GMC number and specialty                                | Bulk download for a yearly fee; republication needs a separate licence and the GMC's approval (ADR 0002, source 14)                                                                                                                      | General Medical Council, registers team: ask the price and conditions of a republication licence for a free public directory                                   |
| GDC registers                                                                                                                                 | Dentists and dental care professionals                                              | "Copies of the registers are not available for sale or for commercial purposes": single lookups only (ADR 0002, GB1)                                                                                                                     | General Dental Council: a lookup to verify a claim is enough                                                                                                   |
| NMC register                                                                                                                                  | Nurses, midwives, nursing associates                                                | Free single search only, no bulk file (ADR 0002, source 16)                                                                                                                                                                              | Nursing and Midwifery Council: a lookup to verify a claim                                                                                                      |
| [General Practitioner Contact Details](https://www.opendata.nhs.scot/dataset/general-practitioner-contact-details)                            | Public Health Scotland's list of individual GPs with their GMC number and practice  | Published under the OGL, but it names people: the OGL does not cover personal data, and the UK pages list no clinician                                                                                                                   | Not to be asked for: out of scope until clinicians are listed with a GMC licence                                                                               |
| Dentist Contractor List (same dataset as the Dental Surgery List)                                                                             | The BSO's list of named dentists                                                    | Names people (same as above)                                                                                                                                                                                                             | Same as above                                                                                                                                                  |
| ODS `egpcur` (and the other practitioner reports)                                                                                             | NHS England's list of individual GPs                                                | Names people (same as above)                                                                                                                                                                                                             | Same as above                                                                                                                                                  |
| [NHS Service Search API](https://digital.nhs.uk/developer/api-catalogue) (the NHS website's directory)                                        | Practices with websites, opening hours, services                                    | Onboarding and an online connection agreement are required (ADR 0002, source 19)                                                                                                                                                         | NHS England, API Management: onboarding for a public directory                                                                                                 |
| Organisation Data Terminology FHIR API                                                                                                        | The ODS data as FHIR, with the websites ODS holds                                   | Onboarding required ("there is no restriction on use case/application of the data", NHS England Developer Community, 21 October 2025); ODS holds no opening hours                                                                        | NHS England, Organisation Data Service: onboarding, to add the practices' websites                                                                             |
| Northern Irish postcode coordinates (ONS Postcode Directory, NSPL, postcodes.io)                                                              | The location of each `BT` postcode                                                  | "you need a separate licence for commercial use direct from Land and Property Services"; the ONS issues only an internal-business-use end user licence ([ONS geography licences](https://www.ons.gov.uk/methodology/geography/licences)) | Land & Property Services (Department of Finance, Northern Ireland): price of a licence to show postcode-level locations of about 650 practices                 |
| District (LGD) and coordinates of each GP practice                                                                                            | What the BSO's GP Reference File lacks: it gives only the commissioning group (LCG) | Today a Northern Irish GP practice is placed by the town in its address, else by the district the dental list gives its postcode district: some practices are placed in their district only                                              | Business Services Organisation, Family Practitioner Services information unit (dataset contact on OpenDataNI): add the LGD, and a point, to the quarterly file |
| Pharmacies of Northern Ireland                                                                                                                | Community pharmacies                                                                | No open list with addresses found on OpenDataNI (the "Dispensing by Contractor" dataset gives counts, not addresses)                                                                                                                     | Business Services Organisation: publish the pharmacy contractor list as the dental surgery list is                                                             |
| Crown Dependencies (Isle of Man, Guernsey, Jersey)                                                                                            | Practices the ODS lists include                                                     | Not in the United Kingdom: left out on purpose                                                                                                                                                                                           | -                                                                                                                                                              |

## How to ask

A public sector body may be asked to make information it holds available for re-use under the
[Re-use of Public Sector Information Regulations 2015](https://www.legislation.gov.uk/uksi/2015/1415/contents)
(SI 2015/1415): a request for re-use (regulation 6), answered "promptly and in any event before
the end of the twentieth working day beginning with the day after receipt" (regulation 8(1)),
with more time only if the body says so in writing within those 20 working days. The GMC, the
GDC and the NMC are statutory regulators; whether the 2015 regulations reach them was not
checked (UNVERIFIED): the GMC request below is a commercial licence request, not a re-use request.
Land & Property Services and the BSO are public bodies of Northern Ireland, so the regulations
apply to their requests.

Suggested request, to the BSO (adapt for Land & Property Services and the GMC):

> Subject: Request for re-use of public sector information (SI 2015/1415): GP practice reference file
>
> Dear colleagues,
>
> Apercura (apercura.org) is a free, open-source directory of health practices. In Northern
> Ireland it already publishes the practices of your GP Practice Reference File and Dental
> Surgery List, under the Open Government Licence, with your attribution, without ratings or
> advertising, and with a removal path on every page. It lists practices, never clinicians.
>
> We ask you to add to the quarterly GP Practice Reference File, under the same licence, the
> local government district of each practice and, if you hold them, the coordinates of its
> premises, as a request for re-use under the Re-use of Public Sector Information Regulations
> 2015. We would also welcome a list of community pharmacies in the same form.
>
> We are happy to explain our processing (legitimate interests assessment, privacy notice,
> removal on request).
>
> Kind regards

Record every answer in the United Kingdom section of
[ADR 0002](../adr/0002-multi-country.md#united-kingdom-gb) and here.
