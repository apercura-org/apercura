# Cyprus: what is imported, what is not, and whom to ask

> Prepared 2026-11-27 for issue #174. Not legal advice: every licence below was read on the
> dataset's own page on data.gov.cy that day. Have a native speaker proofread the Greek letters
> before sending.

Cyprus opened (`/cy`) with facilities only: the Pharmaceutical Services' private pharmacies and the
Ministry of Health's state hospitals and state health centres, placed in the municipalities and
communities of the 2021 census ([data import](../data-import.md#cyprus),
[ADR 0002](../adr/0002-multi-country.md#cyprus-cy)). No person is listed: the pharmacies' list
identifies each pharmacy by its pharmacist, whose name and house telephone number are never read,
so a pharmacy's page is named after its address.

## Imported

| Dataset                                                                                  | Publisher                                           | Licence (as published) | Credit printed                                                                                                  |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------- |
| Κατάλογος Ιδιωτικών Φαρμακείων (CSV, 2024–2025 edition)                                  | Φαρμακευτικές Υπηρεσίες, Υπουργείο Υγείας           | CC BY 4.0              | `Κατάλογος Ιδιωτικών Φαρμακείων: Φαρμακευτικές Υπηρεσίες, Υπουργείο Υγείας, CC BY 4.0· με αλλαγές της Apercura` |
| Κατάλογος Κρατικών Νοσοκομείων Κύπρου (CSV)                                              | Υπουργείο Υγείας                                    | CC BY 4.0              | `Κατάλογος Κρατικών Νοσοκομείων Κύπρου: Υπουργείο Υγείας, CC BY 4.0· με αλλαγές της Apercura`                   |
| Κατάλογος Κρατικών Κέντρων Υγείας Κύπρου (CSV)                                           | Υπουργείο Υγείας                                    | CC BY 4.0              | `Κατάλογος Κρατικών Κέντρων Υγείας Κύπρου: Υπουργείο Υγείας, CC BY 4.0· με αλλαγές της Apercura`                |
| Ταχυδρομικοί Κώδικες ανά Δήμο, Κοινότητα και Επαρχία (the workbook with LAU codes, 2021) | Τμήμα Ταχυδρομικών Υπηρεσιών (Κυπριακά Ταχυδρομεία) | CC BY 4.0              | `Ταχυδρομικοί κώδικες ανά δήμο και κοινότητα: Τμήμα Ταχυδρομικών Υπηρεσιών, CC BY 4.0`                          |
| Απογραφή 2021: πληθυσμός κατά επαρχία, δήμο/κοινότητα και ενορία (PxWeb table 1891164G)  | Στατιστική Υπηρεσία Κύπρου (ΚΥΣΤΑΤ)                 | CC BY 4.0              | `Δήμοι και κοινότητες: Στατιστική Υπηρεσία Κύπρου, Απογραφή 2021, CC BY 4.0`                                    |

Article 45 of the Code of Medical Ethics (ΚΔΠ 100/91) asks that a directory listing doctors list
them "uniform for all", without paid prominence: Apercura's pages are factual, in a neutral order,
without ratings, advertising or paid placement, and so fit it.

## Not imported

| Data                                                                    | Where                                              | Licence                              | Why not, and what it would take                                                                                                                                   |
| ----------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The pharmacist each pharmacy is listed under, and their house telephone | the pharmacies' list                               | CC BY 4.0                            | Personal data the pages do not need: the columns are never read. The pharmacy is named after its address until the list gives a pharmacy name (letter (b) below). |
| The additional address line of a pharmacy                               | the pharmacies' list                               | CC BY 4.0                            | Landmarks naming nearby shops and, at times, people: not read.                                                                                                    |
| The register of doctors                                                 | Cyprus Medical Council (one HTML table on gov.cy)  | none stated ("© Republic of Cyprus") | Named persons, no licence. An open dataset on data.gov.cy, with a legitimate-interest assessment, would be needed.                                                |
| GESY's providers (personal doctors, specialists, clinics)               | the GESY provider search                           | not open data                        | Not published for reuse.                                                                                                                                          |
| Private clinics, dentists, physiotherapists, psychologists              | -                                                  | -                                    | No open list found.                                                                                                                                               |
| Address points for the pharmacies and health centres                    | Department of Lands and Surveys, INSPIRE addresses | CC BY 4.0                            | They cover about 4% of the island: pages are located at their municipality's or community's centre, no map pin.                                                   |
| Two health centres ("Δευτεράς/ Ανθούπολης", "Παλαιοχωρίου")             | the health centres' list                           | CC BY 4.0                            | Their name fits no single place and the list gives no address: left out rather than guessed. An address in the list (letter (a)) would place them.                |

**The state lists are old.** Both files were released on 13 March 2018 (their dataset pages say
"modified 01/07/2024", the files themselves are unchanged). Since then the State Health Services
Organisation (ΟΚΥπΥ) has taken over the state hospitals and health centres, and some centres may
have moved, merged or closed. The data page says so plainly; letter (a) asks for an update.

## How to ask

Send the letters below from the publisher's address (`{{CONTACT_EMAIL}}`), once the legal entity
exists ([README](README.md#how-to-send)), to the contact each dataset page on data.gov.cy gives
(its contact e-mail or its feedback form). **The opening does not wait for the answers.** ROADMAP.md
lists sending them as founder actions.

### (a) To the Ministry of Health and the State Health Services Organisation: an updated list of state hospitals and health centres

#### Επιστολή (ελληνικά)

**Θέμα: Επικαιροποίηση των καταλόγων κρατικών νοσοκομείων και κέντρων υγείας στο data.gov.cy**

Προς το Υπουργείο Υγείας και τον Οργανισμό Κρατικών Υπηρεσιών Υγείας (ΟΚΥπΥ)

Η {{PUBLISHER_NAME}} ({{PUBLISHER_ADDRESS}}) λειτουργεί την Apercura (apercura.org/cy), έναν
δωρεάν, μη κερδοσκοπικό κατάλογο υπηρεσιών υγείας ανοικτού κώδικα (AGPL-3.0), χωρίς διαφημίσεις
και χωρίς πληρωμένη κατάταξη. Ο κατάλογος παρουσιάζει τα κρατικά νοσοκομεία, τα κρατικά κέντρα
υγείας και τα ιδιωτικά φαρμακεία της Κύπρου από τα ανοικτά δεδομένα του Υπουργείου στο
data.gov.cy, με την άδεια Creative Commons Attribution 4.0 (CC BY 4.0).

Οι κατάλογοι «Κατάλογος Κρατικών Νοσοκομείων Κύπρου» και «Κατάλογος Κρατικών Κέντρων Υγείας
Κύπρου» χρονολογούνται από τον Μάρτιο του 2018, και ο δεύτερος δεν περιλαμβάνει διευθύνσεις.
Παρακαλούμε, αν είναι δυνατόν:

1. να δημοσιευθεί επικαιροποιημένη έκδοση των δύο καταλόγων στο data.gov.cy, με την ίδια άδεια
   CC BY 4.0·
2. να περιλαμβάνει, για κάθε νοσοκομείο και κέντρο υγείας, τη διεύθυνση, τον ταχυδρομικό κώδικα,
   τον δήμο ή την κοινότητα, το τηλέφωνο και, αν υπάρχει, έναν σταθερό κωδικό της μονάδας·
3. να σημειώνεται η ημερομηνία της έκδοσης.

Δεν ζητούμε κανένα προσωπικό δεδομένο: μόνο στοιχεία των μονάδων.

Επικοινωνία: {{CONTACT_EMAIL}}.

Με εκτίμηση,

{{PUBLICATION_DIRECTOR}}, για την {{PUBLISHER_NAME}}

#### Letter (English)

**Subject: Updating the lists of state hospitals and health centres on data.gov.cy**

To the Ministry of Health and the State Health Services Organisation (ΟΚΥπΥ)

{{PUBLISHER_NAME}} ({{PUBLISHER_ADDRESS}}) runs Apercura (apercura.org/cy), a free, non-commercial,
open-source (AGPL-3.0) directory of health services, without advertising or paid ranking. It shows
Cyprus's state hospitals, state health centres and private pharmacies from the Ministry's open data
on data.gov.cy, under the Creative Commons Attribution 4.0 licence (CC BY 4.0).

The lists "Κατάλογος Κρατικών Νοσοκομείων Κύπρου" and "Κατάλογος Κρατικών Κέντρων Υγείας Κύπρου"
date from March 2018, and the second gives no addresses. We would be grateful if:

1. an updated edition of both lists could be published on data.gov.cy, under the same CC BY 4.0
   licence;
2. it gave, for each hospital and health centre, its address, postcode, municipality or community,
   telephone number and, where there is one, a stable code of the unit;
3. it stated the date of the edition.

We ask for no personal data: only facts about the facilities.

Contact: {{CONTACT_EMAIL}}.

Yours faithfully,

{{PUBLICATION_DIRECTOR}}, for {{PUBLISHER_NAME}}

### (b) To the Pharmaceutical Services: the registration number and a pharmacy name

#### Επιστολή (ελληνικά)

**Θέμα: Ο «Κατάλογος Ιδιωτικών Φαρμακείων» στο data.gov.cy: αριθμός μητρώου και επωνυμία φαρμακείου**

Προς τις Φαρμακευτικές Υπηρεσίες του Υπουργείου Υγείας

Η {{PUBLISHER_NAME}} ({{PUBLISHER_ADDRESS}}) λειτουργεί την Apercura (apercura.org/cy), έναν
δωρεάν, μη κερδοσκοπικό κατάλογο υπηρεσιών υγείας ανοικτού κώδικα, χωρίς διαφημίσεις και χωρίς
πληρωμένη κατάταξη. Παρουσιάζουμε τα ιδιωτικά φαρμακεία από τον «Κατάλογο Ιδιωτικών Φαρμακείων»
στο data.gov.cy (CC BY 4.0), με τη διεύθυνση, τον ταχυδρομικό κώδικα και το τηλέφωνο του
φαρμακείου.

Για την προστασία των προσωπικών δεδομένων δεν διαβάζουμε ούτε δημοσιεύουμε το ονοματεπώνυμο του
φαρμακοποιού ούτε το τηλέφωνο οικίας. Γι' αυτό κάθε φαρμακείο εμφανίζεται με τη διεύθυνσή του
(«Φαρμακείο, Ερμού 51Γ, Λάρνακα»). Θα σας παρακαλούσαμε:

1. να μας επιβεβαιώσετε ότι η στήλη «ΑΜ / Reg. No» είναι ο αριθμός μητρώου του φαρμακείου (και όχι
   του φαρμακοποιού), ώστε να τον χρησιμοποιούμε ως σταθερό κλειδί της σελίδας του φαρμακείου·
2. αν είναι δυνατόν, να προστεθεί στον κατάλογο στήλη με την επωνυμία του φαρμακείου, όπου αυτή
   διαφέρει από το όνομα του φαρμακοποιού·
3. να εξετάσετε αν το τηλέφωνο οικίας χρειάζεται να δημοσιεύεται σε ανοικτά δεδομένα.

Επικοινωνία: {{CONTACT_EMAIL}}.

Με εκτίμηση,

{{PUBLICATION_DIRECTOR}}, για την {{PUBLISHER_NAME}}

#### Letter (English)

**Subject: The "Κατάλογος Ιδιωτικών Φαρμακείων" on data.gov.cy: the registration number and a pharmacy name**

To the Pharmaceutical Services of the Ministry of Health

{{PUBLISHER_NAME}} ({{PUBLISHER_ADDRESS}}) runs Apercura (apercura.org/cy), a free, non-commercial,
open-source directory of health services, without advertising or paid ranking. It shows the
private pharmacies of the "Κατάλογος Ιδιωτικών Φαρμακείων" on data.gov.cy (CC BY 4.0), with the
pharmacy's address, postcode and telephone number.

To protect personal data we neither read nor publish the pharmacist's name or the house telephone
number. Each pharmacy is therefore shown under its address ("Φαρμακείο, Ερμού 51Γ, Λάρνακα"). We
would be grateful if you could:

1. confirm that the column "ΑΜ / Reg. No" is the pharmacy's registration number (not the
   pharmacist's), so that we may use it as the stable key of the pharmacy's page;
2. where possible, add a column with the pharmacy's trading name, where it differs from the
   pharmacist's name;
3. consider whether the house telephone number needs to be published as open data.

Contact: {{CONTACT_EMAIL}}.

Yours faithfully,

{{PUBLICATION_DIRECTOR}}, for {{PUBLISHER_NAME}}

## Sources (checked 2026-11-27)

- Κατάλογος Ιδιωτικών Φαρμακείων: <https://www.data.gov.cy/el/dataset/katalogos-idiotikon-farmakeion>
- Κατάλογος Κρατικών Νοσοκομείων Κύπρου: <https://www.data.gov.cy/el/dataset/katalogos-kratikon-nosokomeion-kyproy>
- Κατάλογος Κρατικών Κέντρων Υγείας Κύπρου: <https://www.data.gov.cy/el/dataset/katalogos-kratikon-kentron-ygeias-kyproy>
- Ταχυδρομικοί Κώδικες ανά Δήμο, Κοινότητα και Επαρχία: <https://www.data.gov.cy/el/dataset/tahydromikoi-kodikes-ana-dimo-koinotita-kai-eparhia>
- Απογραφή 2021, population by district, municipality/community and parish:
  <https://www.data.gov.cy/el/dataset/katoikies-noikokyria-idrymata-kai-plithysmos-poy-katagrafikan-kata-eparhia-dimokoinotita>;
  the table: <https://cystatdb.cystat.gov.cy/pxweb/el/8.CYSTAT-DB/8.CYSTAT-DB__Population__Census%20of%20Population%20and%20Housing%202021__Population__Population%20-%20Place%20of%20Residence/1891164G.px/>
- Διευθύνσεις – Addresses (INSPIRE), Department of Lands and Surveys ("4% of the whole of Cyprus"):
  <https://www.data.gov.cy/el/dataset/dieythynseis-addresses-inspire>
- Cyprus Medical Council, members register: <https://www.gov.cy/moh-cmc/en/documents/members-register/>
- ΚΔΠ 100/91, Code of Medical Ethics: <http://www.cylaw.org/KDP/data/1991_1_100.pdf>
- The Commissioner for Personal Data Protection: <https://www.dataprotection.gov.cy>
