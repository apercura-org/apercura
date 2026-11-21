---

name: Apercura
description: The open directory and free booking tool for every health practitioner in France, set as a pre-printed health booklet.
colors:
paper: "oklch(1 0 0)"
paper-shade: "oklch(0.975 0.008 235)"
ink: "oklch(0.32 0.07 235)"
ink-muted: "oklch(0.46 0.05 235)"
ink-disabled: "oklch(0.62 0.03 235)"
rule-soft: "oklch(0.84 0.025 235)"
field-edge: "oklch(0.55 0.05 235)"
cover: "oklch(0.32 0.07 235)"
cover-ink: "oklch(1 0 0)"
cover-muted: "oklch(0.87 0.03 235)"
cover-rule: "oklch(0.62 0.05 235)"
stamp: "oklch(0.45 0.17 295)"
stamp-strong: "oklch(0.38 0.16 295)"
stamp-tint: "oklch(0.96 0.03 295)"
error: "oklch(0.5 0.19 27)"
error-tint: "oklch(0.97 0.02 27)"
typography:
display:
fontFamily: "Archivo Variable, Archivo Fallback, sans-serif"
fontSize: "clamp(3.5rem, 1.25rem + 9vw, 6rem)"
fontWeight: 900
lineHeight: 0.92
letterSpacing: "-0.03em"
fontVariation: "'wdth' 125"
headline:
fontFamily: "Archivo Variable, Archivo Fallback, sans-serif"
fontSize: "clamp(2.125rem, 1.5rem + 2.6vw, 3.25rem)"
fontWeight: 900
lineHeight: 1.05
letterSpacing: "-0.02em"
fontVariation: "'wdth' 125"
title:
fontFamily: "Archivo Variable, Archivo Fallback, sans-serif"
fontSize: "1.75rem"
fontWeight: 700
lineHeight: 1.2
fontVariation: "'wdth' 112.5"
lead:
fontFamily: "Atkinson Hyperlegible Next Variable, Atkinson Fallback, sans-serif"
fontSize: "1.375rem"
fontWeight: 400
lineHeight: 1.45
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
fontWeight: 600
lineHeight: 1.5
fontVariation: "'wdth' 87.5"
caps:
fontFamily: "Archivo Variable, Archivo Fallback, sans-serif"
fontSize: "0.875rem"
fontWeight: 650
lineHeight: 1.3
letterSpacing: "0.07em"
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
backgroundColor: "{colors.ink}"
textColor: "{colors.paper}"
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

Every practitioner in France already has a page, like a page of a health booklet whose fields the national register has filled in. Claiming the page means completing the form; booking means stamping a box. The interface is set in the printed-form grammar of that booklet: white paper, one deep petrol print ink for type, rules and field labels, solid petrol cover bands that carry whole regions, and a single violet stamp ink.

The booklet is translated away from any state look. There is no Marianne typeface, no tricolour, no DSFR component and no seal of the Republic; Apercura is a public-interest project, not a government service. It also refuses the category default (blue cards over stock photos) and the cream-and-serif editorial default: the paper is pure white and the faces are a grotesque and a hyperlegible sans.

Patients of every age, including older and low-vision readers, use it on a phone, sometimes unwell. So the booklet is generous: 18 px body text, 44 px targets, rules instead of boxes, and honest states that always say what the patient can do next.

**Key Characteristics:**

- Pure white paper, one petrol ink, one violet stamp, ink red only for errors.
- Cover bands (solid petrol, white type) open and close every page: home hero, page titles, action block headers, dialog title strips, footer.
- Ruled tables with small-caps column headers; field rows with dotted leaders; running heads and folio numbers on every booklet page.
- A deterministic seal per practitioner, derived from the RPPS number.
- Square corners (2 px), no shadows: depth is rules and bands.

## Colors

One ink and one stamp on white paper. Colour lives in rules, edges, bands and stamps; running text is always ink.

### Primary

