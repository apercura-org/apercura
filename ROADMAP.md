# Roadmap

What Apercura does today is described in the [README](./README.md) and in [`docs/`](./docs).
This file lists what comes next, roughly in order of expected value. Nothing here is a promise
or a date; the work in progress is tracked in the
[issues](https://github.com/maxgfr/apercura/issues).

Every module below plugs into an extension point that already exists, or adds one. A new module
ships behind its own feature flag (`apps/web/src/server/features.ts`), off by default until it
is ready.

## Before launch

The launch blockers are not features. They are tracked in issues
[#32](https://github.com/maxgfr/apercura/issues/32) (accessibility and performance audits),
[#33](https://github.com/maxgfr/apercura/issues/33) (legal pages, DPIA, DPO, hosting contract)
and [#34](https://github.com/maxgfr/apercura/issues/34) (production deployment, backups,
monitoring), with the [launch checklist](./docs/launch-checklist.md).

## Next modules

1. **Embeddable booking widget** for the practitioner's own website, plus a "Book on Apercura"
   button.
2. **SMS reminders**, as a second `NotificationChannel` next to e-mail. Sending SMS costs money,
   so it needs a funding decision first.
3. **AI help for the page editor**: suggested presentation text and page layouts, built only
   from the practitioner's structured data, triggered by the practitioner, off without a key
   (`AiProvider`). It never invents a title, a diploma or a specialty, and never receives patient
   data. Medic Remplacement had a bio and headline generator that worked this way, one locale
   at a time.
4. **Pages managed by their structure**: health centres, multi-professional practices (MSP) and
   clinics edit their own establishment page and the agendas they host.
5. **Locum marketplace**, described in its own section below.
6. **Two-way calendar sync** with Google and Microsoft calendars. The private `.ics` feed exists
   today; this adds the other direction.
7. **Waiting list** and "earlier slot available" alerts for patients.
8. **Optional patient accounts**: booking history, booking for relatives. Booking without an
   account stays the default.
9. **Claim by post** (a code mailed to the registry address), and optional **end-to-end
   encryption** of free-text notes, sealed to the practice's public key.
10. **Give the enriched directory back** as open data (Licence Ouverte), geocoded and
    deduplicated.
11. **More countries**, one `CountryAdapter` each: Germany, the United Kingdom, Spain and Italy
    first ([ADR 0002](./docs/adr/0002-multi-country.md)), then Belgium, Switzerland and
    Luxembourg. Medic Remplacement already covered Belgium (INAMI numbers), Switzerland (GLN)
    and Germany (Approbation), with Dutch (`nl`) and Swiss German (`de-CH`) interfaces, and its
    notes live on in
    [`docs/reference/medical-systems-by-country.md`](./docs/reference/medical-systems-by-country.md).
12. **Teleconsultation**, with a video provider that meets the same hosting requirements as the
    rest of the booking data.

## Practitioner tools

Smaller additions to the pro area, most of them inherited from Medic Remplacement:

- **Page statistics**: views per day (an aggregated daily counter, no visitor tracking and no
  cookie), bookings per week, and a checklist of what is missing from the page with a completion
  score.
- **Share kit**: the page link and a printable QR code for the waiting room or the door plate.
- **In-app notifications**: a bell in the pro area for new bookings, pending requests and claim
  decisions, in addition to the e-mails. Booking e-mails already go through an outbox, so this is
  a second reader of the same events.
- **Blog or guides**: articles for patients ("how to find a midwife", "what a sector 2 fee
  means"), written as content files, not hard-coded pages.

## Locum marketplace

Apercura already models locums: an activity with the `locum` practice kind gets a public page
that says "locum doctor" and shows no patient booking. The marketplace adds the other half: a
practice that needs a replacement finds a locum, and a locum finds missions. It is a B2B module
between verified professionals; patients never see it.

This was the core of Medic Remplacement, the project Apercura replaces. Its code is not reused
(it was a different stack and data model), but its scope and rules are recorded here so the
module can be rebuilt without it.

### Scope

| Feature             | What it does                                                                                                                                                                                                                                                                                                          |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Missions**        | A practice posts a replacement need: title, specialty, dates, daily rate, place, description. Status `open`, `filled`, `cancelled` or `expired`. A mission that starts within 48 hours is flagged urgent automatically.                                                                                               |
| **Applications**    | A locum applies with a message; the practice accepts or declines. Status `pending`, `accepted` or `rejected`. Accepting one application fills the mission.                                                                                                                                                            |
| **Alerts**          | A locum sets criteria (specialties, a home location with a radius in km, default 50, between 1 and 500, a minimum daily rate) and channels (e-mail, in-app). A new mission that matches notifies them; an urgent mission says so. Locums without criteria are matched on their profile (specialty and travel radius). |
| **Availability**    | A per-day calendar: the locum marks days as available or not, with an optional note. One row per locum and day.                                                                                                                                                                                                       |
| **Direct booking**  | A practice asks a locum for given dates, with or without a mission; the locum confirms or declines. Status `pending`, `confirmed`, `rejected` or `cancelled`, with a cancellation deadline.                                                                                                                           |
| **Messaging**       | One conversation per practice and locum pair.                                                                                                                                                                                                                                                                         |
| **Favourites**      | A practice keeps a list of locums it has worked with.                                                                                                                                                                                                                                                                 |
| **History**         | Past missions for both sides.                                                                                                                                                                                                                                                                                         |
| **Marketplace hub** | Three tabs for the locum: "For you" (matching their alerts), "All missions", "My applications".                                                                                                                                                                                                                       |

### How it fits Apercura

- **Identity**: both sides are verified practitioners. A practice is an Apercura organization;
  a locum is a claimed practitioner page with a `locum` activity. No separate "cabinet" or
  "doctor" account type as in Medic Remplacement.
- **Places**: missions use the `places` table and PostGIS (`ST_DWithin` on `geography`), not the
  in-memory distance filter Medic Remplacement used.
- **Time**: mission and booking dates are civil dates in the site's time zone, not instants.
- **Notifications**: matching runs as a job over the outbox, not inside the request that creates
  the mission, so posting a mission stays fast however many locums match.
- **Data**: the marketplace holds no patient data, so it stays out of the `care` schema and its
  encryption and audit trail.
- **Countries**: missions carry a country, and the rules for replacements differ by country and
  profession (in France, a locum contract and a declaration to the Ordre). The module shows those
  rules; it does not handle the paperwork.

### Not carried over

- **Ratings between practices and locums, and the "Top locum" badge** (10 missions or more with
  an average rating of 4.5 or more in Medic Remplacement). Public ratings and rankings of
  practitioners conflict with the professional codes of conduct (`R.4127-19-1` for doctors).
  If feedback between professionals comes back, it stays private between the two parties and is
  reviewed with the Ordres first.

## Never

These are product decisions, not missing features:

- patient reviews, ratings or stars on practitioner pages;
- paid ranking, sponsored results or advertising;
- trackers or a cookie banner;
- artificial urgency ("only 2 slots left").
