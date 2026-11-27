---

name: Apercura
description: The open directory and free booking tool for every health practitioner in France, set as a calm, sober health-service interface in light and dark.
colors:
paper: "oklch(1 0 0)"
paper-shade: "oklch(0.977 0.003 260)"
ink: "oklch(0.23 0.014 260)"
ink-muted: "oklch(0.47 0.014 260)"
ink-disabled: "oklch(0.6 0.01 260)"
rule-soft: "oklch(0.91 0.005 260)"
field-edge: "oklch(0.6 0.012 260)"
stamp: "oklch(0.47 0.13 285)"
stamp-strong: "oklch(0.4 0.12 285)"
stamp-tint: "oklch(0.965 0.016 285)"
error: "oklch(0.52 0.16 25)"
error-tint: "oklch(0.97 0.013 25)"
colorsDark:
paper: "oklch(0.2 0.01 260)"
paper-shade: "oklch(0.235 0.011 260)"
ink: "oklch(0.95 0.005 260)"
ink-muted: "oklch(0.77 0.012 260)"
ink-disabled: "oklch(0.59 0.01 260)"
rule-soft: "oklch(0.32 0.012 260)"
field-edge: "oklch(0.6 0.012 260)"
stamp: "oklch(0.78 0.1 285)"
stamp-strong: "oklch(0.85 0.075 285)"
stamp-tint: "oklch(0.28 0.04 285)"
error: "oklch(0.74 0.14 25)"
error-tint: "oklch(0.27 0.045 25)"
typography:
display:
fontFamily: "Allo, Allo Fallback, sans-serif"
fontSize: "clamp(2.5rem, 1.9rem + 2.6vw, 3.5rem)"
fontWeight: 600
lineHeight: 1.05
letterSpacing: "-0.028em"
headline:
fontFamily: "Allo, Allo Fallback, sans-serif"
fontSize: "clamp(1.875rem, 1.55rem + 1.3vw, 2.375rem)"
fontWeight: 600
lineHeight: 1.15
letterSpacing: "-0.022em"
title:
fontFamily: "Allo, Allo Fallback, sans-serif"
fontSize: "1.5rem"
fontWeight: 600
lineHeight: 1.25
letterSpacing: "-0.014em"
subtitle:
fontFamily: "Allo, Allo Fallback, sans-serif"
fontSize: "1.25rem"
fontWeight: 600
lineHeight: 1.3
letterSpacing: "-0.008em"
lead:
fontFamily: "Allo, Allo Fallback, sans-serif"
fontSize: "1.25rem"
fontWeight: 400
lineHeight: 1.5
body:
fontFamily: "Allo, Allo Fallback, sans-serif"
fontSize: "1.125rem"
fontWeight: 400
lineHeight: 1.6
fontFeature: "'cv03', 'cv04'"
meta:
fontFamily: "Allo, Allo Fallback, sans-serif"
fontSize: "1rem"
fontWeight: 400
lineHeight: 1.5
label:
fontFamily: "Allo, Allo Fallback, sans-serif"
fontSize: "1rem"
fontWeight: 600
lineHeight: 1.5
caption:
fontFamily: "Allo, Allo Fallback, sans-serif"
fontSize: "0.875rem"
fontWeight: 600
lineHeight: 1.35
rounded:
mark: "6px"
field: "10px"
panel: "14px"
full: "9999px"
spacing:
page-gutter: "20px"
page-gutter-wide: "32px"
section: "64px"
target: "44px"
shadows:
overlay: "0 12px 32px -12px, 0 2px 6px -2px (ink at 16 %, black at 50 % in dark)"
components:
button-accent:
backgroundColor: "{colors.stamp}"
textColor: "{colors.paper}"
rounded: "{rounded.field}"
padding: "0 18px"
height: "44px"
button-accent-hover:
backgroundColor: "{colors.stamp-strong}"
textColor: "{colors.paper}"
button-outline:
backgroundColor: "{colors.paper}"
textColor: "{colors.ink}"
borderColor: "{colors.field-edge}"
rounded: "{rounded.field}"
padding: "0 18px"
height: "44px"
button-outline-hover:
backgroundColor: "{colors.paper-shade}"
borderColor: "{colors.ink}"
field:
backgroundColor: "{colors.paper}"
textColor: "{colors.ink}"
borderColor: "{colors.field-edge}"
rounded: "{rounded.field}"
padding: "10px 14px"
height: "48px"
badge-verified:
backgroundColor: "{colors.stamp-tint}"
textColor: "{colors.stamp}"
rounded: "{rounded.full}"
typography: "{typography.caption}"
slot-booked:
backgroundColor: "{colors.stamp}"
textColor: "{colors.paper}"
rounded: "{rounded.field}"
width: "80px"
height: "56px"
---

