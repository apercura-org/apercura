---

name: Apercura
description: The open directory and free booking tool for every registered health practitioner in Europe, drawn by the Astryx design system with Apercura's brand on top, in light and dark.
---

# Design System: Apercura

## Overview

**Creative North Star: "The Clear Practice Card"**

Every registered practitioner already has a page, filled in from the national register. The page answers one question first: what can I do next? Patients arrive worried, on a phone, often older; practitioners are busy and wary of platforms. The interface is calm, dense where it has to be, and honest about what it does not know.

Astryx draws the interface: density, surfaces, cards, elevation, control states. Apercura adds only its brand: the violet accent, the Allo typeface, the practitioner stamp, the seal, and its honesty conventions. When Astryx already has an answer, we use it as it comes.

Apercura is a public-interest project, not a government service: no Marianne, no tricolour, no DSFR component. It does not imitate Doctolib: no bright blue, no cards over stock photos, no ratings.

**Status.** The code is moving to this system over several PRs: the theme first, then thin component wrappers, tables, links and buttons, the page structure on Astryx's layout primitives, and the pro area last. Where the code and this file disagree, this file says where the code is going.

## Tokens

`packages/ui/src/astryx/apercura.ts` is the only source of colour, radius, type and motion. It is a `defineTheme` on Astryx's Neutral theme, generated from three `themePalette` seeds: the accent (violet), a cool neutral, and the danger red. `bun run --cwd packages/ui theme:build` writes the built theme to `packages/ui/src/astryx/built/` (generated, never edited); `theme:check`, run by the package's tests, fails when it is stale.

Values are read from `apercura.ts`, the built theme, or Astryx's docs (`cd packages/ui && bunx astryx docs tokens`). They are never copied into this file or any other doc.

- `packages/ui/src/styles/theme.css` keeps only the Tailwind aliases that point at Astryx variables, plus the stamp, closed-hatch and MapLibre rules.
- `packages/ui/src/tokens/index.ts` keeps only the map palettes.

## Colours

Colours are roles, not values. Astryx's semantic tokens carry them: the page body, surfaces and cards, muted backgrounds, primary and secondary text, the border and its emphasised form, the accent and the text on it, and the status colours (error first). All of them come from the three seeds.

- **The accent law.** The accent means the visitor's next step (search, book, call, confirm), a verified page, a booked slot, and the keyboard focus. On a patient page, that next step is the patient's. The practitioner's own actions there ("Revendiquer cette page") are secondary buttons, never the accent. A selection that is not a booking (a chosen date, a checked box, a selected tab, the current language) uses Astryx's native selected state, not the accent. The accent covers about 10 % of a screen or less. `apps/web/src/lib/stamp-law.test.ts` fails if the accent carries a step back, a cancellation or a removal.
- **The red law.** Red is for errors only, and every error also carries an icon and words.
- **The text law.** Running text is primary or secondary text, never the accent or red. Badges and the error line are the exceptions, and both also carry an icon or a border.
- **Contrast.** WCAG 2.2 AA in both themes. `packages/ui/src/tokens/tokens.test.ts` checks the pairs against the built theme.
- **What stays light in the dark theme.** QR codes (`apps/web/src/components/pro/qr-code.tsx`) and the share kit's poster preview stay dark on white, because scanners need it and print is white. Photos are dimmed slightly on a dark ground. Emails are not themed.

## Theme

Light, dark, or the system's (the default), chosen in the footer and remembered on the device (`localStorage`, key `apercura-theme`).

- `/theme.js` (`apps/web/src/app/theme.js/route.ts`, body in `apps/web/src/lib/theme.ts`) is a small same-origin script that every root layout loads in `<head>`, before the first paint. It sets `data-theme="light|dark"` on `<html>` when a choice is stored, and `data-js` always. It also drives the theme control, so the control ships no React code. The CSP (`script-src 'self'`) is unchanged.
- The root layouts print `data-astryx-theme="apercura"` on `<html>`. There is no `<Theme>` provider: it would be a client component, and the built theme's CSS needs only the attribute.
- The pages stay static: the HTML is the same for every visitor and theme, and no request reads the choice.
- `color-scheme` follows the choice or the system, and Astryx's `light-dark()` colours follow `color-scheme`. Without JavaScript the system decides and the theme control stays hidden.
- The map re-inks itself from the map palettes (`packages/ui/src/map/map-runtime.ts`) and follows a theme change while open.

## Typography

**Allo** (Josh Puckett, SIL OFL 1.1), the only family. A humanist-leaning grotesque with softened corners: calm and friendly without being cute.

