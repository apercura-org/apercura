# Medical systems by country: France, Belgium, Germany, Switzerland

> **About this document.** This is an English translation of research inherited from Medic
> Remplacement, an earlier project (now archived) that built a marketplace for locum
> (replacement) doctors in France, Belgium, Germany and Switzerland. It was written for locum
> replacement, not for a practitioner directory, and has **not been re-verified** for Apercura.
> Treat every fact below as a lead to check against a primary source.
>
> For Germany, the United Kingdom, Spain and Italy, the current source of truth is
> [ADR 0002: Multi-country foundation](../adr/0002-multi-country.md). Where the two disagree, the
> ADR wins.
>
> Sections marked **Context from the earlier project** (locum rates, market size, competitors,
> launch strategy, risks) describe the locum marketplace and are kept for reference only.

## Known issues

- **Swiss MedReg access.** The source describes MedReg (`medreg.admin.ch`) as offering a "public
  API". Notes in the earlier project's code said the API requires authentication.
  **UNVERIFIED**: check before relying on it.
- **Identifier check digits.**
  - RPPS (France): 11 digits with a trailing Luhn check digit. **Verified** in Apercura's code
    (`isValidRpps` in `packages/core/src/rpps.ts`).
  - INAMI/RIZIV (Belgium): a mod-97 check is commonly cited. **UNVERIFIED**.
  - GLN (Switzerland): 13 digits with a GS1 mod-10 check digit. **UNVERIFIED** for Swiss
    practitioner GLNs.
- **Germany.** Facts about Germany in this document predate ADR 0002, which supersedes them
  (practitioner identifiers such as the eFN, data sources, hosting rules).
- **Switzerland, billing.** TARMED is described as "in transition to TARDOC"; the transition
  date and current status were not re-checked.

---

## 1. France

### Regulation

- **Supervisory authority**: Conseil National de l'Ordre des Médecins (CNOM).
- **Practitioner identifier**: **RPPS** (Répertoire Partagé des Professionnels de Santé), 11
  digits.
- **Licence to practise**: State diploma of Doctor of Medicine (Diplôme d'État de Docteur en
  Médecine) plus registration with the Ordre.
- **Locum status**: the locum practises under the RPPS number of the doctor being replaced, not
  their own. They need a replacement licence issued by the departmental Ordre.

### How replacement works

1. The doctor in post declares the absence to the Ordre.
2. They find a locum (personal network, Facebook groups or a platform).
3. A **replacement contract** is signed by both parties.
4. The locum bills procedures under the doctor in post's number.
5. A **fee retrocession** is agreed (see the rates below).

### Technical specifics

- RPPS verification through the Annuaire Santé API (`annuaire.sante.fr`).
- CPS card (Carte de Professionnel de Santé) for billing.
- Procedures billed under the NGAP/CCAM nomenclatures.
- Third-party payment (tiers payant) is mandatory for some procedures.

### Context from the earlier project

- **Rates (fee retrocession)**: usually 70-80% to the locum. General practitioner 300-450 EUR
  per day; specialist 400-800 EUR per day depending on specialty and area. Not regulated; freely
  negotiated.
- **Market**: about 12,000 locum doctors in France. Severe shortage in rural areas ("medical
  deserts"). Dominated by Facebook groups, word of mouth and a few platforms (RemplaFrance,
  Docndoc). Strongly seasonal: high demand in summer and school holidays.

---

## 2. Belgium

### Regulation

- **Supervisory authority**: Ordre des médecins (French-speaking) / Orde van artsen
  (Dutch-speaking).
- **Practitioner identifier**: **INAMI** (Institut National d'Assurance Maladie-Invalidité) /
  **RIZIV** (Rijksinstituut voor ziekte- en invaliditeitsverzekering), 11 digits.
- **Licence to practise**: medical degree plus a visa from the FPS Public Health (SPF Santé
  publique) plus specialist recognition (agrément) where applicable.
- **Locum status**: more flexible than in France. The locum practises under their own INAMI
  number.

### How replacement works

1. The doctor in post announces the absence.
2. A locum is found, often through the local general practitioners' circle (cercle de médecins
   généralistes).
3. **No formal contract is mandatory** (but one is recommended).
4. The locum bills directly under their own INAMI number.
5. The financial arrangement is free (fee sharing or a daily flat rate).

### Technical specifics

- INAMI verification through the register of health professions (cadastre des professions de
  santé) of the FPS Public Health.
- Billing system: eAttest (electronic billing).
- Two medical communities: French and Dutch must both be supported in the same region (Brussels
  is bilingual).
- On-call duty is organised by the doctors' circles (wachtdiensten / weekend gardes).

