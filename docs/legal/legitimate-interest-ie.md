# Legitimate-interest assessment: Ireland's facility pages

> Draft of 2026-11-27 for issue #171, to be validated by the lawyer with the rest of the legal
> texts (`LEGAL_TEXTS_REVIEWED`). Not legal advice. GDPR article 6(1)(f); the privacy notice
> (`/ie/privacy`) carries its summary and the article 14 information.

## What is processed

Ireland's pages list facilities, not people: retail pharmacy businesses (the PSI's register),
designated centres for older people (HIQA's register), hospitals and health centres (the HSE's
Health Atlas layers). Personal data can still appear in three places:

1. **A pharmacy's trading name** may be a person's surname or full name ("Example's Pharmacy",
   "J. Sample Pharmacy"), as the PSI publishes it.
2. **A nursing home's operator** is shown only when it is the HSE or a company with a CRO number
   whose published name names no member. An individual provider, partners "trading as", or a body
   registered "with A, B as members" are not stored: the import reads the provider's name only to
   decide, and keeps nothing of it.
3. **A facility's phone number** (HIQA's `Centre_Phone`) is the centre's line, not a person's; a
   number that reaches a sole trader directly can still be personal data.

Never read or stored: the PSI extract's `RPB Owner` (the owning company or sole trader), the
superintendent and supervising pharmacists, HIQA's person in charge and their phone, management
contacts, the provider's address and phone, the HSE's GP layer (doctors' names). No e-mail address
of any list is read.

## 1. Purpose test: is there a legitimate interest?

Telling people where the registered pharmacies, nursing homes, hospitals and health centres are,
in one free directory without advertising, with the official source of each fact. The registers
are published for that reason by statute: the PSI must publish each register "by means of— (a) the
Internet" and keep it available "without charge, to the public" (Pharmacy Act 2007, s. 13); HIQA's
registers of designated centres shall be "open to inspection by members of the public free of
charge … and (c) made available on the Internet" (Health Act 2007, s. 49(3)). The interest is
lawful, specific and real (people looking for a pharmacy or a nursing home near them), and shared
by the public bodies that publish the registers.

## 2. Necessity test: is the processing necessary?

A facility is found by its name, kind, address and phone. A pharmacy whose registered trading name
is a person's name cannot be listed under another name without misleading (the PSI's re-use
conditions ask to "reproduce the information accurately" and "not use the information in a
misleading way"). Everything else that names a person is left out (above). The page prints what
the register publishes, no more: no owner, no pharmacist, no home address, no e-mail, no rating.

## 3. Balancing test: do the persons' interests override it?

- **Reasonable expectations.** A sole trader who registers a pharmacy under their own name knows the
  name is published on the PSI's public register, on the Internet, by law, and appears on the shop
  front. Its re-use in a directory of registered pharmacies is within what they can expect.
- **Nature of the data.** A business name and a business phone; no special-category data (GDPR
  article 9): the pages say nothing about anyone's health.
- **Impact.** Low: the same facts are on the public register and the shop front. The directory adds
  no review, no rating, no comparison, no ranking for payment.
- **Safeguards.** The article 14 information on the privacy notice; an objection form on every page
  (GDPR article 21) that hides the page at once while it is checked; correction routes; claims by
  documents; the import never restores a page removed on objection; the data is refreshed weekly,
  so a pharmacy struck off the register leaves the directory.

Conclusion: the interest is not overridden, for the facility names and phones shown. Re-assess if
a feature would add a field naming a person, or a promotion of one facility (which would also
breach the PSI's condition on advertising, [`docs/data-requests/ie.md`](../data-requests/ie.md)).

## Article 14 information (summary of what the privacy notice gives)

Controller and contact; the purpose and the legal basis (article 6(1)(f), the interest above); the
categories (a facility's name, address, phone, kind, operator when a company or the HSE); the
sources (the PSI's register, HIQA's register, the HSE's layers, each named and linked); recipients
(the public); retention (while the facility is on its register, then removed by the next import);
the rights (access, rectification, erasure, restriction, objection under article 21) and the form;
the complaint to the Data Protection Commission (Data Protection Act 2018, s. 11) or to the CNIL.
Article 14(5)(b) is not relied on: the information is given on the site, where the pages are.
