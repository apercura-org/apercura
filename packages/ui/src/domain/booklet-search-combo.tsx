"use client";

import { type ReactNode, useState } from "react";
import {
	Collection,
	Header,
	Input,
	type Key,
	Label,
	ListBox,
	ListBoxItem,
	ListBoxSection,
	Popover,
	ComboBox as RACComboBox,
} from "react-aria-components";
import { SearchIcon } from "../icons";
import { buttonStyles, cn, listBoxItemStyles, popoverStyles } from "../recipes";

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

const cell = cn(
	"group relative flex flex-1 flex-col px-4 pt-2.5 pb-1.5 text-ink",
	"has-[input:focus-visible]:outline-3 has-[input:focus-visible]:outline-offset-[-6px] has-[input:focus-visible]:outline-stamp",
);
const input =
	"min-h-11 w-full text-ellipsis bg-transparent py-1 text-body text-ink sm:text-lead outline-none placeholder:text-ink-muted [&::-webkit-search-cancel-button]:hidden";

/**
 * One printed search cell with suggestions: a React Aria combo box whose text
 * is submitted with the surrounding GET form, so the form works the same with
 * or without JavaScript. Suggestions open on a paper slip with hairline rows.
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
	const visible = sections.filter((section) => section.options.length > 0);

	const choose = (key: Key | null) => {
		if (key === null) return;
		for (const section of visible) {
			const option = section.options.find((item) => item.id === key);
			if (option) {
				setValue(option.textValue);
				onChoose?.(option, section.id);
				return;
			}
		}
	};

	return (
		<RACComboBox
			id={id}
			name={name}
			allowsCustomValue
			formValue="text"
			menuTrigger="input"
			inputValue={value}
			onInputChange={(next) => {
				setValue(next);
				onInputChange?.(next);
			}}
			onSelectionChange={choose}
			items={visible}
			allowsEmptyCollection={emptyStatus !== undefined}
			className={cell}
		>
			<Label className="caps text-ink">{label}</Label>
			<Input
				type="search"
				placeholder={hint}
				autoComplete={autoComplete}
				enterKeyHint="search"
				className={input}
			/>
			<Popover
				placement="bottom start"
				offset={8}
				className={popoverStyles({
					className: "w-(--trigger-width) min-w-72 max-w-[calc(100vw-2.5rem)]",
				})}
			>
				<ListBox<BookletComboSection>
					className="max-h-96 overflow-auto outline-none"
					renderEmptyState={() => (
						<p className="px-3.5 py-3 text-meta text-ink-muted">{emptyStatus}</p>
					)}
				>
					{(section) => (
						<ListBoxSection id={section.id} className="border-b border-ink last:border-b-0">
							<Header className="caps border-b border-rule-soft bg-paper-shade px-3.5 py-1.5 text-ink">
								{section.title}
							</Header>
							<Collection items={section.options}>
								{(option) => (
									<ListBoxItem
										id={option.id}
										textValue={option.textValue}
										className={listBoxItemStyles({ className: "flex-wrap gap-x-2 gap-y-0" })}
									>
										<span>{option.label}</span>
										{option.detail ? (
											<span className="text-meta text-ink-muted">{option.detail}</span>
										) : null}
									</ListBoxItem>
								)}
							</Collection>
						</ListBoxSection>
					)}
				</ListBox>
			</Popover>
		</RACComboBox>
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
}

/**
 * The booklet search as a row of form cells with a stamp at the end, holding
 * interactive cells. Same printed look and GET contract as `BookletSearch`.
 */
export function BookletSearchFrame({
	action,
	label,
	submitLabel,
	children,
	footer,
	formId,
	className,
}: BookletSearchFrameProps) {
	return (
		<search aria-label={label} className={cn("flex flex-col gap-3", className)}>
			<form
				id={formId}
				action={action}
				method="get"
				className="flex flex-col gap-3 md:flex-row md:gap-0"
			>
				<div
					className={cn(
						"flex flex-1 flex-col border-2 border-paper bg-paper md:flex-row",
						"[&>*+*]:border-t-[1.5px] [&>*+*]:border-ink md:[&>*+*]:border-t-0 md:[&>*+*]:border-s-[1.5px]",
					)}
				>
					{children}
				</div>
				<button
					type="submit"
					className={buttonStyles({
						intent: "stamp",
						size: "lg",
						className:
							"min-h-16 text-body md:min-w-44 md:border-2 md:border-paper focus-visible:outline-cover-ink",
					})}
				>
					<SearchIcon className="size-5" />
					{submitLabel}
				</button>
			</form>
			{footer}
		</search>
	);
}
