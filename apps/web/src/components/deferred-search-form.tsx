"use client";

import {
	type ComponentType,
	type ReactNode,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import { flushSync } from "react-dom";
import { type MarketCountry, marketOfSegment } from "~/i18n/locales";
import { searchFormId } from "~/lib/search-form-id";
import type { SearchFormProps } from "./search-form";

/*
 * The home search loads its suggestions on first interaction. The combo boxes
 * (React Aria), the class merger and the API client are most of the home
 * page's JavaScript, and evaluating them at load blocked the main thread for
 * longer than everything else on the page (Total Blocking Time). Until then
 * the form is the server-rendered plain GET form visitors without JavaScript
 * get, so typing and submitting work from the first paint.
 */

/** Events that announce a visitor about to use the form: hover, touch, focus, keys. */
const INTERACTIONS = ["pointerenter", "pointerdown", "touchstart", "focusin", "keydown"] as const;

/** What the visitor did in the plain form, carried over to the interactive one. */
interface Carried {
	who: string;
	where: string;
	/** The country chosen (`pays`). */
	market: MarketCountry | null;
	/** The focused control, as a selector inside the form, and its text selection. */
	focus: { selector: string; start: number | null; end: number | null } | null;
}

const fieldValue = (form: HTMLFormElement, name: string) => {
	const field = form.elements.namedItem(name);
	return field instanceof HTMLInputElement || field instanceof HTMLSelectElement ? field.value : "";
};

function carry(form: HTMLFormElement): Carried {
	const active = document.activeElement;
	let focus: Carried["focus"] = null;
	if (active instanceof HTMLInputElement && active.name && form.contains(active)) {
		focus = {
			selector: `input[name="${active.name}"]`,
			start: active.selectionStart,
			end: active.selectionEnd,
		};
	} else if (active instanceof HTMLSelectElement && active.name && form.contains(active)) {
		focus = { selector: `select[name="${active.name}"]`, start: null, end: null };
	} else if (
		active instanceof HTMLButtonElement &&
		active.type === "submit" &&
		form.contains(active)
	) {
		focus = { selector: 'button[type="submit"]', start: null, end: null };
	}
	return {
		who: fieldValue(form, "quoi"),
		where: fieldValue(form, "ou"),
		market: marketOfSegment(fieldValue(form, "pays")),
		focus,
	};
}

/**
 * Prints `children` (the plain form, `BookletSearch` with the same ids and
 * classes) and, on first interaction, loads `SearchForm` and puts it in its
 * place in one synchronous commit, with the typed text, the focused control
 * and its selection carried over. Rendered on the client (a client-side
 * navigation), it waits for an interaction too.
 */
export function DeferredSearchForm({
	idPrefix,
	children,
}: {
	idPrefix: string;
	/** The plain form shown until the interactive one is loaded. */
	children: ReactNode;
}) {
	const formId = searchFormId(idPrefix);
	const [Form, setForm] = useState<ComponentType<SearchFormProps> | null>(null);
	const carried = useRef<Carried | null>(null);

	useEffect(() => {
		const form = document.getElementById(formId);
		if (Form || !(form instanceof HTMLFormElement)) return;
		let cancelled = false;
		const stop = () => {
			for (const type of INTERACTIONS) form.removeEventListener(type, start);
		};
		function start() {
			stop();
			import("./search-form-hydrated").then(
				({ default: Loaded }) => {
					if (cancelled) return;
					// Read and swap in the same task: nothing typed in between is lost.
					carried.current = carry(form as HTMLFormElement);
					flushSync(() => setForm(() => Loaded));
				},
				// Offline or a failed chunk: the plain form keeps working.
				() => {},
			);
		}
		if (form.contains(document.activeElement)) start();
		else for (const type of INTERACTIONS) form.addEventListener(type, start, { passive: true });
		return () => {
			cancelled = true;
			stop();
		};
	}, [formId, Form]);

	// Focus moves to the same control of the new form before the browser paints.
	useLayoutEffect(() => {
		const focus = carried.current?.focus;
		if (!Form || !focus) return;
		const target = document.getElementById(formId)?.querySelector<HTMLElement>(focus.selector);
		target?.focus();
		if (target instanceof HTMLInputElement && focus.start !== null && focus.end !== null) {
			target.setSelectionRange(focus.start, focus.end);
		}
	}, [Form, formId]);

	if (!Form) return children;
	return (
		<Form
			idPrefix={idPrefix}
			landmark={false}
			defaultWho={carried.current?.who}
			defaultWhere={carried.current?.where}
			defaultMarket={carried.current?.market ?? undefined}
		/>
	);
}
