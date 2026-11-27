import { cn, fieldStyles } from "../recipes";

const styles = fieldStyles();

/**
 * The booklet's field look on Astryx's field parts (`containerClassName`, `controlClassName`):
 * the semibold label, the 48 px ruled box with its control edge turning ink on hover, the focus
 * ring, the red edge of an invalid field. Astryx's own status box and icon are hidden: the
 * error is printed under the box with the boxed exclamation, as everywhere in the booklet.
 * The field's root carries `group/field` and `data-invalid`, as the recipe expects.
 */
export const fieldLook = {
	container: cn(
		"gap-1.5",
		"[&_.astryx-field-label]:font-display [&_.astryx-field-label]:text-meta [&_.astryx-field-label]:font-semibold [&_.astryx-field-label]:text-ink",
		"[&_.astryx-field-status]:hidden",
		// The booklet marks no field "required" in its label: the field says so to assistive
		// technology (`aria-required`) and in its error.
		"[&_.astryx-field-label>span]:hidden",
	),
	control: cn(
		styles.box(),
		"h-auto p-0 shadow-none [&>.astryx-icon[data-status]]:hidden",
		"[&_input]:min-w-0 [&_input]:flex-1 [&_input]:bg-transparent [&_input]:px-3.5 [&_input]:py-2.5 [&_input]:text-body [&_input]:text-ink [&_input]:outline-none [&_input]:placeholder:text-ink-muted",
		"[&_textarea]:min-w-0 [&_textarea]:flex-1 [&_textarea]:resize-y [&_textarea]:bg-transparent [&_textarea]:px-3.5 [&_textarea]:py-2.5 [&_textarea]:text-body [&_textarea]:leading-relaxed [&_textarea]:text-ink [&_textarea]:outline-none [&_textarea]:placeholder:text-ink-muted",
		"has-[textarea:focus-visible]:outline-3 has-[textarea:focus-visible]:outline-solid has-[textarea:focus-visible]:-outline-offset-1 has-[textarea:focus-visible]:outline-(--focus-ring)",
	),
	root: (className?: string) => styles.root({ className }),
};

/** Ids for a field's hint and error, and the `aria-describedby` that names them, in that order. */
export function describedBy(...ids: (string | false | null | undefined)[]) {
	const list = ids.filter(Boolean).join(" ");
	return list === "" ? undefined : list;
}
