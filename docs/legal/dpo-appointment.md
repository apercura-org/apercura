# Appointment of a data protection officer (DPO)

> **DRAFT — not legal advice. To be reviewed and completed by a lawyer and the DPO before booking opens to patients.**
>
> Draft of 22 November 2026

## Why a DPO is required

Article 37(1) GDPR requires a DPO where the core activities of the controller **or the
processor** consist of:

- (b) processing operations which, by their nature, scope or purposes, require regular and
  systematic monitoring of data subjects on a large scale; or
- (c) processing on a large scale of special categories of data (art. 9).

Online booking processes health data (an appointment with a named practitioner) for
practitioners across France. This is a core activity of the publisher, which acts as
**processor** for each practitioner ([DPIA](dpia-draft.md), P2): article 37(1)(c) applies to
the publisher as processor, independently of the practitioners' own obligations. Whether
article 37(1)(b) also applies (it would require systematic monitoring, which the service does
not do by design) is **to confirm by the lawyer**; (c) is sufficient.

The directory alone (public data, no health data, no monitoring) would probably not require
a DPO, but the same organization runs both, and a single DPO covers all processing
operations of the publisher.

The DPO must be designated **before booking opens to patients** (the DPIA's action A-15).

## Options

| Option                          | Description                                                                                               | Points to weigh                                                                                                                                                          |
| ------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Internal DPO                    | A member of staff, under an employment contract                                                           | Knowledge of the product; risk of conflict of interest if they also decide on purposes and means (for example a founder, the publication director or the lead developer) |
| External DPO (service contract) | A firm or an individual under a service contract (art. 37(6))                                             | Expertise in health data and HDS; cost; must have enough time and access to the team                                                                                     |
| Shared DPO                      | A DPO shared with other organizations (art. 37(3) for public bodies; a group of undertakings, art. 37(2)) | Only if the structure qualifies; easy access from each establishment required                                                                                            |

Requirements in every case: expert knowledge of data protection law and practice, in
particular health data (art. 37(5)); no conflict of interest (art. 38(6)); easily reachable
by patients, practitioners and the CNIL, in French.

## Tasks (art. 39)

- Inform and advise the publisher, its staff and contributors on their obligations.
- Monitor compliance: records of processing, DPIA, processor agreements, retention, the
  access logs (`care.audit_events`, `directory.platform_audit_events`) and the administrators'
  use of claim documents, staff awareness, audits.
- Advise on and monitor the DPIA (art. 35), give the opinion in its validation section.
- Cooperate with the CNIL and act as its contact point, including for breach notifications
  and prior consultation (art. 36).
- Be the contact point for data subjects (art. 38(4)), including objections to directory
  pages (`/donnees#retrait`) and requests forwarded by practitioners.
- As DPO of a processor: assist practitioners on request (breach information, DPIA, rights).

## Independence and resources (art. 38)

- Involved properly and in a timely manner in all data protection issues (new features, new
  sub-processors, new countries).
- Receives no instructions on the exercise of their tasks; may not be dismissed or penalised
  for performing them; reports to the highest management level ({{REPORTING_LINE}}).
- Resources: time allocation of {{DPO_TIME_ALLOCATION}}, budget {{DPO_BUDGET}}, access to the
  repository, documentation, the read-only database role where needed (`apercura_readonly`,
  which sees no secret columns), the host's logs, and the people concerned.
- Bound by secrecy or confidentiality (art. 38(5)).

## Designation with the CNIL

The publisher designates the DPO to the CNIL through the CNIL's online designation form
(designation service on cnil.fr), giving the organization's identity ({{PUBLISHER_NAME}},
{{PUBLISHER_REGISTRATION}}, {{PUBLISHER_ADDRESS}}) and the DPO's contact details. The CNIL
acknowledges receipt; the receipt is kept with these documents ({{CNIL_RECEIPT_REFERENCE}}).
Any change of DPO is declared the same way.

## Where the DPO contact appears

- **Privacy page** (`/confidentialite`, `apps/web/src/app/[locale]/confidentialite/page.tsx`):
  the "Délégué à la protection des données" row (`PrivacyPage.fields.dpo` in
  `apps/web/messages/*.json`), filled from the `LEGAL_DPO_CONTACT` configuration variable
  (`apps/web/src/env.ts`, read through `apps/web/src/lib/legal.ts`). Unset, the page prints the
  `{{DPO_CONTACT}}` placeholder. Production refuses to start with `FEATURE_BOOKING` on and
  `LEGAL_DPO_CONTACT` unset ([configuration](../configuration.md)).
- The [records of processing](records-of-processing.md), the [DPIA](dpia-draft.md) and the
  [processor agreement](processor-agreement-draft.md) (practitioner terms annex).
- Emails sent to patients and requesters: a link to the privacy page (**to confirm**).
- `/.well-known/security.txt` for security reports, separate from the DPO contact (security
  review, recommendation 4).

## Checklist

- [ ] Choose the option (internal, external, shared) and check the absence of conflict of
      interest.
- [ ] Sign the appointment letter or service contract with {{DPO_NAME}}, including tasks,
      independence, resources and confidentiality.
- [ ] Create a functional contact address ({{DPO_CONTACT}}) that does not depend on one
      person's mailbox.
- [ ] Designate the DPO with the CNIL online form; keep the receipt.
- [ ] Set `LEGAL_DPO_CONTACT` in production; check the privacy page in every locale.
- [ ] Fill `{{DPO_NAME}}` and `{{DPO_CONTACT}}` in the records, the DPIA and the processor
      agreement.
- [ ] Have the DPO review and give an opinion on the DPIA (section 5) before booking opens.
- [ ] Give the DPO access to the documentation, the audit logs and the breach register.
- [ ] Tell practitioners the DPO's contact in the practitioner terms.
- [ ] Plan a yearly review of the records and the DPIA with the DPO ({{NEXT_REVIEW_DATE}}).

---

## Placeholders used

`{{PUBLISHER_NAME}}`, `{{PUBLISHER_REGISTRATION}}`, `{{PUBLISHER_ADDRESS}}`, `{{DPO_NAME}}`,
`{{DPO_CONTACT}}`, `{{REPORTING_LINE}}`, `{{DPO_TIME_ALLOCATION}}`, `{{DPO_BUDGET}}`,
`{{CNIL_RECEIPT_REFERENCE}}`, `{{NEXT_REVIEW_DATE}}`.