# Design System: Apercura

## Overview

**Creative North Star: "The Well-Kept Practice Sheet"**

Every practitioner in France already has a page, filled in from the national register. The interface reads like a well-kept practice information sheet at a good clinic: plain facts on a white (or, in the dark theme, deep graphite) ground, hairline rules between them, one clear next action, and the source of every fact printed underneath. It is sober and professional on purpose: patients arrive worried, on a phone, often older; practitioners are busy and wary of platforms. Nothing decorates, nothing shouts.

It replaces the first version's "pre-printed booklet" costume (caps running heads, dotted leaders, a stamp with an inner frame, square 2 px corners): the honesty of that world stays (empty fields say so, every page states its source), its printed-form props go.

Apercura is a public-interest project, not a government service: no Marianne, no tricolour, no DSFR component. It does not imitate Doctolib: no bright blue, no cards over stock photos, no ratings.

**Key characteristics**

- White paper and a cool near-neutral shade, one graphite ink, one indigo-violet accent, muted red only for errors. The same roles in a dark theme.
- Allo, one family, with tabular figures for times, fees, counts and numbers.
- Hairline borders (1 px) and soft corners on one scale: 6 px marks, 10 px controls, 14 px panels and stamps. One shadow, for overlays only.
- Generous space: 64 px between sections, 18 px body text, 44 px targets.
- Calm motion: short colour transitions, a 180 ms slip for overlays, nothing else.

## Colors

Restrained: neutrals tinted a few degrees cool (hue 260, chroma ≤ 0.015) and one accent. The values live in `packages/ui/src/tokens/index.ts` (`palette`, `paletteDark`) and `packages/ui/src/styles/theme.css` (`--light-*`, `--dark-*`); `tokens.test.ts` keeps them in sync and checks every pair below in both themes.

| Role           | Token          | Light            | Dark             | Use                                                                                                                          |
| -------------- | -------------- | ---------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Ground         | `paper`        | #ffffff          | #13161b          | Page ground, the header, fields, panels.                                                                                     |
| Quiet surface  | `paper-shade`  | #f6f7f9          | #1b1e23          | Page openings, the footer, panel title strips, hovered rows, skeletons.                                                      |
| Ink            | `ink`          | #191d24 (16.9:1) | #eceff2 (15.6:1) | All text, selected tabs, checked boxes, the "now" markers, blocks in the agenda.                                             |
| Muted ink      | `ink-muted`    | #565b63 (6.8:1)  | #b0b4bc (8.7:1)  | Secondary facts, hints, placeholders, field labels in fact lists, "Non renseigné".                                           |
| Disabled ink   | `ink-disabled` | #7d8086 (3.9:1)  | #7a7d83 (4.4:1)  | Disabled controls (exempt, kept ≥ 3:1).                                                                                      |
| Hairline       | `rule-soft`    | #dfe1e5          | #2f3339          | Borders of panels and rows. Decorative: never the only boundary of a control.                                                |
| Control edge   | `field-edge`   | #7c8088 (3.9:1)  | #7c8088 (4.6:1)  | Field, outline button and search frame borders (≥ 3:1 on paper and shade).                                                   |
| Accent         | `stamp`        | #554da0          | #b0aff5          | The primary action, verified pages, booked slots, the focus ring. Its label (`paper` on `stamp`) is 7.1:1 light, 8.9:1 dark. |
| Accent pressed | `stamp-strong` | #433a85          | #c8c8fe          | Hover and press of the accent button.                                                                                        |
| Accent wash    | `stamp-tint`   | #f2f2fe          | #27263c          | Behind verified and booked marks (accent text on it 6.4:1, 7.2:1).                                                           |
| Error          | `error`        | #b33736 (6.0:1)  | #f7857d (7.4:1)  | Error text, invalid field edges, the error mark.                                                                             |
| Error wash     | `error-tint`   | #fef2f1          | #3a1d1b          | Behind error notices.                                                                                                        |

The token names `stamp*` are kept from v1 for code stability; in prose they are "the accent".

**The accent law.** The accent means exactly: an action that moves the visitor forward (search, book, claim, confirm, save), a verified page, a booked slot, and the keyboard focus ring. It covers 10 % of a screen or less. A selection that is not a booking (a chosen date, a checked box, a selected tab, the current language) is ink, never the accent.

