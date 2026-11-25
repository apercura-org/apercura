# Security review

Review of the whole application before booking opens to patients (issue #31):
authentication and sessions, authorization of every procedure and route
handler, patient data handling, web hardening, rate limiting and abuse, and
infrastructure. Patient booking data is health data: it is encrypted at the
application level and production must run on an HDS-certified host.

- **Scope**: `apps/web` (Next.js app, tRPC, route handlers, proxy),
  `packages/core/src/crypto`, `packages/db` (schema, migrations, grants),
  `packages/etl`, `docker/`, `clevercloud/`, CI workflows.
- **Method**: code reading against the plan's security sections, checks on a
  production build (headers, CSP, Host handling, nonce coverage of partially
  prerendered pages), dependency audit (`bun audit`), and new automated tests
  for every fix. Synthetic data only.
- **Not covered**: an external penetration test, the hosting provider's
  controls, and the legal documents (DPIA, processing records, contracts).
  See [Recommendations](#recommendations).

## Threat model

| Asset                                          | Where                                                                   | Main threats                                                                                       |
| ---------------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Patient identity and contact, appointments     | `care.appointments` (encrypted fields), outbox, emails, calendar feeds  | Reading by an outsider, a former team member or the host; leaks through logs, errors, emails, URLs |
| Practitioner accounts and their second factors | `directory.user`, `session`, `two_factor`, `passkey`, `account`         | Credential stuffing, session theft, second-factor bypass, account takeover by an impostor          |
| Claims and identity documents                  | `directory.claims`, `claim_documents` (encrypted in S3)                 | Impostor claiming a page, document leak, IDOR between claimants                                    |
| Master, data and blind-index keys              | Environment (`ENCRYPTION_KEYS`, `BLIND_INDEX_KEY`), `organization_keys` | Key disclosure, inability to rotate after a disclosure                                             |
| Directory integrity and public pages           | `directory.*`, cached pages                                             | Cache poisoning, XSS through imported or owner-provided text, defacement through the import        |
| Availability of booking                        | Public tRPC procedures, auth endpoints                                  | Bots holding slots, email flooding, oversized bodies, brute force                                  |

Actors: anonymous visitors and bots; patients (no account, email code and
opaque manage token); practitioners and their assistants (password plus TOTP
or passkey, or Pro Santé Connect); platform administrators (claims and
reports, **no access to patient data**); the operator and the HDS host
(database, backups, environment); third parties that receive data by design
(SMTP provider, the calendar provider reading a feed, the map tile server).

Trust boundaries: the browser and the app (CSP, same-origin writes, cookies);
the app and PostgreSQL (one role per component: app, import, read-only); the
`phi` module and the rest of the app (the only decryption path, audited); the
HDS perimeter and outgoing email (minimal content).

## What was verified and holds

- **Second factor everywhere patient data is reachable.** The app trusts its
  own `session.mfaVerifiedAt`, set only by TOTP, backup code, passkey with user
  verification or Pro Santé Connect; the sign-in methods that would skip it
  (magic link, email OTP, password reset, other OAuth providers, ID-token
  sign-in, `trustDevice`) are disabled or refused. Every tRPC procedure, the
  upload and download route handlers and the account export check it again,
  never the proxy. The calendar feed is the one exception by design: a
  256-bit bearer URL for calendar apps, initials only by default.
- **Authorization.** Membership and the platform administrator flag are read
  from the database on each call; the client's `activeOrganizationId` is
  ignored; every agenda, calendar, team, profile and audit query is scoped by
  the organization read from the database (integration tests cover
  cross-organization refusals). Assistants cannot edit pages or settings;
  only owners open the agenda, manage the team and read the access log.
  Platform administrators carry no organization.
- **Patient data.** Only `server/phi` decrypts patient fields, and it inserts
  the audit row in the same transaction first. The Biome rule catches static,
  dynamic and relative imports and re-exports of the crypto package. Outbox
  rows hold ids only; patient emails carry no specialty and no reason; manage
  tokens travel in the URL fragment and in POST bodies; blind indexes use an
  HKDF key per organization; the purge erases identity, contact, blind
  indexes and token hashes, audited.
- **Abuse.** ALTCHA proofs are verified server side, signature before any
  work, and burnt once used; holds, codes, resends, manage links, claims,
  reports, removal requests and suggestions are rate limited; revalidation
  requests are HMAC-signed with a ±5 minute window; the jobs endpoint compares
  its bearer secret in constant time.
- **Web.** `?suite=` is parsed against an allowlist of typed routes; Better
  Auth checks `callbackURL` against `trustedOrigins`; raw SQL is limited to
  constant fragments; the only `dangerouslySetInnerHTML` is JSON-LD; uploads
  are sniffed by magic bytes, photos re-encoded by sharp without metadata
  under random keys, claim documents encrypted before storage in a private
  bucket and served on demand with `nosniff` and a sandboxed policy. A
  production build answers 400 to a `Host` or `X-Forwarded-Host` it does not
  serve, and the proxy redirects any other host to `APP_URL`; per-request
  pages are `private, no-store`.
- **Infrastructure.** The image is multi-stage, runs as `node`, holds no
  secret (built with `SKIP_ENV_VALIDATION`, `.env*` excluded from the
  context); the self-hosted stack publishes the app only, on 127.0.0.1; the
  bucket is private and the app's S3 key is limited to it.

## Findings

Severity: **High** (exploitable, patient data at stake), **Medium**
(exploitable with conditions, or a control missing), **Low** (defense in
depth, hard to exploit), **Info** (hardening, no direct impact).

| #    | Severity | Finding                                                                                                                                                                                                                                                      | Status   | Fix              |
| ---- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ---------------- |
| H-1  | High     | Private calendar feeds survived a change of owner: after a contested claim (page taken over from an impostor) or an owner handing the practice over and deleting their account, the previous owner's feed URL kept serving patients' names and appointments. | Fixed    | f71edef          |
| M-1  | Medium   | No Content-Security-Policy, HSTS, `X-Content-Type-Options`, `Permissions-Policy` or framing protection on pages and API answers (only a few routes set headers of their own).                                                                                | Fixed    | ea699e4          |
| M-2  | Medium   | Raw SMTP error messages were stored in `care.outbox.last_error`, readable by the read-only role. SMTP replies quote the recipient, so a patient's email address could sit there in clear.                                                                    | Fixed    | f25f243          |
| M-3  | Medium   | Request bodies were buffered whole before any size check on unauthenticated endpoints (`/api/auth/*`, `/api/revalidate`, `/api/trpc`), and uploads sent without `Content-Length` were read without limit: memory exhaustion with one request.                | Fixed    | ee586fe, cc3d46a |
| M-4  | Medium   | A master key could not be retired: nothing re-wrapped the practices' data keys or re-encrypted platform-key data, so after a key disclosure the old key had to stay listed forever.                                                                          | Fixed    | ca37c1f          |
| M-5  | Medium   | Outgoing mail did not require TLS: an `smtp://` URL was used as given, so codes, appointments and sign-in links could travel in clear to a server without STARTTLS (or after a downgrade).                                                                   | Fixed    | #63              |
| M-6  | Medium   | Deleting an account that closed a practice holding booking data failed on foreign keys (calendars and data keys restrict the organization), and nothing defined what happens to its patients, feeds and keys.                                                | Fixed    | #63              |
| L-1  | Low      | Only the booking mutations checked `Sec-Fetch-Site`; every other mutation and the uploads relied on `SameSite=Lax` cookies alone, which do not stop a sibling subdomain of a shared hosting domain.                                                          | Fixed    | ee586fe          |
| L-2  | Low      | Unexpected errors (database errors) reached the client with their message in production, and were not logged at all.                                                                                                                                         | Fixed    | 5e5d801          |
| L-3  | Low      | Sign-in attempts were limited per IP only (a botnet spreads thin, a hospital shares one address); sign-up and verification emails had no limit per address (plan: 3 a day).                                                                                  | Fixed    | 8335e65          |
| L-4  | Low      | Sessions had a 12-hour idle expiry but no absolute lifetime: a session in daily use, and its second-factor proof, never ended.                                                                                                                               | Fixed    | 8335e65          |
| L-5  | Low      | A signed revalidation request could be replayed within its 5-minute window (cache stampede).                                                                                                                                                                 | Fixed    | cc3d46a          |
| L-6  | Low      | The import downloaded the FINESS file from a URL taken from the data.gouv.fr API answer without checking its host, and its outgoing requests had no timeout.                                                                                                 | Fixed    | 1b3f3da          |
| L-7  | Low      | The app's configuration check accepted secrets of any length in production, and a missing `BETTER_AUTH_SECRET` was only caught by Better Auth at the first request.                                                                                          | Fixed    | f745189          |
| L-8  | Low      | The development compose file published PostgreSQL, MinIO and Mailpit, with well-known passwords, on every interface.                                                                                                                                         | Fixed    | f745189          |
| L-9  | Low      | Practitioner sessions stored the client's raw IP address, readable (with the user agent) by the read-only role.                                                                                                                                              | Fixed    | #63              |
| L-10 | Low      | Error reports and removal requests were never deleted, although the privacy policy limits them to the time needed.                                                                                                                                           | Fixed    | #63              |
| L-11 | Low      | Better Auth's sign-in rate limiter stored the raw client IP in its keys (`{ip}\|{path}`), and neither rate-limit table was ever purged.                                                                                                                      | Fixed    | #66              |
| L-12 | Low      | A confirmed removal kept the whole practitioner row, refreshed by every import, with its places, qualifications, page and owner content, although the privacy policy said only the RPPS number stays.                                                        | Fixed    | #116             |
| I-1  | Info     | JSON-LD escaped `<` only; `>`, `&`, U+2028 and U+2029 are now escaped too.                                                                                                                                                                                   | Fixed    | d2165d4          |
| I-2  | Info     | No automated check that every procedure keeps its middleware, that the decryption boundary holds beyond Biome, or that the database roles stay narrow.                                                                                                       | Fixed    | 5e5d801, be6793c |
| I-3  | Info     | `bun audit`: one moderate advisory (esbuild ≤ 0.24.2 development server) in development tools only (`drizzle-kit`, `vitest`); production dependencies are clean. CI now fails on any production advisory and on high or critical ones anywhere.              | Accepted | f745189          |
| I-4  | Info     | `GET /api/pro/claims/{id}/psc` records the Pro Santé Connect result (a state change on GET). It only re-reads the caller's own linked identity for their own claim and is idempotent.                                                                        | Accepted | —                |
| I-5  | Info     | Claim documents open inline under a `sandbox` policy; Chrome does not render PDFs in a sandboxed document. Serving PDFs as attachments would keep the policy and work everywhere.                                                                            | Open     | —                |
| I-6  | Info     | Audit logs are append-only for the app role, so the planned one-year retention could not be applied by the app: nothing deleted older rows.                                                                                                                  | Fixed    | #63              |

### Details of the fixes

- **Headers and CSP** (`apps/web/src/lib/security-headers.ts`, `proxy.ts`,
  `next.config.ts`). Every response: `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin` (`no-referrer` on
  `/rdv`), `X-Frame-Options: DENY`, a `Permissions-Policy` that turns off
  every powerful feature but geolocation on our origin and passkeys,
  `Cross-Origin-Opener-Policy: same-origin`, and HSTS (two years, subdomains)
  in an HTTPS production build. API answers: `default-src 'none'` and
  `Cross-Origin-Resource-Policy: same-origin`. Pages, from the proxy:
  - the practitioner space and `/rdv` (rendered per request) get a fresh
    nonce: `script-src 'self' 'nonce-…' 'sha256-…'`. Next.js puts the nonce on
    its inline scripts; the prerendered shell keeps one React timing script,
    allowed by its hash (pinned by a test against the React build Next.js
    ships). `'strict-dynamic'` is left out because the shell's `<script src>`
    tags are prerendered without a nonce;
  - cached public pages get `script-src 'self' 'unsafe-inline'`: their
    inline data scripts are prerendered and cannot carry a per-request nonce,
    and no user-provided HTML is rendered there;
  - both: no `eval` outside development, `object-src`, `base-uri`,
    `frame-src` and `frame-ancestors` `'none'`, `form-action 'self'`,
    `worker-src 'self' blob:` (MapLibre's worker file, ALTCHA's blob worker),
    and the map style's origin in `connect-src` and `img-src`.

  The sign-up and registry-email pages now answer per request
  (`PerRequest`), so the whole practitioner space carries a nonce. An e2e
  spec loads every page type and fails on any CSP violation.
- **Cross-site writes and body caps** (`server/http/same-origin.ts`,
  `server/http/body.ts`): POSTs to tRPC and the upload routes need
  `Sec-Fetch-Site: same-origin` (or `none`), or an `Origin` of the app;
  bodies are read up to a cap (64 KB auth and revalidation, 512 KB tRPC, the
  file size plus 64 KB for uploads) and refused with 413 beyond.
- **Errors** (`trpc/error-redaction.ts`): outside development, an
  `INTERNAL_SERVER_ERROR` reaches the client as that code only, without stack;
  the server logs the procedure path, the error class, its SQLSTATE or Node
  code and the first frame of our code, never the message nor the input.
  Business errors keep their codes.
- **SMTP errors** (`server/mail/error-summary.ts`): the outbox stores and the
  logs print `Error EENVELOPE SMTP 450 on RCPT TO`, never the reply text.
- **Calendar feeds** (`server/booking/feeds.ts`): all feeds of a practice are
  revoked when a contested claim takes it over and when its owner hands it to
  a member before deleting their account. The new owner issues a new link.
- **Auth** (`server/auth/policy.ts`): 10 sign-in attempts per address per
  15 minutes, 3 sign-ups and 3 verification emails per address per day (keyed
  hashes in `rate_limits`), on top of Better Auth's per-IP limits; a session
  ends 7 days after its creation, however active.
- **Key rotation** (`server/keys/rotation.ts`, `jobs:tick rotate-keys`):
  re-wraps every data key, re-encrypts reports, removal requests and claim
  documents with the active master key; idempotent. The procedure is in
  [self-hosting](self-hosting.md#key-rotation).
- **Revalidation**: a verified signature is burnt in `rate_limits` for
  15 minutes; a replay is answered 200 without revalidating anything.
- **Import**: the FINESS resource must be HTTPS on `data.gouv.fr` or a
  subdomain; JSON requests time out after 30 s, geocoding after 10 min, a
  download that stalls for 2 min is retried.
- **Retention and transport (issue #63)**:
  - _Access logs_ (`care.purge_audit_events()`, migration 0016; `server/retention.ts`):
    `jobs:tick audit-log` deletes rows of both audit logs older than
    `AUDIT_LOG_RETENTION_MONTHS` (12 by default, 6 at least, enforced by the function too)
    through a `SECURITY DEFINER` function owned by the migration role, with a fixed
    `search_path` and a cutoff computed from the server clock. Only `apercura_jobs`
    (`DATABASE_URL_JOBS`), a role with no table privilege, may call it; the app role stays
    append-only and gets `permission denied`.
  - _Session IPs_ (`server/auth/client-ip.ts`, `auth/index.ts`): Better Auth's session hooks
    store the IPv4 /24 or IPv6 /48 network only; migration 0016 truncates the rows stored
    before with the same rule (`directory.truncate_ip`, compared with the app's by a test) and
    revokes the read-only role's grant on `ip_address` and `user_agent`. Rate limits read the
    request's address through their own keyed hashes and are unchanged.
  - _Reports and removal requests_ (`jobs:tick requests`): deleted 6 and 12 months after they
    were closed (`REPORT_RETENTION_MONTHS`, `REMOVAL_REQUEST_RETENTION_MONTHS`); a confirmed
    objection deletes its request, the reports and the page at once and keeps only the
    suppression (issue #116, below).
  - _Closing a practice_ (`booking/closure.ts`): in the account deletion's transaction, under
    the practitioners' booking locks, the calendars stop taking bookings, their feeds are
    revoked, live holds expire, upcoming appointments are cancelled by the practice with the
    usual patient email (proved addresses only) and the team loses access. `jobs:tick
    closures` then deletes every booking row, then the data keys, then the organization, once
    the outbox holds no email of the practice (24 hours at most). Audit rows carry no foreign
    key and stay until their own retention.
  - _SMTP_ (`server/mail/smtp-options.ts`, `smtp-check.ts`): in production `smtps://` is
    implicit TLS and `smtp://` gets `requireTLS`, certificates verified, TLS 1.2 at least; a
    URL that sets TLS options is refused by the environment check, the jobs and the
    transport, and the app refuses to start against a server that cannot do STARTTLS.
    `SMTP_ALLOW_INSECURE=true` lifts this for a local catcher only.
- **Owner experience (issue #92)**:
  - _"I am this practitioner" contact requests_ (`server/contact-requests/service.ts`,
    `trpc/routers/practitioner-contact.ts`, `directory.practitioner_contact_requests`, migration
    0022): public, same-origin writes only, 5 an hour per client (the GDPR forms' budget), a
    self-hosted ALTCHA proof of work burnt after one use, a honeypot, plain text with markup
    refused. The name, professional email, phone and message are one ciphertext under the
    platform key (AAD `practitioner_contact_requests.content_enc.<id>`, re-encrypted by
    `rotate-keys`); the row only says which page, when and its status. A claimed page refuses
    the form (the claim's contest is the way); nothing here grants access to a page. Only
    platform administrators list (without the personal fields), decrypt (audited
    `contact_request.decrypt`) and move a request (audited `contact_request.status`). The
    requester's acknowledgment is fixed text, never what was typed, and at most 3 a day per
    address (`emailRateLimitKey`), so the form cannot relay messages or flood a third party.
    `jobs:tick requests` deletes a request `CONTACT_REQUEST_RETENTION_MONTHS` (12) after its
    last change, whatever its status. The import role has no access to the table.
  - _Admin alerts_ (`server/admin-alerts.ts`, `directory.admin_alerts`): a count and a link to
    the queue, never a name or an address, to `ADMIN_NOTIFY_EMAIL` (default
    `LEGAL_CONTACT_EMAIL`); one email per queue every `ADMIN_ALERT_INTERVAL_MINUTES` at most,
    the slot taken under a row lock, so a flood of submissions sends one email. Instants travel
    as PostgreSQL text so the high-water mark never loses its microseconds.
  - _Page statistics_ (`server/stats/page-views.ts`, `api/page-views/[id]`,
    `directory.page_view_days`): claimed pages only, one counter per page and day, no other
    column. The public page stays static and cached; an empty `fetch` (`credentials: "omit"`,
    `referrerPolicy: "no-referrer"`) counts after the response, which is the same 204 whether
    the view counted or not. Not counted: requests without `Sec-Fetch-Site: same-origin`
    (other sites, scripts, old browsers), prefetches, crawler, preview, monitor and headless
    user agents, Global Privacy Control and Do Not Track, and any visitor whose address is
    unknown (no trusted proxy). Inflation is bounded in memory only: the client address (IPv4,
    or the IPv6 /48) becomes an HMAC under a random key held by the process and replaced every
    day (so buckets cannot be linked to an address or across days), one view per page and
    bucket every 30 minutes, 30 an hour per bucket; once the map is full, new buckets stop
    counting rather than evicting the windows already there. Kept `PAGE_VIEW_RETENTION_MONTHS`
    (13). Only the page's owner and practitioner members read them (`stats.page`, page read
    permission), and only the views counted since their own claim was verified (a page that
    changes hands does not show the former owner's figures); online bookings per week are
    counts of the practice's own appointments.
  - _Withheld pages_: the "I am this practitioner" form answers `NOT_FOUND`, like an unknown
    page, for a page withheld by an objection.
  - _Share kit and badge_: the QR code files are drawn in the browser (no request); the poster
    is the browser's print of a page of the practitioner space; the badge
    (`/badges/apercura-{locale}.svg`) is a static, prerendered SVG with no script, link, font
    or image of its own, served with `Cross-Origin-Resource-Policy: cross-origin`, a sandboxed
    `default-src 'none'` policy and no cookie; the snippet is a plain link and image with
    `referrerpolicy="no-referrer"`, its attributes escaped.
  - _Opt-out_: the "Is this you?" block and the claim page link to the GDPR art. 21 objection
    for every page; a claimed page sends its owner to the editor's removal. Both end in a
    `directory.suppressions` row (`FR`, `RPPS`) that every import honours (ETL integration
    test: hidden while checked, only the suppression left through two imports, the page back
    once it is withdrawn).
- **Minimisation of removed practitioners (issue #116, GDPR art. 5(1)(c))**:
  - _What stays_: the `directory.suppressions` row only (country, id scheme, national id,
    reason `objection` or `owner`, who recorded it, when). On a confirmed objection
    (`decideRemoval`) or an owner's removal (`setOwnerRemoval`), the same transaction calls
    `directory.purge_suppressed_practitioners(ids)` (migration 0023), which deletes the places
    of practice (activities, then the sites nobody else links to and no agenda uses), the
    qualifications, Ameli fields, owner content, former slugs, page, search entry, page views,
    error reports, removal and contact requests, the person's lines in the last import's
    staging and quarantine tables, then the row itself with the claims on it. The decision
    email's address is decrypted before the request goes.
  - _Bare rows_: a row still held by something with its own retention is kept, never
    published, without registry enrichments, page or places: the claim of its owner (who may
    restore it from their space; their account shows its name and RPPS) or an agenda
    (`care.calendars` restricts the delete; the places that agenda uses stay linked). The first
    purge after nothing holds it any more deletes it: the account deletion runs one, and every
    import runs one over all suppressions (at the latest a week later). No foreign key is
    broken: appointments keep the booking retention, organizations and accounts their own.
  - _The function_: `SECURITY DEFINER` with `search_path = pg_catalog, pg_temp`, executable by
    `apercura_app` and `apercura_etl` only (not the read-only or jobs roles, nor `PUBLIC`;
    integration test). It lets the import delete what it may not delete itself, and only ever
    for national ids of `directory.suppressions`, which that role may read but not write. It
    returns the cache tags (page, listings, establishments) computed before the links go; the
    app expires them with the sitemaps, then rebuilds the listing counts
    (`refresh_landing_pages`) unless an import holds its advisory lock (it rebuilds them itself).
  - _Storage_: the photo and unpurged claim documents of a deleted row are queued in
    `directory.storage_deletions` (keys only, no grant to the import); the app deletes them
    right after the commit, and `jobs:tick claim-documents` retries what is left.
  - _The import_: reads the suppressed ids of its country and scheme before the files and
    drops their lines while parsing, before staging or quarantine (`etl_runs.stats
    .suppressedLines` counts them per country and file; the staging volume guards add them back
    so a suppression never looks like a shrinking file). It runs the purge as a safety net
    (a suppression added by hand, or confirmed while it loaded) and makes a row whose
    suppression was withdrawn active again.
  - _Public answer_: a removed page answers 404 with `noindex`, the same as an unknown or a
    withheld page (#104), and leaves every sitemap (e2e `claims.spec.ts`).
  - _Existing rows_: migration 0023 purges the rows suppressed before it, once (a handful,
    found through the unique national id index; `lock_timeout` 5 s, forward-only).
  - _Owner's confirmation_ (issue #119): the editor removes a page only from an alert dialog
    (labelled, focus trapped and restored, Escape cancels) that lists what is deleted and how a
    restored page comes back, with a box to tick first; `profile.setRemoved` refuses a removal
    (`CONFIRMATION_REQUIRED`) unless the request sends back the page's own RPPS number, so a
    stray or forged request without it changes nothing (integration and e2e tests). A cached
    miss of a known practitioner is tagged by id, so the import that brings a restored page
    back expires it at once.
  - _Withdrawal_: deleting the suppression (the owner's "restore", or an administrator in SQL
    for an objection, `docs/data-import.md`) lets the next import recreate the page.
- **Rate-limit hygiene (issue #66)**:
  - _Better Auth's counters_ (`server/auth/rate-limit-storage.ts`, migration 0017): Better Auth
    keeps limiting sign-in, sign-up, verification emails, second factors and passkeys per
    address and path, with the same rules, but through our own storage: one atomic
    `INSERT … ON CONFLICT DO UPDATE` per hit on `directory.auth_rate_limit`, keyed
    `auth:{HMAC-SHA256 of the address}|{path}` (`authRateLimitKey`). The HMAC key is
    `RATE_LIMIT_KEY`, or one derived from `BETTER_AUTH_SECRET` when it is unset, so the
    counters stay shared across instances and restarts as before. Migration 0017 deletes the
    rows stored before with raw addresses (counters of an hour at most: a client mid-window
    starts a new one). A test signs in against a real database and finds no address in the
    table.
  - _Purge_ (`purgeExpiredRateLimits` in `server/rate-limit.ts`, `jobs:tick rate-limits`):
    both tables record each row's window; under its advisory lock the job deletes the rows
    whose window has elapsed, which the limiters count as zero anyway, and nothing else. It
    runs with the app role, which already holds `DELETE` on both tables (`apercura_jobs` holds
    no table privilege and gets none).
- **Home visits (issue #75)**: a new patient field, the address of a home visit.
  - _Storage_ (`care.appointments.patient_address_enc`, `patient_commune_enc`, migration 0018):
    the street address (number, street, floor, door code) and the INSEE code of the commune
    are sealed by `server/phi` like the name and contact (organization data key, AAD
    `appointments.<column>.<id>`), so key rotation needs nothing new: `rotate-keys` re-wraps
    the data keys and the address never changes. Nothing else holds them in clear: no blind
    index, no event data, no audit field value, no log line, no outbox row; an integration
    test scans every text column of `care` for the address. The read-only role sees the
    ciphertext columns only, as for the other `*_enc` fields.
  - _Area check_ (`server/booking/home-visit.ts`): the service area is a list of communes
    (INSEE codes of `directory.places`), not a radius, so the patient chooses their commune
    from it and the address is never geocoded (no third party sees it). `booking.hold`
    refuses a commune outside the area (`OUTSIDE_AREA`) or a missing address before it holds
    a slot or encrypts anything.
  - _Who reads it_: the practice only, in the agenda (`agenda.list` decrypts it when the range
    holds a home visit, audited with `patient_address_enc` and `patient_commune_enc` in the
    row's fields). Patient emails, the `.ics` files and `/rdv` print "À domicile — <commune>"
    and never the street; practice emails print "À domicile" only (no patient data there, as
    before); the private calendar feed carries no place at all.
  - _Travel time_ (`travelConflict` in `packages/core/src/booking/occupancy.ts`,
    `server/booking/travel.ts`): each appointment freezes its place and travel time. Its
    occupied range holds the travel after a visit (the overlap constraint keeps ranges apart);
    the travel before a visit, needed only next to an entry that does not travel, is checked by
    every booking write inside the practitioner's serialized transaction and answered like an
    overlap. Rescheduling keeps the frozen travel time and refuses a type that changed place
    since the booking.
  - _Erasure_: the purge clears both columns with the rest of the patient's details (24 hours
    for an unverified booking, `purge_after` otherwise); a closed practice deletes the rows.
- **Configuration**: production refuses to start without
  `BETTER_AUTH_SECRET`, or with any secret shorter than 32 characters;
  development services listen on 127.0.0.1 only.

### Tests added

- `trpc/procedure-access.test.ts`: lists every procedure of the app router
  with its required access (public, signed in, second factor, member with
  given permissions, platform administrator) and calls each one signed out,
  without a second factor, as a non-member and as a non-administrator.
- `server/phi/boundary.test.ts`: the Biome rule and its exemptions are still
  configured; Node ciphers appear in the crypto package only; the package root
  does not export decryption; platform-key data is opened by the claims and
  GDPR services only.
- `server/database-roles.integration.test.ts`: the import cannot read `care`,
  accounts or claims, nor rewrite practitioner-owned columns; the read-only
  role writes nothing and reads no column that looks like a secret (a scan,
  so a new secret column fails until a migration hides it); both audit logs
  are append-only for the app; nothing is granted to `PUBLIC`.
- `server/retention.integration.test.ts`, `server/booking/closure.integration.test.ts`,
  `server/mail/smtp-options.test.ts`, `server/auth/client-ip.test.ts` (#63): retention of
  reports, removal requests and both audit logs, and who may purge them; a practice closed
  end to end (cancellation emails, feed revocation, purge without foreign key errors, audit
  rows kept, deadline); TLS rules and a STARTTLS-less server refused at start; session IP
  truncation. `database-roles.integration.test.ts` also checks the jobs role, the session
  columns hidden from the read-only role and the SQL truncation against the app's.
- `server/phi/rotation.integration.test.ts`: data under the old key opens
  after the rotation starts (data keys unwrap with the old master key),
  `rotateKeys` moves everything, and everything opens once the old key is gone.
- Unit tests for the policy builder, cross-site checks, body caps, error
  redaction, SMTP summaries, JSON-LD escaping, per-address keys, session
  lifetime and the FINESS URL check; integration tests for feed revocation,
  revalidation replay and stored SMTP errors; `e2e/security.spec.ts` for
  headers, nonces, CSP violations, cross-site refusals and body caps.

## Residual risks

- **Cached public pages run inline scripts.** Their policy needs
  `'unsafe-inline'` for scripts; it is mitigated by plain-text rendering of
  every owner and registry field, React's escaping and `nosniff`. Revisit
  when Next.js can hash the inline data scripts of prerendered pages.
- **`style-src 'unsafe-inline'`** on every page (React `style` attributes,
  widget styles): CSS injection stays possible where markup injection is.
- **Calendar feeds** are bearer URLs read by the calendar provider's servers
  (Google, Apple), outside the HDS perimeter; they carry initials and the
  reason by default and full names only if the owner turns them on. A second
  factor cannot protect them; rotation and revocation are manual.
- **Patient emails** leave the HDS perimeter through the SMTP provider and the
  patient's mailbox; their content is minimal by design (practitioner, date,
  time, the practice's address or "À domicile — <commune>" for a home visit,
  manage link) and must be validated in the DPIA.
- **Client IP behind proxies**: `TRUSTED_PROXY_COUNT` too low makes every
  visitor share one rate-limit bucket (booking holds, sign-ins); too high lets
  clients choose their address. It must match the deployment.
- **Pro Santé Connect**: state, PKCE, nonce, issuer and ID-token signature
  checks are Better Auth's `genericOAuth`; only the `SubjectNameID` matching
  is ours. The ANS qualification and the pentest must exercise this flow.
- **Platform administrators** read claim documents, reports, removal requests
  and "I am this practitioner" contact requests (audited in
  `platform_audit_events`): a governance matter (few people, second factor,
  review of the log).
- **Page statistics are approximate by design**: a determined script that
  spreads over many addresses and spoofs a browser can still add views
  (bounded per address); the figures are shown as an order of
  magnitude, never used to rank pages. A restart of the process forgets the
  in-memory limits.
- **Keys** live in environment variables of the host; `BLIND_INDEX_KEY`
  cannot be rotated without rebuilding the indexes. Backups keep purged data
  until their own expiry.
- **Audit log retention** (I-6, fixed): the purge needs `DATABASE_URL_JOBS` in
  every deployment; without it the jobs skip it with a warning. Backups keep
  purged rows until their own expiry.

## Recommendations

Before opening booking to patients:

1. **HDS**: run production (app, database, jobs, object storage, backups) on
   the HDS-certified host under a signed hosting contract; keep `PUBLIC_HDS_HOST`
   unset until then. Store the master keys in the host's secret manager, with
   restricted access and a written rotation and incident procedure.
2. **DPIA (AIPD)**, mandatory for health data at scale (draft:
   [legal/dpia-draft.md](legal/dpia-draft.md)), covering at least:
   the content of patient emails and `.ics` files, the calendar feed and its
   default fields, retention (90 days by default, 30 to 365) and backups, the
   platform administrators' access to claim documents, IP hashing in audit
   rows, the SMTP and map tile providers, and the breach procedure (CNIL
   notification within 72 hours). Appoint the DPO and keep the records of
   processing up to date.
3. **Penetration test** by an external team, in a staging environment with
   synthetic data: authentication and second factor (including Pro Santé
   Connect in the ANS sandbox), session handling, the booking flow and its
   limits, manage links, IDOR on every id, the calendar feed, uploads and
   claim documents, admin paths, CSP and headers, and the database roles.
4. **HSTS preload** once the production domain is final; publish a
   `/.well-known/security.txt` with a contact and a disclosure policy.
   _Done in the code (issue #34): `security.txt` is served with a contact, the policy and
   an `Expires` 180 days ahead; `HSTS_PRELOAD=true` adds `preload` in production. The
   preload submission itself is a founder step ([launch checklist](launch-checklist.md))._
5. **CodeQL** with the `security-extended` query suite, GitHub secret
   scanning with push protection, and Dependabot (already on) for every
   ecosystem in the repository.
6. Close I-5 (claim PDFs as attachments). I-6 (audit retention task) is fixed (#63): set
   `DATABASE_URL_JOBS` in every deployment.
7. Set `RATE_LIMIT_KEY` and `ALTCHA_HMAC_KEY` explicitly in every deployment
   (they are random per process otherwise) and check `TRUSTED_PROXY_COUNT`
   against the actual proxy chain.
