# Data protection impact assessment (DPIA / AIPD)

> **DRAFT — not legal advice. To be reviewed and completed by a lawyer and the DPO before booking opens to patients.**
>
> Draft of 22 November 2026

| Item                    | Value                                                                                                            |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Service                 | Apercura: public directory of health practitioners in France, with free online booking                           |
| Publisher               | {{PUBLISHER_NAME}}, {{PUBLISHER_LEGAL_FORM}}, {{PUBLISHER_ADDRESS}}, {{PUBLISHER_REGISTRATION}}                  |
| Contact                 | {{CONTACT_EMAIL}}, {{PUBLISHER_PHONE}}                                                                           |
| Data protection officer | {{DPO_NAME}}, {{DPO_CONTACT}}                                                                                    |
| Host                    | {{HOST_NAME}}, {{HOST_ADDRESS}}, {{HOST_PHONE}}: interim EEA host, not HDS-certified (planned: Clever Cloud HDS) |
| Methodology             | CNIL PIA methodology (context, fundamental principles, risks, validation)                                        |
| Version                 | {{DPIA_VERSION}}, effective {{EFFECTIVE_DATE}}                                                                   |
| Technical basis         | Repository state of 22 November 2026; [security review](../security-review.md) (issue #31)                       |

Related documents: [records of processing](records-of-processing.md),
[processor agreement](processor-agreement-draft.md),
[DPO appointment](dpo-appointment.md).

---

## 0. Scope and why a DPIA is carried out

### 0.1 Processing operations covered

The roles differ between operations, so each one is assessed separately where it matters.

| Id  | Processing operation                                                  | Role of the publisher                                     | Health data                                            |
| --- | --------------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------ |
| P1  | Public directory built from open data (pages, search, maps, sitemaps) | Controller                                                | No                                                     |
| P2  | Online booking and agenda, on behalf of each practitioner             | Processor (each practitioner: controller)                 | Yes                                                    |
| P3  | Practitioner and team accounts, page claims and identity verification | Controller                                                | No                                                     |
| P4  | Platform administration (claim review, reports, removal requests)     | Controller                                                | No                                                     |
| P5  | Error reports and removal (objection) requests from the public        | Controller                                                | No (users are asked not to send any)                   |
| P6  | Security: audit logs, rate limiting, anti-abuse, sessions             | Controller (P1, P3–P5); processor for the part serving P2 | No (P2 audit rows reference health records by id only) |

Out of scope: third-party installations of the open-source code (each operator who self-hosts
Apercura is its own controller and must run its own DPIA, see
[self-hosting](../self-hosting.md#health-data-and-hds)); the internal controls of the host.

### 0.2 Why a DPIA is required

- **P2 (booking)**: an appointment with a named practitioner is health data (art. 4(15) and 9
  GDPR; the [self-hosting guide](../self-hosting.md#health-data-and-hds) applies the same
  reading). The service is meant to cover every registered practitioner in France and patients
  who are sometimes unwell, older or vulnerable. Article 35(3)(b) (large-scale processing of
  special categories) applies, and at least three criteria of the EDPB guidelines on DPIAs
  (WP248 rev.01) are met: sensitive data, large scale, vulnerable data subjects. The CNIL list
  of processing operations requiring a DPIA (deliberation no. 2018-327) covers health data
  processing of this kind; the exact entry relied on is **to confirm by the DPO**. The CNIL
  referential applicable to online medical appointment platforms must also be checked against
  this design (exact title and version **to confirm**).
- Under art. 35 the DPIA of P2 is formally each practitioner's duty as controller. The
  publisher, as processor, provides this analysis so that practitioners can rely on it
  (art. 28(3)(f)); each practitioner remains free to complete it.
- **P1 and P3–P6**: no health data, but large scale (about 500,000 registered practitioners)
  and identity documents (P3). The publisher assesses them here as a matter of prudence and
  because they share supporting assets with P2.
- The [security review](../security-review.md#recommendations) (recommendation 2) lists points
  the DPIA must address; they are answered one by one in [section 3.6](#36-points-required-by-the-security-review-recommendation-2).

---

## 1. Context: description of the processing

### 1.1 Overview

Apercura publishes a factual page for every registered health practitioner in France, built
from public open data (Annuaire Santé, FINESS, Ameli) refreshed weekly. Practitioners claim
their page for free, verify their identity, complete it and may open online booking. Patients
book without an account: they give their details, confirm their email address with a 6-digit
code and manage the appointment through a private link. No ratings, no advertising, no paid
ranking, no audience-measurement cookies or trackers (privacy page,
`apps/web/messages/fr.json`, `PrivacyPage.sections.cookies`). The code is open source
(AGPL-3.0).

Booking is behind a feature flag (`FEATURE_BOOKING`, default `false`,
[configuration](../configuration.md)): until the HDS hosting contract is signed, production
runs in directory-only mode, without health data
([deploy-clever-cloud](../deploy-clever-cloud.md#before-anything-the-hds-contract)).

### 1.2 Purposes

| Id  | Purposes                                                                                                                                                                               |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | Inform the public about who practises where (name, profession, specialties, places, published phones, billing sector), help patients find a practitioner, link to booking where opened |
| P2  | Let patients book, confirm, reschedule and cancel appointments; let the practice manage its agenda; send the related emails, codes and reminders; feed the practice's own calendar app |
| P3  | Create and secure practitioner and team accounts; verify that a claimant is the practitioner of the page; let owners edit their page and manage their team                             |
| P4  | Review claims, reports and removal requests                                                                                                                                            |
| P5  | Correct directory errors; handle objections under art. 21                                                                                                                              |
| P6  | Protect the service and the data (traceability of access to encrypted data, abuse prevention, account security)                                                                        |

No profiling, no automated decision with legal or similarly significant effects, no
advertising, no resale of data.

### 1.3 Data subjects

| Category                                                  | Operations            | Volume (order of magnitude)                                                                                                                                       |
| --------------------------------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Registered health practitioners                           | P1, P5                | Registry figures of 19 Nov 2026 ([PRODUCT.md](../../PRODUCT.md)): 401,691 doctors, 65,056 dentists, 32,436 midwives; about 311,000 with a public practice address |
| Practitioners and assistants with an account              | P2 (as users), P3, P6 | Not known yet (no users at the date of this draft)                                                                                                                |
| Patients                                                  | P2                    | Not known yet; potentially large (national scope)                                                                                                                 |
| Platform administrators                                   | P4, P6                | A few people                                                                                                                                                      |
| Members of the public sending reports or removal requests | P5                    | Not known yet                                                                                                                                                     |
| Visitors of the public site                               | P1, P6                | Not known yet                                                                                                                                                     |

### 1.4 Personal data processed

**P1 — Directory** (`packages/db/src/schema/directory.ts`, import in `packages/etl`,
[data import](../data-import.md)):

- From the registries: RPPS number and PSC identifier (`8` + RPPS), civility and title codes,
  first and last names, profession, specialties, competences and diplomas, places of practice
  (structure name, address, geocoded position), published phone numbers, Ameli billing sector,
  OPTAM, Carte Vitale. The registry email and fax of a place are also stored (`sites.email`,
  `sites.fax`); the email serves the registry-email claim method, and neither appears to be
  shown on public pages (**to confirm**).
- Added by the owner of a claimed page (`practitioner_profiles`): photo (re-encoded WebP without
  metadata under a random key), headline, biography, languages, fees, payment methods,
  accessibility of the place, website, expertises, fields hidden from the public page.
- Computed: slug, indexability, next free slot (when booking is open), status (active, removed,
  suppressed, withheld during an objection).

**P2 — Booking** (`packages/db/src/schema/care.ts`, `apps/web/src/server/booking`,
`apps/web/src/server/phi`, input schema in `apps/web/src/trpc/routers/booking.ts`):

| Data                                                                                                                                     | Storage                                                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Patient first name, last name (100 characters max each)                                                                                  | Encrypted (`patient_first_name_enc`, `patient_last_name_enc`)                                                            |
| Patient email address                                                                                                                    | Encrypted (`patient_email_enc`) and blind index (`email_bidx`)                                                           |
| Patient phone number (asked unless the calendar turns it off, `requirePhone` default `true`)                                             | Encrypted (`patient_phone_enc`) and blind index (`phone_bidx`)                                                           |
| Answer to "first visit?" (when asked, `askFirstVisit` default `true`)                                                                    | Plaintext boolean (`patient_is_new`)                                                                                     |
| Locale of the patient's emails                                                                                                           | Plaintext (`patient_locale`)                                                                                             |
| Appointment: practitioner, place, start and end, status, reason ("motif": the practice's own appointment-type name, e.g. "Consultation") | Plaintext (`type_name`, times, status): needed by the practice; never in patient emails                                  |
| Message of the practice attached to a cancellation                                                                                       | Encrypted (`practice_message_enc`)                                                                                       |
| Email verification time, reminder sent, "patient unreachable" flag                                                                       | Plaintext timestamps                                                                                                     |
| One-time codes                                                                                                                           | HMAC of the code and salt; encrypted copy until sent (`care.otp_challenges`)                                             |
| Manage, hold and browser tokens                                                                                                          | SHA-256 hashes only; the manage token is an HMAC of the id and a nonce, re-derived per email (`care.ts`, `phi/index.ts`) |
| Transition history                                                                                                                       | `care.appointment_events`: actor, event, statuses, non-identifying details                                               |
| Access log                                                                                                                               | `care.audit_events`: actor, user id, action, purpose, record ids, fields, request id, keyed hash of the IP               |

Not collected: date of birth, social security number, address of the patient, free-text reason
or symptoms from the patient, documents, payment data. No patient account.

**P3 — Accounts and claims** (`packages/db/src/schema/auth.ts`, `claims.ts`):

- Account: name, email, email verified, locale, password hash, TOTP secret and backup codes,
  passkeys, Pro Santé Connect link (`SubjectNameID`, given and family name; the profile email is
  replaced by a placeholder, `apps/web/src/server/auth/psc.ts`), sessions (IP address
  truncated to its IPv4 /24 or IPv6 /48 network, user agent, second-factor method and time), memberships and roles (owner, practitioner, assistant),
  invitations (email).
- Claim: target RPPS, status, contest flag, decision, reason, deciding administrator; checks
  (`psc`, `registry_email`, `document`, `phone_callback`) with hashed secrets and non-secret
  facts (masked email, PSC identifier matched, site called).
- Identity documents: photo or scan of the CPS card or of the Ordre registration certificate,
  encrypted before storage in a private bucket (`claim_documents`, `apps/web/src/server/claims`).

**P4 — Administration**: the administrators' accounts (as P3) and the platform audit log
(`directory.platform_audit_events`: actor, action, subject, keyed hash of the IP).

**P5 — Reports and removal requests** (`claims.ts`, `apps/web/src/server/gdpr/service.ts`):
report kind (wrong information, retired, deceased, impersonation), free-text message and
optional contact email (encrypted together, `content_enc`); removal request: target page,
contact email (encrypted, required), optional message (encrypted), locale, decision. Once
confirmed, the RPPS is kept in `directory.suppressions` so the import never brings the page back.

**P6 — Security**: rate-limit counters keyed by an HMAC-SHA256 of the client IP or of the email
address (`directory.rate_limits`, `apps/web/src/server/rate-limit-key.ts`); Better Auth's own
per-IP counters, keyed the same way (`directory.auth_rate_limit`,
`apps/web/src/server/auth/rate-limit-storage.ts`); keyed hashes of IPs in both audit logs; server
logs without request inputs (`apps/web/src/trpc/error-redaction.ts`) and SMTP error summaries
without reply text (`apps/web/src/server/mail/error-summary.ts`).

Note: Better Auth builds its rate-limit keys as `{ip}|{path}`; our storage replaces the address
with its HMAC-SHA256 before writing (`auth:{hash}|{path}`), and migration 0017 deleted the rows
stored before with raw addresses (action A-12, done in #66). `directory.session.ip_address` holds only the network of the address (IPv4 /24,
IPv6 /48, `apps/web/src/server/auth/client-ip.ts`, rows stored before truncated by migration
0016), and the read-only role reads neither it nor the user agent.

### 1.5 Recipients

| Recipient                                                                      | Data                                                                                              | Operations |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- | ---------- |
| The public, search engines                                                     | Public directory pages (registry facts, owner content not hidden)                                 | P1         |
| Members of the practice (owner, practitioners, assistants, with second factor) | Their organization's agenda, decrypted on screen; every decryption audited                        | P2         |
| Owner of the practice                                                          | Access log of patient data (`care.audit_events`)                                                  | P2, P6     |
| The patient                                                                    | Their own appointment through the manage link and emails                                          | P2         |
| Platform administrators (second factor)                                        | Claims, claim documents, reports, removal requests (every decryption audited); never patient data | P3, P4, P5 |
| Host {{HOST_NAME}} (processor / sub-processor)                                 | Everything stored, in encrypted form for patient fields and documents                             | All        |
| SMTP provider {{SMTP_PROVIDER}} (processor / sub-processor)                    | Email content (see 3.6.1)                                                                         | P2, P3, P5 |
| Patients' and practitioners' mailbox providers                                 | Emails received                                                                                   | P2, P3, P5 |
| Calendar provider chosen by the practice (e.g. Google, Apple)                  | Calendar feed content, read from a bearer URL                                                     | P2         |
| Map tile server (default OpenFreeMap)                                          | Visitors' IP addresses and the map area viewed                                                    | P1         |
| Agence du numérique en santé (Pro Santé Connect)                               | Authentication of practitioners who choose it                                                     | P3         |
| Competent authorities                                                          | On a lawful request                                                                               | All        |

### 1.6 Retention

| Data                                                                                                      | Retention                                                                                                                                              | Source                                                                                                                                        |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Patient identity, contact, practice message, blind indexes, token hashes                                  | End of the appointment + the calendar's retention: **90 days by default, configurable 30 to 365**                                                      | `care.ts` (`retentionDays`, check `between 30 and 365`); `booking/verify.ts`, `booking/agenda.ts` (`purgeAfter`); `booking/jobs.ts` (`purge`) |
| Details of an online booking never verified by code                                                       | 24 hours after creation                                                                                                                                | `booking/jobs.ts` (`UNVERIFIED_RETENTION_MS`)                                                                                                 |
| One-time codes                                                                                            | Valid 30 minutes; encrypted copy erased once sent; row deleted 24 hours after expiry                                                                   | `booking/config.ts` (`codeValidityMs`), `care.ts`, `booking/jobs.ts`                                                                          |
| Outbox rows (identifiers only)                                                                            | 30 days after processing                                                                                                                               | `booking/jobs.ts` (`OUTBOX_RETENTION_MS`)                                                                                                     |
| Purged appointment rows (times, status, reason, first-visit answer, locale, no identity) and their events | No limit defined (kept for the agenda's history)                                                                                                       | `booking/jobs.ts` comment; **to define**                                                                                                      |
| Access log `care.audit_events`                                                                            | One year (`AUDIT_LOG_RETENTION_MONTHS`, 6 to 60), then deleted by `jobs:tick audit-log`                                                                | `care.purge_audit_events()` (migration 0016), `server/retention.ts`                                                                           |
| Platform audit log                                                                                        | One year, same purge                                                                                                                                   | `care.purge_audit_events()`, `server/retention.ts`                                                                                            |
| Claim identity documents                                                                                  | Deleted 30 days after the decision (or with the account)                                                                                               | `claims/service.ts` (`DOCUMENT_RETENTION_DAYS = 30`, `purgeClaimDocuments`); `account/service.ts`                                             |
| Booking data of a closed practice (account deleted, practice closed)                                      | Upcoming appointments cancelled and patients emailed at once; every booking row, then the data keys, deleted once the emails are out, 24 hours at most | `booking/closure.ts`, `jobs:tick closures`                                                                                                    |
| Claims and checks                                                                                         | Until the account is deleted (cascade)                                                                                                                 | `claims.ts`, `account/service.ts`                                                                                                             |
| Accounts                                                                                                  | Until deleted by the user; no inactivity rule                                                                                                          | `account/service.ts`; **to define**                                                                                                           |
| Sessions                                                                                                  | 12 hours idle, 7 days absolute; truncated IP; deletion of expired rows by Better Auth **to confirm**                                                   | `auth/index.ts`, `auth/policy.ts` (`SESSION_MAX_AGE_MS`), `auth/client-ip.ts`                                                                 |
| Rate-limit counters                                                                                       | Windows of a minute to a day; each row deleted once its window has elapsed, by `jobs:tick rate-limits` (every 5 minutes)                               | `server/rate-limit.ts` (`purgeExpiredRateLimits`), `auth/rate-limit-storage.ts`                                                               |
| Error reports, removal requests                                                                           | Reports: 6 months after resolution or dismissal; removal requests: one year after the decision (configurable); open ones until handled                 | `server/retention.ts` (`purgeClosedRequests`), `jobs:tick requests`                                                                           |
| Suppressions (RPPS of a page removed on objection)                                                        | As long as the directory is published (needed to honour the objection)                                                                                 | `directory.ts` (`suppressions`)                                                                                                               |
| Directory records                                                                                         | While present in the source; an unclaimed practitioner absent from two consecutive imports is marked `removed`                                         | [data import](../data-import.md); retention of removed rows **to confirm**                                                                    |
| Database backups (planned host)                                                                           | Daily backup kept 7 days; point-in-time recovery to be requested (retention **to confirm**)                                                            | [deploy-clever-cloud](../deploy-clever-cloud.md#2-database)                                                                                   |
| Host logs                                                                                                 | **To confirm** with the host                                                                                                                           | —                                                                                                                                             |
| Copies held by third parties (mailboxes, calendar apps)                                                   | Outside the publisher's control; the calendar feed covers the last 30 and next 120 days                                                                | `booking/ics-feed.ts`                                                                                                                         |

### 1.7 Supporting assets

| Asset                | Description                                                                                                                                        | Reference                                                                            |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Web application      | Next.js App Router, tRPC, route handlers, proxy; Node.js & Bun runtime on {{HOST_NAME}}                                                            | `apps/web`, `clevercloud/`                                                           |
| Database             | PostgreSQL 17 + PostGIS, dedicated add-on, schemas `directory` and `care`; roles `apercura_app`, `apercura_etl`, `apercura_readonly`               | `packages/db`, `packages/db/drizzle/0004_database_roles.sql`, `0010_care_grants.sql` |
| Object storage       | S3-compatible private bucket (Cellar planned): photos, encrypted claim documents                                                                   | `apps/web/src/server/storage`                                                        |
| Scheduled jobs       | `jobs:tick` every 5 minutes: expirations, reminders, outbox, next free slot, purges                                                                | `apps/web/src/server/booking/jobs.ts`, `clevercloud/cron.json`                       |
| Import task          | Weekly open data import, `apercura_etl` role, no access to `care`, accounts or claims                                                              | `packages/etl`, [data import](../data-import.md)                                     |
| Keys                 | `ENCRYPTION_KEYS`, `ENCRYPTION_ACTIVE_KEY`, `BLIND_INDEX_KEY`, `BETTER_AUTH_SECRET`, `RATE_LIMIT_KEY`, `ALTCHA_HMAC_KEY` in the host's environment | [configuration](../configuration.md)                                                 |
| Backups              | Host database backups; object storage copies **to confirm**                                                                                        | [deploy-clever-cloud](../deploy-clever-cloud.md#2-database)                          |
| Outgoing email       | SMTP provider {{SMTP_PROVIDER}} (a European provider is required by the deployment guide), SPF, DKIM, DMARC                                        | `apps/web/src/server/mail`                                                           |
| Browsers and devices | Patients, practitioners, administrators, visitors                                                                                                  | —                                                                                    |
| External services    | Pro Santé Connect (ANS); map tile server; calendar apps; open data sources and the IGN geocoder during import                                      | `apps/web/src/server/auth/psc.ts`, `packages/ui/src/map`                             |

### 1.8 Data flows

1. **Import (P1)**: Annuaire Santé, FINESS and Ameli files (Licence Ouverte 2.0) and
   geo.api.gouv.fr are downloaded over HTTPS by the import task; practice addresses are sent to
   the IGN Géoplateforme geocoder during the import only. Results go into `directory.*` through
   `apercura_etl`, which cannot write practitioner-owned columns.
2. **Public pages (P1)**: the visitor's browser loads pages from the app. When a map scrolls into
   view (`packages/ui/src/map/map-view.tsx`), the browser fetches the style, tiles, glyphs and
   sprites from the map style's origin (`NEXT_PUBLIC_MAP_STYLE_URL`, default OpenFreeMap), the
   only third-party origin allowed by the Content-Security-Policy.
3. **Booking (P2)**: the browser solves a self-hosted ALTCHA proof of work
   (`booking/proof.ts`), then posts the patient's details with the hold (same-origin checked).
   `server/phi` encrypts them with the organization's data key and stores them in
   `care.appointments`. An outbox row (identifiers only) leads the job to decrypt the email
   address and code, audit the read and hand the message to the SMTP provider, which delivers
   it to the patient's mailbox. After the code is verified, confirmation, reminder and change
   emails follow the same path; some carry an `.ics` invitation.
4. **Agenda (P2)**: members with a second factor list the agenda; each list decrypts patient
   fields and writes an audit row first. The practice's calendar app (Google, Apple…) polls a
   private feed URL (`/api/ics/{token}`) from its own servers.
5. **Claims (P3, P4)**: the claimant proves identity with Pro Santé Connect (redirect to the
   ANS), a link sent to the email published in the registry, a document upload (encrypted, then
   stored in the bucket) or a phone callback to the registry-listed place; an administrator
   reviews documents (decryption audited) and decides; documents are deleted 30 days later.
6. **Reports and removals (P5)**: the public form posts the message and contact, encrypted
   with the platform key; an administrator decrypts (audited) and decides; the requester gets
   an email.
7. **Account export and deletion (P3)**: JSON download behind a second factor
   (`/api/pro/account-export`), deletion from the security settings.
8. **Backups**: the host's database backups contain the same ciphertexts; keys are not in the
   backups.

### 1.9 Applicable references

GDPR (in particular art. 5, 6, 9, 12–22, 24, 25, 28, 30, 32–39); French Data Protection Act
(loi no. 78-17); Code de la santé publique art. L.1110-4 (medical secrecy) and L.1111-8 (HDS
hosting); HDS certification referential; CNIL PIA guides; CNIL list of processing requiring a
DPIA; CNIL referential on appointment platforms (**to confirm**); Licence Ouverte 2.0 for the
data sources; professional codes of ethics (factual information, no advertising).

---

## 2. Fundamental principles

### 2.1 Purposes

The purposes in [1.2](#12-purposes) are specified and limited. Booking data is used only for
the appointment (booking panel text: "Vos coordonnées sont chiffrées, servent uniquement à ce
rendez-vous et sont effacées automatiquement après", `booking.panel.details.privacy`). The
publisher does not reuse patient data for its own purposes; processing it needs for security
(rate limits on email blind indexes, access logs) serves the controller's service and is
described in the [processor agreement](processor-agreement-draft.md).

### 2.2 Legal bases (proposals to be validated by the lawyer)

| Id  | Legal basis (art. 6)                                                                                                      | Condition for special categories (art. 9)                                         |
| --- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| P1  | Legitimate interest (6(1)(f)): informing the public from public data; balancing test below                                | Not applicable                                                                    |
| P2  | Determined by each practitioner as controller; likely 6(1)(b) (steps at the patient's request before care) **to confirm** | Likely 9(2)(h) with 9(3) (care by a professional bound by secrecy) **to confirm** |
| P3  | Contract (6(1)(b)) for accounts; legitimate interest (6(1)(f)) for identity verification and preventing impersonation     | Not applicable                                                                    |
| P4  | Legitimate interest (6(1)(f)); legal obligation (6(1)(c)) where it serves the handling of objections                      | Not applicable                                                                    |
| P5  | Legal obligation (6(1)(c), art. 12 and 21) for objections; legitimate interest (6(1)(f)) for error reports                | Not applicable                                                                    |
| P6  | Legal obligation (6(1)(c), art. 32) and legitimate interest (6(1)(f)) in securing the service                             | Not applicable                                                                    |

**Balancing test for P1** (summary, to be completed): the data is already published by public
bodies under an open licence for reuse; practitioners exercise a regulated profession and the
public has a strong interest in finding them; the pages are factual and neutral (no ratings,
reviews or paid ranking); only practitioners with an activity open to patients at an address
get a public page (`DataPage.rules`); the objection is effective (see 2.7). Residual concerns:
indexing by search engines widens exposure; published phone numbers may be personal lines
(the import marks switchboard numbers shared by many practitioners, [data import](../data-import.md)).

### 2.3 Data minimisation

- **P2**: only names, email, phone (can be turned off per calendar) and the first-visit answer
  (can be turned off) are asked. No date of birth, no free-text reason, no patient account.
  The reason ("motif") is the practice's own appointment-type name, chosen from presets or
  typed by the practice: a type name can itself reveal health information (for example a
  pregnancy follow-up). Action A-9: guidance in the agenda settings to keep type names
  generic.
- **Emails** carry no specialty and no reason (`booking/mail-content.tsx`): the patient email
  holds the practitioner's name, date, time, address and the manage link; the code email holds
  the code. Practice notifications carry date, time and address only, never patient data, and
  go to owners and practitioners, never assistants.
- **Calendar feed**: initials and reason by default; full names only if the owner turns them
  on (`calendars.ics_full_names`, default `false`).
- **P3**: Pro Santé Connect's email is not used; claim documents are limited to two kinds
  (CPS card, Ordre certificate) and deleted 30 days after the decision.
- **P5**: the contact email of a report is optional; the forms say "N'indiquez aucune
  information de santé".
- **P6**: rate limits (Better Auth's included) and audit rows hold keyed hashes of IPs and
  emails, not raw values; sessions hold the network of the address only.

### 2.4 Accuracy

Directory pages show their source and update date and are refreshed weekly; corrections are
made at the source (Ordre, Ameli, FINESS) and appear at the next import; claimed pages are
completed by the practitioner; anyone can report an error. Booking: the patient's email is
proven by code before an online booking counts; the patient can change their details before
verifying.

### 2.5 Storage limitation

See [1.6](#16-retention). Strong points: automatic purge of patient data with an audited
`purge` action; unverified details erased after 24 hours; claim documents deleted 30 days
after the decision; both audit logs deleted after a year; reports and removal requests deleted
6 and 12 months after they are closed; booking data of a closed practice deleted within a day;
rate-limit counters deleted once their window has elapsed.
Gaps: de-identified appointment rows, inactive accounts and backups beyond the
host's default (actions A-4 and A-6).

### 2.6 Information of data subjects

- **Practitioners (P1, art. 14)**: individual information would involve a disproportionate
  effort for about 500,000 people (art. 14(5)(b)). Public measures: the privacy page
  (`/confidentialite`), the data and sources page (`/donnees`, sources, licences, dates, how to
  correct, how to object), and on every practitioner page a notice that the page is built from
  the public registry, with links to report an error and to object
  (`PractitionerPage.claim`, `PractitionerPage.report`). The art. 14(5)(b) choice and these
  measures must be documented in the records (done in
  [records of processing](records-of-processing.md)).
- **Patients (P2, art. 13)**: information is owed by each practitioner. The booking panel shows
  a short notice only. Action A-8: an art. 13 notice on the booking form and in the
  confirmation email, naming the practitioner as controller and the publisher as processor,
  with purposes, retention, rights and contacts (template provided by the publisher).
- **Account holders (P3)**: privacy page and the practitioner terms (draft).
- **Requesters (P5)**: the forms state the use of their email ("Il est chiffré et ne sert à
  rien d'autre").

### 2.7 Data subject rights

| Right                   | P1 directory                                                                                                                                                                                                                                                                                             | P2 booking                                                                                                                                                      | P3 accounts                                                                                                                          |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Access, portability     | On request to {{CONTACT_EMAIL}} / {{DPO_CONTACT}}                                                                                                                                                                                                                                                        | Addressed to the practitioner; members see the agenda. No per-patient export tool (A-10)                                                                        | JSON export (`/api/pro/account-export`, `account/service.ts`, second factor)                                                         |
| Rectification           | At the source (registries); the owner of a claimed page edits it; error report form                                                                                                                                                                                                                      | Patient changes details before verification; afterwards the practice cancels and recreates the entry (no edit of patient details in the agenda, **to confirm**) | Account settings                                                                                                                     |
| Erasure                 | Through the objection flow                                                                                                                                                                                                                                                                               | Automatic at retention; cancellation by the patient. No early erasure tool (A-10)                                                                               | Account deletion (`deleteAccount`): sessions, sign-in methods, memberships, claims and documents; the page returns to registry facts |
| **Objection (art. 21)** | `/donnees#retrait`: an unclaimed page is withheld at once (not shown, indexed or listed), then suppressed after a light check by an administrator; a claimed page is removed by its owner from the editor; a suppressed page never returns with the import (`gdpr/service.ts`, `directory.suppressions`) | Not applicable to the basis likely chosen (to confirm)                                                                                                          | —                                                                                                                                    |
| Restriction             | On request                                                                                                                                                                                                                                                                                               | On request to the practitioner, with the publisher's assistance                                                                                                 | On request                                                                                                                           |
| Complaint               | CNIL link on the privacy page                                                                                                                                                                                                                                                                            | Same                                                                                                                                                            | Same                                                                                                                                 |

Abuse of the objection flow (someone hiding another practitioner's page) is a known risk:
the page is withheld at once and restored if the request is rejected; the requester must give
an email and tick "Je suis le praticien de cette page"; 5 requests per hour per client
(`trpc/routers/gdpr.ts`, `PUBLIC_FORM_LIMIT`). See risk R-M4.

### 2.8 Processors and sub-processors (art. 28)

| Processor                                                | Role                                                                | Status                                                                                 |
| -------------------------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| {{HOST_NAME}} (current interim host)                     | Hosting of app, database, storage, jobs, backups, in the EEA        | Interim host, **not HDS-certified**; booking stays off until an HDS contract is signed |
| Planned HDS host (Clever Cloud)                          | Hosting of app, database, storage, jobs, backups, in the HDS region | HDS contract **planned, not signed**                                                   |
| {{SMTP_PROVIDER}}                                        | Outgoing email                                                      | **To choose** (European provider); DPA to sign                                         |
| Alternative host (Scalingo, HDS region `osc-secnum-fr1`) | Fallback only                                                       | Not used ([deploy-scalingo](../deploy-scalingo.md))                                    |

The Agence du numérique en santé (Pro Santé Connect), the map tile server, the calendar
providers and the mailbox providers are not processors of the publisher; their position
(independent controllers or third parties chosen by the user) is **to confirm by the lawyer**.

### 2.9 Transfers outside the EEA

None by design: production runs on an interim host in the EEA, the planned HDS host (Clever
Cloud, HDS region) is in the EEA too, and the SMTP provider must be European. Residual third
parties, outside the publisher's perimeter:

- the **SMTP provider** and the **patient's mailbox provider** (which may be outside the EEA,
  for example a US-based webmail chosen by the patient);
- the **calendar-feed reader**: Google or Apple servers fetch the bearer URL chosen by the
  practice and keep copies;
- the **map tile server** (OpenFreeMap by default) receives visitors' IP addresses when maps
  load; its hosting location is **to confirm**; self-hosting tiles is possible through
  `NEXT_PUBLIC_MAP_STYLE_URL`;
- **Pro Santé Connect** (ANS, France) for practitioners who sign in with it.

---

## 3. Risks to data subjects

### 3.1 Method and scales

Scales of the CNIL methodology. **Severity**: 1 Negligible, 2 Limited, 3 Significant,
4 Maximum. **Likelihood**: 1 Negligible, 2 Limited, 3 Significant, 4 Maximum. Every level
below is **a proposal to be validated** by the DPO and the controller(s); it is assessed with
the existing measures, and with the planned measures where stated.

### 3.2 Sources of risk

| Source                                 | Examples                                                                                      |
| -------------------------------------- | --------------------------------------------------------------------------------------------- |
| External attackers and bots            | Credential stuffing, injection, scraping, slot holding, email flooding                        |
| Impostors                              | Person claiming a practitioner's page or using the objection flow against someone else        |
| Members of a practice                  | Curious or former assistant, shared computer, lost phone                                      |
| Platform administrators                | Excessive reading of claim documents or messages                                              |
| Operator and host staff                | Access to the database, environment variables (keys), backups, logs                           |
| Third parties receiving data by design | SMTP provider, mailbox providers, calendar providers, map tile server                         |
| Non-human sources                      | Bugs, misconfiguration (`TRUSTED_PROXY_COUNT`, unset keys), failure of the host, loss of keys |

### 3.3 Illegitimate access to data

**Threats**: theft of a session or account of a practice member; database dump through an
injection or the read-only role; leak of keys from the environment; access by host staff;
interception or reading of emails; reading of the calendar feed URL; access to claim documents
by an impostor or an over-curious administrator; IDOR between organizations or claimants;
leaks through logs, errors, URLs or the outbox.

**Potential impacts**: disclosure that a person consulted a given practitioner (which can
reveal a condition, for example psychiatry, addiction, sexual or reproductive health),
discrimination, embarrassment, phishing using real appointment details; identity theft with a
CPS card image; harassment of practitioners.

**Existing measures** (from the code and the [security review](../security-review.md)):

| Measure                                                                                                                                                                                                                | Reference                                                                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Application-level encryption of patient fields, AES-256-GCM with a data key per organization, AAD `table.column.rowId`, data keys wrapped by master keys                                                               | `packages/core/src/crypto/envelope.ts`, `care.organization_keys`, `server/phi/index.ts`                                                    |
| Single decryption path: only `server/phi` decrypts patient data, and inserts the audit row in the same transaction first; enforced by a Biome rule and a boundary test                                                 | `server/phi/index.ts`, `server/phi/boundary.test.ts`, `biome.json`                                                                         |
| Blind indexes keyed per organization (HKDF), so a patient cannot be linked across practices                                                                                                                            | `packages/core/src/crypto/blind-index.ts`                                                                                                  |
| Second factor (TOTP, backup code, passkey with user verification, or Pro Santé Connect) required wherever patient data is reachable; checked in every procedure and route handler; sessions 12 h idle, 7 days absolute | `server/auth/index.ts`, `server/auth/policy.ts`, `trpc/procedure-access.test.ts`                                                           |
| Authorization from the database on each call; agenda queries scoped by organization; roles owner / practitioner / assistant                                                                                            | `server/auth/access.ts`, `server/auth/membership.ts`                                                                                       |
| Database roles: `apercura_app` (app), `apercura_etl` (import, no access to `care`, accounts or claims), `apercura_readonly` (no secret columns); nothing granted to `PUBLIC`                                           | `packages/db/drizzle/0004_database_roles.sql`, `0006_auth_grants.sql`, `0010_care_grants.sql`, `server/database-roles.integration.test.ts` |
| Manage token: 256-bit, only its hash stored, in the URL fragment and POST bodies, never in a GET query; `/rdv` with `no-referrer` and `noindex`                                                                        | `trpc/routers/booking.ts`, `care.ts`, [public site](../public-site.md)                                                                     |
| Minimal email content; outbox rows hold identifiers only; SMTP errors stored without reply text                                                                                                                        | `booking/mail-content.tsx`, `care.outbox`, `mail/error-summary.ts`                                                                         |
| Calendar feed: 256-bit bearer token (hash stored), initials by default, 60 reads per hour per token, revoked when a practice changes hands                                                                             | `booking/ics-feed.ts`, `booking/feeds.ts`, `booking/config.ts`                                                                             |
| Claim documents: sniffed by magic bytes, encrypted with the platform key before storage, private bucket, served on demand with `nosniff` and a sandbox policy; every decryption written to `platform_audit_events`     | `server/claims/service.ts`, `server/crypto/platform.ts`, `server/audit.ts`                                                                 |
| Administrators: promoted in the database only, second factor, no organization, no access to patient data                                                                                                               | [configuration](../configuration.md#platform-administrators)                                                                               |
| Web hardening: CSP with nonces, HSTS, `nosniff`, frame denial, same-origin checks on writes, body caps, error redaction, Host checks                                                                                   | `lib/security-headers.ts`, `server/http/same-origin.ts`, `server/http/body.ts`, `trpc/error-redaction.ts`                                  |
| Rate limits on every public form and auth endpoint, keyed by HMAC of IP (`RATE_LIMIT_KEY`) or of the email                                                                                                             | `server/rate-limit-key.ts`, `booking/config.ts`, `server/auth/policy.ts`                                                                   |
| Retention applied by the jobs: both access logs after one year through a `SECURITY DEFINER` function only `apercura_jobs` may call (the app stays append-only); reports and removal requests after closure             | `care.purge_audit_events()` (migration 0016), `server/retention.ts`, `server/retention.integration.test.ts`                                |
| Session IPs truncated (IPv4 /24, IPv6 /48); the read-only role reads neither address nor user agent                                                                                                                    | `server/auth/client-ip.ts`, migration 0016, `server/database-roles.integration.test.ts`                                                    |
| Outgoing mail over TLS only in production: `smtps://`, or `smtp://` with STARTTLS required, certificate verified; start-up refused otherwise                                                                           | `server/mail/smtp-options.ts`, `server/mail/smtp-check.ts`                                                                                 |
| Closing a practice: upcoming appointments cancelled with patient email, feeds revoked, team removed at once; booking data, then keys, then the organization deleted; audit rows kept                                   | `server/booking/closure.ts`, `server/booking/closure.integration.test.ts`                                                                  |
| Key rotation: re-wraps data keys and re-encrypts platform-key data                                                                                                                                                     | `server/keys/rotation.ts`, [self-hosting](../self-hosting.md#key-rotation)                                                                 |
| Image runs as `node`, holds no secret; private bucket with a key limited to it                                                                                                                                         | `docker/`, security review                                                                                                                 |

**Planned measures**: HDS hosting under contract, keys in the host's secret manager with
restricted access (A-1); external penetration test (A-2); review of the platform audit log
(A-7); art. 13 notice (A-8).

| Processing           | Severity (proposal)                                             | Likelihood (proposal) | Rationale                                                                                                                                |
| -------------------- | --------------------------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| P2 booking           | 3 Significant (4 Maximum for sensitive specialties)             | 2 Limited             | Health-related and identifying; encryption, second factor and audit make a mass leak hard; emails and feeds remain outside the perimeter |
| P3 claim documents   | 3 Significant                                                   | 2 Limited             | Identity document images; encrypted, short retention, audited access by few people                                                       |
| P3 accounts          | 2 Limited (on their own; account takeover leads to the P2 risk) | 2 Limited             | Password hashing, second factor, rate limits                                                                                             |
| P1 directory         | 1 Negligible                                                    | —                     | Data is public by nature                                                                                                                 |
| P5 reports, removals | 2 Limited                                                       | 2 Limited             | Contact emails and free text, encrypted, read by administrators only                                                                     |
| P6 logs              | 1 Negligible to 2 Limited                                       | 2 Limited             | Keyed hashes (Better Auth's rate limits included, A-12), truncated session IPs, one-year retention                                       |

### 3.4 Unwanted modification of data

**Threats**: an impostor claims a page and changes its content or opens booking in a
practitioner's name; a former owner keeps access after a contested claim; cancellation or
rescheduling by someone holding a manage link; bots holding slots; defacement through the
import or owner text (XSS); tampering with the audit log; replayed revalidation requests.

**Potential impacts**: patients misled about a practitioner (wrong address or phone), missed
or delayed care, appointments booked with an impostor; loss of trust; practitioner
reputational harm.

**Existing measures**: verification methods (Pro Santé Connect, registry email, documents
reviewed by a person, phone callback), with booking opening 7 days after a verification
without Pro Santé Connect (`claims.ts`, `bookingOpensAt`); contested claims freeze the losing
account and revoke its feeds (`claims/service.ts`, `booking/feeds.ts`); one verified owner per
page (unique index); plain-text rendering of every owner and registry field, JSON-LD escaping;
the import cannot write practitioner-owned columns and has circuit breakers
([data import](../data-import.md)); append-only audit logs for the app role
(`0010_care_grants.sql`); overlap constraint on appointments (`0009_care_constraints.sql`);
ALTCHA proof of work burnt once used, holds and codes limited per IP and per email, 5 code
attempts per hold (`booking/config.ts`, `booking/proof.ts`); HMAC-signed revalidation with
replay protection; manage links revoked by a new nonce.

| Processing                      | Severity (proposal) | Likelihood (proposal)                        | Rationale                                                              |
| ------------------------------- | ------------------- | -------------------------------------------- | ---------------------------------------------------------------------- |
| P2 booking                      | 3 Significant       | 2 Limited                                    | Missed care is possible; integrity controls and limits are in place    |
| P1/P3 page takeover by impostor | 3 Significant       | 2 Limited                                    | Several verification methods, human review, delay before booking opens |
| P1 directory data (import)      | 2 Limited           | 2 Limited                                    | Errors come from sources; weekly correction; circuit breakers          |
| P5 abusive objection (R-M4)     | 2 Limited           | 3 Significant before review, 2 Limited after | Page hidden at once on a simple request; restored on rejection         |

### 3.5 Disappearance of data

**Threats**: host failure, deletion by error, ransomware on an operator's machine, loss of
the master keys or of `BLIND_INDEX_KEY` (encrypted data becomes unreadable), failed migration,
purge bug, SMTP outage (codes and confirmations not delivered).

**Potential impacts**: patients not knowing their appointment, practices losing their agenda,
practitioners losing their page content.

**Existing measures**: host backups (daily, kept 7 days, on the planned host); point-in-time
recovery to request; restore to be tested before booking opens
([deploy-clever-cloud](../deploy-clever-cloud.md#2-database)); purge jobs under advisory
locks, idempotent; outbox with retries and an "unreachable patient" flag so the practice calls
the patient (`care.appointments.patient_unreachable_at`); the directory can be rebuilt from
open data; old key versions stay listed after rotation.

| Processing   | Severity (proposal) | Likelihood (proposal) | Rationale                                                                              |
| ------------ | ------------------- | --------------------- | -------------------------------------------------------------------------------------- |
| P2 booking   | 2 Limited           | 2 Limited             | Patients also hold the confirmation email; backups; keys are a single point of failure |
| P1 directory | 1 Negligible        | 2 Limited             | Rebuilt from sources; owner content restored from backups                              |
| P3 claims    | 1 Negligible        | 2 Limited             | The claimant can submit again                                                          |

### 3.6 Points required by the security review (recommendation 2)

#### 3.6.1 Content of patient emails and `.ics` files

Patient emails (`booking/mail-content.tsx`) contain: greeting with first name; practitioner
name; date; time; address of the place; manage link (token in the fragment) or a link to book
again; for a cancellation by the practice, the practice's message. The subject contains the
practitioner's name and a short date (or the code for the code email). No specialty and no
reason. The `.ics` attachment (`REQUEST` or `CANCEL`) contains the practitioner's name in the
summary, the address, the start and end, the sender as organizer and the patient's full name
and email as attendee.

Assessment: the practitioner's name and address can reveal the specialty indirectly, and the
content leaves the HDS perimeter through the SMTP provider and the mailbox. This is judged
necessary for the patient to attend the appointment; the DPO must validate it (A-11). Options
to consider: omit the patient's name from the `.ics` attendee field; let a practice choose a
neutral sender display name.

#### 3.6.2 Calendar feed and its default fields

The feed (`booking/ics-feed.ts`) covers the last 30 and next 120 days and shows, per entry,
the reason and the patient's initials (full names only if the owner turns them on); it is
read by the calendar provider's servers, outside the HDS perimeter and outside the second
factor. Token: 256-bit, only its hash stored, 60 reads per hour, rotation and revocation by
the owner, revocation when a practice changes hands. Proposal: keep full names off by default,
show a warning when they are turned on, and remind owners to rotate the link when a member
leaves (A-11).

#### 3.6.3 Retention and backups

Patient data is purged at the end of the appointment plus 90 days by default (30 to 365 set
by the practice). The default should be validated against the CNIL referential and the
practitioners' needs (**to confirm**). Purged data stays in backups until they expire (7 days
on the planned host; point-in-time recovery retention **to confirm**). Backups hold
ciphertexts only; the keys are not in them.

#### 3.6.4 Platform administrators' access to claim documents

Administrators decrypt claim documents, reports and removal requests; each decryption is
recorded in `platform_audit_events` with a keyed hash of the IP. Governance (A-7): a named
short list of administrators, second factor, a written review of the log at a fixed interval
({{REVIEW_INTERVAL}}), and removal of the flag when a person leaves.

#### 3.6.5 IP hashing in audit rows

Audit rows store an HMAC-SHA256 of the client IP under `RATE_LIMIT_KEY`
(`server/audit.ts`, `trpc/booking-runtime.ts`). This is pseudonymisation, not anonymisation:
whoever holds the key can test every IPv4 address. If `RATE_LIMIT_KEY` is unset, each process
draws a random key and the hashes are no longer comparable across restarts. Proposal: set the
key explicitly (security review recommendation 7), restrict who holds it, and state in the
records that the hash is personal data kept with the audit log (one year, `AUDIT_LOG_RETENTION_MONTHS`).

#### 3.6.6 SMTP and map tile providers

SMTP: {{SMTP_PROVIDER}}, European, under a DPA, with SPF, DKIM and DMARC. In production the
transport (`apps/web/src/server/mail/smtp-options.ts`) requires TLS: `smtps://` (implicit TLS)
or `smtp://` with STARTTLS required, the certificate verified, TLS 1.2 at least; the app
refuses to start with a URL that weakens it or a server without STARTTLS
(`SMTP_ALLOW_INSECURE=true` only for a local catcher). TLS from the provider to the patient's
mailbox depends on that mailbox. Map tiles:
OpenFreeMap by default receives visitors' IPs and the area viewed when a map scrolls into
view; no consent mechanism exists. Options: self-host the tiles (configurable through
`NEXT_PUBLIC_MAP_STYLE_URL`), or document the provider in the privacy page. To decide (A-13).

#### 3.6.7 Breach procedure

As controller (P1, P3–P6): notify the CNIL within 72 hours of becoming aware of a breach
(art. 33), inform data subjects when the risk is high (art. 34), keep a breach register. As
processor (P2): notify each affected practitioner without undue delay, with a target of
48 hours, so that they can notify the CNIL within 72 hours (see the
[processor agreement](processor-agreement-draft.md)). A written procedure (A-3) must cover
detection (host alerts, audit log anomalies), qualification, key rotation
(`jobs:tick rotate-keys`), revocation of sessions and feeds, and contacts ({{DPO_CONTACT}},
{{HOST_NAME}}).

#### 3.6.8 DPO and records

See [DPO appointment](dpo-appointment.md) and [records of processing](records-of-processing.md).

---

## 4. Action plan and residual risks

### 4.1 Action plan

| Id   | Action                                                                                                                                           | Owner        | Due                  | Status |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------ | -------------------- | ------ |
| A-1  | Sign the HDS hosting contract; move app, database, jobs, storage and backups to the HDS region; keys in the host's secret manager                | {{OWNER}}    | Before booking opens | Open   |
| A-2  | External penetration test on staging with synthetic data (security review recommendation 3)                                                      | {{OWNER}}    | Before booking opens | Open   |
| A-3  | Written breach procedure and register; processor notification target of 48 hours                                                                 | {{OWNER}}    | Before booking opens | Open   |
| A-4  | Define retention for de-identified appointment rows, inactive accounts (reports and removal requests: done, #63; rate-limit rows: done, #66)     | {{OWNER}}    | Before booking opens | Open   |
| A-5  | Implement the one-year deletion of both audit logs by a privileged task (security review I-6): `care.purge_audit_events()`, role `apercura_jobs` | {{OWNER}}    | Before booking opens | Done   |
| A-6  | Request point-in-time recovery, confirm backup retention, test a restore                                                                         | {{OWNER}}    | Before booking opens | Open   |
| A-7  | Administrator governance: named list, review of `platform_audit_events`, offboarding                                                             | {{OWNER}}    | Before booking opens | Open   |
| A-8  | Art. 13 notice for patients on the booking form and in the confirmation email (template for practitioners)                                       | {{OWNER}}    | Before booking opens | Open   |
| A-9  | Guidance on generic appointment-type names                                                                                                       | {{OWNER}}    | Before booking opens | Open   |
| A-10 | Tools for practitioners to answer patient requests: per-patient export and early erasure; export of the agenda at the end of the contract        | {{OWNER}}    | {{DUE_DATE}}         | Open   |
| A-11 | DPO validation of email, `.ics` and feed content (3.6.1, 3.6.2)                                                                                  | {{DPO_NAME}} | Before booking opens | Open   |
| A-12 | Limit raw IPs in `directory.auth_rate_limit` (Better Auth): keyed hashes, purge of elapsed windows (#66; sessions: truncated, #63)               | {{OWNER}}    | {{DUE_DATE}}         | Done   |
| A-13 | Decide on the map tile provider (self-hosting or documented third party)                                                                         | {{OWNER}}    | {{DUE_DATE}}         | Open   |
| A-14 | Set `RATE_LIMIT_KEY`, `ALTCHA_HMAC_KEY` and `DATABASE_URL_JOBS` explicitly; check `TRUSTED_PROXY_COUNT`; SMTP TLS is enforced by the code (#63)  | {{OWNER}}    | Before booking opens | Open   |
| A-15 | Appoint the DPO, register with the CNIL, publish the contact                                                                                     | {{OWNER}}    | Before booking opens | Open   |
| A-16 | Sign the processor agreement with each practitioner before opening their booking; DPA with the SMTP provider                                     | {{OWNER}}    | Before booking opens | Open   |
| A-17 | Confirm the legal bases (2.2) and the role analysis (processor for P2) with the lawyer                                                           | {{OWNER}}    | Before booking opens | Open   |

### 4.2 Residual risks (after planned measures, proposals)

| Risk                              | Severity | Likelihood | Accepted?         |
| --------------------------------- | -------- | ---------- | ----------------- |
| Illegitimate access, P2           | 3        | 2          | {{TO_BE_DECIDED}} |
| Illegitimate access, P3 documents | 3        | 1          | {{TO_BE_DECIDED}} |
| Unwanted modification, P2         | 3        | 2          | {{TO_BE_DECIDED}} |
| Page takeover by an impostor      | 3        | 1          | {{TO_BE_DECIDED}} |
| Abusive objection (R-M4)          | 2        | 2          | {{TO_BE_DECIDED}} |
| Disappearance, P2                 | 2        | 1          | {{TO_BE_DECIDED}} |

Residual risks that cannot be removed by design: emails and calendar feeds leave the HDS
perimeter; backups keep purged data until their expiry; keys live in the host's environment;
`BLIND_INDEX_KEY` cannot be rotated without rebuilding the indexes; a practice member with
legitimate access can copy what is on screen.

If a high residual risk remained, the CNIL would have to be consulted before the processing
starts (art. 36).

---

## 5. Validation

| Role                                              | Name                            | Opinion / decision | Date               | Signature |
| ------------------------------------------------- | ------------------------------- | ------------------ | ------------------ | --------- |
| Controller (publisher), for P1 and P3–P6          | {{CONTROLLER_SIGNATORY}}        |                    | {{SIGNATURE_DATE}} |           |
| Data protection officer (opinion, art. 35(2))     | {{DPO_NAME}}                    |                    | {{SIGNATURE_DATE}} |           |
| Processor (publisher), for P2                     | {{CONTROLLER_SIGNATORY}}        |                    | {{SIGNATURE_DATE}} |           |
| Practitioner representative(s), for P2, if sought | {{PRACTITIONER_REPRESENTATIVE}} |                    | {{SIGNATURE_DATE}} |           |

**Views of data subjects or their representatives (art. 35(9))**: sought: yes / no.
If yes, from whom ({{CONSULTED_PARTIES}}, for example patient associations, professional
bodies), how, and summary of the views: {{DATA_SUBJECT_VIEWS}}. If not, reason:
{{REASON_NOT_SOUGHT}}.

**Next review**: at the latest {{NEXT_REVIEW_DATE}}, and at any significant change (opening
booking, new country, new processor, new data field).

---

## Placeholders used

`{{PUBLISHER_NAME}}`, `{{PUBLISHER_LEGAL_FORM}}`, `{{PUBLISHER_ADDRESS}}`,
`{{PUBLISHER_REGISTRATION}}`, `{{PUBLISHER_PHONE}}`, `{{CONTACT_EMAIL}}`, `{{DPO_NAME}}`,
`{{DPO_CONTACT}}`, `{{HOST_NAME}}`, `{{HOST_ADDRESS}}`, `{{HOST_PHONE}}`, `{{SMTP_PROVIDER}}`,
`{{EFFECTIVE_DATE}}`, `{{DPIA_VERSION}}`, `{{REVIEW_INTERVAL}}`, `{{OWNER}}`, `{{DUE_DATE}}`,
`{{TO_BE_DECIDED}}`, `{{CONTROLLER_SIGNATORY}}`, `{{PRACTITIONER_REPRESENTATIVE}}`,
`{{SIGNATURE_DATE}}`, `{{CONSULTED_PARTIES}}`, `{{DATA_SUBJECT_VIEWS}}`,
`{{REASON_NOT_SOUGHT}}`, `{{NEXT_REVIEW_DATE}}`.
