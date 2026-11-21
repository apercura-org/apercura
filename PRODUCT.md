# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack
Decided by the founder: Next.js (App Router) + tRPC + PostgreSQL (Drizzle), Bun monorepo with an in-house component library (React Aria Components + Tailwind CSS v4). Production runs entirely on a French HDS-certified host; everything is self-hostable with Docker. Maps from OpenStreetMap data without API keys. Details in docs/architecture.md.

## Users
- Patients in France of every age, including older and low-vision people, looking for a health practitioner near them, mostly arriving from a search engine on a phone, sometimes unwell or worried. Their job: find the right practitioner and book or call within a minute.
- Practitioners (doctors, dentists and midwives first; every registered health profession next), busy and wary of platforms that charge or lock them in. Their job: make sure their public information is right and let patients book without extra work.
- Practice assistants who run the agenda on a practitioner's behalf.

## Product Purpose
Apercura publishes a free, factual public page for every registered health practitioner in France, generated from public open data (Annuaire Santé, FINESS, Ameli). Practitioners claim their page for free, complete it, and open free online booking. Success means every practitioner is findable, a claimed page is bookable within minutes, and patients book without creating an account.

## Positioning
An open, public-interest alternative to commercial booking platforms: every practitioner is listed, not only paying customers; it is free for practitioners and patients; the code is open source (AGPL-3.0); health data is encrypted and hosted in France by an HDS-certified host; anyone can run the whole thing on their own infrastructure; there are no ratings, ads or paid ranking.

## Operating Context
- Directory data comes from the national registry of health professionals and is refreshed weekly; each page shows its source and update date.
- Practitioners work in private offices, health centers, hospitals or as locums, often in several places at once; each place has its own agenda.
- Practitioners verify their identity with Pro Santé Connect (e-CPS) or a document reviewed by a person.

## Capabilities and Constraints
- v1: directory and landing pages, search, claim and verification, page editor, online booking without patient accounts (email code), agenda, team access, data export, page removal on request.
- France first; Belgium, Switzerland and Germany later, through a multi-country data model.
- GDPR applies. Booking data is health data: production is hosted by an HDS-certified host in France (decided).
- French medical deontology: factual information only, no ratings, no promotional claims.
- Legal entity and funding model: open decisions.

## Brand Commitments
- Name: Apercura.
- Public claim: "free" for practitioners and patients. Never "free forever".
- Communication pillars: free; open source; health data hosted in France by an HDS-certified host; run it all yourself (self-hosting). Say "hosted by an HDS-certified host", never "HDS-certified", and only once production actually runs there.
- Must never look like a government service (no DSFR components, no Marianne typeface, no tricolour) and must not imitate Doctolib.

## Evidence on Hand
- Registry figures (19 Nov 2026): 401,691 doctors, 65,056 dentists, 32,436 midwives; about 311,000 have a public practice address.
- No users, testimonials, partner logos or usage figures exist yet; none may be invented.

## Product Principles
1. Every practitioner, not just customers.
2. Honest states: always say what the patient can actually do next.
3. Free and open, with no lock-in.
4. Privacy by design: minimal patient data, encrypted, purged on schedule.
5. Factual, never promotional.

## Accessibility & Inclusion
WCAG 2.2 AA and RGAA 4.1 on every surface. Patient pages are designed for older and low-vision users: large text, large targets, plain language, full keyboard and screen-reader support.
