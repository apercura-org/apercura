# Launch checklist

Everything that still stands between the repository and a public launch, in order. The code
side of issues #32 (accessibility), #33 (legal) and #34 (launch readiness) is done; what is
left needs the founder: accounts, contracts, signatures, money, or a person's judgement. Each
step links to the document that details it.

Legend: **[founder]** needs the founder's accounts or signature; **[review]** needs an
outside person (lawyer, DPO, auditor, native speaker); **[code]** is a change in the
repository, to open as an issue.

## 1. Legal entity and names

- [ ] **[founder]** Create the legal entity (association loi 1901 or SAS). It is needed for the
      legal notice, the HDS contract, the Pro Santé Connect Datapass, the processing agreements
      with practitioners and the hosts' invoices.
- [ ] **[founder]** Buy the domains `apercura.health`, `.eu`, `.org`, `.fr`.
- [ ] **[founder]** Trademark search for "Apercura" ([INPI](https://data.inpi.fr/),
      [EUIPO](https://euipo.europa.eu/eSearch/)), then filing.
- [ ] **[founder]** Fill the `LEGAL_*` facts from the entity's documents
      ([configuration](configuration.md)): publisher name, legal form, registered office,
      phone, register number, publication director, contact address, host name, address and
      phone, SMTP provider, effective date. Production refuses to build and start without
      them; until then every legal page prints `{{…}}` placeholders.

## 2. Legal texts and GDPR

- [ ] **[review]** Lawyer review of the legal notice, privacy policy and terms (French is
      binding: `apps/web/messages/fr.json`, namespaces `LegalPage`, `PrivacyPage`,
      `TermsPage`), then the same changes in `en`, `de`, `es`, `it`. Set
      `LEGAL_TEXTS_REVIEWED = true` in `apps/web/src/lib/legal.ts` in the same change: it
      removes the draft marks.
- [ ] **[review]** The verbatim conventionnement notice of the order of 30 May 2018 (art. 5):
      replace `fees.regulatoryNotice` (`PractitionerPage`, every locale; see the comment in
      `apps/web/src/components/owner-sections.tsx`) and the `{{CONVENTIONNEMENT_WORDING}}`
      placeholder of the terms (`LEGAL_REVIEW_PLACEHOLDERS` in `apps/web/src/lib/legal.ts`).
- [ ] **[review]** Retention of error reports and removal requests (the privacy page says it
      is still to be set), consumer mediation and competent courts (terms).
- [ ] **[founder]** Appoint the DPO and declare them to the CNIL
      ([designation service](https://designations.cnil.fr/)); set `LEGAL_DPO_CONTACT`
      ([dpo-appointment](legal/dpo-appointment.md)). Required before booking opens.
- [ ] **[review]** Complete and sign the DPIA before booking opens
      ([dpia-draft](legal/dpia-draft.md)); keep the
      [records of processing](legal/records-of-processing.md) up to date.
- [ ] **[review]** Finalise the art. 28 processing agreement and annex it to the practitioner
      terms ([processor-agreement-draft](legal/processor-agreement-draft.md)); sign a DPA with
      the host and the SMTP provider.
- [ ] **[founder]** Present the project to the CNOM, the ONCD and the Ordre des sages-femmes
      before the public launch.

## 3. HDS hosting (Clever Cloud by default, Scalingo as alternative)

- [ ] **[founder]** Quotes from both; written confirmation of the HDS scope of **every**
      service used (application, PostgreSQL, tasks, Cellar, backups); sign the HDS contract.
- [ ] **[founder]** Create the Clever Cloud organisation and the applications in the HDS
      region `parhds` ([deploy-clever-cloud §1](deploy-clever-cloud.md#1-applications-and-add-ons)).
- [ ] **[founder]** Support tickets for the database
      ([§2](deploy-clever-cloud.md#2-database)): the three roles `apercura_app`,
      `apercura_etl`, `apercura_readonly`; check the extensions (`postgis`, `pg_trgm`,
      `unaccent`, `btree_gist`); point-in-time recovery (pgBackRest).
- [ ] **[founder]** Secrets on a trusted machine (`bun run keys:generate`, plus
      `openssl rand -base64 32` for `REVALIDATE_SECRET` and `JOBS_SECRET`), stored only in the
      host's environment; set `RATE_LIMIT_KEY` and `ALTCHA_HMAC_KEY` explicitly and
      `TRUSTED_PROXY_COUNT=1` ([§3](deploy-clever-cloud.md#3-environment-of-the-web-app)).
- [ ] **[founder]** First deployment with `FEATURE_BOOKING=false`.

## 4. Email and Pro Santé Connect

- [ ] **[founder]** European SMTP provider; SPF, DKIM and DMARC on the sending domain; set
      `SMTP_URL` (TLS: `smtps://` or STARTTLS), `MAIL_FROM` and `LEGAL_SMTP_PROVIDER`. Check delivery of a sign-up code to
      the main mailbox providers.
- [ ] **[founder]** Pro Santé Connect: iSC account, Datapass request
      ([datapass.api.gouv.fr](https://datapass.api.gouv.fr/)), sandbox (set `PSC_*` on
      staging, redirect URI `{APP_URL}/api/auth/callback/psc`), then production. Count about a
      month; the Datapass probably needs the SIRET.

## 5. Data

- [ ] **[founder]** First full-France import from the import task. The first import after
      migration 0015 needs `--approve` ([data-import](data-import.md)); check the circuit
      breakers' report before approving.
- [ ] **[founder]** Restore test before opening booking, then monthly: download a backup and
      run `scripts/verify-backup.sh <file>`
      ([self-hosting](self-hosting.md#verify-a-backup)); rehearse a restore into a separate
      add-on once.

## 6. Opening booking

Only when all of these hold: HDS contract signed and production entirely on the HDS host,
DPIA signed, DPO appointed, processing agreement in the practitioner terms, restore tested.

- [ ] **[founder]** Set `PUBLIC_HDS_HOST` (e.g. `Clever Cloud`) and rebuild without cache
      ([§9](deploy-clever-cloud.md#9-switching-public_hds_host-on)): the public pages then
      name the host.
- [ ] **[founder]** Set `FEATURE_BOOKING=true` and `LEGAL_DPO_CONTACT` (production refuses
      booking without it).
- [ ] **[code]** Close before booking opens (from [security-review](security-review.md) and
      the DPIA draft): I-5 (claim PDFs as attachments); purge of rate-limit rows; raw IP
      addresses in the sign-in limiter's keys; an export of the patients' data for a
      practitioner who leaves. _Done (#63): purge of both audit logs after a year, of error
      reports and removal requests after closure, truncated session IPs hidden from the
      read-only role, closing a practice that holds booking data, TLS required for SMTP._
- [ ] **[founder]** Enable the `apercura_jobs` role (`ALTER ROLE apercura_jobs WITH LOGIN
      PASSWORD '…'`) and set `DATABASE_URL_JOBS` where `jobs:tick` runs: without it the audit
      logs are not purged. Use an `SMTP_URL` with `smtps://` or STARTTLS; never set
      `SMTP_ALLOW_INSECURE` in production.

## 7. Security

- [ ] **[review]** External penetration test on staging with synthetic data
      ([security-review, recommendations](security-review.md#recommendations)).
- [ ] **[founder]** `SECURITY_CONTACT` (a monitored mailbox or form) for
      `/.well-known/security.txt`; without it the legal contact is used.
- [ ] **[founder]** HSTS preload once the domain is final: every subdomain on HTTPS,
      `HSTS_PRELOAD=true`, rebuild, then submit at [hstspreload.org](https://hstspreload.org)
      ([§10](deploy-clever-cloud.md#10-search-engines-hsts-preload-monitoring)).
- [ ] **[founder]** GitHub: secret scanning with push protection; CodeQL `security-extended`.

## 8. Visibility and monitoring

- [ ] **[founder]** [Search Console](https://search.google.com/search-console) and
      [Bing Webmaster Tools](https://www.bing.com/webmasters): HTML tag method, set
      `GOOGLE_SITE_VERIFICATION` and `BING_SITE_VERIFICATION`, rebuild, verify, submit
      `/sitemap.xml`; follow the coverage of practitioner pages.
- [ ] **[founder]** Repository variable `PRODUCTION_URL` (and optionally
      `UPTIME_PRACTITIONER_PATH`) to turn on `.github/workflows/uptime.yml`; watch the `uptime`
      issues.

## 9. Accessibility and languages

- [ ] **[review]** Manual screen-reader pass (VoiceOver on macOS and iOS, NVDA on Windows) over
      search → practitioner page → booking → `/rdv`, and over Today and Week; then the RGAA
      audit of the 106 criteria ([rgaa-self-assessment](accessibility/rgaa-self-assessment.md)).
- [ ] **[review]** Publish the result in the accessibility statement (`AccessibilityPage`,
      every locale): conformance rate, non-conforming content, new date
      (`ACCESSIBILITY_STATEMENT_DATE`), and set `LEGAL_CONTACT_EMAIL` so the feedback channel
      is real.
- [ ] **[review]** Native speakers review the `de`, `es` and `it` catalogs (and `en`),
      legal pages first.
