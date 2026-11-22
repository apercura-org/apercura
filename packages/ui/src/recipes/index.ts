/**
 * Style recipes (tailwind-variants). Server-safe: they hold no React code, so
 * server components can style plain elements (`<a>`, `<table>`) exactly like
 * the interactive React Aria components.
 */
import { tv } from "./tv";

export { cn, tv } from "./tv";

/** Focus ring for elements styled outside React Aria. Colour comes from the surface. */
export const focusRing =
	"outline-none focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring) data-focus-visible:outline-3 data-focus-visible:outline-offset-2 data-focus-visible:outline-(--focus-ring)";

export const buttonStyles = tv({
	base: [
		"relative inline-flex max-w-full shrink-0 cursor-pointer select-none items-center justify-center gap-2 rounded-field",
		"font-display font-semibold tracking-[0.005em] font-stretch-normal no-underline",
		"transition-[background-color,color,transform,border-color] duration-150 ease-out",
		"active:translate-y-px data-pressed:translate-y-px",
		"disabled:cursor-not-allowed data-disabled:cursor-not-allowed data-disabled:translate-y-0",
		"forced-colors:border-2 forced-colors:border-[ButtonText] [&_svg]:shrink-0",
		focusRing,
	],
	variants: {
		intent: {
			/** The stamp: primary action. Muted violet fill, a hairline white inner frame. */
			stamp: [
				"bg-stamp text-paper shadow-[inset_0_0_0_3px_var(--color-stamp),inset_0_0_0_4px_var(--color-paper)]",
				"hover:bg-stamp-strong hover:shadow-[inset_0_0_0_3px_var(--color-stamp-strong),inset_0_0_0_4px_var(--color-paper)]",
				"data-pressed:bg-stamp-strong",
				"data-disabled:bg-paper-shade data-disabled:text-ink-disabled data-disabled:shadow-[inset_0_0_0_1px_var(--color-ink-disabled)]",
			],
			/** Printed outline: secondary action. Its labels can be long ("Call 01 00 00 00 00"). */
			ink: [
				"border border-ink bg-paper text-ink text-start hover:bg-paper-shade data-pressed:bg-paper-shade",
				"data-disabled:border-ink-disabled data-disabled:text-ink-disabled data-disabled:bg-paper",
			],
			/** Text-only action inside dense rows. */
			quiet: [
				"bg-transparent px-2 font-body font-semibold tracking-normal text-ink underline decoration-1 underline-offset-4",
				"hover:decoration-2 data-pressed:decoration-2 data-disabled:text-ink-disabled",
			],
		},
		size: {
			md: "min-h-11 px-5 text-meta",
			lg: "min-h-14 px-7 text-body",
			icon: "size-11 p-0 text-meta",
		},
	},
	compoundVariants: [{ intent: "quiet", size: "md", className: "px-2" }],
	defaultVariants: { intent: "stamp", size: "md" },
});

export const linkStyles = tv({
	base: [
		"cursor-pointer rounded-[1px] underline decoration-1 underline-offset-[0.2em] transition-[text-decoration-thickness] duration-100",
		"hover:decoration-2 data-hovered:decoration-2",
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
		label: "font-display text-meta font-medium text-ink font-stretch-semi-condensed",
		box: [
			"flex min-h-12 w-full items-center overflow-hidden rounded-field border border-field-edge bg-paper text-ink",
			"transition-colors duration-150 hover:border-ink",
			"has-[input:focus-visible]:outline-3 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-(--focus-ring)",
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

/** Popover paper slip: border-only elevation, as print has no shadows. */
export const popoverStyles = tv({
	base: [
		"min-w-(--trigger-width) overflow-auto rounded-field border border-ink bg-paper text-ink outline-none",
		"data-entering:animate-slip-in",
		"forced-colors:border-[CanvasText]",
	],
});

export const listBoxItemStyles = tv({
	base: [
		"flex min-h-11 cursor-pointer items-center gap-3 border-b border-rule-soft px-3.5 py-2 text-body text-ink outline-none last:border-b-0",
		"data-focused:bg-paper-shade data-hovered:bg-paper-shade",
		"data-selected:font-semibold",
		"data-focus-visible:outline-3 data-focus-visible:-outline-offset-3 data-focus-visible:outline-(--focus-ring)",
		"data-disabled:cursor-not-allowed data-disabled:text-ink-disabled",
	],
});

export const badgeStyles = tv({
	base: "inline-flex min-h-7 items-center gap-1.5 rounded-field px-2.5 py-0.5 font-display text-folio font-semibold uppercase tracking-[0.045em] font-stretch-normal",
	variants: {
		tone: {
			/** Neutral printed mark: unclaimed, not provided, informational. */
			ink: "border border-field-edge bg-paper text-ink",
			/** Stamped mark, double-edged: verified page, booked slot. */
			stamp:
				"border border-stamp bg-stamp-tint text-stamp shadow-[inset_0_0_0_2px_var(--color-stamp-tint),inset_0_0_0_3px_var(--color-stamp)]",
			/** Error mark. */
			error: "border border-error bg-error-tint text-error",
		},
	},
	defaultVariants: { tone: "ink" },
});

/** Ruled table: strong top and bottom rules, hairlines between rows, caps headers. */
export const tableStyles = tv({
	slots: {
		table: "w-full border-collapse border-y border-ink text-left text-body",
		caption: "type-title pb-3 text-left",
		head: "border-b border-ink",
		column:
			"caps px-3 py-2.5 text-left align-bottom text-ink first:pl-0 last:pr-0 outline-none data-focus-visible:outline-3 data-focus-visible:-outline-offset-3 data-focus-visible:outline-(--focus-ring)",
		row: "border-b border-rule-soft last:border-b-0 outline-none data-focus-visible:outline-3 data-focus-visible:-outline-offset-3 data-focus-visible:outline-(--focus-ring) data-hovered:bg-paper-shade data-selected:bg-paper-shade",
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
