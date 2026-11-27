"use client";

import "./styles";
import { useLayer } from "@astryxdesign/core/Layer";
import {
	type KeyboardEvent,
	type ReactNode,
	type RefObject,
	useEffect,
	useId,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { cn, listBoxItemStyles, popoverStyles } from "../recipes";

/**
 * A text box that suggests, the WAI-ARIA editable combobox with list autocomplete: the text
 * is free (it is what a form submits), the list only proposes. Built on Astryx's layer
 * (`useLayer`: the popover API and CSS anchor positioning), so the list sits in the top layer,
 * above a modal dialog too, and follows its box.
 *
 * Astryx's `Typeahead` picks an item and keeps the typed text out of the form, and its
 * `Selector` has no free text: this is the piece they leave out, on their primitives.
 *
 * The focus stays in the box; the active option is `aria-activedescendant`. Arrow keys open
 * the list and move, Enter chooses (and only then does not submit), Escape closes, Tab and
 * leaving the box close it.
 */

export interface SuggestOption {
	id: string;
	/** Row content. */
	label: ReactNode;
	/** Text written into the box when the option is chosen; also its name when `label` is not text. */
	textValue: string;
	isDisabled?: boolean;
}

export interface SuggestSection {
	id: string;
	/** Printed caption of the group; none for a single plain list. */
	title?: string;
	options: SuggestOption[];
}

export interface SuggestBoxRenderProps {
	ref: RefObject<HTMLInputElement | null>;
	role: "combobox";
	"aria-autocomplete": "list";
	"aria-expanded": boolean;
	"aria-controls": string;
	"aria-activedescendant": string | undefined;
	onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
	onFocus: () => void;
	onBlur: () => void;
	/** Call it on each keystroke that changes the text: the list opens again. */
	onInput: () => void;
}

export interface SuggestBoxProps {
	value: string;
	onValueChange: (value: string) => void;
	sections: SuggestSection[];
	/** Called with the option and its section once its text is written into the box. */
	onChoose?: (option: SuggestOption, sectionId: string) => void;
	/** Printed in the open list while it has no row (loading, nothing found); none keeps it shut. */
	emptyStatus?: string;
	/** The box itself: an input given these props, inside the element `anchor` is set on. */
	children: (
		input: SuggestBoxRenderProps,
		anchor: (element: HTMLElement | null) => void,
	) => ReactNode;
	/** Accessible name of the list (the box's label). */
	listLabel: string;
	/** Extra classes for the floating list. */
	listClassName?: string;
	offset?: number;
	/**
	 * Take what was typed before the box hydrated (#159): its text and its focus, so the
	 * suggestions open without another keystroke.
	 */
	adoptsTypedText?: boolean;
	/** The box's ref, when the caller needs it too (validation). */
	inputRef?: RefObject<HTMLInputElement | null>;
}

export function SuggestBox({
	value,
	onValueChange,
	sections,
	onChoose,
	emptyStatus,
	children,
	listLabel,
	listClassName,
	offset = 6,
	adoptsTypedText = false,
	inputRef,
}: SuggestBoxProps) {
	const listId = useId();
	const ownInput = useRef<HTMLInputElement>(null);
	const input = inputRef ?? ownInput;
	const [focused, setFocused] = useState(false);
	const [dismissed, setDismissed] = useState(true);
	const [active, setActive] = useState<string | null>(null);
	const layer = useLayer({ mode: "context" });

	const visible = useMemo(
		() => sections.filter((section) => section.options.length > 0),
		[sections],
	);
	const flat = useMemo(
		() =>
			visible.flatMap((section) =>
				section.options
					.filter((option) => !option.isDisabled)
					.map((option) => ({
						option,
						sectionId: section.id,
						id: `${listId}-${section.id}-${option.id}`,
					})),
			),
		[visible, listId],
	);
	const hasContent = flat.length > 0 || (emptyStatus !== undefined && value.trim() !== "");
	const open = focused && !dismissed && hasContent;

	useLayoutEffect(() => {
		if (open && !layer.isOpen) layer.show();
		else if (!open && layer.isOpen) layer.hide();
	}, [open, layer]);

	// The active option disappears with a new list.
	useEffect(() => {
		if (active && !flat.some((item) => item.id === active)) setActive(null);
	}, [flat, active]);

	// #159: on hydration, the box may already hold the visitor's text and focus.
	// biome-ignore lint/correctness/useExhaustiveDependencies: once, on hydration.
	useEffect(() => {
		if (!adoptsTypedText) return;
		const field = input.current;
		if (!field) return;
		if (field === document.activeElement) {
			setFocused(true);
			setDismissed(false);
		}
		if (field.value !== value) onValueChange(field.value);
	}, []);

	const choose = (item: (typeof flat)[number]) => {
		onValueChange(item.option.textValue);
		onChoose?.(item.option, item.sectionId);
		setDismissed(true);
		setActive(null);
	};

	const move = (step: 1 | -1) => {
		if (flat.length === 0) return;
		const index = flat.findIndex((item) => item.id === active);
		const next =
			index === -1
				? step === 1
					? 0
					: flat.length - 1
				: (index + step + flat.length) % flat.length;
		setActive(flat[next]?.id ?? null);
		document.getElementById(flat[next]?.id ?? "")?.scrollIntoView({ block: "nearest" });
	};

	const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
		if (event.nativeEvent.isComposing) return;
		switch (event.key) {
			case "ArrowDown":
			case "ArrowUp":
				event.preventDefault();
				if (!open) {
					setDismissed(false);
					return;
				}
				move(event.key === "ArrowDown" ? 1 : -1);
				return;
			case "Enter": {
				const item = open ? flat.find((entry) => entry.id === active) : undefined;
				if (item) {
					event.preventDefault();
					choose(item);
				}
				return;
			}
			case "Escape":
				if (open) {
					event.preventDefault();
					event.stopPropagation();
					setDismissed(true);
					setActive(null);
				}
				return;
			case "Tab":
				setDismissed(true);
				return;
		}
	};

	const list = (
		<div
			id={listId}
			role="listbox"
			aria-label={listLabel}
			className="max-h-96 overflow-auto outline-none"
			// Pressing a row must not take the focus from the box.
			onMouseDown={(event) => event.preventDefault()}
		>
			{flat.length === 0 ? (
				<p className="px-3.5 py-3 text-meta text-ink-muted">{emptyStatus}</p>
			) : (
				visible.map((section) => {
					const rows = section.options.map((option) => {
						const id = `${listId}-${section.id}-${option.id}`;
						return (
							// The focus stays in the box: options are reached through
							// `aria-activedescendant` and the arrow keys, as the pattern asks.
							// biome-ignore lint/a11y/useFocusableInteractive: see above.
							// biome-ignore lint/a11y/useKeyWithClickEvents: the box's keys choose.
							<div
								key={option.id}
								id={id}
								role="option"
								aria-selected={active === id}
								aria-disabled={option.isDisabled || undefined}
								data-focused={active === id || undefined}
								onPointerMove={() => !option.isDisabled && setActive(id)}
								onClick={() => {
									const item = flat.find((entry) => entry.id === id);
									if (item) choose(item);
								}}
								className={listBoxItemStyles({ className: "flex-wrap gap-x-2 gap-y-0" })}
							>
								{option.label}
							</div>
						);
					});
					if (!section.title) return rows;
					const headerId = `${listId}-${section.id}`;
					return (
						// biome-ignore lint/a11y/useSemanticElements: a group of options inside a listbox.
						<div
							key={section.id}
							role="group"
							aria-labelledby={headerId}
							className="border-b border-rule-soft last:border-b-0"
						>
							<div
								id={headerId}
								role="presentation"
								className="type-caption border-b border-rule-soft bg-paper-shade px-3.5 py-1.5 text-ink-muted"
							>
								{section.title}
							</div>
							{rows}
						</div>
					);
				})
			)}
		</div>
	);

	return (
		<>
			{children(
				{
					ref: input,
					role: "combobox",
					"aria-autocomplete": "list",
					"aria-expanded": open,
					"aria-controls": listId,
					"aria-activedescendant": open && active ? active : undefined,
					onKeyDown,
					onFocus: () => {
						setFocused(true);
						setDismissed(false);
					},
					onBlur: () => {
						setFocused(false);
						setActive(null);
					},
					onInput: () => setDismissed(false),
				},
				layer.ref,
			)}
			{layer.render(list, {
				placement: "below",
				alignment: "start",
				offset,
				className: popoverStyles({ className: cn("p-0 animate-none", listClassName) }),
				style: { minWidth: "anchor-size(width)" },
			})}
		</>
	);
}
