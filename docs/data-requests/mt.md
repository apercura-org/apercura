# Malta: what is imported, what is not, and whom to ask

> Prepared 2026-11-27 for issue #176. Not legal advice: every licence below was read on the
> national catalogue's record as data.europa.eu harvests it from data.gov.mt (the national portal,
> portal.data.gov.mt, and most gov.mt sites refused automated reads that day, behind a Cloudflare
> block that was not bypassed), on the Planning Authority's WFS metadata and on the Medicines
> Authority's own pages. The letters are in English, an official language of Malta.

Malta opened (`/mt`) with community pharmacies only: the pharmacies the Medicines Authority
licenses to serve the public in Malta and Gozo ([data import](../data-import.md#malta),
[ADR 0002](../adr/0002-multi-country.md#malta-mt)). No health professional, no hospital and no
health centre is listed.

## Imported

| Dataset                                                                                                                                                                                                                                                                                                   | Publisher                                                                  | Licence (as published)                                                                                                                    | Credit printed                                                                                                                       |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| [Licensed Pharmacies in Malta and Gozo](https://data.europa.eu/data/datasets/0dfe65b7-626f-49ef-ab09-6a6ab8a4db72) (API, `data.gov.mt/Pharmacy/V1/Pharmacy`)                                                                                                                                              | Medicines Authority (contact point `pharmacies.medicinesauthority@gov.mt`) | CC BY 4.0 (the distribution's `license`, `https://creativecommons.org/licenses/by/4.0/`, modified 2026-11-18); checked again on every run | `Source: Medicines Authority, Licensed Pharmacies in Malta and Gozo (data.gov.mt), CC BY 4.0.`                                       |
| [Local Councils Units and Boundaries](https://data.europa.eu/data/datasets/f47bf292-c4d4-4a39-b2ff-86bc3f9d7e31) (INSPIRE WFS, `au:AdministrativeUnit`)                                                                                                                                                   | Planning Authority                                                         | CC BY 4.0 in the catalogue; the service's metadata: "no conditions to access and use", fees "noConditionsApply"                           | `Source: Planning Authority, Local Councils Units and Boundaries, CC BY 4.0 (localities' points computed by Apercura).`              |
| The districts and localities of the NSO's [Total Population by region, district and locality](https://data.europa.eu/data/datasets/532756e1-10fc-4d4c-99f6-569ba15bcddc) and the Address Registrar's [Local Councils of Malta](https://data.europa.eu/data/datasets/04245c19-e7de-4fb0-b854-89b9d6036d56) | National Statistics Office; Office of the Address Registrar                | CC BY 4.0 (both)                                                                                                                          | `Source: National Statistics Office, districts and localities; Office of the Address Registrar, Local Councils of Malta; CC BY 4.0.` |

The NSO's codes and English names and the Address Registrar's Maltese names of the 68 localities
were read once, on 27 November 2026, into `MT_LOCALITIES` (`packages/core/src/country/mt.ts`); the
import fetches only the pharmacies' API, its catalogue record and the Planning Authority's
boundaries. Fields read from the register: the licence number, type, name, address, locality,
postcode, phone and point. The register names no pharmacist; its `ID` (a row number) is not used.

## Not imported, and why

| Candidate                                                                                                          | What it would add                                                                                                                  | Why not now                                                                                                                                                                                                                                                                              | Whom to ask, for what                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The register's other pharmacies: 11 in-patient, 6 of government entities, 2 medical-oxygen, 1 parenteral nutrition | Mater Dei, Gozo General, Mount Carmel and private hospitals' pharmacies; health-centre dispensaries; the Armed Forces' and Sedqa's | None serves the public at a counter: an in-patient pharmacy serves its hospital's wards, a government entity's its own patients (the Armed Forces' has no phone and no point), the oxygen and nutrition dispensaries supply treatments at home. Listing them as pharmacies would mislead | Nobody: a later page could show a hospital with its pharmacy, once hospitals are open data                                                                     |
| Hospitals and health centres (Mater Dei, Gozo General, the regional health centres)                                | About 4 state hospitals, about 10 health centres, the private hospitals                                                            | No dataset on data.gov.mt or data.europa.eu (searched "hospital", "health centre", "clinic", "Mater Dei" on 27 November 2026); the Ministry for Health's pages (health.gov.mt, healthservices.gov.mt) refused automated reads, and no licence was read for them                          | The Ministry for Health: publish its hospitals and health centres on data.gov.mt under CC BY 4.0 ([letter](#ministry-for-health-hospitals-and-health-centres)) |
| The Medical Council's registers of doctors (principal, specialist, provisional, temporary) and dentists            | About 2,600 doctors and the dentists                                                                                               | Listed in the national catalogue under CC BY 4.0, but the distribution is the Council's web search and its PDFs, not a file, and ADR 0002 asks for the Council's written confirmation before any named practitioner is republished; many entries withhold an address                     | **Founder:** send the Medical Council the letter of [`mt-medical-council.md`](mt-medical-council.md) (written confirmation and a machine-readable copy)        |
| The Pharmacy Council's registers (pharmacists, pharmacy technicians, qualified persons)                            | Pharmacists by name                                                                                                                | People, not places: a pharmacy page does not need its pharmacist                                                                                                                                                                                                                         | Nobody                                                                                                                                                         |
| The Council for the Professions Complementary to Medicine's PDFs (physiotherapists, opticians, podiatrists…)       | Allied health professionals by name                                                                                                | PDFs of people (CC BY 4.0 in the catalogue): the same written confirmation and assessment as for doctors would come first                                                                                                                                                                | Later, after the Medical Council's answer                                                                                                                      |
| The NSO's LAU 2 boundaries (`SU.Vector_LAU2`)                                                                      | The localities' boundaries                                                                                                         | The catalogue says CC BY 4.0 but the WFS's own metadata says "Attribution-NonCommercial-NoDerivatives 4.0 International": the Planning Authority's local council boundaries, with the same codes and no condition, are read instead                                                      | Nobody                                                                                                                                                         |
| The pharmacies' Sunday and holiday roster (`medicinesauthority.gov.mt/pharmacyroster`)                             | Which pharmacy is open on a Sunday                                                                                                 | A web page under the Medicines Authority's website terms, which prohibit "reproduction or use for commercial or marketing purposes"; not in the open dataset                                                                                                                             | The Medicines Authority: the roster as open data ([letter](#medicines-authority-the-licence-and-the-roster))                                                   |
| A Maltese interface (`/mt-mt`)                                                                                     | Malta's other official language                                                                                                    | A Maltese catalog, legal texts, route segments and search words are a follow-up of their own (ROADMAP.md); the register and the localities already carry Maltese names                                                                                                                   | Nobody                                                                                                                                                         |

## The Medicines Authority's website terms

The Medicines Authority's [copyright page](https://medicinesauthority.gov.mt/copyright?l=1) allows
reproduction "provided reproduction is complete, accurate, not malicious, and is accompanied by a
proper reference to the source and an acknowledgement to the Medicines Authority", and adds:
"Reproduction or use for commercial or marketing purposes is prohibited." That page governs the
Authority's **website**. The import reads the **dataset** the Authority published on the national
portal, whose distribution carries CC BY 4.0, a licence that allows any use, commercial included,
with attribution. Apercura is in any case free, without advertising, ranking or paid placement, so
it meets the website's terms as well; the credit names the Authority on every page. Confirming in
writing that the dataset's licence is CC BY 4.0 is the first question of the letter below; the
opening does not wait for it, the licence being the one the publisher chose.

## Advertising rules

- **Medicines.** The Medicinal Products (Advertising) Regulations (S.L. 458.32, transposing
  Directive 2004/27/EC) govern any advertising of medicinal products, to the public (regulations 5
  to 7: no prescription-only medicine, no testimonial, no misleading claim) and to professionals.
  The Medicines Authority does not review advertisements before publication; it monitors them and
  handles complaints (its [advertising page](https://medicinesauthority.gov.mt/regulationadvertisingofmedicines?l=1),
  read 2026-11-27). Pharmacy pages never name a medicine, a brand or an offer.
- **Pharmacies and pharmacists.** The Pharmacy Licence Regulations (S.L. 458.16) say nothing of
  advertising (read 2026-11-27). The Pharmacy Council's Code of Ethics for the Pharmaceutical
  Profession, issued under the Health Care Professions Act (Cap. 464), limits pharmacists'
  self-advertising (UNVERIFIED: the code's PDF refused automated reads; a secondary extract reads
  "should endeavour to maintain self advertising" without its context). It binds pharmacists,
  not a directory: Apercura lists every licensed community pharmacy alike, free, in the order of
  the search, with the register's facts only. A pharmacy that claims its page may add factual
  information (opening hours, services), never a promotion: the same rule as the other markets.
- **Doctors.** The Medical Council's ethics code limits doctors' own advertising (the research of
  #168, UNVERIFIED); no doctor is listed.

## How to ask

Both letters go from the publisher's address (`{{CONTACT_EMAIL}}`), once the legal entity exists
([README](README.md#how-to-send)), under the Re-use of Public Sector Information Act (Cap. 546)
where a public body holds the data. **The opening does not wait for either.** ROADMAP.md lists
sending them, and the Medical Council's letter, as founder actions.

### Ministry for Health: hospitals and health centres

**Recipient:** Ministry for Health and Active Ageing, Palazzo Castellania, 15, Merchants Street,
Valletta VLT 1171 (UNVERIFIED: gov.mt refused automated reads). Channel: the Ministry's e-mail
(UNVERIFIED), or the data.gov.mt contact form of the Data Governance Unit (`dgu.opm@gov.mt`,
VERIFIED as the national catalogue's contact).

**Subject: Re-use request: a list of Malta's public hospitals and health centres as open data
(Cap. 546)**

Dear Sir or Madam,

{{PUBLISHER_NAME}}, {{PUBLISHER_ADDRESS}}, publishes Apercura (apercura.org/mt), a free,
non-profit and open-source (AGPL-3.0) directory of health facilities, without advertising,
ratings or paid ranking. In Malta it lists the community pharmacies of the Medicines Authority's
register, which the Authority publishes on data.gov.mt under CC BY 4.0.

We found no open list of Malta's public hospitals and health centres on data.gov.mt. Under
articles 9, 10 and 13 of the Re-use of Public Sector Information Act (Cap. 546), we ask:

1. Whether the Ministry would publish, on data.gov.mt under CC BY 4.0 as the Medicines Authority
   did, the list of public hospitals, regional health centres and local health centres, with each
   one's name, address, locality, public phone and, if available, opening hours.
2. If such a list already exists, its address and the licence under which it may be re-used.

We would use only those facility fields, never a person's name, credit the Ministry on every page,
and correct or remove any entry on request.

We look forward to your answer within 20 working days (Cap. 546, art. 9(2)).

Contact: {{CONTACT_EMAIL}}. Postal address: {{PUBLISHER_ADDRESS}}.

Yours faithfully,

{{PUBLICATION_DIRECTOR}}, for {{PUBLISHER_NAME}}

### Medicines Authority: the licence and the roster

**Recipient:** Medicines Authority, Sir Temi Żammit Buildings, Malta Life Sciences Park, San Ġwann
SĠN 3000 (VERIFIED on medicinesauthority.gov.mt), by e-mail to the dataset's contact point,
`pharmacies.medicinesauthority@gov.mt` (VERIFIED in the national catalogue).

**Subject: Licensed Pharmacies in Malta and Gozo (data.gov.mt): licence confirmation and the
pharmacy roster**

Dear Sir or Madam,

{{PUBLISHER_NAME}}, {{PUBLISHER_ADDRESS}}, publishes Apercura (apercura.org/mt), a free,
non-profit and open-source (AGPL-3.0) directory of health facilities, without advertising,
ratings or paid ranking. It lists Malta's community pharmacies from the Authority's dataset
"Licensed Pharmacies in Malta and Gozo" on data.gov.mt, credited on every page as "Source:
Medicines Authority, Licensed Pharmacies in Malta and Gozo (data.gov.mt), CC BY 4.0."

We ask you:

1. To confirm that the dataset's licence is the Creative Commons Attribution 4.0 licence its
   distribution states, and that the credit above is the one you wish to see. Your website's
   copyright page prohibits "reproduction or use for commercial or marketing purposes"; we read it
   as applying to the website, not to the dataset, and Apercura is non-commercial in any case.
2. Whether the Authority would publish the pharmacy roster (the pharmacies open on Sundays and
   public holidays) on data.gov.mt under the same licence, so that patients can find an open
   pharmacy.

We do not list the register's in-patient, government-entity, medical-oxygen and parenteral
nutrition pharmacies, which do not serve the public at a counter, and we never name a pharmacist.

Contact: {{CONTACT_EMAIL}}.

Yours faithfully,

{{PUBLICATION_DIRECTOR}}, for {{PUBLISHER_NAME}}

## Sources (checked 2026-11-27)

- Licensed Pharmacies in Malta and Gozo, catalogue record (data.europa.eu, harvested from
  data.gov.mt): <https://data.europa.eu/api/hub/search/datasets/0dfe65b7-626f-49ef-ab09-6a6ab8a4db72>;
  API: <https://data.gov.mt/Pharmacy/V1/Pharmacy>.
- Local Councils Units and Boundaries (Planning Authority):
  <https://data.europa.eu/api/hub/search/datasets/f47bf292-c4d4-4a39-b2ff-86bc3f9d7e31>; WFS
  metadata: <https://haleconnect.com/services/bsp/org.1261.27899a9f-4361-4e9c-a73e-148512500919/md/dataset/dataset1>.
- NSO, LAU 2 classification (WFS metadata with the non-commercial licence):
  <https://data.europa.eu/api/hub/search/datasets/cd446ef3-ce5e-40f5-8dfe-91dc75e40f49>.
- NSO, Total Population by region, district and locality:
  <https://data.europa.eu/api/hub/search/datasets/532756e1-10fc-4d4c-99f6-569ba15bcddc>.
- Office of the Address Registrar, Local Councils of Malta:
  <https://data.europa.eu/api/hub/search/datasets/04245c19-e7de-4fb0-b854-89b9d6036d56>.
- Medicines Authority, copyright: <https://medicinesauthority.gov.mt/copyright?l=1>; regulation of
  advertising: <https://medicinesauthority.gov.mt/regulationadvertisingofmedicines?l=1>.
- Medicinal Products (Advertising) Regulations, S.L. 458.32: <https://legislation.mt/eli/sl/458.32/eng>;
  Pharmacy Licence Regulations, S.L. 458.16: <https://legislation.mt/eli/sl/458.16/eng>.
- Pharmacy Council, Code of Ethics (refused automated reads):
  <https://pharmacycouncil.gov.mt/wp-content/uploads/2024/02/Code-of-Ethics.pdf>.
- Re-use of Public Sector Information Act, Cap. 546: <https://legislation.mt/eli/cap/546/eng>.
