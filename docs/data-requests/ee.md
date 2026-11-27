# Estonia: what is imported, what is not, and whom to ask

> Prepared 2026-11-27 for issue #165. Not legal advice: every licence below was read on
> andmed.eesti.ee (the `license` of each distribution) or on the publisher's own page that day,
> and the laws on Riigi Teataja. Have a native speaker proofread the Estonian letter before
> sending.

Estonia opened (`/ee`) with healthcare providers and general pharmacies only: the providers
holding an activity licence in the Health Board's register (MEDRE open data) and the pharmacies of
the State Agency of Medicines' register ([data import](../data-import.md#estonia),
[ADR 0002](../adr/0002-multi-country.md#estonia-ee)). No health worker is listed. The earlier
request to the Health Board for a more open licence of the whole register, health workers included,
still stands: [`ee-terviseamet.md`](ee-terviseamet.md).

## Imported

| Dataset                                                                      | Publisher                                              | Licence (as published)                                        | Credit printed                                                                                                                |
| ---------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Tervishoiuteenuse osutajate ning tegevuslubade andmestik (`od_asutused.xml`) | Terviseamet (Health Board); MEDRE, run by TEHIK        | CC BY-NC-SA 3.0 Unported ("jurisdiktsiooniga sidumata")       | `Terviseamet, tervishoiuteenuse osutajate ning tegevuslubade andmestik (MEDRE), CC BY-NC-SA 3.0; Apercura on andmeid muutnud` |
| Ravimiameti tegevuslubade register: apteekide koondandmed (CSV)              | Ravimiamet (State Agency of Medicines)                 | CC0 1.0                                                       | `Ravimiamet, tegevuslubade register`                                                                                          |
| Aadressid ja posti sihtnumbrid (`sihtnumbrid.zip`, ADS)                      | Maa- ja Ruumiamet (Land and Spatial Development Board) | CC0 1.0 (the ADS metadata record)                             | `Aadressiandmed: Maa- ja Ruumiamet`                                                                                           |
| Haldus- ja asustusjaotus, asustusüksused (`asustusyksus_shp.zip`, EHAK)      | Maa- ja Ruumiamet                                      | Open data, credited with the Board's name and the data's date | `Haldus- ja asustusjaotus: Maa- ja Ruumiamet {date}`                                                                          |

The Health Board's data is republished under the same licence, CC BY-NC-SA 3.0, which the data page
(`/ee/andmed`) and every page's credit say. The Advertising Act (reklaamiseadus, § 22(3)) requires
information about a healthcare provider to include its activity licence number: every provider page
prints its licence numbers, and § 22(4)(1) keeps the factual information the pages show (name,
hours, place of activity, specialty, services) outside the ban on advertising health services.

## Not imported

| Data                                                                                                                        | Where                                         | Licence         | Why not, and what it would take                                                                                                                                                                                                                                                 |
| --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The health workers registered with each provider (`tootajad`: D, N, M, T, G and H codes, names, professions, specialties)   | `od_asutused.xml`, the same file              | CC BY-NC-SA 3.0 | Named persons: a written legitimate-interest assessment, the article 14 notice, opt-out and minimisation, and a reading of how the NC and SA terms apply to personal data. Decided against for the opening (ADR 0002, "Estonia"); see [`ee-terviseamet.md`](ee-terviseamet.md). |
| Family doctors' lists (`nimistud`: list codes, the family doctor and nurses by name, service areas, consultation addresses) | MEDRE open data, "Perearsti nimistute andmed" | CC BY-NC-SA 3.0 | Names the family doctor of each list. Useful (a patient chooses a list, not a practice): the same conditions as the health workers.                                                                                                                                             |
| Pharmacists (`apteekrid`: F and P codes, names, workplaces)                                                                 | MEDRE open data                               | CC BY-NC-SA 3.0 | People, and a pharmacy's page does not need them. Not planned.                                                                                                                                                                                                                  |
| Hospital pharmacies (25) and the veterinary pharmacy                                                                        | Ravimiamet's register                         | CC0 1.0         | They do not serve the public.                                                                                                                                                                                                                                                   |
| Ambulance services and school health places                                                                                 | MEDRE open data                               | CC BY-NC-SA 3.0 | An ambulance is called, not visited; a school's health room serves its pupils.                                                                                                                                                                                                  |
| An interface in Russian                                                                                                     | -                                             | -               | Russian is widely spoken in Estonia: a follow-up adds the locale (ROADMAP.md).                                                                                                                                                                                                  |

## How to ask

Send the letter below to the Health Board (Terviseamet, registry code 70008799, Paldiski mnt 81,
10614 Tallinn), by e-mail to `info@terviseamet.ee`, the contact point andmed.eesti.ee gives for the
dataset, from the publisher's address (`{{CONTACT_EMAIL}}`), once the legal entity exists
([README](README.md#how-to-send)). The answer is due within 5 working days (Public Information Act,
§ 18(1)), extendable to 15 with notice (§ 19). **The opening does not wait for the answer**: the
pages are published under the reading the letter sets out and follow the Board's answer.
ROADMAP.md lists sending it as a founder action.

### Kiri (eesti keeles)

**Teema: MEDRE avaandmete taaskasutus Apercuras: litsentsi CC BY-NC-SA 3.0 tõlgenduse kinnitamine**

Terviseamet, Paldiski mnt 81, 10614 Tallinn

Lugupeetud Terviseameti esindaja

{{PUBLISHER_NAME}} ({{PUBLISHER_ADDRESS}}) avaldab Apercurat (apercura.org/ee), tasuta,
kasumit taotlemata ja avatud lähtekoodiga (AGPL-3.0) kataloogi Eesti tegevusloaga
tervishoiuteenuse osutajatest ja üldapteekidest. Kataloog põhineb Terviseameti andmestikul
„Tervishoiuteenuse osutajate ning tegevuslubade andmestik“ (MEDRE avaandmed), mis on portaalis
andmed.eesti.ee avaldatud litsentsi CC BY-NC-SA 3.0 (jurisdiktsiooniga sidumata) alusel. Avaldame
ainult teenuse osutajad, nende tegevusload (numbri ja liigi), lubatud teenused ja tegevuskohtade
aadressid; teenuse osutajate juures registreeritud tervishoiutöötajaid me ei avalda. Iga lehel on
teenuse osutaja tegevusloa number, nagu nõuab reklaamiseaduse § 22 lõige 3.

Palume kinnitada, et järgmine litsentsi tõlgendus on õige:

1. **Mitteäriline eesmärk (litsentsi punkt 4(c)).** Apercura on patsientidele ja teenuse
   osutajatele tasuta, sellel ei ole reklaami ega tasulist järjestamist ega paigutust ning
   andmeid ei müüda ega rendita. Kas selline kasutamine ei ole „peamiselt suunatud ärilise eelise
   või isikliku rahalise tasu saamisele“ ja on seega litsentsiga lubatud?
2. **Jagamine samadel tingimustel (punkt 4(b)).** Taasavaldatud Eesti andmed (lehed, loendid,
   saidikaardid) on kättesaadavad litsentsi CC BY-NC-SA 3.0 alusel; lähtekood on litsentsi
   AGPL-3.0 all. Andmed paigutatakse Maa- ja Ruumiameti haldus- ja asustusüksustesse (avaandmed
   viitega) ja aadressipunktidele (aadressiandmete süsteem, CC0 1.0) ning kataloogis on ka
   Ravimiameti apteegid (CC0 1.0). Kas selline ühendamine vastab jagamise samadel tingimustel
   nõudele, kui Terviseameti andmed jäävad kõikjal litsentsi CC BY-NC-SA 3.0 alla?
3. **Viide allikale (punkt 4(d)).** Kas sobib viide „Terviseamet, tervishoiuteenuse osutajate
   ning tegevuslubade andmestik (MEDRE), CC BY-NC-SA 3.0; Apercura on andmeid muutnud“ koos lingiga
   andmestikule ja litsentsile, või soovite muud sõnastust?
4. **Mitteärilised paigaldused.** Apercura lähtekoodi saab igaüks oma serveris käitada. Kas
   kasumit mittetaotlev käitaja, kes järgib samu tingimusi, võib andmeid samamoodi importida?

Kui Terviseamet saab andmed avaldada ka avatuma litsentsi (näiteks CC BY 4.0) alusel, oleks see
meile ja teistele taaskasutajatele veelgi lihtsam; meie varasem taotlus selle kohta kehtib.

Lehed on juba avaldatud eespool kirjeldatud tõlgenduse alusel ja järgivad teie vastust.
Ootame vastust avaliku teabe seaduse § 18 lõikes 1 sätestatud tähtaja jooksul.

Kontakt: {{CONTACT_EMAIL}}.

Lugupidamisega

{{PUBLICATION_DIRECTOR}}, {{PUBLISHER_NAME}} nimel

### Letter (English)

**Subject: Re-use of the MEDRE open data in Apercura: confirmation of our reading of CC BY-NC-SA
3.0**

Terviseamet, Paldiski mnt 81, 10614 Tallinn

Dear Sir or Madam,

{{PUBLISHER_NAME}}, {{PUBLISHER_ADDRESS}}, publishes Apercura (apercura.org/ee), a free,
non-profit and open-source (AGPL-3.0) directory of Estonia's healthcare providers holding an
activity licence and of its general pharmacies. It is built from the Health Board's dataset
"Tervishoiuteenuse osutajate ning tegevuslubade andmestik" (MEDRE open data), published on
andmed.eesti.ee under CC BY-NC-SA 3.0 (Unported). We publish the providers only, with their
activity licences (number and kind), licensed services and the addresses of their places of
activity; the health workers registered with each provider are not published. Every page prints
the provider's activity licence number, as section 22(3) of the Advertising Act requires.

We would be grateful if you could confirm that the following reading of the licence is correct:

1. **Non-commercial (licence section 4(c)).** Apercura is free for patients and for providers, has
   no advertising, no paid ranking or placement, and sells or rents no data. Is such a use "not
   primarily intended for or directed toward commercial advantage or private monetary
   compensation", and therefore allowed by the licence?
2. **Share-alike (section 4(b)).** The Estonian data as republished (pages, listings, sitemaps) is
   offered under CC BY-NC-SA 3.0; the code is under AGPL-3.0. The data is placed in the Land and
   Spatial Development Board's administrative and settlement units (open data with a credit) and at
   the points of its address data system (CC0 1.0), and the directory also lists the State Agency
   of Medicines' pharmacies (CC0 1.0). Does that combination meet the share-alike term, provided the
   Health Board's data stays under CC BY-NC-SA 3.0 wherever it is shown?
3. **Credit (section 4(d)).** Is the credit "Terviseamet, tervishoiuteenuse osutajate ning
   tegevuslubade andmestik (MEDRE), CC BY-NC-SA 3.0; Apercura on andmeid muutnud", with links to
   the dataset and the licence, suitable, or would you like another wording?
4. **Non-commercial instances.** Anyone can run Apercura's code on their own server. May a
   non-profit operator that follows the same terms import the data in the same way?

Should the Health Board be able to publish the data under a more open licence as well (for example
CC BY 4.0), it would be simpler still for us and for other re-users; our earlier request to that
effect stands.

The pages are already published under the reading set out above and will follow your answer. We
look forward to your reply within the time limit of section 18(1) of the Public Information Act.

Contact: {{CONTACT_EMAIL}}.

Yours faithfully,

{{PUBLICATION_DIRECTOR}}, for {{PUBLISHER_NAME}}

## Sources (checked 2026-11-27)

- andmed.eesti.ee, providers and licences (distribution `Asutused`, licence `CC_BY_NC_SA_3.0`):
  <https://andmed.eesti.ee/api/datasets/e13199a5-cbbd-4fd8-a428-b752794f3c04>; the portal's
  licence list names it "CC BY-NC-SA 3.0 … Jurisdiktsiooniga sidumata":
  <https://andmed.eesti.ee/api/licences>
- MEDRE open data and its description: <https://medre.tehik.ee/open-data>,
  <https://medre.tehik.ee/api-common/public/open-data/data/description>
- andmed.eesti.ee, Ravimiamet's register of activity licences (licence `CC0_1.0`):
  <https://andmed.eesti.ee/api/datasets/68ec6e29-3604-4fc8-b84f-420ac9613b2a>; the register:
  <https://rkav.tehik.ee/rkav/faces/pages/tegevuslubaForm/tegevuslubaOtsing.xhtml>
- The address data system's metadata record (CC0 1.0):
  <https://metadata.geoportaal.ee/geonetwork/srv/api/records/b0bd266e-b4c6-45db-b7ea-f47486b6258b>
- Administrative and settlement units, open data with the Board's credit and date:
  <https://geoportaal.maaruum.ee/est/ruumiandmed/haldus-ja-asustusjaotus-p119.html>; the Board's
  open data licence: <https://geoportaal.maaruum.ee/avaandmete-litsents>
- CC BY-NC-SA 3.0 Unported, legal code:
  <https://creativecommons.org/licenses/by-nc-sa/3.0/legalcode>
- Reklaamiseadus, § 22 (redaction in force 2026-03-16 to 2029-03-30, RT I, 06.03.2026, 8):
  <https://www.riigiteataja.ee/akt/106032026008>
- Infoühiskonna teenuse seadus, § 4 (redaction in force since 2026-08-18):
  <https://www.riigiteataja.ee/akt/111072026089>
- Andmekaitse Inspektsioon, contact: <https://www.aki.ee/kontakt>
