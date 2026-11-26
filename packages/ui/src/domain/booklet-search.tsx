import { ChevronDownIcon, SearchIcon } from "../icons";
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

export interface BookletSelectOption {
	/** Submitted value, e.g. `gb`. */
	value: string;
	/** Printed text, e.g. "United Kingdom". */
	label: string;
}

export interface BookletSelectFieldProps {
	/** Select id, unique on the page. */
	id: string;
	/** Query parameter name, e.g. `pays`. */
	name: string;
	/** Printed field label, e.g. "Country". */
	label: string;
	options: BookletSelectOption[];
	defaultValue?: string;
	onChange?: (value: string) => void;
	className?: string;
}

/**
 * A printed search cell holding a short native choice (the country searched): a plain
 * `<select>` submitted with the GET form, sized to its longest option so the text cells
 * keep the room.
 */
export function BookletSelectField({
	id,
	name,
	label,
	options,
	defaultValue,
	onChange,
	className,
}: BookletSelectFieldProps) {
	return (
		<div
			className={cn(
				"group relative flex flex-col rounded-field px-3.5 pt-2 pb-1 text-ink md:flex-none",
				"has-[select:focus-visible]:outline-3 has-[select:focus-visible]:outline-solid has-[select:focus-visible]:outline-offset-0 has-[select:focus-visible]:outline-stamp",
				className,
			)}
		>
			<label htmlFor={id} className="type-caption text-ink-muted">
				{label}
			</label>
			<div className="relative flex items-center">
				<select
					id={id}
					name={name}
					defaultValue={defaultValue}
					onChange={onChange ? (event) => onChange(event.target.value) : undefined}
					className="min-h-11 w-full cursor-pointer appearance-none truncate bg-transparent py-1 pe-7 text-body text-ink outline-none sm:text-lead md:w-auto md:max-w-48 [&>option]:bg-paper [&>option]:text-ink"
				>
					{options.map((option) => (
						<option key={option.value} value={option.value}>
							{option.label}
						</option>
					))}
				</select>
				<ChevronDownIcon className="pointer-events-none absolute end-0 size-5 text-ink-muted" />
			</div>
		</div>
	);
}

export interface BookletSearchProps {
	/** Form action (a GET URL), e.g. `/recherche`. */
	action: string;
	/** One or two printed fields. */
	fields: BookletSearchField[];
	/** A short choice printed after the fields (the country searched). */
	select?: Omit<BookletSelectFieldProps, "id" | "onChange" | "className">;
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
	select,
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
				{select ? (
					<BookletSelectField
						{...select}
						id={`${idPrefix}-${select.name}`}
						className={
							fields.length > 0 ? "border-t border-rule-soft md:border-t-0 md:border-s" : undefined
						}
					/>
				) : null}
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