### Context from the earlier project

- **Rates**: general practitioner 250-400 EUR per day; specialist 350-700 EUR per day. Whether
  the doctor is "conventionné" (bound by the national fee agreement) or not affects rates.
- **Market**: smaller population but high medical density. Three language communities (French,
  Dutch, German), so three distinct markets. Replacement is more informal than in France. On-call
  associations (GP circles) make replacements easier. Few dedicated digital platforms, which the
  earlier project saw as a significant opportunity.

---

## 3. Germany

> Superseded by [ADR 0002](../adr/0002-multi-country.md#germany-de) where they overlap.

### Regulation

- **Supervisory authority**: Ärztekammer (chamber of physicians), 17 regional chambers.
- **Practitioner identifier**: **Approbation** (federal licence to practise medicine). There is
  no unified number comparable to the RPPS.
- **Licence to practise**: Approbation als Arzt, plus Facharztanerkennung (specialist title
  granted by the Ärztekammer) where applicable.
- **Locum status**: **Vertretungsarzt**. Must hold the Approbation. Doctors under contract with
  the statutory health insurance (Vertragsarzt) must declare their replacement to the KV
  (Kassenärztliche Vereinigung, regional association of statutory health insurance physicians).

### How replacement works

1. The doctor in post (Praxisinhaber) declares the absence to the regional KV.
2. A locum is appointed and must be approved by the KV.
3. The locum practises under the doctor in post's practitioner number (as in France).
4. A fee retrocession is negotiated (see the rates below).
5. For absences longer than one week, the KV must be formally notified.

### Technical specifics

- No unified national practitioner number: the Approbation is a document, not a number that an
  API can look up.
- Verification goes through the Bundesärztekammer or the regional Ärztekammern.
- Complex KV system: 17 regions, each with its own rules.
- Billing through the KBV (Kassenärztliche Bundesvereinigung) under the EBM nomenclature
  (Einheitlicher Bewertungsmaßstab).
- Data protection: DSGVO (the German name of the GDPR), described in the source as more
  rigorously enforced.

### Context from the earlier project

- **Rates (fee retrocession)**: usually 60-80%. General practitioner (Allgemeinmedizin) 400-600
  EUR per day; specialist 500-1,200 EUR per day (highly variable). Higher than France on average,
  with a significant East/West gap (former West German Länder versus the new Länder).
- **Market**: about 400,000 doctors in Germany, of whom about 160,000 work in private practice.
  Severe shortage in rural areas, especially in the former GDR. A highly structured market: the
  regional KVs often run their own replacement exchanges. Existing platforms: Arztpool.de,
  DocInsider, Vertretungsarzt.de. Significant bureaucracy; doctors look for simple solutions. The
  source estimated the replacement market at several billion euros a year.

---

## 4. Switzerland

### Regulation

- **Supervisory authority**: FMH (Foederatio Medicorum Helveticorum) plus the cantonal
  authorities.
- **Practitioner identifier**: **GLN** (Global Location Number), 13 digits.
- **Licence to practise**: federal medical diploma plus a cantonal authorisation to practise.
- **Locum status**: must hold the authorisation to practise in the canton concerned. Each canton
  has its own rules.

### How replacement works

1. The doctor in post arranges the replacement.
2. The locum must hold the cantonal authorisation to practise (sometimes a temporary one).
3. A **replacement contract** is recommended but not always mandatory.
4. Billing: the locum bills either under the doctor in post's ZSR/RCC number (Registre des
   codes-créanciers, creditor code register) or under their own.
5. Fee retrocession (see the rates below).

### Technical specifics

