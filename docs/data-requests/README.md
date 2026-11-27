# Data re-use requests to practitioner registries

> Prepared 2026-11-25 for issue #110. Not legal advice: every legal point was checked on the source
> cited in each letter on that date, and the letters say where a point is uncertain.

Apercura publishes a page for every practitioner only where a source allows republication (see
the [launch order in ADR 0002](../adr/0002-multi-country.md#launch-order)). Everywhere else the
market starts with claimed pages. These letters ask each registry for the minimum a directory
needs (name, profession or specialty, practice address and, where the register publishes it, a
public phone), under the Open Data Directive (EU) 2019/1024 and its national transposition, the UK
Re-use of Public Sector Information Regulations 2015, or as a plain licence request where no law
gives a right to re-use.

Austria has its own request, prepared separately (`at.md`); the United Kingdom's, Czechia's,
Spain's, Italy's, Germany's, Switzerland's, Estonia's, Poland's, Norway's, Finland's, Lithuania's, Slovenia's, Cyprus's, Latvia's, Sweden's and Malta's candidates are in
`gb.md`,
`cz.md`, `es.md`, `it.md`, `de.md`, `ch.md`, `ee.md`, `pl.md`, `no.md`, `fi.md`, `lt.md`, `si.md`, `cy.md`, `lv.md`, `se.md` and `mt.md` (Spain opened from the register of centres,
REGCESS, Italy from the Ministry of Health's lists of places, Germany from the statistical offices'
directory of hospitals and the Länder's pharmacy lists, Switzerland from the FOPH's hospital
figures and the cantons' lists, Estonia from the Health Board's register of providers and the State
Agency of Medicines' pharmacies, Poland from RPWDL's healthcare entities, Norway from the establishments of the Central
Coordinating Register for Legal Entities, and Latvia from the National Health Service's GPs, the
Ministry of the Interior's addresses and the State Agency of Medicines' pharmacies, Finland from the
Finnish Service Catalogue's public health service locations, Lithuania from VASPVT's licence
register of institutions, Slovenia from the health insurer's lists of personal doctors, and Cyprus from the Ministry of
Health's lists of pharmacies, state hospitals and health centres, Sweden from Läkemedelsverket's licensed pharmacies and
Västra Götaland's health centres, and Malta from the Medicines Authority's licensed pharmacies; the requests below
for their registers of people still stand).

## Tracking

Update a row the day something happens. Status: `not sent`, `sent`, `extended`, `answered`,
`appealed`, `closed`. Outcome: `granted`, `granted with conditions`, `refused`, `no answer`.

| Market (launch #)  | Registry and letter                                                               | Recipient                                        | Channel                               | Legal basis                                                          | Status   | Date sent | Answer | Outcome |
| ------------------ | --------------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------- | -------------------------------------------------------------------- | -------- | --------- | ------ | ------- |
| Switzerland (2)    | MedReg: [ch-medreg.md](ch-medreg.md)                                              | FOPH, Register of Health Professions             | Email with the FOPH application form  | RegV MedBG, art. 11 (written application)                            | not sent |           |        |         |
| Switzerland (2)    | doctorfmh.ch: [ch-fmh.md](ch-fmh.md)                                              | FMH, legal service                               | Email                                 | None (private association): licence request                          | not sent |           |        |         |
| Switzerland (2)    | GLN partner data: [ch-refdata.md](ch-refdata.md)                                  | Stiftung Refdata                                 | Email                                 | None (private foundation): consent request                           | not sent |           |        |         |
| Switzerland (2)    | FOPH figures 2024: [ch.md](ch.md#how-to-ask)                                      | FOPH, Datenmanagement und Statistik              | Email                                 | None (federal dataset terms): permission request                     | not sent |           |        |         |
| Czechia (3)        | Czech Medical Chamber list: [cz.md](cz.md#how-to-ask)                             | Česká lékařská komora                            | Email                                 | None (Act No. 220/1991 Coll., § 6a publication): licence request     | not sent |           |        |         |
| United Kingdom (4) | LRMP: [GMC licence quote](#united-kingdom-gmc-licence-quote)                      | GMC registration data team                       | Email                                 | Commercial licence; RPSI 2015, reg. 6, in the alternative (doubtful) | not sent |           |        |         |
| Belgium (6)        | INAMI list of care providers: [be-inami.md](be-inami.md)                          | INAMI, DPO                                       | Email and registered post             | Law of 4 May 2016, art. 11                                           | not sent |           |        |         |
| Luxembourg (7)     | Register of doctors: [lu-college-medical.md](lu-college-medical.md)               | Collège médical, copy Ministry of Health         | Email                                 | Law of 29 November 2021, art. 4 (Collège uncertain, Ministry yes)    | not sent |           |        |         |
| Spain (8)          | REPS: [es-reps.md](es-reps.md)                                                    | Ministry of Health, DG Ordenación Profesional    | General electronic registry, or email | Ley 37/2007, art. 10                                                 | not sent |           |        |         |
| Spain (8)          | Register of colegiados: [es-cgcom.md](es-cgcom.md)                                | CGCOM, copy DPO                                  | Email and burofax                     | None under Ley 37/2007; access under Ley 19/2013, art. 17            | not sent |           |        |         |
| Italy (9)          | Albo Unico: [it-fnomceo.md](it-fnomceo.md)                                        | FNOMCeO, legal office, copy DPO                  | PEC, or email and raccomandata A/R    | D.lgs. 33/2013, arts. 5 and 7; d.lgs. 36/2006, art. 5 (uncertain)    | not sent |           |        |         |
| Italy (9)          | Coordinates of the pharmacy lists: [it.md](it.md#how-to-ask)                      | Ministry of Health, the datasets' expert contact | Email                                 | D.lgs. 36/2006, art. 5 (re-use request)                              | not sent |           |        |         |
| Ireland (10)       | Register of Medical Practitioners: [ie-medical-council.md](ie-medical-council.md) | Medical Council, DPO                             | Email                                 | S.I. 376/2021, reg. 6                                                | not sent |           |        |         |
| Malta (11)         | Registers of doctors and dentists: [mt-medical-council.md](mt-medical-council.md) | Medical Council, Registrar                       | Email                                 | Cap. 546, arts. 9, 10 and 13; CC BY 4.0 confirmation                 | not sent |           |        |         |
| Malta (11)         | Hospitals and health centres: [mt.md](mt.md#ministry-for-health-hospitals-and-health-centres) | Ministry for Health                              | Email                                 | Cap. 546, arts. 9, 10 and 13: publication request                    | not sent |           |        |         |
| Malta (11)         | Pharmacies' licence and roster: [mt.md](mt.md#medicines-authority-the-licence-and-the-roster) | Medicines Authority                              | Email                                 | None needed (CC BY 4.0): confirmation and publication request        | not sent |           |        |         |
| Germany (12)       | 116117 Arztsuche: [de-kbv.md](de-kbv.md)                                          | KBV, copy DPO                                    | Email                                 | None (DNG, § 1(2)): licence request                                  | not sent |           |        |         |
| Germany (12)       | Chamber doctor searches: [de-aerztekammern.md](de-aerztekammern.md)               | Each of the 17 Landesärztekammern                | Email, one per chamber                | None: licence request                                                | not sent |           |        |         |
| Estonia (13)       | MEDRE open data: [ee-terviseamet.md](ee-terviseamet.md)                           | Terviseamet                                      | Email                                 | Public Information Act, § 3¹ (licence change or confirmation)        | not sent |           |        |         |
| Estonia (13)       | CC BY-NC-SA 3.0 reading: [ee.md](ee.md#how-to-ask)                                | Terviseamet                                      | Email                                 | Public Information Act, § 3¹ (confirmation of the licence's terms)   | not sent |           |        |         |
| Norway             | Licence of "Landets apotek": [no.md](no.md#how-to-ask)                            | Direktoratet for medisinske produkter (DMP)      | Email                                 | None stated: licence request (NLOD 2.0 asked)                        | not sent |           |        |         |
| Slovenia (14)      | Stable file addresses: [si.md](si.md#how-to-ask)                                  | ZZZS, the dataset's contact on podatki.gov.si    | Email                                 | None (CC BY 4.0 dataset): stable addresses, acknowledgement          | not sent |           |        |         |
| Slovenia (14)      | Register of doctors and dentists: [si.md](si.md#how-to-ask)                       | Zdravniška zbornica Slovenije                    | Email                                 | None (the Chamber's legal notice): permission request                | not sent |           |        |         |
| Cyprus             | Updated state lists with addresses: [cy.md](cy.md#how-to-ask)                     | Ministry of Health and ΟΚΥπΥ                     | Email or data.gov.cy feedback form    | None needed (CC BY 4.0): update request                              | not sent |           |        |         |
| Cyprus             | Pharmacy registration number and name: [cy.md](cy.md#how-to-ask)                  | Pharmaceutical Services, Ministry of Health      | Email or data.gov.cy feedback form    | None needed (CC BY 4.0): confirmation and update request             | not sent |           |        |         |
| Latvia (15)        | GP practices' addresses: [lv.md](lv.md#how-to-ask)                                | Nacionālais veselības dienests                   | E-address (latvija.gov.lv) or email   | Informācijas atklātības likums (re-use and open data)                | not sent |           |        |         |
| Sweden             | Health centres of 20 regions: [se.md](se.md#how-to-ask)                           | Each region but Västra Götaland, registrator     | Email                                 | TF 2 ch.; lag 2022:818 (open data request)                           | not sent |           |        |         |
| Netherlands (16)   | BIG-register: [nl-big-register.md](nl-big-register.md)                            | CIBG, copy Ministry DPO                          | Email or contact form                 | None under the Who (art. 2(1)(h)): permission request                | not sent |           |        |         |
| Portugal (17)      | Register of doctors: [pt-ordem-dos-medicos.md](pt-ordem-dos-medicos.md)           | Ordem dos Médicos, access-to-information officer | Email, subject `RAI \|`               | Lei 26/2016, arts. 19 and 21                                         | not sent |           |        |         |
| Croatia (18)       | Contracted primary care: [hr-hzzo.md](hr-hzzo.md)                                 | HZZO, information officer                        | Email or HZZO form                    | ZPPI, arts. 27 and 29                                                | not sent |           |        |         |
| Romania (20)       | Registrul unic al medicilor: [ro-cmr.md](ro-cmr.md)                               | CMR, copy DPO                                    | Email                                 | Legea 179/2022, art. 4 (CMR probably not covered)                    | not sent |           |        |         |
| Lithuania (24)     | Contracted places: [lt.md](lt.md#how-to-ask)                                      | Valstybinė ligonių kasa (VLK)                    | Email, or a data.gov.lt request       | Teisės gauti informaciją ir duomenis įstatymas (UNVERIFIED article)  | not sent |           |        |         |
| Lithuania (24)     | Pharmacy licences: [lt.md](lt.md#how-to-ask)                                      | Valstybinė vaistų kontrolės tarnyba (VVKT)       | Email, or a data.gov.lt request       | Teisės gauti informaciją ir duomenis įstatymas (UNVERIFIED article)  | not sent |           |        |         |
| Lithuania (24)     | Kind and postcode fields: [lt.md](lt.md#how-to-ask)                               | VASPVT                                           | Email, or a data.gov.lt request       | Teisės gauti informaciją ir duomenis įstatymas (UNVERIFIED article)  | not sent |           |        |         |
| Lithuania (24)     | Current address points: [lt.md](lt.md#how-to-ask)                                 | VĮ Registrų centras                              | Email, or a data.gov.lt request       | Teisės gauti informaciją ir duomenis įstatymas (UNVERIFIED article)  | not sent |           |        |         |
| Finland (30)       | SOTE organisation register: [fi.md](fi.md#how-to-ask)                             | THL (Terveyden ja hyvinvoinnin laitos)           | Email                                 | Directive (EU) 2019/1024: licence request                            | not sent |           |        |         |

## How to send

1. **Only once the legal entity exists.** Replace every placeholder (`{{PUBLISHER_NAME}}`,
   `{{PUBLISHER_ADDRESS}}`, `{{CONTACT_EMAIL}}`, `{{PUBLICATION_DIRECTOR}}`) with the values the
   legal pages print (`LEGAL_*` configuration, `apps/web/src/lib/legal.ts`); the German chamber
   letter also has `{{CHAMBER_NAME}}` and `{{CHAMBER_ADDRESS}}`. Never send a letter that still
   shows a placeholder.
2. **Check the recipient again** on the day: addresses marked UNVERIFIED in a letter's header
   could not be read on the registry's own site.
3. **Send from the publisher's address** (`{{CONTACT_EMAIL}}`), never a personal one: the answer,
   and any licence, must name the publisher.
4. **Send both versions** in one message: the registry's language first, the English version
   below it ("English version for reference"). The registry-language text is the request.
5. **Croatian, Estonian and Romanian texts**: have a native speaker proofread them first.
6. **Keep proof** in the publisher's records (not in this repository): the sent email exported as
   `.eml` with its headers, a PDF of the letter, any acknowledgement, the web-form confirmation
   page, and the registered-post or burofax receipt where the letter says to send by post. The
   date sent is the day the email left, or the post receipt date.
7. **Write the date sent in the table**, and the date the deadline falls (below).
8. **Follow up the day after the deadline** with a one-line reminder quoting the date sent and the
   article giving the deadline; if a second deadline passes, or the answer is a refusal without
   reasons, use the redress route the letter names. Silence counts as a refusal in Spain (REPS)
   and can be appealed straight away.
9. **Record the outcome**, summarised in a line, in the table. No names of officials or other
   personal data in this repository: keep the correspondence itself in the publisher's records.
10. **If a licence is granted**, add its text, conditions and attribution wording to ADR 0002 (the
    market's section and the launch order) before any import is written.

## Response deadlines

| Market         | Law                                              | Deadline                                                      | Extension                                    | If no answer or refused                                                             |
| -------------- | ------------------------------------------------ | ------------------------------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------- |
| Switzerland    | RegV MedBG, art. 11 (FOPH)                       | None set; the letter asks for 30 days                         | None                                         | Ask for a formal decision; appeal to the Federal Administrative Court in 30 days    |
| United Kingdom | RPSI 2015, reg. 8 (if it applies)                | 20 working days                                               | Reasonable, notified by day 20               | Internal complaint (reg. 17), then the Information Commission (reg. 18)             |
| Belgium        | Law of 4 May 2016, art. 12                       | 30 days                                                       | 15 days                                      | Reconsideration and Commission de réutilisation in 30 days, then Conseil d'État     |
| Luxembourg     | Law of 29 November 2021, art. 4                  | 1 month (access time limit, law of 14 September 2018, art. 5) | 1 month                                      | Tribunal administratif in 3 months                                                  |
| Spain (REPS)   | Ley 37/2007, art. 10                             | 20 working days; silence is a refusal                         | 20, notified within 10                       | Administrative appeal, then the contencioso-administrativo courts                   |
| Spain (CGCOM)  | Ley 19/2013, art. 20                             | 1 month                                                       | 1 month                                      | Consejo de Transparencia y Buen Gobierno in 1 month                                 |
| Italy          | D.lgs. 33/2013, art. 5; d.lgs. 36/2006, art. 5   | 30 days                                                       | 20 days (d.lgs. 36/2006), notified within 21 | Transparency officer (RPCT, answers in 20 days), then the TAR                       |
| Ireland        | S.I. 376/2021, reg. 6                            | 20 working days                                               | To 40, notified within 3 weeks               | Information Commissioner in 4 weeks (reg. 15)                                       |
| Malta          | Cap. 546, art. 9                                 | 20 working days                                               | 20, notified within 3 weeks                  | Information and Data Protection Commissioner in 60 days (art. 24)                   |
| Germany        | None (DNG); IFG, § 7(5) if it applies to the KBV | None; the letters ask for 1 month                             | None                                         | None for a licence                                                                  |
| Estonia        | Public Information Act, § 18                     | 5 working days                                                | To 15 working days, notified within 5 (§ 19) | Data Protection Inspectorate or administrative court                                |
| Netherlands    | Who, art. 4 (if CIBG treats it as a Who request) | 4 weeks                                                       | 2 weeks                                      | Objection and appeal under the General Administrative Law Act                       |
| Portugal       | Lei 26/2016, art. 22                             | 10 working days (our reading of the counting)                 | None found for re-use                        | CADA in 20 days, then the administrative court                                      |
| Croatia        | ZPPI, art. 29(4)                                 | 15 days                                                       | None found for re-use                        | Information Commissioner in 15 days, then the High Administrative Court             |
| Romania        | Legea 179/2022, art. 4(8)                        | 30 working days                                               | 20, notified within 15                       | Autoritatea pentru Digitalizarea României in 30 days, then the administrative court |

The Directive's own fallback, where national law sets none, is 20 working days, extendable by 20
for extensive or complex requests, with notice within three weeks (art. 4(2)). A refusal must give
its grounds and the means of redress (art. 4(3)-(4)).

## What the Directive does and does not give

- It makes **accessible** documents of public sector bodies re-usable (art. 3(1)); it creates no
  right of access. A field the register does not publish (often the address or phone) cannot be
  asked for under it, and the letters do not.
- It does not apply to documents whose access is restricted on data-protection grounds (art.
  1(2)(h)), and it is without prejudice to the GDPR (art. 1(4)). Hence the GDPR paragraph in every
  letter: the registers publish these professional data by law; Apercura's own processing rests on
  legitimate interest (art. 6(1)(f)), with information under art. 14 and objections honoured under
  art. 21 (the removal flow of `/donnees#retrait` and the `directory.suppressions` that every
  import applies).
- A public body need not create or adapt documents or provide extracts where that means
  disproportionate effort beyond a simple operation (art. 5(3)). An export from an existing
  database is a simple operation (Irish Information Commissioner, RPSI/22/04).
- Re-use is free of charge, or at marginal cost (art. 6(1)); conditions must be objective,
  proportionate and non-discriminatory (art. 8(1), art. 11).
- A **professional chamber** is a "body governed by public law" only if it is mainly
  state-financed, under state management supervision, or has a board mostly appointed by the
  state (art. 2(2)). The CJEU held that a medical chamber financed by member fees it fixes itself,
  under mere legality supervision, is not one (C-526/11, _IVD v Ärztekammer Westfalen-Lippe_, 12
  September 2013, under the procurement directive's identical definition). So the Directive often
  does **not** reach the chambers that hold the registers, unless national law names them.

## Where a request has no legal basis

Said plainly, so that nobody counts on a right that does not exist:

- **Switzerland, FMH and Refdata**: private bodies; no re-use law applies. Licence or consent
  only. MedReg has a procedure (RegV MedBG, art. 11) but no right: the FOPH decides whether a
  private directory pursues a task matching the register's purpose.
- **Germany, KBV and Landesärztekammern**: the DNG creates no right to obtain data (§ 1(2)), the
  chambers are very probably not public bodies in its sense (C-526/11), and the KBV's status is
  uncertain. Licence requests only.
- **Netherlands, BIG-register**: the Who excludes personal data in public statutory registers
  (art. 2(1)(h)). Permission request only, and **no address** is public at all.
- **Spain, CGCOM and the colegios**: outside Ley 37/2007, art. 2. Only an access request under Ley
  19/2013 remains; the re-use itself needs CGCOM's permission. REPS (the Ministry) is covered.
- **Romania, CMR**: probably not an "entitate publică" under Legea 179/2022, and its register
  publishes **no address** (workplaces only with the doctor's consent).
- **Italy, FNOMCeO**: d.lgs. 36/2006 probably does not reach the Ordini (DL 101/2013, art.
  2(2-bis)); the letter rests on d.lgs. 33/2013, which names them, but whether its art. 7 re-use
  covers the albo is arguable.
- **Luxembourg, Collège médical**: probably not a public body; the Ministry of Health, in copy, is.
- **United Kingdom, GMC**: whether RPSI 2015 reaches a fee-financed regulator is doubtful; the
  request is in substance a commercial quote.
- **Fields that are not public cannot be asked for anywhere under these laws**: no address in
  Ireland, the Netherlands or Romania; **no phone** is made public by statute in any market except
  Switzerland (MedReg practice phone) and, through the published lists, where a registry chooses to
  show one.

## United Kingdom: GMC licence quote

The GMC sells the List of Registered Medical Practitioners (LRMP) as a daily file under a yearly
standard licence (£775 + VAT in the archived page; £815 per a search snippet, UNVERIFIED), ordered
from `data@gmc-uk.org` and administered by GMC Services International Ltd. **Republication needs a
separate licence**, granted after an enquiry describing the use; the subscriber agreement says
"your company can't republish the information without our permission" (VERIFIED from an archived
copy; the live site refused automated reads on 2026-11-25).

Legal basis: the UK never transposed Directive 2019/1024; the Re-use of Public Sector Information
Regulations 2015 (SI 2015/1415) still apply, but whether they reach the GMC is **doubtful**: reg.
3(1)(aa) covers bodies financed, supervised or with a board appointed by another public sector
body, and the GMC is financed by registrant fees, its members appointed by the Privy Council
(Medical Act 1983, Sch. 1). The register itself is public (s. 34). The letter is therefore a
commercial quote request, citing the Regulations only in the alternative. Under them: answer by
the 20th working day (reg. 8), internal complaint first (reg. 17), then the Information
Commission under the FOIA s. 50 procedure (reg. 18).

**Recipient:** GMC registration data team, `data@gmc-uk.org`; General Medical Council, 3 Hardman
Street, Manchester M3 3AW (address UNVERIFIED).

**Subject: LRMP: quote for a standard licence and a republication licence for a free, non-profit
directory**

Dear Sir or Madam,

{{PUBLISHER_NAME}}, {{PUBLISHER_ADDRESS}}, publishes Apercura, a free, non-profit and open-source
directory of health practitioners. Each page shows factual information only, with its source and
date. There are no ratings, no advertising and no paid ranking. Every practitioner can claim their
page to correct or complete it, or object to its publication; an objection is honoured at once and
the entry is never imported again.

We would like a quote for:

1. the **standard LRMP licence** (the daily file); and
2. a **republication licence** allowing us to show, on one page per doctor, the following LRMP
   fields for doctors with a licence to practise: name, GMC reference number, registration and
   licence status, and Specialist and GP Register entries. We do not ask for any other field.

Please send the enquiry form for the republication licence, the licence terms, and the field list
of the file. Every page would credit "Source: General Medical Council, List of Registered Medical
Practitioners" with the extraction date, and we would refresh the data at least weekly so that
erasures and suspensions are reflected promptly.

**Data protection.** The data are those the GMC publishes under section 34 of the Medical Act 1983.
Our processing rests on legitimate interests (Article 6(1)(f) UK GDPR): helping patients check and
find a registered doctor. We inform doctors under Article 14 (a notice on every page and in our
privacy policy), and honour objections under Article 21.

Should the GMC consider this a request under the Re-use of Public Sector Information Regulations
2015, we would ask for an answer within 20 working days (regulation 8) and, for any refusal, the
reasons and the complaints procedure (regulations 9 and 17).

Contact: {{CONTACT_EMAIL}}.

Yours faithfully,

{{PUBLICATION_DIRECTOR}}, for {{PUBLISHER_NAME}}

Sources (checked 2026-11-25): RPSI 2015, <https://www.legislation.gov.uk/uksi/2015/1415>; Medical
Act 1983, s. 34, <https://www.legislation.gov.uk/ukpga/1983/54/section/34>; GMC, download the
register, <https://www.gmc-uk.org/registration-and-licensing/the-medical-register/download-the-register>
(read through the Internet Archive).

## Sources common to every letter

- Directive (EU) 2019/1024: <https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32019L1024>
- CJEU, C-526/11, _IVD v Ärztekammer Westfalen-Lippe_:
  <https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:62011CJ0526>
- GDPR (Regulation (EU) 2016/679): <https://eur-lex.europa.eu/eli/reg/2016/679/oj>
