---

name: Apercura
description: The open directory and free booking tool for every health practitioner in France, set as a pre-printed health booklet in a quiet, neutral print.
colors:
paper: "oklch(1 0 0)"
paper-shade: "oklch(0.975 0.003 255)"
ink: "oklch(0.24 0.012 255)"
ink-muted: "oklch(0.46 0.012 255)"
ink-disabled: "oklch(0.6 0.008 255)"
rule-soft: "oklch(0.88 0.006 255)"
field-edge: "oklch(0.56 0.01 255)"
stamp: "oklch(0.42 0.09 290)"
stamp-strong: "oklch(0.35 0.08 290)"
stamp-tint: "oklch(0.965 0.014 290)"
error: "oklch(0.5 0.15 25)"
error-tint: "oklch(0.97 0.012 25)"
typography:
display:
fontFamily: "Archivo Variable, Archivo Fallback, sans-serif"
fontSize: "clamp(2.5rem, 1.75rem + 3vw, 3.75rem)"
fontWeight: 600
lineHeight: 1.02
letterSpacing: "-0.02em"
fontVariation: "'wdth' 115"
headline:
fontFamily: "Archivo Variable, Archivo Fallback, sans-serif"
fontSize: "clamp(1.875rem, 1.5rem + 1.5vw, 2.5rem)"
fontWeight: 600
lineHeight: 1.12
letterSpacing: "-0.018em"
fontVariation: "'wdth' 102"
title:
fontFamily: "Archivo Variable, Archivo Fallback, sans-serif"
fontSize: "1.5rem"
fontWeight: 600
lineHeight: 1.25
letterSpacing: "-0.01em"
fontVariation: "'wdth' 100"
lead:
fontFamily: "Atkinson Hyperlegible Next Variable, Atkinson Fallback, sans-serif"
fontSize: "1.25rem"
fontWeight: 400
lineHeight: 1.5
body:
fontFamily: "Atkinson Hyperlegible Next Variable, Atkinson Fallback, sans-serif"
fontSize: "1.125rem"
fontWeight: 400
lineHeight: 1.6
meta:
fontFamily: "Atkinson Hyperlegible Next Variable, Atkinson Fallback, sans-serif"
fontSize: "1rem"
fontWeight: 400
lineHeight: 1.5
label:
fontFamily: "Archivo Variable, Archivo Fallback, sans-serif"
fontSize: "1rem"
fontWeight: 500
lineHeight: 1.5
fontVariation: "'wdth' 87.5"
caps:
fontFamily: "Archivo Variable, Archivo Fallback, sans-serif"
fontSize: "0.875rem"
fontWeight: 560
lineHeight: 1.3
letterSpacing: "0.045em"
fontVariation: "'wdth' 87.5"
rounded:
field: "2px"
full: "9999px"
spacing:
page-gutter: "20px"
page-gutter-wide: "32px"
section: "56px"
target: "44px"
components:
button-stamp:
backgroundColor: "{colors.stamp}"
textColor: "{colors.paper}"
rounded: "{rounded.field}"
padding: "0 20px"
height: "44px"
button-stamp-hover:
backgroundColor: "{colors.stamp-strong}"
textColor: "{colors.paper}"
button-ink:
backgroundColor: "{colors.paper}"
textColor: "{colors.ink}"
rounded: "{rounded.field}"
padding: "0 20px"
height: "44px"
button-ink-hover:
backgroundColor: "{colors.paper-shade}"
field:
backgroundColor: "{colors.paper}"
textColor: "{colors.ink}"
rounded: "{rounded.field}"
padding: "10px 14px"
height: "48px"
badge-verified:
backgroundColor: "{colors.stamp-tint}"
textColor: "{colors.stamp}"
typography: "{typography.caps}"
tab-selected:
backgroundColor: "{colors.paper}"
textColor: "{colors.ink}"
typography: "{typography.label}"
slot-booked:
backgroundColor: "{colors.stamp}"
textColor: "{colors.paper}"
width: "80px"
height: "56px"
---

# Design System: Apercura

## Overview

**Creative North Star: "The Pre-Printed Health Booklet"**

Every practitioner in France already has a page, like a page of a health booklet whose fields the national register has filled in. Claiming the page means completing the form; booking means stamping a box. The interface is set in the printed-form grammar of that booklet, in a quiet, professional print: white paper, a pale neutral shade for openings and secondary areas, one cool graphite ink for type, rules and field labels, and a single muted violet stamp ink. Nothing shouts: the character lives in the form itself (ruled tables, dotted leaders, honest empty fields, engraved seals), not in saturated colour or heavy type.

