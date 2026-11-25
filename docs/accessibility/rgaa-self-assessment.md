# RGAA 4.1 self-assessment

> **Self-assessment, not an audit.** It maps the 13 themes of RGAA 4.1 (version 4.1.2, 106
> criteria) to the evidence the repository holds: automated tests and the components that
> implement each requirement. It supports the interim accessibility statement
> (`/accessibilite`, "partially conforming, audit in progress") and does not replace the full
> audit, which must evaluate every criterion manually on a representative sample of pages with
> VoiceOver and NVDA. No conformance rate is claimed until that audit is published.

- **Date**: 22 November 2026 (`ACCESSIBILITY_STATEMENT_DATE` in `apps/web/src/lib/legal.ts`;
  update both together).
- **Scope**: the public site (home, search and results, listings, practitioner and
  establishment pages, institutional pages, the booking panel, `/rdv`) and the practitioner
  space (sign-in, claim, page editor, Today, Week, settings, team).
- **Target**: RGAA 4.1 and WCAG 2.2 level AA (PRODUCT.md, "Accessibility & Inclusion").
- **Environment of the automated evidence**: Chromium through Playwright, axe-core 4.14 rules
  tagged `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa` (`apps/web/e2e/axe.ts`), and a
  virtual screen reader (`@guidepup/virtual-screen-reader`, `apps/web/e2e/screen-reader.ts`)
  that reads the real pages of the production build.

## Status legend

| Status                 | Meaning                                                                                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Conforming (automated) | Every criterion of the theme that a tool can check is covered by a test that passes on every page type; the remaining criteria need a person (see "Manual"). |
| To verify manually     | The theme depends on judgement (relevance of an alternative, of a heading, of a link text) or on assistive technology a test cannot run.                     |
| Not applicable         | The site has no such content.                                                                                                                                |

"Conforming (automated)" is **not** a conformity claim for the theme: it says the automatable
part holds. Every theme stays open until the manual audit.

## Evidence by theme

| #   | Theme              | Evidence in the repository                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Status                                                                         |
| --- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 1   | Images             | axe `image-alt`, `svg-img-alt`, `role-img-alt` on every page (`e2e/*.spec.ts` via `axeViolations`). Decorative icons are `aria-hidden` (`packages/ui/src/icons`); practitioner photos carry an `alt` (`packages/ui/src/domain/practitioner-header.tsx`); the specimen card on the home page is announced as "Exemple fictif" (`e2e/screen-reader.spec.ts`).                                                                                                                                                                                         | To verify manually (relevance of alternatives, 1.3, 1.6)                       |
| 2   | Frames             | No `iframe` on any page; CSP `frame-src 'none'` (`apps/web/src/lib/security-headers.ts`).                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Not applicable                                                                 |
| 3   | Colours            | axe `color-contrast` on every page and state; every token pair checked at 4.5:1 for text and 3:1 for large text, edges and focus (`packages/ui/src/tokens/tokens.test.ts`); states never carried by colour alone (badges and words, `packages/ui/src/components/notice.tsx`, agenda legend read as a list).                                                                                                                                                                                                                                         | To verify manually (3.1 information by colour, non-text contrast 3.3)          |
| 4   | Multimedia         | No audio or video content.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Not applicable                                                                 |
| 5   | Tables             | Data tables use `th scope` and a name: search results ("Résultats"), the home commitments table, Today's day table (named by its heading since this assessment) — read as named tables with column headers by `e2e/screen-reader.spec.ts`. The week agenda and the slot picker are ARIA grids with row and column headers (`apps/web/src/components/pro/agenda/week-view.tsx`, `packages/ui/src/domain/slot-picker.tsx`). axe `td-headers-attr`, `th-has-data-cells`.                                                                               | Conforming (automated)                                                         |
| 6   | Links              | axe `link-name`; external links say "opens another site" to screen readers (`ExternalLink`, `apps/web/src/components/institutional.tsx`); link phrases asserted in the spoken logs (results, practitioner page, footer).                                                                                                                                                                                                                                                                                                                            | To verify manually (6.1 explicit link text in context)                         |
| 7   | Scripts            | React Aria Components for every interactive widget (combobox, dialog, radio group, grid, menu); keyboard journeys for booking and the week grid (`e2e/booking.spec.ts`, `e2e/agenda.spec.ts`); status messages through live regions: slot selection ("Sélectionné : …"), code errors (focus back on the field, error read with the attempts left), confirmation (`role="status"`), all asserted in `e2e/screen-reader.spec.ts`. Search and directory pages work without JavaScript (`e2e/search.spec.ts`).                                          | Conforming (automated); manual check of 7.1 and 7.3 with VoiceOver/NVDA        |
| 8   | Mandatory elements | `lang` on `<html>` per locale (`apps/web/src/app/[locale]/layout.tsx`); unique, descriptive `<title>` per page (`e2e/seo.spec.ts`); valid HTML from React; language switch links carry their `lang`. axe `html-has-lang`, `html-lang-valid`, `document-title`.                                                                                                                                                                                                                                                                                      | Conforming (automated); 8.2 (validity) to verify with the W3C validator        |
| 9   | Structure          | One `h1` per page and no skipped heading level, asserted on home, results, practitioner page, `/rdv`, Today and Week (`expectHeadingOutline` in `e2e/screen-reader.spec.ts`); landmarks banner, navigation (main, language, breadcrumb "Vous êtes ici", footer), main, search, complementary, contentinfo, named regions; lists marked up as lists; field rows as description lists read "label, value" (`FieldList`/`FieldRow`, `packages/ui/src/domain/field-row.tsx`).                                                                           | Conforming (automated); relevance of headings to verify                        |
| 10  | Presentation       | Reflow at 390 px on the pages that used to overflow (`e2e/directory.spec.ts`, `e2e/booking.spec.ts`); visible focus ring on Tab (`e2e/focus.spec.ts`); text of 18 px and targets of 44 px on patient pages (`DESIGN.md`); `prefers-reduced-motion` honoured (`packages/ui/src/styles/theme.css`); hidden content uses `sr-only` only for screen-reader additions.                                                                                                                                                                                   | To verify manually (10.4 text zoom 200 %, 10.12 text spacing, 10.11 at 320 px) |
| 11  | Forms              | Every field has a visible label tied to it (axe `label`, spoken "textbox, Prénom, required"); required fields announced; errors shown after submit, linked to their field (`aria-describedby`) and read with it ("Saisissez votre nom., invalid"); the code field takes the focus back on a wrong code and reads the attempts left; `autocomplete` on identity fields and on the address of a home visit (`street-address`, `address-level2` on the commune list, `e2e/home-visit.spec.ts`); grouped radios have a legend ("Motif du rendez-vous"). | Conforming (automated); 11.10 and 11.13 to verify manually                     |
| 12  | Navigation         | Skip link to the main content, also after client navigations (`e2e/navigation.spec.ts`, `e2e/pages.spec.ts`); breadcrumb navigation; two ways to reach a page (search, directory listings, sitemap); focus order follows reading order; the booking dialog traps and restores focus (`e2e/booking.spec.ts`).                                                                                                                                                                                                                                        | To verify manually (12.8 tab order on every page)                              |
| 13  | Consultation       | No time limit without control: the booking hold shows its end time and the code can be sent again (`apps/web/src/components/booking/booking-steps.tsx`); no content flashes; no new window without warning; documents are HTML (the `.ics` file is optional and duplicated by the page); orientation not locked.                                                                                                                                                                                                                                    | To verify manually (13.1, 13.8 moving content on the map)                      |

