"use client";

import { CheckIcon, ChevronDownIcon, cn, GlobeIcon } from "@apercura/ui";
import { type KeyboardEvent, useEffect, useRef } from "react";
import type { Href } from "~/i18n/navigation";
import { type Locale, routing } from "~/i18n/routing";
import { LocaleSwitchLink } from "./locale-switch-link";

interface LanguagePickerProps {
	/** The page's language. */
	locale: Locale;
	/** The current page: every option links to it in another language (ADR 0002 §2). */
	href: Href;
	/** Landmark name, e.g. "Langue". */
	label: string;
	/** The toggle's accessible name, naming the current language, e.g. "Langue : Français". */
	currentLabel: string;
	/** Each language named in itself ("Français", "English"…). */
	names: Record<Locale, string>;
	/** Keep the fragment (the appointment page's token lives there). */
	keepHash?: boolean;
	className?: string;
}

/**
 * The language picker: a disclosure (`<details>`) holding the list of languages as links to
 * the same page in each. Without JavaScript it opens and closes natively and the links work;
 * with it, Escape closes it (focus back on the toggle), a click or focus elsewhere closes it,
 * and the arrow keys, Home and End move through the list. Links, not a select: choosing a
 * language is an explicit activation, never a change of page on a mere arrow key (WCAG 3.2.2),
 * and crawlers still see every language's URL.
 */
export function LanguagePicker({
	locale,
	href,
	label,
	currentLabel,
	names,
	keepHash = false,
	className,
}: LanguagePickerProps) {
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

	return (
		<nav aria-label={label} className={cn("relative", className)}>
			<details ref={details} className="group" onKeyDown={onKeyDown}>
				<summary
					ref={toggle}
					aria-label={currentLabel}
					className={cn(
						"flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-field px-2.5 text-meta text-ink",
						"hover:bg-paper-shade group-open:bg-paper-shade [&::-webkit-details-marker]:hidden",
						"outline-none focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)",
					)}
				>
					<GlobeIcon className="size-5 text-ink-muted" />
					<span lang={locale}>{names[locale]}</span>
					<ChevronDownIcon className="size-4 text-ink-muted transition-transform duration-150 group-open:rotate-180" />
				</summary>
				<ul
					ref={list}
					className="absolute end-0 top-full z-50 mt-1.5 flex min-w-52 flex-col gap-0.5 rounded-field border border-rule-soft bg-paper p-1.5 shadow-overlay group-open:motion-safe:animate-slip-in"
				>
					{routing.locales.map((other) => (
						<li key={other}>
							<LocaleSwitchLink
								href={href}
								locale={other}
								keepHash={keepHash}
								hrefLang={other}
								lang={other}
								aria-current={other === locale ? "true" : undefined}
								onClick={() => {
									if (details.current) details.current.open = false;
								}}
								className={cn(
									"flex min-h-11 items-center justify-between gap-4 rounded-[0.25rem] px-3 text-meta text-ink no-underline",
									"hover:bg-paper-shade aria-[current]:font-semibold",
									"outline-none focus-visible:outline-3 focus-visible:outline-solid focus-visible:-outline-offset-3 focus-visible:outline-(--focus-ring)",
								)}
							>
								{names[other]}
								{other === locale ? <CheckIcon className="size-4 text-stamp" /> : null}
							</LocaleSwitchLink>
						</li>
					))}
				</ul>
			</details>
		</nav>
	);
}