- GLN verification through the MedReg register (`medreg.admin.ch`). The source says a public API
  is available; see [Known issues](#known-issues): **UNVERIFIED**, it may require
  authentication.
- Billing system: TARMED (in transition to TARDOC). TARMED defines the procedures, but private
  fees are free.
- Several cantons means a complex authorisation process.
- Personal data: the Swiss Federal Act on Data Protection (FADP; LPD in French, DSG in German),
  similar to the GDPR but distinct.
- Swiss doctors are often multilingual (German and French).

### Context from the earlier project

- **Rates (fee retrocession)**: usually 60-75% to the locum. General practitioner 600-1,000 CHF
  per day; specialist 800-2,000 CHF per day. The source described Swiss rates as the highest in
  Europe.
- **Market**: about 38,000 doctors in Switzerland. 26 cantons, so 26 different sets of rules.
  Four official languages (German 63%, French 23%, Italian 8%, Romansh 0.5%) but three main
  areas. Significant shortage in rural areas and in primary care. Replacement dominated by
  personal networks and the cantonal medical societies. Existing platforms: Medi-Jobs.ch,
  FMH-Jobs, Doxymed. The source saw a strong opportunity in a fragmented market with few digital
  solutions.

---

## Comparison table

|                               | France            | Belgium             | Germany                  | Switzerland            |
| ----------------------------- | ----------------- | ------------------- | ------------------------ | ---------------------- |
| **Practitioner identifier**   | RPPS (11 digits)  | INAMI/RIZIV (11 d.) | Approbation (document)   | GLN (13 digits)        |
| **Verification source**       | annuaire.sante.fr | FPS register        | Regional Ärztekammer     | medreg.admin.ch (1)    |
| **Locum bills under**         | Doctor in post's  | Own INAMI number    | Doctor in post's (KV)    | Varies (canton)        |
| **Contract mandatory**        | Yes (Ordre)       | No (recommended)    | Yes (KV, over 1 week)    | Varies (canton)        |
| **Billing nomenclature**      | NGAP/CCAM         | eAttest             | EBM (KBV)                | TARMED / TARDOC        |
| **Data protection**           | GDPR              | GDPR                | GDPR (DSGVO)             | FADP (LPD/DSG)         |
| **Language(s)**               | FR                | FR, NL, DE          | DE                       | DE, FR, IT             |
| **Regulatory complexity**     | Medium            | Low                 | High (17 KVs)            | Very high (26 cantons) |
| **Shortage** (2)              | Severe (rural)    | Moderate            | Very severe (rural East) | Severe (rural)         |
| **GP daily rate** (2)         | 300-450 EUR       | 250-400 EUR         | 400-600 EUR              | 600-1,000 CHF          |
| **Specialist daily rate** (2) | 400-800 EUR       | 350-700 EUR         | 500-1,200 EUR            | 800-2,000 CHF          |

(1) API access **UNVERIFIED**; see [Known issues](#known-issues).
(2) Context from the earlier project (locum marketplace).

---

## Implications

### Practitioner verification

- **FR**: Annuaire Santé API (`annuaire.sante.fr`, RPPS lookup).
- **BE**: register of the FPS Public Health (INAMI lookup).
- **DE**: no central API; manual verification or through the Ärztekammer.
- **CH**: MedReg (GLN lookup). The source called it "the most accessible"; access is
  **UNVERIFIED** (see [Known issues](#known-issues)).

### Currency

- **FR/BE/DE**: EUR.
- **CH**: CHF, a different currency (exchange rates apply).

### SEO keywords per language

The earlier project targeted locum searches; directory searches will need different terms.

- **FR**: "médecin remplaçant", "remplacement médical"
- **BE (French)**: same terms, plus "garde médecin"
- **BE (Dutch)**: "waarnemend arts", "artsenwaarneming"
- **DE**: "Vertretungsarzt", "Praxisvertretung", "Arzt Vertretung"
- **CH (German)**: "Stellvertretung Arzt", "Praxisstellvertretung"
- **CH (French)**: same terms as FR, plus "remplacement cabinet"
- **EN**: "locum doctor", "medical locum", "locum tenens"

### Context from the earlier project

**Data model.** `users.country` (FR, BE, DE, CH); a generic `practitionerNumber` (RPPS, INAMI,
GLN or an Approbation reference) with a `practitionerNumberType` (RPPS, INAMI, GLN,
APPROBATION).

**Sign-up forms.**

- **FR**: RPPS, replacement licence.
- **BE**: INAMI, FPS visa, conventionnement status.
- **DE**: Approbation (document upload), KV of affiliation, region.
- **CH**: GLN, canton(s) of authorisation, languages spoken.

**Pricing.** Rate ranges in search filters were to be adapted per country.

**Recommended launch order.**

1. **France** (current): main market, MVP validated.
2. **French-speaking Belgium**: same language, more flexible rules, quick test.
3. **French-speaking Switzerland**: same language, high rates, so better revenue per user.
4. **Germany**: largest European market, but high regulatory complexity.
5. **Dutch-speaking Belgium and German-speaking Switzerland**: language expansion.

**Risks per country.**

| Country | Main risk                           | Mitigation                                            |
| ------- | ----------------------------------- | ----------------------------------------------------- |
| FR      | Existing competition (RemplaFrance) | Differentiate through smart alerts and UX             |
| BE      | Small market, informal habits       | Start with Brussels (bilingual, high density)         |
| DE      | KV complexity, bureaucracy          | Partner with a regional KV, focus on 2-3 Länder       |
| CH      | 26 cantonal sets of rules           | Start with the French-speaking cantons (Vaud, Geneva) |
