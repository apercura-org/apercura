# Legitimate-interest assessment: Malta's pharmacy pages

> Draft of 2026-11-27 for issue #176, to be validated by the lawyer with the rest of the legal
> texts (`LEGAL_TEXTS_REVIEWED`). Not legal advice. GDPR article 6(1)(f); the privacy notice
> (`/mt/privacy`) carries its summary and the article 14 information.

## What is processed

Malta's pages list community pharmacies, not people: the pharmacies of the Medicines Authority's
register of licensed pharmacies in Malta and Gozo, published on data.gov.mt under CC BY 4.0.
Personal data can still appear in two places:

1. **A pharmacy's name** may be a person's first or family name ("Example's Pharmacy",
   "Sample Jo Pharmacy"), as the register publishes it and as the shop front shows it.
2. **A pharmacy's phone number** is the pharmacy's line as the register publishes it; a mobile
   number that reaches the owner directly can still be personal data.

Never read or stored: the register names no pharmacist, no owner and no licence holder, and no
other source is read about the pharmacies. The register's in-patient, government-entity,
medical-oxygen and parenteral-nutrition pharmacies are not listed at all.

## 1. Purpose test: is there a legitimate interest?

Telling people where Malta's licensed community pharmacies are, in one free directory without
advertising, with the official source of each fact. The Medicines Authority publishes the register
"as an official reference for healthcare professionals, regulatory authorities, and the general
public" (the dataset's description) under an open licence that allows re-use. The interest is
lawful, specific and real (people looking for a pharmacy near them, in Malta or in Gozo), and
shared by the public body that publishes the register.

## 2. Necessity test: is the processing necessary?

A pharmacy is found by its name, address, locality and phone. A pharmacy whose licensed name is a
person's name cannot be listed under another name without misleading, and its phone is how a
patient reaches it. The page prints what the register publishes, no more: no pharmacist, no
owner, no home address, no e-mail, no rating. The licence number is printed because it identifies
the pharmacy in the register.

## 3. Balancing test: do the persons' interests override it?

- **Reasonable expectations.** A pharmacy's name is on its licence, on the national register
  published on the Internet as open data, and on its shop front. Its re-use in a directory of
  licensed pharmacies is within what an owner can expect.
- **Nature of the data.** A business name and a business phone; no special-category data (GDPR
  article 9): the pages say nothing about anyone's health.
- **Impact.** Low: the same facts are on the public register and the shop front. The directory adds
  no review, no rating, no comparison and no ranking for payment.
- **Safeguards.** The article 14 information on the privacy notice; an objection form on every page
  (GDPR article 21) that hides the page at once while it is checked; correction routes; claims by
  documents; the import never restores a page removed on objection; the register is read weekly,
  so a pharmacy whose licence ends leaves the directory after two runs.

Conclusion: the interest is not overridden, for the pharmacy names and phones shown. Re-assess if
a feature would add a field naming a person (a pharmacist, a doctor), or a promotion of one
pharmacy (see the advertising rules in [`docs/data-requests/mt.md`](../data-requests/mt.md#advertising-rules)).

## Article 14 information (summary of what the privacy notice gives)

Controller and contact; the purpose and the legal basis (article 6(1)(f), the interest above); the
categories (a pharmacy's name, licence number, address, locality, postcode, phone and point); the
source (the Medicines Authority's register on data.gov.mt, named and linked); recipients (the
public); retention (while the pharmacy is on the register, then removed by the next imports); the
rights (access, rectification, erasure, restriction, objection under article 21) and the form;
the complaint to the Information and Data Protection Commissioner (Data Protection Act, Cap. 586)
or to the CNIL. Article 14(5)(b) is not relied on: the information is given on the site, where the
pages are.
