"use client";

import { ChevronDownIcon } from "@apercura/ui";
import { type KeyboardEvent, type MouseEvent, type ReactNode, useEffect, useRef } from "react";

interface HeaderMenuProps {
	/** Landmark name, e.g. "Langue" or "Pays". */
	label: string;
	/** The toggle's accessible name, naming the current choice, e.g. "Langue : Français". */
	toggleLabel: string;
	/** The toggle's printed caption, e.g. "Langue". */
	caption: string;
	/** The current choice as printed on the toggle, e.g. "Français". */
	current: ReactNode;
	/**
	 * The menu's `<li>` items, each holding one link (rendered by the server: the menu ships
	 * only this disclosure's behaviour). The current one carries `aria-current="true"`.
	 */
	children: ReactNode;
	/**
	 * Where the list opens: under the toggle's end edge (default), or on a phone under its start
	 * edge ("start"), for a menu that sits at the start of its row there.
	 */
	align?: "start" | "end";
	className?: string;
}

/**
 * A menu of the header (the language, the country): a disclosure (`<details>`) holding a list of
 * links. Without JavaScript it opens and closes natively and the links work; with it, Escape
 * closes it (focus back on the toggle), a click or focus elsewhere closes it, choosing a link
 * closes it, and the arrow keys, Home and End move through the list. Links, not a select:
 * choosing is an explicit activation, never a change of page on a mere arrow key (WCAG 3.2.2),
 * and crawlers still see every URL.
 */
export function HeaderMenu({
	label,
	toggleLabel,
	caption,
	current,
	children,
	align = "end",
	className,
}: HeaderMenuProps) {
	const details = useRef<HTMLDetailsElement>(null);
	const toggle = useRef<HTMLElement>(null);
	const list = useRef<HTMLUListElement>(null);

	useEffect(() => {
		const element = details.current;
		if (!element) return;
		const close = () => {
			element.open = false;
		};
		const onPointerDown = (event: PointerEvent) => {
			if (element.open && !element.contains(event.target as Node)) close();
		};
		const onFocusOut = (event: FocusEvent) => {
			const next = event.relatedTarget as Node | null;
			if (element.open && next && !element.contains(next)) close();
		};
		document.addEventListener("pointerdown", onPointerDown);
		element.addEventListener("focusout", onFocusOut);
		return () => {
			document.removeEventListener("pointerdown", onPointerDown);
			element.removeEventListener("focusout", onFocusOut);
		};
	}, []);

	const links = () => Array.from(list.current?.querySelectorAll<HTMLAnchorElement>("a") ?? []);

	const onKeyDown = (event: KeyboardEvent<HTMLDetailsElement>) => {
		const element = details.current;
		if (!element) return;
		if (event.key === "Escape" && element.open) {
			event.preventDefault();
			element.open = false;
			toggle.current?.focus();
			return;
		}
		const items = links();
		const index = items.indexOf(document.activeElement as HTMLAnchorElement);
		const onToggle = document.activeElement === toggle.current;
		let next: number | null = null;
		if (event.key === "ArrowDown") {
			if (onToggle) {
				element.open = true;
				next = Math.max(
					0,
					items.findIndex((item) => item.getAttribute("aria-current") === "true"),
				);
			} else if (index >= 0) next = (index + 1) % items.length;
		} else if (event.key === "ArrowUp" && index >= 0) {
			next = (index - 1 + items.length) % items.length;
		} else if (event.key === "Home" && index >= 0) {
			next = 0;
		} else if (event.key === "End" && index >= 0) {
			next = items.length - 1;
		}
		if (next === null) return;
		event.preventDefault();
		items[next]?.focus();
	};

	// A link chosen: the menu closes (a same-document navigation would leave it open).
	const onClick = (event: MouseEvent<HTMLUListElement>) => {
		if ((event.target as Element).closest("a") && details.current) details.current.open = false;
	};

	return (
		<nav aria-label={label} className={className ? `relative ${className}` : "relative"}>
			<details ref={details} className="group" onKeyDown={onKeyDown}>
				<summary
					ref={toggle}
					aria-label={toggleLabel}
					className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-field px-2.5 text-meta text-ink outline-none hover:bg-paper-shade focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring) group-open:bg-paper-shade [&::-webkit-details-marker]:hidden"
				>
					<span className="text-ink-muted">{caption}</span>
					<span className="font-medium">{current}</span>
					<ChevronDownIcon className="size-4 text-ink-muted transition-transform duration-150 group-open:rotate-180" />
				</summary>
				{/* biome-ignore lint/a11y/useKeyWithClickEvents: the links handle the keyboard; this only closes the menu after one is chosen. */}
				<ul
					ref={list}
					onClick={onClick}
					className={`absolute ${align === "start" ? "start-0 sm:start-auto sm:end-0" : "end-0"} top-full z-50 mt-1.5 flex min-w-52 flex-col gap-0.5 rounded-panel border border-rule-soft bg-paper p-1.5 shadow-overlay group-open:motion-safe:animate-slip-in`}
				>
					{children}
				</ul>
			</details>
		</nav>
	);
}
