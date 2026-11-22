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
	className?: string;
}

/**
 * The search printed as a row of form cells with a stamp at the end. A plain
 * GET form: it works without JavaScript and ships none.
 */
export function BookletSearch({
	action,
	fields,
	submitLabel,
	label,
	idPrefix = "booklet-search",
	className,
}: BookletSearchProps) {
	return (
		<search aria-label={label} className={className}>
			<form action={action} method="get" className="flex flex-col gap-3 md:flex-row md:gap-0">
				<div className="flex flex-1 flex-col border border-field-edge bg-paper md:flex-row">
					{fields.map((field, index) => {
						const id = `${idPrefix}-${field.name}`;
						return (
							<div
								key={field.name}
								className={cn(
									"group relative flex flex-1 flex-col px-4 pt-2.5 pb-1.5 text-ink",
									"has-[input:focus-visible]:outline-3 has-[input:focus-visible]:outline-solid has-[input:focus-visible]:outline-offset-[-6px] has-[input:focus-visible]:outline-stamp",
									index > 0 && "border-t border-field-edge md:border-t-0 md:border-s",
								)}
							>
								<label htmlFor={id} className="caps text-ink">
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
						className: "min-h-16 text-body md:min-w-44",
					})}
				>
					<SearchIcon className="size-5" />
					{submitLabel}
				</button>
			</form>
		</search>
	);
}
