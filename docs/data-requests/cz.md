# Czechia: data we could not import yet

Czechia's directory (`/cz`) is built from the National Register of Healthcare Providers
(Národní registr poskytovatelů zdravotních služeb, NRPZS), published by ÚZIS ČR and the Ministry
of Health under CC BY 4.0 ([`docs/data-import.md`](../data-import.md#czechia)): the places of care
of general practitioners, paediatricians, dentists, gynaecologists, specialists, pharmacies, home
care agencies, physiotherapists, clinical psychologists, speech therapists and midwives, placed in
RÚIAN's regions, districts and municipalities (ČÚZK, CC BY 4.0). A page is a facility, under its
name in the register. This file lists every other candidate found on 26 November 2026, why it is
not imported, and whom to ask, so that requests can be sent.

The search covered the NZIP open-data catalogue (ÚZIS), the NRPZS site, the ČÚZK RÚIAN downloads,
SÚKL's open data, and the chambers' public searches (Czech Medical Chamber, Czech Dental Chamber).

## Imported

| Dataset                                                                                                                                                               | Publisher                                         | Licence   | Attribution                                                                                                                                         |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| [NRPZS: Místa poskytování zdravotních služeb](https://www.nzip.cz/data/1823-narodni-registr-poskytovatelu-zdravotnich-sluzeb-otevrena-data) (monthly CSV, 49 columns) | ÚZIS ČR, content guarantor the Ministry of Health | CC BY 4.0 | `Zdroj: Ministerstvo zdravotnictví ČR a Ústav zdravotnických informací a statistiky ČR, Národní registr poskytovatelů zdravotních služeb (nzip.cz)` |
| RÚIAN, state basic dataset `ST_UZSZ` (VFR, monthly)                                                                                                                   | ČÚZK                                              | CC BY 4.0 | `ČÚZK, 2026` (the form ČÚZK's terms require)                                                                                                        |

Columns of the NRPZS file that are read but never stored: the provider's company number (IČO, and
the facility code `ZZ_kod` that embeds it), the provider's seat, its professional representative
(a named person), e-mail, fax, data box and website, the start date and the founder. For a sole
trader the seat is often a home address and the IČO identifies the person.

## Not imported, and why

| Candidate                                                                                                                                                            | What it would add                                            | Why not now                                                                                                                                                                                                                                | Whom to ask, for what                                                                                                                            |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| NRPZS facility kinds left out (hospitals and their wards, polyclinics of several fields, laboratories, opticians, ambulance and transport, spas, social care homes…) | About 7,900 more places of care                              | Not a place a patient books or calls directly (wards, laboratories, ambulances), or a facility whose fields of care are not tied to one practice (polyclinics): pages would mislead. Same file, same licence: a code change, not a request | -                                                                                                                                                |
| [Czech Medical Chamber, list of doctors](https://www.lkcr.cz/seznam-lekaru)                                                                                          | Named doctors with specialty and district                    | Published under Act No. 220/1991 Coll., § 6a, as a search only; the site says "Všechna práva vyhrazena Česká lékařská komora"                                                                                                              | Česká lékařská komora: a licence to republish the member list, or a statement that § 6a publication allows re-use                                |
| National Register of Health Workers (NRZP)                                                                                                                           | Individual health workers                                    | Not public (sign-in register)                                                                                                                                                                                                              | Not to be asked for: out of scope                                                                                                                |
| [SÚKL, list of pharmacies](https://opendata.sukl.gov.cz/?q=katalog%2Fseznam-lekaren) (monthly CSV)                                                                   | Pharmacies as SÚKL authorises them, with their pharmacy code | Re-usable under SÚKL's own terms ("jako zdroj dat musí být uveden SÚKL", meaning not altered, terms passed on when the data are redistributed); NRPZS already lists the pharmacies. Not read for this opening                              | SÚKL, open data team (opendata@sukl.gov.cz): confirm that a directory may show the list next to NRPZS data, and whether it carries opening hours |
| Opening hours (ordinační hodiny), insurers' contracts                                                                                                                | When a practice is open; which insurers pay for its care     | Not in the NRPZS; the chamber's search and the insurers' searches are websites without a reuse licence                                                                                                                                     | Health insurers (VZP ČR and the others): open data of contracted providers under Act No. 106/1999 Coll.                                          |
| An NRPZS API                                                                                                                                                         | Live updates                                                 | No API is documented on nrpzs.uzis.cz or on the NZIP dataset page (read on 26 November 2026); the monthly CSV is enough for a weekly import                                                                                                | ÚZIS ČR (zadosti-data@uzis.cz): whether an API is planned                                                                                        |

## How to ask

Information held by a public body may be requested under Act No. 106/1999 Coll. on free access to
information, which transposes the Open Data Directive (EU) 2019/1024: data published as open data
are, by § 3(11), data "jejichž způsob ani účel následného využití není omezen". A request is
answered within 15 days of receipt (§ 14(5)(d)), extendable by up to 10 days for serious reasons
(§ 14(7)) (UNVERIFIED on the day: read the consolidated text before sending). The chambers are
professional self-governing bodies; whether the Act reaches their member lists was not checked
(UNVERIFIED): the request below is a licence request, not an access request.

Suggested request, to the Czech Medical Chamber (adapt for SÚKL and the insurers):

> Předmět: Žádost o licenci ke zveřejnění seznamu lékařů
>
> Vážení,
>
> Apercura (apercura.org) je bezplatný adresář zdravotnických zařízení s otevřeným zdrojovým kódem.
> V České republice zveřejňuje místa poskytování zdravotních služeb z Národního registru
> poskytovatelů zdravotních služeb (ÚZIS ČR, licence CC BY 4.0), s uvedením zdroje, bez hodnocení
> a bez reklamy, a na každé stránce nabízí možnost jejího odstranění.
>
> Žádáme o licenci ke zveřejnění jména, odbornosti a okresu působení lékařů ze seznamu členů, který
> Komora zveřejňuje podle § 6a zákona č. 220/1991 Sb., případně o vaše stanovisko, zda toto
> zveřejnění další užití umožňuje.
>
> Rádi vysvětlíme, jak údaje zpracováváme (posouzení oprávněného zájmu, informace podle čl. 14
> GDPR, odstranění na žádost).
>
> S pozdravem

Record every answer in the Czechia section of
[ADR 0002](../adr/0002-multi-country.md#czechia-cz) and here.