- **Scale.** Astryx's type scale from an 18 px base, ratio 1.2. Body text is 18 px or more on patient surfaces, at most 65 ch wide.
- **Files.** `apps/web/src/fonts/allo/build.sh` cuts the variable font to what the site sets (weights 400 to 700, latin and latin-ext, plus `tnum`, `case`, `cv03`, `cv04`) and vendors it with `OFL.txt`. `apps/web/src/app/fonts.ts` loads it from the site's own origin with `font-display: swap`; the latin file is preloaded. The fallback in `apps/web/src/app/fonts.css` is Arial scaled to Allo's metrics, so the swap does not reflow.
- **Open Graph images** use static cuts in `apps/web/src/fonts/allo/og`, listed in `apps/web/src/server/og/font-files.ts`.
- **Legibility.** Body copy turns on the tailed l and the serifed I (`cv03`, `cv04`), so Il1 never read alike.
- **Figures.** Times, fees, counts, phone and register numbers use tabular figures.
- Hierarchy comes from size, weight and space, never colour. No capitals for emphasis, no tracked-out labels, no kicker above a heading.

## Logo

The symbol ("Pin a") is a round tile with one sharp corner, a map pin tipped onto its point, and a single-storey a whose counter holds a dot: the point of care. The wordmark is "apercura" in Allo. No cross, no snake, no state emblem.

- **Source.** One geometry, `packages/ui/src/brand/geometry.ts`, read by everything that draws the logo (`BrandLogo`, `BrandLockup`, `BrandSymbol` in `packages/ui/src/brand/logo.tsx`). The standalone files and the usage note are in `docs/brand/`; `brand.test.ts` keeps them equal to the geometry.
- **Colours.** Primary text for the tile and the wordmark, the accent for the dot. The dot is the one use of the accent outside the accent law: it is the brand, not an action. Mono files draw everything in the current colour.
- **Header.** `BrandLogo`: the symbol as inline SVG and the wordmark as live text, hidden from assistive technology. The link around it carries the name ("Apercura, accueil").
- **Icons.** `apps/web/src/app/icon.svg` is the scheme-aware favicon; `icon.tsx` renders 48, 192 and 512 px; `apple-icon.tsx` and `apps/web/src/app/brand/[file]/route.ts` render the app icon, the maskable icons and the Organization logo.
- **Use.** Clear space of a quarter of the symbol's height; never under 16 px high, and the symbol alone below about 24 px. Don't stretch, rotate, outline or recolour it.

## Layout

- One centred column, `max-width: 72rem`. Grey page body, white surfaces and cards.
- The shell (header, footer, pro area) is built from Astryx's layout primitives (`Layout`, `LayoutHeader`, `LayoutContent`, `LayoutFooter`, `TopNav`, `SideNav` for the pro area), not hand-made boxes.
- The header holds the logo, "Professionnels de santé", then the country menu and the language menu: two separate choices, the market and the language. On a phone the two menus take a second row.
- Every target is at least 44 px (52 px for large controls such as the search); the layout survives 400 % zoom.

### Page patterns

- **Practitioner page.** The stamp, then the next-step card first. Then one card per place of practice: name, address, the phone as a button, and one "Itinéraire" menu instead of three buttons. Then the facts as rows. Then a quiet "Vous êtes ce professionnel ?" card. From 1024 px the next-step card is sticky in the side column.
- **Listing.** Narrowing first (commune, filters), at the top. Then the results as list items, each with its next action on the right. Search results follow the same pattern.
- **Home.** One template for every market (`apps/web/src/app/[locale]/page.tsx`). Search first. Then a short set of specialities with a link to all of them. The sample stamps (`apps/web/src/lib/home-samples.ts`) are not repeated on mobile. A section with nothing to show is left out, heading and all.

## Elevation and shape

- **Astryx's elevation scale.** Surfaces sit on the grey body; cards and overlays take the theme's shadows. Nothing invents its own shadow.
- **Cards for discrete objects only**, as Astryx intends: things that mean something on their own. On a practitioner page, the next-step card is the one elevated card. Each place of practice is a card. A result in search or a listing may be a card or a list item.
- **Dense data is rows**: Astryx `Table` or `List`, never a grid of cards.
- **Corners** come from the theme's radii. The stamp keeps its own.

## Components

Astryx components are used as they come, through thin wrappers in `packages/ui/src/components`. Check names with `cd packages/ui && bunx astryx component --list` and a component's guidance with `bunx astryx component <Name>`.