The booklet is translated away from any state look. There is no Marianne typeface, no tricolour, no DSFR component and no seal of the Republic; Apercura is a public-interest project, not a government service. It also refuses the category default (blue cards over stock photos) and the cream-and-serif editorial default: the paper is pure white and the faces are a grotesque and a hyperlegible sans.

Patients of every age, including older and low-vision readers, use it on a phone, sometimes unwell. So the booklet is generous: 18 px body text, 44 px targets, rules instead of boxes, and honest states that always say what the patient can do next.

**Key Characteristics:**

- Pure white paper, a quiet neutral shade, one graphite ink, one muted violet stamp, muted red only for errors.
- No saturated bands. The running head is white with a hairline; page openings (home search, page titles), action block and dialog title strips, and the footer sit on the quiet shade, closed by hairlines.
- Ruled tables with small-caps column headers; field rows with dotted leaders; a running head on every booklet page, and a folio only where it means something.
- A deterministic seal per practitioner, derived from the RPPS number.
- Square corners (2 px), no shadows: depth is hairlines, 1 px rules and the quiet shade.

## Colors

One graphite ink and one stamp on white paper, with a near-neutral shade for secondary areas. Colour lives in the stamp and in errors only; everything else is a neutral, cool by a few degrees (hue 255, chroma ≤ 0.012) so it never reads as warm grey or as blue.

### Primary

