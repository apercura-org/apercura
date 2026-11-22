# Data processing agreement (art. 28 GDPR) — online booking

> **DRAFT — not legal advice. To be reviewed and completed by a lawyer and the DPO before booking opens to patients.**
>
> Draft of 22 November 2026

Annex {{ANNEX_NUMBER}} to the practitioner terms of Apercura, effective {{EFFECTIVE_DATE}}.

**Between**

- the practitioner or practice that opens online booking on Apercura, identified by their
  account and organization in the application (the **Controller**); and
- {{PUBLISHER_NAME}}, {{PUBLISHER_LEGAL_FORM}}, registered under {{PUBLISHER_REGISTRATION}},
  whose registered office is at {{PUBLISHER_ADDRESS}}, represented by
  {{LEGAL_REPRESENTATIVE}} (the **Processor**).

The Controller accepts this agreement when opening online booking, before any patient can
book (acceptance mechanism: {{ACCEPTANCE_MECHANISM}}).

Note for reviewers: the Processor is the controller of the public directory, of practitioner
accounts and of claims; those operations are outside this agreement (see the
[records of processing](records-of-processing.md), part 1).

---

## 1. Subject

This agreement sets out the terms under which the Processor processes personal data on behalf
of the Controller for online booking and agenda management, in accordance with article 28(3)
GDPR and article L.1111-8 of the Code de la santé publique.

## 2. Duration

