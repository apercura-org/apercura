# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Decided by the founder: Next.js (App Router) + tRPC + PostgreSQL (Drizzle), Bun monorepo with an in-house component library (Astryx with the Apercura theme, and Tailwind CSS v4). The production target is an HDS-certified host; until then production runs on an interim host in the European Economic Area, with booking data encrypted at the application level. Everything is self-hostable with Docker. Maps from OpenStreetMap data without API keys. Details in docs/architecture.md.

## Users

- Patients in France of every age, including older and low-vision people, looking for a health practitioner near them, mostly arriving from a search engine on a phone, sometimes unwell or worried. Their job: find the right practitioner and book or call within a minute.
- Practitioners (doctors, dentists, midwives and self-employed nurses first; every registered health profession next), busy and wary of platforms that charge or lock them in. Their job: make sure their public information is right and let patients book without extra work.
- Practice assistants who run the agenda on a practitioner's behalf.

## Product Purpose

Apercura publishes a free, factual public page for every registered health practitioner in France, generated from public open data (Annuaire Santé, FINESS, Ameli). Practitioners claim their page for free, complete it, and open free online booking. Success means every practitioner is findable, a claimed page is bookable within minutes, and patients book without creating an account.

## Positioning

An open, public-interest alternative to commercial booking platforms: every practitioner is listed, not only paying customers; it is free for practitioners and patients; the code is open source (AGPL-3.0); health data is encrypted at the application level, and the target is an HDS-certified host (until then production runs on an interim host in the European Economic Area); anyone can run the whole thing on their own infrastructure; there are no ratings, ads or paid ranking.

## Operating Context

- Directory data comes from the national registry of health professionals and is refreshed weekly; each page shows its source and update date.
- Practitioners work in private offices, health centers, hospitals or as locums, often in several places at once; each place has its own agenda.
- Practitioners verify their identity with Pro Santé Connect (e-CPS) or a document reviewed by a person.

## Capabilities and Constraints

- v1: directory and landing pages, search, claim and verification, page editor, online booking without patient accounts (email code), home visits for self-employed nurses (a service area of communes, a fixed travel time), agenda, team access, data export, page removal on request.
- France first; then other European markets one at a time, through a multi-country data model, in the order of the [ADR 0002 launch order](./docs/adr/0002-multi-country.md#launch-order): Austria (`/at`), Switzerland (`/ch`, `/ch-fr`, `/ch-it`, open since #154, facilities), Czechia (`/cz`), the United Kingdom (`/gb`), Spain (`/es`, open since #148), Germany (`/de`, open since #152, facilities), Estonia (`/ee`, open since #165, healthcare providers and pharmacies), Norway (`/no`, open since #172, establishments of care), Latvia (`/lv`, open since #166, GP practices and pharmacies), Ireland (`/ie`, open since #171, facilities), Cyprus (`/cy`, open since #174, pharmacies, state hospitals and health centres), Poland (`/pl`, open since #164, healthcare establishments), Finland (`/fi`, open since #173, public health service locations), Lithuania (`/lt`, open since #170, licensed institutions), Slovenia (`/si`, open since #167, personal doctors), Sweden (`/se`, open since #175, pharmacies and health centres) and Malta (`/mt`, open since #176, community pharmacies) first.
- GDPR applies. Booking data is health data: the target is an HDS-certified host (decided). Until then production runs on an interim host in the European Economic Area, which is not HDS-certified, with booking data encrypted at the application level.
- French medical deontology: factual information only, no ratings, no promotional claims.
- Legal entity and funding model: open decisions.

## Brand Commitments

- Name: Apercura.
- Public claim: "free" for practitioners and patients. Never "free forever".
- Communication pillars: free; open source; health data encrypted at the application level, hosted by an HDS-certified host once production runs on one; run it all yourself (self-hosting). Say "hosted by an HDS-certified host", never "HDS-certified", and only once production actually runs there.
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
