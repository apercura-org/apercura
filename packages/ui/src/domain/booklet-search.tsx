import { SearchIcon } from "../icons";
import { buttonStyles, cn } from "../recipes";

export interface BookletSearchField {
	/** Query parameter name, e.g. `quoi`. */
	name: string;
	/** Printed field label, e.g. "Qui ?". */
	label: string;
	/** Hint shown inside the empty field, e.g. "Nom, spécialité". */
	hint: string;
	defaultValue?: string;
	autoComplete?: string;
}

export interface BookletSearchProps {
	/** Form action (a GET URL), e.g. `/recherche`. */
	action: string;
	/** One or two printed fields. */
	fields: BookletSearchField[];
	submitLabel: string;
	/** Accessible name of the search landmark. */
	label: string;
	/** Prefix for input ids, when several searches share a page. */
	idPrefix?: string;
	formId?: string;
	className?: string;
	/**
	 * `false` prints the form without the `<search>` landmark, for a caller that
	 * wraps it in its own (`label` and `className` then belong to that wrapper).
	 */
	landmark?: boolean;
}

/**
 * The search as one framed row of cells with the accent button at the end. A plain GET form:
 * it works without JavaScript and ships none.
 */
export function BookletSearch({
	action,
	fields,
	submitLabel,
	label,
	idPrefix = "booklet-search",
	formId,
	className,
	landmark = true,
}: BookletSearchProps) {
	const form = (
		<form
			id={formId}
			action={action}
			method="get"
			className="flex flex-col gap-1.5 rounded-panel border border-field-edge bg-paper p-1.5 md:flex-row"
		>
			<div className="flex flex-1 flex-col md:flex-row">
				{fields.map((field, index) => {
					const id = `${idPrefix}-${field.name}`;
					return (
						<div
							key={field.name}
							className={cn(
								"group relative flex flex-1 flex-col rounded-field px-3.5 pt-2 pb-1 text-ink",
								"has-[input:focus-visible]:outline-3 has-[input:focus-visible]:outline-solid has-[input:focus-visible]:outline-offset-0 has-[input:focus-visible]:outline-stamp",
								index > 0 && "border-t border-rule-soft md:border-t-0 md:border-s",
							)}
						>
							<label htmlFor={id} className="type-caption text-ink-muted">
								{field.label}
							</label>
							<input
								id={id}
								name={field.name}
								type="search"
								defaultValue={field.defaultValue}
								placeholder={field.hint}
								autoComplete={field.autoComplete ?? "off"}
								enterKeyHint="search"
								className="min-h-11 w-full text-ellipsis bg-transparent py-1 text-body text-ink sm:text-lead outline-none placeholder:text-ink-muted [&::-webkit-search-cancel-button]:hidden"
							/>
						</div>
					);
				})}
			</div>
			<button
				type="submit"
				className={buttonStyles({
					intent: "stamp",
					size: "lg",
					className: "min-h-14 text-body md:min-w-40",
				})}
			>
				<SearchIcon className="size-5" />
				{submitLabel}
			</button>
		</form>
	);
	if (!landmark) return form;
	return (
		<search aria-label={label} className={className}>
			{form}
		</search>
	);
}