The agreement applies from the opening of online booking by the Controller until the later of
(a) the end of the practitioner terms or the closing of the Controller's booking, and (b) the
deletion or return of the data under [section 13](#13-end-of-the-processing-deletion-and-return).

## 3. Nature and purpose of the processing

| Item     | Description                                                                                                                                                                                                                                                                            |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nature   | Collection, recording, storage, encryption, consultation by the Controller's team, transmission by email, provision through a calendar feed, erasure                                                                                                                                   |
| Purposes | Publishing the Controller's free slots; letting patients book, confirm, reschedule and cancel; managing the agenda; sending codes, confirmations, reminders and notices; supplying the Controller's calendar app; recording access to patient data; securing the service against abuse |
| Means    | The Apercura web application, its scheduled jobs and its database, operated by the Processor on an HDS-certified host                                                                                                                                                                  |

## 4. Types of personal data and categories of data subjects

| Data subjects                    | Data                                                                                                                                                                                                                                                                                                                                                                |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Patients                         | First and last name, email address, phone number (unless the Controller turns it off), answer to "first visit?" (if asked), language of emails; the appointment (practitioner, place, date, time, status, appointment type chosen by the Controller); message of the Controller attached to a cancellation; verification codes and access tokens (stored as hashes) |
| Members of the Controller's team | Identity and actions recorded in the access log and in the history of appointments                                                                                                                                                                                                                                                                                  |

These data include **health data** (art. 9 GDPR): an appointment with a named practitioner.
The Controller undertakes not to name appointment types in a way that discloses more health
information than needed (for example a diagnosis).

## 5. Documented instructions of the Controller

1. The Processor processes the data only on the documented instructions of the Controller,
   including with regard to transfers outside the EEA. This agreement, the practitioner terms
   and the settings the Controller chooses in the application (open or paused calendar,
   appointment types, data asked to the patient, manual validation, retention period from 30
   to 365 days, calendar feed and whether it shows full names, team members and their roles)
   are the Controller's instructions.
2. The Processor informs the Controller immediately if, in its opinion, an instruction
   infringes data protection law.
3. The Processor uses the data for no purpose of its own. The security processing it carries
   out (access log, limits per IP address and per email, proof of work) serves the
   Controller's service and is part of these instructions.
4. Where Union or Member State law requires the Processor to process the data otherwise, it
   informs the Controller before processing, unless that law prohibits it.

## 6. Confidentiality

1. The persons authorised by the Processor to process the data are bound by confidentiality
   ({{CONFIDENTIALITY_INSTRUMENT}}: contract clause or statutory obligation) and are informed
   of the medical secrecy that applies to the data (art. L.1110-4 CSP).
2. Platform administrators of the Processor have **no access to patient data** in the
   application: they carry no organization, and patient fields are decrypted only for members
   of the Controller's team ([configuration](../configuration.md#platform-administrators)).
3. Operator access to the infrastructure (database, environment, backups) is limited to
   {{OPERATOR_ACCESS_LIST}} and logged by the host.

## 7. Security of the processing (art. 32)

The Processor implements at least the following measures, described with their references in
the [records of processing](records-of-processing.md#p-1-online-booking-and-agenda-on-behalf-of-practitioners)
and the [security review](../security-review.md):

| Area           | Measures                                                                                                                                                                                                                                                                                                           |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Hosting        | Production on an HDS-certified host in France (see [section 15](#15-hds-hosting)); separate staging with synthetic data only                                                                                                                                                                                       |
| Encryption     | Patient fields encrypted in the application (AES-256-GCM) with a data key specific to the Controller's organization, wrapped by master keys; searchable fields through blind indexes keyed per organization; TLS between browsers and the application (HSTS); TLS required on the connection to the email provider |
| Access control | Second factor for every team member; roles owner, practitioner and assistant; organization checked on every request; separate database roles for the application, the import and read-only support                                                                                                                 |
| Traceability   | Every decryption of patient data recorded (who, when, why, which records), append-only for the application, viewable by the Controller's owner                                                                                                                                                                     |
| Minimisation   | Emails carry no specialty and no reason; calendar feed shows initials by default; patient data erased automatically at the end of the retention period                                                                                                                                                             |
| Resilience     | Daily backups by the host ({{BACKUP_POLICY}}), restore tested before opening; key rotation procedure                                                                                                                                                                                                               |
| Testing        | Automated tests of access control, encryption boundary and database roles; external penetration test before opening ({{PENTEST_STATUS}})                                                                                                                                                                           |

The Processor may update these measures provided the overall level of security is not
reduced.

## 8. Sub-processors

1. **Prior general authorisation.** The Controller gives the Processor a general authorisation
   to engage the sub-processors listed below.

   | Sub-processor     | Service                                                       | Location                  | Guarantees                                                                       |
   | ----------------- | ------------------------------------------------------------- | ------------------------- | -------------------------------------------------------------------------------- |
   | {{HOST_NAME}}     | Hosting of the application, database, files, jobs and backups | France ({{HOST_ADDRESS}}) | HDS certification of the host; HDS contract {{HDS_CONTRACT_REFERENCE}} (planned) |
   | {{SMTP_PROVIDER}} | Sending of emails to patients and to the Controller's team    | {{SMTP_LOCATION}} (EEA)   | {{SMTP_DPA_REFERENCE}}                                                           |

2. **Changes.** The Processor informs the Controller of any intended addition or replacement
   of a sub-processor at least {{NOTICE_PERIOD}} in advance, by email and in the application.
   The Controller may object on reasonable grounds within that period; if no solution is
   found, the Controller may close its online booking and terminate the practitioner terms
   for booking without penalty.
3. The Processor imposes on each sub-processor, by contract, the same data protection
   obligations as in this agreement, and remains fully liable to the Controller for them.
4. **Not sub-processors.** The following receive data because the user chose them or because
   email works that way, and are outside the Processor's control: the patient's mailbox
   provider; the calendar provider whose servers read the Controller's calendar feed (the
   Controller decides whether to create a feed and may revoke it at any time); the map tile
   server used by public pages (it receives visitors' IP addresses, not booking data).

## 9. Transfers outside the EEA

The Processor and its sub-processors process the data within the EEA. No transfer outside
the EEA takes place without the Controller's prior written instruction and appropriate
safeguards (Chapter V GDPR). The limits in [section 8.4](#8-sub-processors) apply.

## 10. Assistance with data subject rights

1. Patients exercise their rights with the Controller. The application lets the Controller's
   team read, create, decide on and cancel appointments (`apps/web/src/trpc/routers/agenda.ts`);
   patients can cancel or reschedule through their private link. Editing a patient's details
   after booking is not offered in the agenda (**to confirm**).
2. The Processor assists the Controller, by appropriate technical and organisational
   measures, in answering requests for access, rectification, erasure, restriction,
   portability and objection, within {{ASSISTANCE_DELAY}} of a request. Tools to export the
   data of one patient and to erase it before the end of the retention period are planned
   (**to confirm**); until they exist, the Processor carries out such requests on the
   Controller's written instruction.
3. A request received directly by the Processor is forwarded to the Controller without undue
   delay; the Processor does not answer it itself, except to redirect the patient.

## 11. Personal data breaches

1. The Processor notifies the Controller of any personal data breach **without undue delay
   after becoming aware of it, with a target of 48 hours**, so that the Controller can notify
   the CNIL within 72 hours (art. 33) and, where required, the patients (art. 34).
2. Notification is sent to the email address of the Controller's owner account and to
   {{CONTROLLER_NOTIFICATION_CONTACT}}, and includes, as far as known: the nature of the
   breach, categories and approximate number of patients and records concerned, the likely
   consequences, the measures taken or proposed, and the contact of the Processor's DPO
   ({{DPO_CONTACT}}). Information may be provided in phases.
3. The Processor documents every breach and keeps the Controller informed until it is closed.
4. A breach involving health data hosted under HDS is also reported as the HDS framework
   requires (**to confirm** with the host and the lawyer).

## 12. Assistance with security, DPIA and prior consultation

The Processor assists the Controller in ensuring compliance with articles 32 to 36,
in particular by providing its [DPIA](dpia-draft.md) of online booking, which the Controller
may rely on and complete, and the information needed for a prior consultation of the CNIL
where required.

## 13. End of the processing: deletion and return

1. Patient data are erased automatically at the end of each appointment's retention period
   (90 days by default, 30 to 365 days as set by the Controller), by an audited purge job
   (`apps/web/src/server/booking/jobs.ts`). Details of online bookings never confirmed by code
   are erased after 24 hours.
2. When the processing ends, the Controller chooses, within {{CHOICE_PERIOD}}, between:
   (a) **return**: an export of its agenda and patient data in a structured, commonly used
   format ({{EXPORT_FORMAT}}). The existing account export
   (`/api/pro/account-export`) covers the account, not patient data; an agenda export is
   planned (**to confirm** before booking opens);
   (b) **deletion**: erasure of all remaining patient data of the Controller within
   {{DELETION_PERIOD}}.
   Without a choice, the data are deleted.
3. Backups are not altered; they expire under the host's rotation ({{BACKUP_POLICY}}, about
   7 days for daily database backups on the planned host). They contain encrypted data only.
4. The Processor confirms the deletion in writing on request. Data that the law requires the
   Processor to keep are kept only for that purpose and duration.
5. Rows of appointments kept for the agenda history after the purge contain no patient
   identity (times, status, appointment type, first-visit answer). Their deletion at the end
   of the processing is **to confirm**.

## 14. Information and audits

1. The Processor makes available to the Controller all information necessary to demonstrate
   compliance with article 28: this agreement, the records of processing, the DPIA, the
   security review, the host's HDS certificate and the list of sub-processors. The source code
   of the application is public (AGPL-3.0).
2. The Controller may carry out, or have carried out by an independent auditor bound by
   confidentiality, an audit of the processing, with {{AUDIT_NOTICE}} prior notice, at most
   {{AUDIT_FREQUENCY}}, during working hours and without access to other controllers' data.
   Audit costs: {{AUDIT_COSTS}}. Audits of the host follow the host's own audit terms.
3. The Controller's owner can read the access log of its patient data in the application at
   any time.

## 15. HDS hosting

1. In accordance with article L.1111-8 of the Code de la santé publique, the health data
   processed under this agreement are hosted by a host certified for health data hosting (HDS)
   for the relevant activities, under a hosting contract that meets the requirements of that
   article.
2. Planned host: {{HOST_NAME}}, {{HOST_ADDRESS}}, {{HOST_PHONE}} (Clever Cloud, HDS region
   `parhds`, Paris). The HDS contract is **planned and not signed** at the date of this
   draft; online booking is not opened to patients before it is signed and production runs
   entirely in the HDS perimeter (application, database, jobs, files, backups).
3. Once production runs there, Apercura is described as hosted by an HDS-certified host;
   Apercura itself is not certified. The public pages name the host only from that moment
   (`PUBLIC_HDS_HOST`).
4. The Processor informs the Controller of any change of host under [section 8](#8-sub-processors),
   and of any loss or suspension of the host's certification without delay.

## 16. Obligations of the Controller

The Controller: provides patients with the information required by article 13 (the
Processor supplies a template, **to confirm**); determines the legal basis of its processing;
chooses the retention period and the data asked; keeps its team list and roles up to date and
removes leaving members; protects its accounts with a second factor; decides whether to create
a calendar feed and whether it shows full names, and rotates or revokes it when needed.

## 17. Liability

{{LIABILITY_CLAUSE}} (to be drafted by the lawyer, consistent with article 82 GDPR and the
practitioner terms).

## 18. Governing law and changes

This agreement is governed by French law ({{JURISDICTION}}). The Processor may update it to
reflect changes in law or in the service, with {{NOTICE_PERIOD}} notice; changes that reduce
the protection of the data require the Controller's agreement.

## Signatures

| Party      | Name                     | Capacity               | Date               | Signature or acceptance |
| ---------- | ------------------------ | ---------------------- | ------------------ | ----------------------- |
| Controller | {{CONTROLLER_NAME}}      | {{CONTROLLER_RPPS}}    | {{SIGNATURE_DATE}} |                         |
| Processor  | {{LEGAL_REPRESENTATIVE}} | For {{PUBLISHER_NAME}} | {{SIGNATURE_DATE}} |                         |

Processor contacts: {{CONTACT_EMAIL}}, {{PUBLISHER_PHONE}}; DPO {{DPO_NAME}},
{{DPO_CONTACT}}.

---

## Placeholders used

`{{ANNEX_NUMBER}}`, `{{EFFECTIVE_DATE}}`, `{{PUBLISHER_NAME}}`, `{{PUBLISHER_LEGAL_FORM}}`,
`{{PUBLISHER_REGISTRATION}}`, `{{PUBLISHER_ADDRESS}}`, `{{PUBLISHER_PHONE}}`,
`{{LEGAL_REPRESENTATIVE}}`, `{{ACCEPTANCE_MECHANISM}}`, `{{CONFIDENTIALITY_INSTRUMENT}}`,
`{{OPERATOR_ACCESS_LIST}}`, `{{BACKUP_POLICY}}`, `{{PENTEST_STATUS}}`, `{{HOST_NAME}}`,
`{{HOST_ADDRESS}}`, `{{HOST_PHONE}}`, `{{HDS_CONTRACT_REFERENCE}}`, `{{SMTP_PROVIDER}}`,
`{{SMTP_LOCATION}}`, `{{SMTP_DPA_REFERENCE}}`, `{{NOTICE_PERIOD}}`, `{{ASSISTANCE_DELAY}}`,
`{{CONTROLLER_NOTIFICATION_CONTACT}}`, `{{DPO_NAME}}`, `{{DPO_CONTACT}}`, `{{CHOICE_PERIOD}}`,
`{{EXPORT_FORMAT}}`, `{{DELETION_PERIOD}}`, `{{AUDIT_NOTICE}}`, `{{AUDIT_FREQUENCY}}`,
`{{AUDIT_COSTS}}`, `{{LIABILITY_CLAUSE}}`, `{{JURISDICTION}}`, `{{CONTROLLER_NAME}}`,
`{{CONTROLLER_RPPS}}`, `{{SIGNATURE_DATE}}`, `{{CONTACT_EMAIL}}`.
