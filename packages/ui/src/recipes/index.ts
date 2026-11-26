/**
 * Style recipes (tailwind-variants). Server-safe: they hold no React code, so
 * server components can style plain elements (`<a>`, `<table>`) exactly like
 * the interactive React Aria components.
 */
import { tv } from "./tv";

export { cn, tv } from "./tv";

/**
 * Focus ring for elements styled outside React Aria. Colour comes from the surface. One class
 * (`styles/theme.css`) for `outline-none` and the `focus-visible:` and `data-focus-visible:`
 * outlines (3 px, solid, offset 2 px, `--focus-ring`), so pages do not repeat them.
 */
export const focusRing = "focus-ring";

/** The focus ring drawn inside the box (offset -3 px): table rows and headers, options. */
const focusRingInset = "focus-ring-inset";

export const buttonStyles = tv({
	base: [
		"relative inline-flex max-w-full shrink-0 cursor-pointer select-none items-center justify-center gap-2 rounded-field",
		"font-display font-semibold tracking-[-0.003em] no-underline",
		"transition-[background-color,color,transform,border-color] duration-150 ease-out",
		"disabled:cursor-not-allowed data-disabled:cursor-not-allowed data-disabled:translate-y-0",
		"forced-colors:border-2 forced-colors:border-[ButtonText] [&_svg]:shrink-0",
		focusRing,
	],
	variants: {
		intent: {
			/**
			 * The violet ink: the primary action, a solid fill with soft corners and its label in the
			 * paper's colour, that presses and settles in 120 ms.
			 */
			stamp: [
				"ink-press border border-stamp bg-stamp text-paper",
				"hover:border-stamp-strong hover:bg-stamp-strong data-pressed:border-stamp-strong data-pressed:bg-stamp-strong",
				// Disabled: the ground with a disabled-ink edge, so it still reads as a button on paper and on the shade.
				"data-disabled:border-ink-disabled data-disabled:bg-paper data-disabled:text-ink-disabled",
			],
			/** Outline: the secondary action. Its labels can be long ("Call 01 00 00 00 00"). */
			ink: [
				"border border-field-edge bg-paper text-ink text-start hover:border-ink hover:bg-paper-shade data-pressed:bg-paper-shade",
				"active:translate-y-px data-pressed:translate-y-px",
				"data-disabled:border-ink-disabled data-disabled:text-ink-disabled data-disabled:bg-paper",
			],
			/** Text-only action inside dense rows. */
			quiet: [
				"bg-transparent px-2 font-body font-semibold tracking-normal text-ink underline decoration-1 underline-offset-4",
				"hover:decoration-2 data-pressed:decoration-2 data-disabled:text-ink-disabled",
				"active:translate-y-px data-pressed:translate-y-px",
			],
		},
		size: {
			md: "min-h-11 px-4.5 text-meta",
			lg: "min-h-13 px-6 text-body",
			icon: "size-11 p-0 text-meta",
		},
	},
	compoundVariants: [{ intent: "quiet", size: "md", className: "px-2" }],
	defaultVariants: { intent: "ink", size: "md" },
});

/**
 * The search, printed as a row of the form: soft fields ("Qui ?", "Où ?"), each a small printed
 * label over a rounded box to write in, and the violet stamp button at the end of the row. A short
 * choice (the country searched) is printed under the row from 768 px, so the fields keep its width.
 */
export const searchStyles = tv({
	slots: {
		form: "flex flex-col gap-4 md:flex-row md:flex-wrap md:items-end md:gap-x-3 md:gap-y-4",
		// From 768 px the cells are items of the form's row itself, beside the stamp button.
		cells: "flex flex-col gap-4 md:contents",
		// "Qui ?" takes the wider share of the row: its hint is the longer one.
		cell: "group relative flex min-w-0 flex-1 flex-col gap-1.5 text-ink md:first-of-type:flex-[1.4]",
		label: "type-caption text-ink-muted",
		input: [
			"min-h-13 w-full text-ellipsis rounded-field border border-field-edge bg-paper px-4 py-2 text-body text-ink sm:text-lead",
			"transition-[border-color] duration-150 hover:border-ink focus-visible:border-stamp",
			"outline-none focus-visible:outline-3 focus-visible:outline-solid focus-visible:-outline-offset-1 focus-visible:outline-(--focus-ring)",
			"placeholder:text-ink-muted [&::-webkit-search-cancel-button]:hidden",
		],
		submit: "min-h-13 text-body md:min-w-40",
		choice: "flex items-center gap-3 md:order-last md:basis-full",
		choiceBox: [
			"relative inline-flex items-center rounded-field border border-field-edge bg-paper text-ink",
			"transition-[border-color] duration-150 hover:border-ink has-[select:focus-visible]:border-stamp",
			"has-[select:focus-visible]:outline-3 has-[select:focus-visible]:outline-solid has-[select:focus-visible]:-outline-offset-1 has-[select:focus-visible]:outline-(--focus-ring)",
		],
		choiceSelect:
			"min-h-11 cursor-pointer appearance-none rounded-field bg-transparent py-1 ps-3.5 pe-10 text-body text-ink outline-none [&>option]:bg-paper [&>option]:text-ink",
	},
});