**The red law.** Red is for errors only, and every error also carries the boxed exclamation and words.

**The achromatic text law.** Running text is ink or muted ink, never the accent or red (badges and the error message line excepted, both also marked by an icon or a border).

**What stays light in the dark theme.** QR codes (`QrCode`) and the share kit's poster preview carry the `scheme-light` utility: dark modules on a white quiet zone, which every scanner reads, and a preview of what will be printed. Photos are dimmed to 92 % brightness on the dark ground. Emails are not themed.

## Theme

Light, dark, or the system's (the default), chosen in the footer and remembered on the device (`localStorage`, key `apercura-theme`).

- `/theme.js` (`apps/web/src/app/theme.js/route.ts`, body in `src/lib/theme.ts`) is a small same-origin script that every root layout loads in `<head>`, so it runs before the first paint: it sets `data-theme="light|dark"` on `<html>` when a choice is stored, and `data-js` always. It also drives the theme control (checks the stored choice, stores a new one, follows other tabs and client-side navigations), so the control ships no React code. It is prerendered at build time and cached an hour; the CSP (`script-src 'self'`) is unchanged.
- The pages stay static: the HTML is the same for every visitor and every theme, and no request reads the choice.
- `theme.css` points the `--color-*` tokens at the dark values under `:root[data-theme="dark"]` and under `@media (prefers-color-scheme: dark)` for `:root:not([data-theme="light"])`. Without JavaScript the system decides and the theme control (which needs JavaScript) stays hidden.
- `<meta name="theme-color">` follows the system scheme; `color-scheme: light dark` lets form controls and scrollbars follow.
- The map re-inks itself from `mapPalette` or `mapPaletteDark` (`packages/ui/src/map/map-runtime.ts`) and follows a theme change while open.

## Typography

**Allo** (Josh Puckett, SIL OFL 1.1, npm `allo-font`), the only family. A humanist-leaning grotesque with softened corners, optical sizes and a full set of figures; calm and friendly without being cute.

- **Files.** `apps/web/src/fonts/allo/build.sh` cuts the variable font down to what the site sets and vendors the result with `OFL.txt`: roundness fixed at 25, optical size fixed at 18 (text and headings share one file), weights 400–700, Fontsource's latin and latin-ext ranges, the default features plus `tnum`, `case`, `cv03` and `cv04`. `allo-latin.woff2` is 54 KB (Archivo plus Atkinson weighed about 135 KB) and is preloaded; `allo-latin-ext.woff2` loads only on a page that needs it. Loaded by `next/font/local` (`apps/web/src/app/fonts.ts`), `font-display: swap`, served from the site's own origin. The fallback is Arial scaled to Allo's metrics (`fonts.css`), so the swap does not reflow.
- **Open Graph images** use static WOFF cuts (500 and 600, Display optical size) in `src/fonts/allo/og`, listed in `src/server/og/font-files.ts` and shipped with the standalone build through `outputFileTracingIncludes`.
- **Legibility.** Body copy turns on the tailed l and the serifed I (`cv03`, `cv04`), so Il1 never read alike for low-vision readers; headings, labels and captions keep the plain forms.
- **Figures.** Times, fees, counts, phone and RPPS numbers use `tabular` (tabular lining figures), and every table does by default.

### Scale

Each role is a utility in `theme.css`.

| Role     | Utility         | Size                  | Weight | Line height | Tracking  | Use                                                                             |
| -------- | --------------- | --------------------- | ------ | ----------- | --------- | ------------------------------------------------------------------------------- |
| Display  | `type-display`  | clamp 2.5–3.5 rem     | 600    | 1.05        | −0.028 em | The home page heading only.                                                     |
| Headline | `type-headline` | clamp 1.875–2.375 rem | 600    | 1.15        | −0.022 em | Page titles (practitioner name, "Agenda").                                      |
| Title    | `type-title`    | 1.5 rem               | 600    | 1.25        | −0.014 em | Section headings.                                                               |
| Subtitle | `type-subtitle` | 1.25 rem              | 600    | 1.3         | −0.008 em | Sub-sections, panel and dialog titles, place names.                             |
| Wordmark | `type-wordmark` | 1.25 rem              | 650    | 1.2         | −0.02 em  | Header and footer.                                                              |
| Lead     | `text-lead`     | 1.25 rem              | 400    | 1.5         |           | Introductions, professions under a name.                                        |
| Body     | `text-body`     | 1.125 rem (18 px)     | 400    | 1.6         |           | Running text, at most 65 ch. The floor on patient surfaces.                     |
| Meta     | `text-meta`     | 1 rem                 | 400    | 1.5         |           | Hints, secondary facts, provenance, navigation.                                 |
| Label    | field `label`   | 1 rem                 | 600    | 1.5         |           | Form field labels.                                                              |
| Caption  | `type-caption`  | 0.875 rem             | 600    | 1.35        |           | Column headers, search cell captions, badges, the "now" markers. Sentence case. |