- **Graphite Ink** (`oklch(0.24 0.012 255)`, #1b2025): all type, 1 px structural rules, field labels, selected tabs (underline), selected dates, checked boxes, the "now" markers, seals' line work, the map pin. 16.4:1 on paper, 15.3:1 on shade.

### Secondary

- **Stamp Violet** (`oklch(0.42 0.09 290)`, #4d437a): a desaturated, darker violet for primary actions, verified pages, booked slots and the focus ring. White on it is 8.7:1; on paper it is 8.7:1 (focus ring and verified marks). **Stamp Pressed** (#3a3261) for hover and press; **Stamp Wash** (#f3f2fd) behind verified marks (stamp text on it 7.9:1). Used on 10 % of a screen or less.

### Tertiary

- **Error Ink** (`oklch(0.5 0.15 25)`, #a83634): a muted red for error text, invalid field edges and the error mark. 6.5:1 on paper, 5.9:1 on **Error Wash** (#fdf2f1).

### Neutral

- **Paper** (#ffffff): the page ground and the running head. Never cream.
- **Paper Shade** (`oklch(0.975 0.003 255)`, #f5f7f9): the quiet surface. Page openings (home search, page titles), action block and dialog title strips, the footer, information notices, hovered rows, skeletons.
- **Muted Ink** (#54585f): hints, placeholders, secondary facts, "not provided", unselected tabs. 7.1:1 on paper, 6.6:1 on shade.
- **Field Edge** (#71757a): control borders and the search cells. 4.7:1 on paper, 4.3:1 on shade (non-text minimum is 3:1).
- **Soft Rule** (`oklch(0.88 0.006 255)`, #d5d8db): hairlines between rows, under the running head and around openings, and dotted leaders. Decorative only, never the only boundary of a control.
- **Disabled Ink** (#7d8085): disabled controls, kept at 3.9:1 although exempt.

### Named Rules

**The Stamp Law.** The one accent, a muted violet, means exactly three things: an action that moves the visitor forward (search, book, claim, confirm), a verified page, a booked slot; it also draws the keyboard focus ring. It covers 10 % of any screen or less. A selection that is not yet a booking (a chosen date, a checked box, a selected tab) is graphite, never violet.

**The Red Law.** Muted red is for errors only, and every error also carries a mark (the boxed exclamation) and words. Nothing is conveyed by colour alone.

**The Achromatic Text Law.** Running text is never violet or red. Colour sits in edges, fills and stamps; letters stay in graphite.

**The Quiet Ground Law.** No saturated ground anywhere. Regions are set apart by the pale neutral shade and hairlines, never by a solid colour band.

Every token pair the UI uses is verified by `packages/ui/src/tokens/tokens.test.ts` (WCAG 2.2: 4.5:1 text, 3:1 large text, edges and focus), which also keeps every neutral at chroma ≤ 0.015 and the accent at ≤ 0.1.

## Typography

**Display Font:** Archivo Variable (weight 100–900, width 62–125 %), fallback metric-adjusted Arial.
**Body Font:** Atkinson Hyperlegible Next Variable (weight 200–800), fallback metric-adjusted Arial.

**Character:** Archivo is a grotesque with a width axis, set calm: semibold and close to its normal width for the wordmark and titles, semi-condensed for labels and column heads, like a form's printed captions. Hierarchy comes from small, regular size steps and from space, never from black weights; only the home wordmark keeps a wide cut, as a signature. Atkinson Hyperlegible Next was drawn for low-vision readers and sets the body and every numeral (RPPS numbers, times, counts). Both are self-hosted from Fontsource, latin and latin-ext subsets only.

### Hierarchy

Each display role is a utility in `theme.css` (`type-display`, `type-headline`, `type-title`, `type-subtitle`, `type-wordmark`), so the scale lives in one place.

- **Display** (`type-display`: 600, wdth 115, clamp 2.5–3.75 rem, 1.02): the wordmark in the home opening only. Its wide cut is the brand's signature; the weight stays semibold.
- **Headline** (`type-headline`: 600, wdth 102, clamp 1.875–2.5 rem, 1.12): page titles (practitioner name, "Votre page existe déjà.").
- **Title** (`type-title`: 600, wdth 100, 1.5 rem, 1.25): section headings on a booklet page.
- **Subtitle** (`type-subtitle`: 600, 1.25 rem, 1.3): sub-sections, dialog titles, place names, list headings.
- **Wordmark** (`type-wordmark`: 650, wdth 106, 1.25 rem): the running head and the footer.
- **Lead** (400, 1.25 rem, 1.5): hooks, introductions, slot and field values that need weight.
- **Body** (400, 1.125 rem = 18 px, 1.6): running text, at most 65 ch. The floor for patient surfaces.
- **Meta** (400, 1 rem, 1.5): hints, secondary facts, provenance.
- **Label** (500, wdth 87.5, 1 rem): field labels and row labels.
- **Caps** (560, wdth 87.5, 0.875 rem, +0.045 em, uppercase): column headers, running heads, folios, badges, the search cell captions "QUI ?" and "OÙ ?". Archivo has no small-caps feature, so caps are set small.
- **Buttons** (Archivo 600, normal width, sentence case): actions never shout in capitals.

### Named Rules

**The Two Families Rule.** Archivo for what is printed on the form, Atkinson for what is written into it. No third family; numerals are always Atkinson with tabular figures.

## Layout

A booklet page is a single centred column, `max-width: 72rem`, with 20 px gutters (32 px from 640 px up). Each page opens with a running head (caps, left) over a 1 px ink rule, then sections separated by 56 px. The running head lives only there, never as a caps label in an opening above a title. Section content uses a 5/7 split on wide screens (heading and intro left, facts right) and stacks below 768 px.

The home opening sits on the quiet shade and holds about 60 % of the viewport (`min-height: calc(60svh - header)`), content bottom-aligned so the search sits just above the fold line, closed by a hairline. From 768 px Apercura's own seal (the same engraving generator, fed a fixed brand seed that no RPPS can reach) is engraved in graphite on the opening's right; practitioner pages only ever carry their RPPS seal. Other openings (page titles of the practitioner space, sign-in, search, institutional pages) use the same shade and hairline; practitioner, listing and establishment pages open straight on white paper under the running head. Page 1 opens with the proof: the unclaimed specimen page (seal, field rows, provenance, labelled "Exemple fictif"), then the commitments table. Form cells sit side by side from 768 px and stack below; field rows switch from label-leader-value to label-over-value under a 28 rem container width.

Every target is at least 44 px; type and layout survive 400 % zoom (rows stack, the slot grid scrolls on its own axis).

## Elevation & Depth

Flat, as print is. There are no shadows. Depth comes from the quiet shade, 1 px graphite rules for table, section and field-list edges, Soft Rule hairlines between rows, and dashed borders for blank or preview forms. Heavier strokes are functional only: the 2 px error edge (fields and the error badge), the 2 px selected-tab underline, the 2 px dashed edge of an agenda request, checkbox and radio outlines. Overlays are paper slips with a 1 px ink border; modal backdrops are ink at 40 %. Inset rules are used only for the stamp's inner frame.

## Shapes

Square. Fields, buttons, badges, popovers and dialogs use a 2 px corner (`rounded-field`), close to a printed box. Circles appear only where the object is round: radio buttons, switch knobs, the seal, the map pin. Dotted leaders join labels to values; dashed boxes mark an unfilled form (empty states, page previews).

## Components

All primitives are built on React Aria Components, styled with `tailwind-variants` recipes in `packages/ui/src/recipes`. Server components style plain elements with the same recipes (`buttonStyles`, `tableStyles`, `linkStyles`).

### Buttons

Buttons default to **Ink**: the stamp is always written out (`intent="stamp"`), and `apps/web/src/lib/stamp-law.test.ts` fails if a stamped button carries a step back, a cancellation, a pause or a removal.

- **Stamp** (`intent="stamp"`): muted violet fill, white sentence-case Archivo semibold, a 1 px white inner frame 3 px in, like a rubber stamp. Hover and press darken to Stamp Pressed; press nudges 1 px down.
- **Ink**: white with a 1 px graphite border (its labels can be long: "Appeler le 01 00 00 00 00"); hover Paper Shade. Also the secondary action on the quiet shade.
- **Quiet**: underlined text action for dense rows.
- States: disabled (paper fill, a 1 px disabled-ink edge and disabled ink, no stamp, so it reads as a button on paper and shade alike), pending (spinner plus announced label), focus (3 px violet ring on paper and shade alike).

### Fields

Label above (Label role), 48 px box with a 1 px Field Edge border that turns ink on hover and focus, hint in Muted Ink below, error below with the boxed exclamation. Invalid fields get a 2 px error edge. TextField, SearchField (search mark, clear button), ComboBox, Select, DatePicker, TimeField (24-hour segments) share this anatomy. **OtpField** is one real input (`inputmode="numeric"`, `autocomplete="one-time-code"`) over a comb of printed boxes; the next box to fill takes the focus ring.

### Choices

Checkbox (24 px square, ink fill and white tick), Switch (state shown by knob position), RadioGroup (ink dot). Selection is ink, never violet.

### Overlays

Dialog and Sheet open on a paper slip whose title is printed on a quiet-shade strip closed by a hairline, with a 44 px close control. Alert dialogs hide the close control and ignore outside clicks. Popover, Menu and ListBox are bordered slips with hairline-ruled rows. Tooltip is ink with white text, never the only home of essential information. Toasts are 1 px bordered slips in a labelled region: ink for notices, violet edge and tick for bookings, red edge and mark for errors. Notices: information on the quiet shade with a Field Edge border, success with an ink edge and a tick, errors on Error Wash with a red edge.

### Navigation and data

Tabs sit on a hairline baseline; unselected tabs are muted ink, the selected tab is graphite, semibold and underlined 2 px. Breadcrumbs read like a running head with the current page unlinked. Tables are ruled: 1 px graphite top and bottom and under the caps header, hairlines between rows, sortable columns marked with a chevron.

### Feedback

Badges are printed marks in light caps: a Field Edge outline (unclaimed, informational), stamped violet with a quiet double edge (1 px edge, 1 px inner line) on Stamp Wash (verified, booked), a 2 px red edge on Error Wash (error). Skeletons are Paper Shade blocks with a soft pulse (off under reduced motion) and an announced status. EmptyState is a dashed blank form that says what is missing and offers the next step.

### Domain

- **Seal**: a deterministic engraved mark derived from the RPPS (FNV-1a hash seeding a Mulberry32 PRNG): outer ruled ring, optional inner ring, a tick ring with accented ticks, two to four wavy guilloché bands (some braided), and a boss. Graphite line work only; a verified page prints the outer ring in stamp violet, the seal's only colour. Decorative (`aria-hidden`).
- **PractitionerHeader**: seal, name (headline), profession (lead), RPPS (caps label and tabular number), page status badge and a one-line explanation.
- **FieldRow / FieldList**: label, dotted leader, value. An empty field prints an em dash and "Non renseigné" in Muted Ink; it never disappears.
- **ActionBlock**: the "what can I do next" box, a 1 px graphite frame with its title on a quiet-shade strip, in five honest states: book (stamp), call the practice (ink, `tel:`), book via the establishment (ink, to its page or site), locum not bookable (statement and hint, no button), and a notice when no contact is published (statement and hint, no button). Until online booking opens, a practice's block says so and offers the call.
- **SlotPicker**: each day is one unbroken row of 80 × 56 px cells, like a step sequencer. A ruled "now" marker with a caret moves through today's row; past slots (open, but their time has gone) are plain muted ink, taken slots are struck through; both are disabled. The marker stands on the boundary after the last slot that has started, never across a slot, with a 0.875 rem caps label printed in a strip of its own under today's cells (on the side of the past slots once two have gone), so it never covers a cell. Taken slots keep their column, so the times of every day line up. Selecting stamps the cell violet with a hairline white inner frame, a tick and a short, subtle stamp animation; a live region announces the selection. Keyboard: arrows, Home/End, Page Up/Down, Enter/Space.
- **WeekGrid** (practice agenda): a timetable with one column per day (a single column on phones) and one ruled row per quarter or half hour, 44 px high; opening hours on paper, closed hours on the quiet shade under a 1 px Soft Rule hatch, with a Field Edge hairline where opening hours begin or end (no hue; the legend names it). Entries are printed over the cells they cover, at least one row high: confirmed appointments stamped violet (a booked slot), requests in a 2 px dashed ink box, blocks solid ink, holds (a patient is booking) in a 1 px dashed Field Edge box on the shade, no-shows struck through. Today's header is printed solid ink and a ruled "now" marker crosses today's column; its caps label is printed in a strip of its own, the time column, at the rule's height (it takes the hour's place when they would overlap), so it never covers a cell, and a week that holds "now" opens scrolled to it. ARIA grid with roving focus: arrows move by time and day, Home/End jump to the first and last time, Page Up/Down change the week (focus stays on the same cell), Enter or Space opens the entry or adds one; each cell's label starts with its printed text.
- **SiteCard**: place name, postal address, optional facts, and directions as plain links to OpenStreetMap, Apple Maps and Google Maps (no API, no key).
- **ProvenanceNote**: source and refresh date set as a printer's imprint.
- **MapView**: MapLibre GL, loaded only when the map nears the viewport; shows the address until ready or if WebGL fails. Style from `NEXT_PUBLIC_MAP_STYLE_URL` (default OpenFreeMap positron), re-inked by `themeMapStyle` (`packages/ui/src/map/map-style.ts`) from the neutral `mapPalette`: white land, grey streets with slightly darker casings, muted blue-grey water, a barely green park tint, graphite labels on white halos, and a graphite pin. It also hides city, town and village names from zoom 13 so the pin never covers them; attribution always visible. The map is the only place a third hue may appear.
- **BookletSearch**: the search printed as white form cells ("QUI ?", "OÙ ?") in a 1 px Field Edge frame on the quiet shade, with a stamp at the end; a plain GET form that ships no JavaScript.
- **BookletComboField / BookletSearchFrame**: the same cells enhanced with a suggestion slip (caps group headers on a Paper Shade strip, hairline rows). The typed text is always what the GET form submits, so search works without JavaScript. "Autour de moi" is an ink outline button under the cells, shown only where geolocation exists, with a status line when it is refused.
- **MapView markers**: several result pins on one lazy map, fitted in view; a single pin stays the default.
- **Listing pages**: a headline with a factual lead closed by a 1 px rule, practitioners as a ruled table (name as a bold link, listing and address in meta below; sector and Carte Vitale columns from 768 px, folded into a meta line below), a "Page x sur y" caps folio between previous and next links, and counted links (place or establishment, count in tabular muted ink) in ruled columns.
- **Unfinished facts**: legal facts not known yet print as empty field rows reading "À compléter" under a "Brouillon" mark in the opening; forms that do not exist yet are an EmptyState with a "Bientôt disponible" ink badge, never a fake form.

### Motion

One authored moment, kept subtle: the stamp (220 ms, ease-out-quart, a 5 % scale and 1.5° rotation settling flat). Everything else is short colour or position transitions. `prefers-reduced-motion` removes all of it.

## Do's and Don'ts

**Do**

- Print every region in the world's material: white paper, graphite rules and hairlines, the quiet shade for openings, title strips and the footer.
- Say what is missing ("Non renseigné") and what the patient can do next, in every state.
- Use the stamp only for action, verified and booked; check new token pairs in `tokens.test.ts`.
- Keep body text at 18 px or more on patient surfaces, targets at 44 px, focus rings visible on both paper and shade.
- Use synthetic, obviously fictitious data in examples ("Dr Exemple Martin", RPPS 10000000009).

**Don't**

- Don't use the Marianne typeface, the tricolour, DSFR components or any state emblem, and don't imitate Doctolib.
- Don't put blue cards over stock photos, cream paper or serif editorial type.
- Don't colour text violet or red, or use violet for mere selection.
- Don't add shadows, glass, gradients, pill buttons or rounded cards; depth is rules, hairlines and the quiet shade.
- Don't bring back saturated bands, black (900) weights, wide cuts beyond the home wordmark, uppercase buttons, or a stamp that is not written out.
- Don't add ratings, promotional badges or anything that ranks practitioners.
- Don't invent figures: registry counts come with their source and date.
