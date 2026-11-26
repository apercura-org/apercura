import { ChevronDownIcon, SearchIcon } from "../icons";
import { buttonStyles, searchStyles } from "../recipes";

const search = searchStyles();

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
	/**
	 * Id of an empty slot printed after the select, on the same row, where a client action (the
	 * search's "near me") renders once the page runs.
	 */
	afterSlotId?: string;
	className?: string;
}

/**
 * A short native choice of the search (the country searched), printed as an option of the form
 * rather than a field: its small label, then a plain `<select>` in a soft box like the fields',
 * submitted with the GET form. Under the row of fields from 768 px, between the fields and the
 * stamp button on a phone.
 */
export function BookletSelectField({
	id,
	name,
	label,
	options,
	defaultValue,
	onChange,
	afterSlotId,
	className,
}: BookletSelectFieldProps) {
	return (
		<div className={search.choice({ className })}>
			<label htmlFor={id} className={search.label()}>
				{label}
			</label>
			<div className={search.choiceBox()}>
				<select
					id={id}
					name={name}
					defaultValue={defaultValue}
					onChange={onChange ? (event) => onChange(event.target.value) : undefined}
					className={search.choiceSelect()}
				>
					{options.map((option) => (
						<option key={option.value} value={option.value}>
							{option.label}
						</option>
					))}
				</select>
				<ChevronDownIcon className="pointer-events-none absolute end-3 size-5 text-ink-muted" />
			</div>
			{afterSlotId ? <span id={afterSlotId} className="contents" /> : null}
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
 * The search as a row of the printed form: soft fields, the stamp button at the end. A plain GET form:
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
		<form id={formId} action={action} method="get" className={search.form()}>
			<div className={search.cells()}>
				{fields.map((field) => {
					const id = `${idPrefix}-${field.name}`;
					return (
						<div key={field.name} className={search.cell()}>
							<label htmlFor={id} className={search.label()}>
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
								className={search.input()}
							/>
						</div>
					);
				})}
				{select ? <BookletSelectField {...select} id={`${idPrefix}-${select.name}`} /> : null}
			</div>
			<button
				type="submit"
				className={buttonStyles({
					intent: "stamp",
					size: "lg",
					className: search.submit(),
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