## Defects found and fixed during this assessment

| Where                                 | Defect                                                                                                                                                                 | Fix                                                                                                                       |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Booking panel, code step              | A wrong or missing code updated the field's error while the focus stayed on the submit button: a screen reader announced nothing (WCAG 4.1.3, 3.3.1; RGAA 7.5, 11.10). | The focus goes back to the code field once the error is rendered, which reads its label, the error and the attempts left. |
| Booking panel, code step              | The "code sent again" status was inserted together with its live region, which screen readers skip.                                                                    | The `role="status"` paragraph is always mounted and only its text changes.                                                |
| Practice Today view                   | The day's table had no accessible name (RGAA 5.4).                                                                                                                     | Named by its section heading ("Les rendez-vous du jour") through `aria-labelledby`.                                       |
| Practice Today and appointment dialog | Patient phone numbers were printed and spoken in E.164 (`+33612345678`), read by screen readers as one large number.                                                   | Printed as dialled in France (`06 12 34 56 78`); the `tel:` link keeps E.164.                                             |

## Known limits of the automated evidence

- The virtual screen reader computes names, roles, states and live announcements from the DOM;
  it does not reproduce what a given screen reader and browser pair speaks, nor timing (a real
  screen reader may read a field before or after its error is attached). The manual pass with
  VoiceOver (macOS Safari, iOS Safari) and NVDA (Windows Firefox, Chrome) is required.
- The results map (MapLibre) is an optional complement to the results table, which carries the
  same information; its own keyboard and screen-reader behaviour is not evaluated yet.
- axe-core finds a subset of WCAG failures; zero violations is a floor, not conformity.
- Pages were tested in French; the other locales share the components but their wording needs a
  native speaker's review (`docs/launch-checklist.md`).

## How to run the evidence

```sh
bun run test:e2e                                  # builds, then every spec (axe, keyboard, screen reader)
cd apps/web && bunx playwright test screen-reader # the screen-reader flows only
```

The screen-reader spec needs the same services as the booking specs (PostgreSQL with the
synthetic fixtures, Mailpit); see `apps/web/playwright.config.ts`.

## Next steps (manual audit)

1. Choose the sample (RGAA method): home, search results, a listing, an unclaimed and a claimed
   practitioner page, an establishment page, the booking panel (every step), `/rdv`, the data
   page, the accessibility statement, sign-in, the claim flow, the page editor, Today, Week,
   settings.
2. Evaluate the 106 criteria on each page, with VoiceOver and NVDA for themes 7, 9, 11 and 12.
3. Publish the conformance rate, the non-conforming content and any derogation in
   `/accessibilite` (catalog `AccessibilityPage`, every locale), and update the date.