export const linkStyles = tv({
	base: [
		// cursor-pointer rounded-mark underline decoration-1 underline-offset-[0.2em], a 100 ms
		// transition of the underline's thickness, 2 px on hover (`styles/theme.css`).
		"link-base",
		focusRing,
	],
	variants: {
		tone: {
			ink: "text-ink",
			muted: "text-ink-muted",
		},
	},
	defaultVariants: { tone: "ink" },
});

/** Shared parts of every text-like field: label, box, input, hint, error. */
export const fieldStyles = tv({
	slots: {
		root: "group/field flex flex-col gap-1.5",
		label: "font-display text-meta font-semibold text-ink",
		box: [
			"flex min-h-12 w-full items-center overflow-hidden rounded-field border border-field-edge bg-paper text-ink",
			"transition-colors duration-150 hover:border-ink",
			"has-[input:focus-visible]:outline-3 has-[input:focus-visible]:outline-solid has-[input:focus-visible]:-outline-offset-1 has-[input:focus-visible]:outline-(--focus-ring)",
			"data-focus-within:border-ink",
			"group-data-invalid/field:border-2 group-data-invalid/field:border-error",
			"group-data-disabled/field:border-ink-disabled group-data-disabled/field:bg-paper-shade group-data-disabled/field:text-ink-disabled",
		],
		input: [
			"min-w-0 flex-1 bg-transparent px-3.5 py-2.5 text-body text-ink outline-none placeholder:text-ink-muted",
			"disabled:cursor-not-allowed [&::-webkit-search-cancel-button]:hidden",
		],
		description: "text-meta text-ink-muted",
		error: "flex items-start gap-1.5 text-meta font-semibold text-error",
	},
});

/** Popover: a hairline-bordered panel with the one overlay shadow. */
export const popoverStyles = tv({
	base: [
		"min-w-(--trigger-width) overflow-auto rounded-panel border border-rule-soft bg-paper text-ink shadow-overlay outline-none",
		"data-entering:animate-slip-in",
		"forced-colors:border-[CanvasText]",
	],
});

export const listBoxItemStyles = tv({
	base: [
		"flex min-h-11 cursor-pointer items-center gap-3 border-b border-rule-soft px-3.5 py-2 text-body text-ink last:border-b-0",
		"data-focused:bg-paper-shade data-hovered:bg-paper-shade",
		"data-selected:font-semibold",
		focusRingInset,
		"data-disabled:cursor-not-allowed data-disabled:text-ink-disabled",
	],
});

/** A printed mark: a small ruled box in caption type, with the marks' soft corners. */
export const badgeStyles = tv({
	base: "type-caption inline-flex min-h-7 items-center gap-1.5 rounded-mark border px-2.5 py-0.5",
	variants: {
		tone: {
			/** Neutral mark: unclaimed, not provided, informational. */
			ink: "border-field-edge bg-paper-shade text-ink",
			/** Accent mark: verified page, booked slot. */
			stamp: "border-stamp bg-stamp-tint text-stamp",
			/** Error mark. */
			error: "border-error bg-error-tint text-error",
		},
	},
	defaultVariants: { tone: "ink" },
});

/**
 * Ruled table, as a printed register: small printed column labels over an ink rule, form
 * hairlines between the rows, no boxes.
 */
export const tableStyles = tv({
	slots: {
		table: "w-full border-collapse border-b border-rule-soft text-left text-body",
		caption: "type-title pb-3 text-left",
		head: "border-b border-ink",
		column: `type-caption px-3 py-2.5 text-left align-bottom text-ink-muted first:pl-0 last:pr-0 ${focusRingInset}`,
		row: `border-b border-rule-soft last:border-b-0 ${focusRingInset} data-hovered:bg-paper-shade data-selected:bg-paper-shade`,
		cell: "px-3 py-3 align-top first:pl-0 last:pr-0",
	},
});

export const skeletonStyles = tv({
	base: "block rounded-field bg-paper-shade motion-safe:animate-pulse-soft",
	variants: {
		shape: {
			line: "h-[1.1em] w-full",
			block: "h-24 w-full",
			seal: "size-20 rounded-full",
		},
	},
	defaultVariants: { shape: "line" },
});
