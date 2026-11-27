"use client";

import { type FormEvent, type ReactNode, useMemo, useState } from "react";
import { SuggestBox } from "../astryx/suggest-box";
import { SearchIcon } from "../icons";
import { buttonStyles, cn, searchStyles } from "../recipes";

export interface BookletComboOption {
	id: string;
	/** Main text of the suggestion row. */
	label: string;
	/** Text written into the field when the suggestion is chosen. */
	textValue: string;
	/** Secondary fact printed after the label (place, department). */
	detail?: string;
}

export interface BookletComboSection {
	id: string;
	/** Printed caption of the group, e.g. "Specialties". */
	title: string;
	options: BookletComboOption[];
}

export interface BookletComboFieldProps {
	/** Query parameter name, e.g. `quoi`: the typed text is submitted with the form. */
	name: string;
	/** Printed field label, e.g. "Qui ?". */
	label: string;
	/** Hint shown inside the empty field. */
	hint: string;
	/** Input id, unique on the page. */
	id: string;
	defaultValue?: string;
	autoComplete?: string;
	/** Suggestions for the current text, grouped. Empty sections are not printed. */
	sections: BookletComboSection[];
	onInputChange?: (value: string) => void;
	/** Called when a suggestion is chosen (after its text is written into the field). */
	onChoose?: (option: BookletComboOption, sectionId: string) => void;
	/**
	 * Text printed on the open slip while there are no rows to show: while
	 * suggestions load ("Searching…") or when none match. Undefined keeps the
	 * slip closed (nothing typed yet). Suggestions arrive after typing, so the
	 * slip must open on the keystroke, before they exist.
	 */
	emptyStatus?: string;
}

const search = searchStyles();

/**
 * One printed search cell with suggestions: its text is submitted with the surrounding GET
 * form, so the form works the same with or without JavaScript. Suggestions open on a paper
 * slip with hairline rows, grouped under printed captions (`SuggestBox`, on Astryx's layer).
 *
 * What the visitor did before React hydrated the box (#159), its text and its focus, is taken
 * on hydration as if just done: the suggestions open without another keystroke.
 */
export function BookletComboField({
	name,
	label,
	hint,
	id,
	defaultValue = "",
	autoComplete = "off",
	sections,
	onInputChange,
	onChoose,
	emptyStatus,
}: BookletComboFieldProps) {
	const [value, setValue] = useState(defaultValue);
	const rows = useMemo(
		() =>
			sections.map((section) => ({
				id: section.id,
				title: section.title,
				options: section.options.map((option) => ({
					id: option.id,
					textValue: option.textValue,
					label: (
						<>
							<span>{option.label}</span>
							{option.detail ? (
								<span className="text-meta text-ink-muted">{option.detail}</span>
							) : null}
						</>
					),
				})),
			})),
		[sections],
	);
	const change = (next: string) => {
		setValue(next);
		onInputChange?.(next);
	};
	return (
		<div className={search.cell()}>
			<label htmlFor={id} className={search.label()}>
				{label}
			</label>
			<SuggestBox
				value={value}
				onValueChange={change}
				sections={rows}
				onChoose={(option, sectionId) => {
					const section = sections.find((item) => item.id === sectionId);
					const chosen = section?.options.find((item) => item.id === option.id);
					if (chosen) onChoose?.(chosen, sectionId);
				}}
				emptyStatus={emptyStatus}
				listLabel={label}
				listClassName="min-w-72 max-w-[calc(100vw-2.5rem)]"
				offset={8}
				adoptsTypedText
			>
				{(input, anchor) => (
					<div ref={anchor} className="w-full">
						<input
							{...input}
							id={id}
							name={name}
							type="search"
							value={value}
							onChange={(event) => {
								input.onInput();
								change(event.target.value);
							}}
							placeholder={hint}
							autoComplete={autoComplete}
							enterKeyHint="search"
							className={search.input()}
						/>
					</div>
				)}
			</SuggestBox>
		</div>
	);
}

export interface BookletSearchFrameProps {
	/** Form action (a GET URL), e.g. `/recherche`. */
	action: string;
	/** Accessible name of the search landmark. */
	label: string;
	submitLabel: string;
	/** The printed cells, usually `BookletComboField`s; hidden inputs may follow. */
	children: ReactNode;
	/** Printed under the row (e.g. a "near me" action and its status). */
	footer?: ReactNode;
	formId?: string;
	className?: string;
	/**
	 * `false` prints the form (and footer) without the `<search>` landmark, for a
	 * caller that wraps it in its own: e.g. a page that hydrates the cells later
	 * than a footer action. `label` and `className` then belong to that wrapper.
	 */
	landmark?: boolean;
}

/**
 * Submitted with the keyboard, the stamp button presses as it does under a pointer (`.ink-press`):
 * the ink gives for 120 ms while the browser loads the results.
 */
function pressStamp(event: FormEvent<HTMLFormElement>) {
	const stamp = event.currentTarget.querySelector<HTMLElement>("button[type=submit]");
	if (!stamp) return;
	stamp.setAttribute("data-pressed", "");
	window.setTimeout(() => stamp.removeAttribute("data-pressed"), 120);
}

/**
 * The search as a row of the printed form, soft fields then the stamp button, holding
 * interactive cells. Same look and GET contract as `BookletSearch`.
 */
export function BookletSearchFrame({
	action,
	label,
	submitLabel,
	children,
	footer,
	formId,
	className,
	landmark = true,
}: BookletSearchFrameProps) {
	const form = (
		<form id={formId} action={action} method="get" onSubmit={pressStamp} className={search.form()}>
			<div className={search.cells()}>{children}</div>
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
	if (!landmark) {
		return (
			<>
				{form}
				{footer}
			</>
		);
	}
	return (
		<search aria-label={label} className={cn("flex flex-col gap-3", className)}>
			{form}
			{footer}
		</search>
	);
}