| Need       | Astryx component                                                                                               |
| ---------- | -------------------------------------------------------------------------------------------------------------- |
| Actions    | `Button` (primary is the accent, secondary, ghost; one primary per view), `IconButton`, `Link`                 |
| Fields     | `TextInput`, `TextArea`, `Selector`, `NumberInput`, `DateInput`, `TimeInput`, `Calendar`, `FileInput`, `Field` |
| Choices    | `CheckboxInput`, `RadioList`, `Switch`, `SegmentedControl` (theme switch, week or day)                         |
| Navigation | `Breadcrumbs`, `Pagination`, `TabList` and `Tab`, `DropdownMenu` (country, language, "Itinéraire")             |
| Overlays   | `Dialog`, `Drawer`, `Popover`, `Tooltip`, `Toast`                                                              |
| Content    | `Card`, `Table`, `List` and `ListItem`, `MetadataList`, `Badge`, `Banner`, `EmptyState`, `Skeleton`            |

Apercura's own pieces:

- **Stamp** (`packages/ui/src/domain/stamp.tsx`, `.stamp` in `theme.css`). The practitioner's page as a stamp: name, profession, address, a foot with the register number and the state in words. The face text is ink; the violet is its rule and its state label. Three states: outlined while unclaimed, solid once verified, a dashed rule over a faint hatch while a claim is checked.
- **Seal** (`packages/ui/src/seal/seal.tsx`). The deterministic engraved mark derived from the register number, the placeholder portrait. Line work in the text colour, the outer ring in the accent on a verified page. Decorative (`aria-hidden`).
- **SlotPicker** (`packages/ui/src/domain/slot-picker.tsx`). One row of slots per day; the booked slot is the accent with a tick; past slots are muted, taken slots struck through.
- **WeekGrid** (`packages/ui/src/domain/week-grid.tsx`). The agenda: one column per day, closed hours under the closed hatch, entries as tiles; confirmed entries take the accent.
- **Map** (`packages/ui/src/map/map-view.tsx`). MapLibre on the map palettes, light or dark, the pin in the accent, attribution always visible.
- **QR code** (`apps/web/src/components/pro/qr-code.tsx`). Always dark on a white quiet zone.
- **Suggestions** (`packages/ui/src/astryx/suggest-box.tsx`). The search's "Qui ?" and "Où ?" are a WAI-ARIA editable combobox on Astryx's layer, because Astryx's `Typeahead` keeps the typed text out of the form and its `Selector` has no free text. The text is free and submitted with a plain GET form.
- **Forms** (`packages/ui/src/components/form.tsx`). Astryx leaves validation to the app: native constraints on submit, server errors by field name, focus sent to the first invalid field.
- **Astryx's own words** ("Close", "Loading") come from the app's catalogs (namespace `Astryx`, given to `AstryxStringsProvider` in `packages/ui/src/astryx/strings.tsx`), in every language the site has.

## Honesty conventions

- An empty field says "— Non renseigné"; it never disappears. Several empty fields of one block may fold into one line: "Non renseigné : horaires, langues…".
- Every block of facts carries its source and date underneath.
- No ratings, no ranking, no promotional badges.
- No invented figures: registry counts come with their source and date.
- Examples use synthetic, obviously fictitious data ("Dr Exemple Martin", RPPS 10000000009).

## Motion

Astryx's motion tokens, set calm in `apercura.ts`: short colour transitions on hover and focus, a short slip for overlays, a slower slide for drawers. `prefers-reduced-motion` removes all of it.

## Accessibility

WCAG 2.2 AA and RGAA 4.1 in both themes.

- The end-to-end suite runs axe on every page type in light and dark (`apps/web/e2e/axe.ts`).
- Targets are at least 44 px; the layout survives 400 % zoom.
- The focus ring is a 3 px accent outline 2 px off the element, and `Highlight` in forced colours. Every page stays usable in forced colours.

## Do's and Don'ts

**Do**

- Let Astryx draw: its surfaces, cards, elevation and control states, as they come.
- Say what is missing and what the patient can do next, in every state.
- Keep one primary button per view, and keep the accent for the next step, verified, booked and focus.
- Use tabular figures for every number that lines up.
- Keep body text at 18 px or more on patient surfaces and targets at 44 px.
- Check a new surface in light and dark, and keep what is printed or scanned light.

**Don't**

- Don't use the Marianne typeface, the tricolour, DSFR components or any state emblem, and don't imitate Doctolib.
- Don't repaint Astryx components with custom recipes or `className` overrides of their look.
- Don't copy token values outside `packages/ui/src/astryx/apercura.ts`.
- Don't wrap dense rows in cards.
- Don't give the practitioner's actions the accent on a patient page, or use the accent for mere selection.
- Don't redraw, recolour or stretch the logo.
- Don't add a second family, capitals for emphasis, tracked-out labels, or a kicker above a heading.
- Don't add gradients or glass.
- Don't add ratings, or anything that ranks practitioners.
- Don't invent figures.
- Don't read the theme on the server or make a public page dynamic for it.