Hierarchy comes from size steps, weight and space; colour never carries it. No capitals for emphasis, no tracked-out labels, no kicker above a heading.

## Logo

The symbol ("Pin a") is a round tile with one sharp corner, a map pin tipped onto its point and a geometric single-storey a; its counter is a window holding a dot, the point of care. The wordmark is "apercura" in Allo 650 at -0.02 em, outlined, its x-height centred on the symbol. No cross, no snake, no state emblem.

- **Source.** One geometry, `packages/ui/src/brand/geometry.ts` (a 64-unit grid, 4 units to a pixel at 16 px), read by everything that draws the logo. The standalone files are in `docs/brand/` (symbol and lockup in light, dark and mono, and the app icon) with the usage note; `brand.test.ts` keeps them, and the favicon, equal to the geometry.
- **Colours.** Ink and accent only: `ink` for the tile and the wordmark, `stamp` for the dot (#191d24 and #554da0 light, #eceff2 and #b0aff5 dark). The dot is the one place the accent appears outside the accent law: it is the brand, not an action. Mono files draw everything in the current colour; nothing else is recoloured.
- **Header.** `BrandLogo`, 24 px high: the symbol as inline SVG and the wordmark as live text in the web font (`type-wordmark`, 650, -0.02 em), its x-height matched to the outlines' and centred on the symbol, so a page carries a few bytes instead of the outlines. The ink is `currentColor`, so it follows the theme; the dot is `fill-stamp`, and the current colour in forced colours. Hidden from assistive technology (`aria-hidden`): the link around it carries the name ("Apercura, accueil") and leads to the market's home. Images and files use the outlined lockup (`BrandLockup`, the builders).
- **Icons.** `app/icon.svg` is the favicon, light or dark with the browser's scheme. `/icon/{48,192,512}` are the symbol on white (`/favicon.ico` redirects to the 48 px one); `/apple-icon` and the manifest's maskable icons (`/brand/apercura-maskable-{192,512}.png`) are the app icon, the symbol at 60 % on white, inside the maskable safe zone. The Organization logo is `/brand/apercura-logo.png` (512 px).
- **Open Graph.** The light lockup takes the place of the printed name: large on the profession images, small under a guide's title, at the top right of a practitioner's card.
- **Use.** Clear space of a quarter of the symbol's height around it; never under 16 px high, and the symbol alone below about 24 px. Don't stretch, rotate, outline or recolour it.

## Layout and spacing

- One centred column, `max-width: 72rem`, 20 px gutters (32 px from 640 px).
- The header: 64 px, white, a hairline below; wordmark left, "Professionnels de santé", then the country menu ("Pays France") and the language menu ("Langue Français") right: two separate choices, the market and the language its pages are read in. On a phone the two menus take a second row. The practitioner space adds its navigation as quiet tabs (current page: shade, semibold, underlined).
- Page openings (home, search, institutional pages, the practitioner space) sit on the quiet shade closed by a hairline; practitioner, listing and establishment pages open on the ground under their breadcrumb.
- Sections are 64 px apart (`BookletPage`), more space above a heading than below. Content splits 5/7 from 768 px (heading and intro left, facts right) and stacks below.
- The home is one template for every market (`apps/web/src/app/[locale]/page.tsx`): the same sections in the same order, filled with the market's own pages. The opening: the promise as the display heading (« Trouvez un professionnel de santé en France »), the complementary line in muted lead, then the search, left-aligned, on eight of the twelve columns; the sample stamps on the last four, one per state of a page, fictitious and of the kind the market lists (a practitioner in France, a practice in the UK, a facility in Germany: `src/lib/home-samples.ts`); the brand lives in the header. Below: the specimen page of the same kind, the directory (the largest listings by kind, then the places, each a hub, and the link to the directory by place), the four commitments in a ruled row of four columns (two on tablets, stacked on phones), the sources and figures (live per kind, with their source, dated with the last import), and the practitioners' call. A section with nothing to show (before the first import) is left out, heading and all.
- A practitioner page reads patients first on every screen: the appointment block, then the facts (presentation, profession, places, practical information, fees), then what concerns the practitioner (claim, removal) and corrections. From 1024 px the appointment block and the page's own matters share the right column.
- Every target is at least 44 px; the layout survives 400 % zoom.

## Elevation and shape

- **Borders, not boxes.** Hairline (`rule-soft`) borders around panels and between rows; `field-edge` for controls. No heavy ink rules.
- **Corners.** One scale (`radii` in `packages/ui/src/tokens/index.ts`, `--radius-*` in `theme.css`, kept in sync by `tokens.test.ts`): 6 px (`rounded-mark`) for badges, menu rows, checkboxes and agenda tiles; 10 px (`rounded-field`) for fields, buttons, selects and slots; 14 px (`rounded-panel`) for the stamps, panels, dialogs, notices, menus, the specimen, the map and the agenda; full round for radios, switch knobs, seals. No square corner, no double rule: sections are closed by a single hairline (`rule-t`, `rule-b`).
- **One shadow** (`shadow-overlay`), for what floats: popovers, the language list, dialogs, sheets, toasts. Nothing on the page itself casts one.
- Modal backdrops are a fixed graphite scrim at 45 %, the same in both themes.

## Components

All primitives are React Aria Components styled with `tailwind-variants` recipes (`packages/ui/src/recipes`); server components style plain elements with the same recipes.

- **Buttons.** Default is the outline (`ink`): ground, a `field-edge` border that turns ink on hover. The accent (`intent="stamp"`) is a solid fill with its label in the ground's colour; hover and press darken it (lighten in dark). `quiet` is an underlined text action for dense rows. Disabled: the ground with a disabled edge. `apps/web/src/lib/stamp-law.test.ts` fails if the accent carries a step back, a cancellation or a removal.
- **Fields.** Label above (semibold), 48 px box with a `field-edge` border turning ink on hover and focus, hint in muted ink, error under it with the boxed exclamation and a red edge.
- **Search.** A row of the form: "Qui ?" and "Où ?" side by side from 768 px, each a caption in muted ink over a 52 px soft field (10 px corners, `field-edge`, turning ink on hover and accent on focus, with the focus ring), the accent "Chercher" button of the same height at the end of the row, the "Pays" select in the same soft box under it, with "Autour de moi" beside it on the same row as a quiet text action with the pin (it wraps under it on a narrow phone). A plain GET form; suggestions open in a popover. A place in a European country Apercura does not cover yet ("Berlin", "Allemagne", `@apercura/core/geo`) gets its own answer: "Apercura ne couvre pas encore l'Allemagne", then the open countries as links.
- **Stamp** (`Stamp`, `.stamp` in `theme.css`). The practitioner's page as a stamp: a single violet rule with 14 px corners, the face set in type (name, profession, address), a foot with the register number and the state in words. Outlined while unclaimed, solid ink once verified, a dashed rule over a faint hatch while a claim is checked. The accent button presses like ink (`.ink-press`: 97 %, a touch lighter, 120 ms, from the centre so the corners hold).
- **Fact list** (`FieldList`/`FieldRow`): label in muted ink, value in ink, two columns from a 28 rem container, a hairline between rows. An empty field prints "— Non renseigné" in muted ink; it never disappears.
- **Practitioner header.** Seal (or photo with the seal on its corner), name as headline, profession in muted lead, the RPPS in tabular figures, the page status badge and its one-line explanation, a hairline below.
- **Action block.** The "what can I do next" panel: title strip on the quiet shade, the statement, the next slot on a shade tile, one action. Five honest states (book, call, establishment, locum, notice); only booking takes the accent.
- **Badges.** Small pills in caption type: neutral (`field-edge` edge on the shade), verified (accent on the accent wash, with a tick), error.
- **Tables.** Caption-type headers in muted ink over a `field-edge` rule, hairlines between rows.
- **Pager** (`Pagination`, listings). A `<nav>` under a hairline: previous and next as semibold links either side of "Page 187 sur 219", then the pages of the current block of ten, then "Aller à la page" with the first, the last and the round pages of the larger blocks (`pager` in `@apercura/core`: any page within three clicks below 1,000 pages). Numbers in meta type and tabular figures, underlined, in 44 px cells that take the shade on hover; the current page is text, on the shade, semibold, ringed in ink, `aria-current="page"`. Screen readers hear "Page 12". Plain links: it works without JavaScript.
- **Notices.** Panels: information on the shade, success with a tick, errors on the error wash with a red edge.
- **Empty states.** A quiet panel on the shade: what is missing, in plain words, and the next step as a button.
- **Dialogs and sheets.** A panel with its title on a shade strip, a 44 px close control, the overlay shadow.
- **Country and language menus** (`apps/web/src/components/country-picker.tsx`, `language-picker.tsx`, both printed by the server on the one client `HeaderMenu`). The country menu links each open market's home, in the visitor's language where that market offers it. The language menu is a `<details>` disclosure in the header: the toggle shows the caption "Langue", the current language and a chevron, and is named "Langue : Français"; the list holds a link per language to the same page in that language (ADR 0002 §2, query and, on `/rdv`, fragment kept), the current one marked `aria-current` and ticked. Works without JavaScript; with it, ArrowDown opens and focuses the current language, arrows, Home and End move, Escape closes and returns focus, a click or focus outside closes. Links, not a `<select>`: a language changes only on an explicit activation (WCAG 3.2.2), and crawlers still see every URL. Non-French pages keep their `noindex`.
- **Theme switch** (`apps/web/src/components/theme-switch.tsx`, a server component driven by `/theme.js`). In the footer: a radio group "Thème" of three segments (Clair, Sombre, Système, each with an icon) in a `field-edge` frame, native radios (arrow keys move and choose), the checked one on the shade, semibold, ringed in ink. The agenda's Week/Day switch uses the same segmented look.
- **SlotPicker.** One row of 80 × 56 px cells per day; the selected slot turns into an accent tile with a tick and settles in with a 200 ms scale from 96 %; past slots are muted, taken slots struck through; a ruled "now" marker in ink.
- **WeekGrid** (agenda). One column per day, 44 px rows in a 10 px-cornered panel; closed hours on the shade under a hairline hatch; entries as 6 px-cornered tiles: confirmed in the accent, requests in a dashed ink box, holds dashed on the shade, blocks solid ink, no-shows struck through; today's header in solid ink.
- **Seal.** The deterministic engraved mark derived from the RPPS stays the practitioner's placeholder portrait: graphite line work (light line work in dark), the outer ring in the accent on a verified page. Decorative (`aria-hidden`).
- **Map.** MapLibre with the site palette, light or dark, the pin in the accent with a ground-coloured ring; controls bordered in `field-edge`, icons inverted in dark; attribution always visible.
- **QR code.** Always dark on a white quiet zone (`scheme-light`).

## Motion

Calm and short. Colour transitions of 150 ms on hover and focus; overlays slip in 4 px over 180 ms; a sheet slides in over 240 ms; a selected slot settles in over 200 ms. `prefers-reduced-motion` removes all of it.

## Accessibility

WCAG 2.2 AA and RGAA 4.1 in both themes. Every token pair is checked in `tokens.test.ts` for both palettes; the end-to-end suite runs axe on every page type in light and in dark (`apps/web/e2e/axe.ts`); the focus ring is a 3 px accent outline 2 px off the element, visible on the ground and the shade in both themes, and `Highlight` in forced colours.

## Do's and Don'ts

**Do**

- Keep the ground white (or deep graphite), regions set apart by the quiet shade and hairlines.
- Say what is missing ("Non renseigné") and what the patient can do next, in every state.
- Use the accent only for action, verified, booked and focus; check new token pairs in `tokens.test.ts`, in both themes.
- Use `tabular` for every number that lines up: times, fees, counts, phone and RPPS numbers.
- Keep body text at 18 px or more on patient surfaces and targets at 44 px.
- Check a new surface in light and dark, and keep what is printed or scanned light (`scheme-light`).
- Use synthetic, obviously fictitious data in examples ("Dr Exemple Martin", RPPS 10000000009).

**Don't**

- Don't use the Marianne typeface, the tricolour, DSFR components or any state emblem, and don't imitate Doctolib.
- Don't redraw, recolour or stretch the logo: use `BrandLockup`, `BrandSymbol` or the files of `docs/brand`.
- Don't add a second family, capitals for emphasis, tracked-out labels, or a kicker above a heading.
- Don't colour running text with the accent or red, or use the accent for mere selection.
- Don't add shadows to things on the page, gradients, glass, or heavy ink rules; one overlay shadow is the whole elevation system.
- Don't add ratings, promotional badges or anything that ranks practitioners.
- Don't invent figures: registry counts come with their source and date.
- Don't read the theme on the server or make a public page dynamic for it.