- **Petrol Print Ink** (`oklch(0.32 0.07 235)`, #003851): all type, strong rules, field labels, selected tabs, selected dates, checked boxes. 12.5:1 on paper.
- **Petrol Cover** (`oklch(0.32 0.07 235)`, #003851): the same ink printed solid as cover bands. Type on it is **Cover Ink** (white, 12.5:1) or **Cover Muted** (`oklch(0.87 0.03 235)`, #c2d8e5, 8.5:1). **Cover Rule** (#698ca0) draws decorative rules on bands.

### Secondary

- **Violet Stamp Ink** (`oklch(0.45 0.17 295)`, #5f38a7): primary actions, verified pages, booked slots, and the focus ring on paper. White on it is 8.1:1. **Stamp Pressed** (#4c258c) for hover and press; **Stamp Wash** (#f3eeff) behind verified marks.

### Tertiary

- **Error Ink** (`oklch(0.5 0.19 27)`, #b7191c): error text, invalid field edges, the error mark. 6.6:1 on paper. **Error Wash** (#fff0ee) behind error badges.

### Neutral

- **Paper** (#ffffff): the page ground. Never cream.
- **Paper Shade** (#f2f8fb): hovered rows, skeletons, sunk areas, map land shade.
- **Muted Ink** (#3c5d70): hints, placeholders, secondary facts, "not provided". 7:1 on paper.
- **Field Edge** (#55778b): control borders. 4.8:1 on paper (non-text minimum is 3:1).
- **Soft Rule** (#bcced9): hairlines between rows and dotted leaders. Decorative only, never the only boundary of a control.
- **Disabled Ink** (#758996): disabled controls, kept at 3.6:1 although exempt.

### Named Rules

**The Stamp Law.** Violet means exactly three things: an action that moves the visitor forward (search, book, claim, confirm), a verified page, a booked slot. A selection that is not yet a booking (a chosen date, a checked box, a selected tab) is ink, never violet.

**The Red Law.** Ink red is for errors only, and every error also carries a mark (the boxed exclamation) and words. Nothing is conveyed by colour alone.

**The Achromatic Text Law.** Running text is never violet or red. Colour sits in rules, edges, fills and stamps; letters stay in ink.

Every token pair the UI uses is verified by `packages/ui/src/tokens/tokens.test.ts` (WCAG 2.2: 4.5:1 text, 3:1 large text, edges and focus).

## Typography

**Display Font:** Archivo Variable (weight 100–900, width 62–125 %), fallback metric-adjusted Arial.
**Body Font:** Atkinson Hyperlegible Next Variable (weight 200–800), fallback metric-adjusted Arial.

**Character:** Archivo is a grotesque with a width axis: expanded and black for the wordmark and titles, semi-condensed for labels and column heads, like a form's printed captions. Atkinson Hyperlegible Next was drawn for low-vision readers and sets the body and every numeral (RPPS numbers, times, counts). Both are self-hosted from Fontsource, latin and latin-ext subsets only.

### Hierarchy

- **Display** (900, wdth 125, clamp 3.5–6 rem, 0.92): the wordmark on the home cover band only.
- **Headline** (900, wdth 125, clamp 2.1–3.25 rem, 1.05): page titles (practitioner name, "Votre page existe déjà.").
- **Title** (700, wdth 112.5, 1.75 rem, 1.2): section headings on a booklet page.
- **Lead** (400, 1.375 rem, 1.45): hooks, introductions, slot and field values that need weight.
- **Body** (400, 1.125 rem = 18 px, 1.6): running text, at most 65 ch. The floor for patient surfaces.
- **Meta** (400, 1 rem, 1.5): hints, secondary facts, provenance.
- **Label** (600, wdth 87.5, 1 rem): field labels and row labels.
- **Caps** (650, wdth 87.5, 0.875 rem, +0.07 em, uppercase): column headers, running heads, folios, the search cell captions "QUI ?" and "OÙ ?". Archivo has no small-caps feature, so caps are set small.

### Named Rules

**The Two Families Rule.** Archivo for what is printed on the form, Atkinson for what is written into it. No third family; numerals are always Atkinson with tabular figures.

## Layout

A booklet page is a single centred column, `max-width: 72rem`, with 20 px gutters (32 px from 640 px up). Each page opens with a running head (caps, left) and a folio (caps, right) over a 1.5 px ink rule, then sections separated by 56 px. Section content uses a 5/7 split on wide screens (heading and intro left, facts right) and stacks below 768 px.

The home cover band holds about 60 % of the viewport (`min-height: calc(60svh - header)`), content bottom-aligned so the search sits just above the fold line, closed by a double printed rule. Form cells sit side by side from 768 px and stack below; field rows switch from label-leader-value to label-over-value under a 28 rem container width.

Every target is at least 44 px; type and layout survive 400 % zoom (rows stack, the slot grid scrolls on its own axis).

## Elevation & Depth

Flat, as print is. There are no shadows. Depth comes from cover bands (solid ink regions), rules (2 px for table and section edges, 1.5 px for field and header rules, 1 px hairlines), and dashed borders for blank or preview forms. Overlays are paper slips with a 1.5 px ink border; modal backdrops are ink at 45 %. Inset rules are used only for the stamp's inner frame.

## Shapes

Square. Fields, buttons, badges, popovers and dialogs use a 2 px corner (`rounded-field`), close to a printed box. Circles appear only where the object is round: radio buttons, switch knobs, the seal, the map pin. Dotted leaders join labels to values; dashed boxes mark an unfilled form (empty states, page previews).

## Components

All primitives are built on React Aria Components, styled with `tailwind-variants` recipes in `packages/ui/src/recipes`. Server components style plain elements with the same recipes (`buttonStyles`, `tableStyles`, `linkStyles`).

### Buttons

- **Stamp** (`intent="stamp"`): violet fill, white uppercase Archivo (wdth 112.5, bold, +0.05 em), a white inner frame 3 px in, like a rubber stamp. Hover and press darken to Stamp Pressed; press nudges 1 px down. On cover bands it gains a white outer edge.
- **Ink**: white with a 2 px ink border, sentence case (its labels can be long: "Appeler le 01 00 00 00 00"); hover Paper Shade.
- **Cover**: outline on a band; hover inverts to paper.
- **Quiet**: underlined text action for dense rows.
- States: disabled (paper shade, disabled ink, no stamp), pending (spinner plus announced label), focus (3 px ring, violet on paper, white on bands).

### Fields

Label above (Label role), 48 px box with a 1.5 px Field Edge border that turns ink on hover and focus, hint in Muted Ink below, error below with the boxed exclamation. Invalid fields get a 2 px error edge. TextField, SearchField (search mark, clear button), ComboBox, Select, DatePicker, TimeField (24-hour segments) share this anatomy. **OtpField** is one real input (`inputmode="numeric"`, `autocomplete="one-time-code"`) over a comb of printed boxes; the next box to fill takes the focus ring.

### Choices

Checkbox (24 px square, ink fill and white tick), Switch (state shown by knob position), RadioGroup (ink dot). Selection is ink, never violet.

### Overlays

Dialog and Sheet open on a paper slip whose title is printed on a cover strip, with a 44 px close control. Alert dialogs hide the close control and ignore outside clicks. Popover, Menu and ListBox are bordered slips with hairline-ruled rows. Tooltip is ink with white text, never the only home of essential information. Toasts are bordered slips in a labelled region: ink for notices, violet edge and tick for bookings, red edge and mark for errors.

### Navigation and data

Tabs sit on a 2 px baseline; the selected tab is printed solid ink. Breadcrumbs read like a running head with the current page unlinked. Tables are ruled: 2 px top and bottom, 1.5 px under the caps header, hairlines between rows, sortable columns marked with a chevron.

### Feedback

Badges are printed marks in caps: ink outline (unclaimed, informational), stamped violet with a double edge (verified, booked), red (error), outline on cover. Skeletons are Paper Shade blocks with a soft pulse (off under reduced motion) and an announced status. EmptyState is a dashed blank form that says what is missing and offers the next step.

### Domain

- **Seal**: a deterministic engraved mark derived from the RPPS (FNV-1a hash seeding a Mulberry32 PRNG): outer ruled ring, optional inner ring, a tick ring with accented ticks, two to four wavy guilloché bands (some braided), and a boss. Ink only; a verified page prints the outer ring in stamp violet. Decorative (`aria-hidden`).
- **PractitionerHeader**: seal, name (headline), profession (lead), RPPS (caps label and tabular number), page status badge and a one-line explanation.
- **FieldRow / FieldList**: label, dotted leader, value. An empty field prints an em dash and "Non renseigné" in Muted Ink; it never disappears.
- **ActionBlock**: the "what can I do next" box with a cover-strip title, in four honest states: book (stamp), call the practice (ink, `tel:`), book via the establishment (ink, external), locum not bookable (statement and hint, no button).
- **SlotPicker**: each day is one unbroken row of 80 × 56 px cells, like a step sequencer. A ruled "now" marker with a caret moves through today's row; past and closed slots are struck through and disabled. Selecting stamps the cell violet with a white inner frame, a tick and a short stamp animation; a live region announces the selection. Keyboard: arrows, Home/End, Page Up/Down, Enter/Space.
- **SiteCard**: place name, postal address, optional facts, and directions as plain links to OpenStreetMap, Apple Maps and Google Maps (no API, no key).
- **ProvenanceNote**: source and refresh date set as a printer's imprint.
- **MapView**: MapLibre GL, loaded only when the map nears the viewport; shows the address until ready or if WebGL fails. Style from `NEXT_PUBLIC_MAP_STYLE_URL` (default OpenFreeMap positron), re-inked by `themeMapStyle` from `@apercura/ui/map-style`; attribution always visible.
- **BookletSearch**: the search printed as form cells ("QUI ?", "OÙ ?") with a stamp at the end; a plain GET form that ships no JavaScript.

### Motion

One authored moment: the stamp (280 ms, exponential ease-out, slight scale and rotation settling flat). Everything else is short colour or position transitions. `prefers-reduced-motion` removes all of it.

## Do's and Don'ts

**Do**

- Print every region in the world's material: white paper, ink rules, cover bands for openings and closings.
- Say what is missing ("Non renseigné") and what the patient can do next, in every state.
- Use the stamp only for action, verified and booked; check new token pairs in `tokens.test.ts`.
- Keep body text at 18 px or more on patient surfaces, targets at 44 px, focus rings visible on both paper and bands.
- Use synthetic, obviously fictitious data in examples ("Dr Exemple Martin", RPPS 10000000009).

**Don't**

- Don't use the Marianne typeface, the tricolour, DSFR components or any state emblem, and don't imitate Doctolib.
- Don't put blue cards over stock photos, cream paper or serif editorial type.
- Don't colour text violet or red, or use violet for mere selection.
- Don't add shadows, glass, gradients, pill buttons or rounded cards; depth is rules and bands.
- Don't add ratings, promotional badges or anything that ranks practitioners.
- Don't invent figures: registry counts come with their source and date.
