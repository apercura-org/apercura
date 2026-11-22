"use client";

import { type ComponentProps, useCallback, useEffect, useState } from "react";
import { type Href, Link } from "~/i18n/navigation";
import type { Locale } from "~/i18n/routing";
import { RETURN_PARAM } from "~/lib/return-to";

/**
 * Query parameters that carry the state of a page across a language switch:
 * where to go back after signing in or up, the RPPS of a claim, a search and
 * its page, the open booking panel. Anything else (tokens, error flags) is
 * dropped.
 */
const KEPT_PARAMS = [RETURN_PARAM, "rpps", "quoi", "ou", "pres", "page", "rdv"] as const;

type PageState = { query: Record<string, string> | null; hash: string | null };

const NO_STATE: PageState = { query: null, hash: null };

function readState(keepHash: boolean): PageState {
	const params = new URLSearchParams(window.location.search);
	const query: Record<string, string> = {};
	for (const key of KEPT_PARAMS) {
		const value = params.get(key);
		if (value !== null) query[key] = value;
	}
	const hash = keepHash && window.location.hash.length > 1 ? window.location.hash : null;
	return { query: Object.keys(query).length > 0 ? query : null, hash };
}

const sameState = (a: PageState, b: PageState) =>
	a.hash === b.hash && JSON.stringify(a.query) === JSON.stringify(b.query);

type LinkProps = Omit<ComponentProps<typeof Link>, "href" | "locale">;

/**
 * A link to the current page in another language. Rendered as the bare page
 * (the HTML stays cacheable); in the browser it adds the allowlisted query
 * parameters of the current URL and, with `keepHash`, its fragment (the
 * appointment token of `/rdv`, which never reaches the server).
 */
export function LocaleSwitchLink({
	href,
	locale,
	keepHash = false,
	...props
}: LinkProps & { href: Href; locale: Locale; keepHash?: boolean }) {
	const [state, setState] = useState<PageState>(NO_STATE);
	const sync = useCallback(() => {
		const next = readState(keepHash);
		setState((current) => (sameState(current, next) ? current : next));
	}, [keepHash]);

	useEffect(() => {
		sync();
		window.addEventListener("hashchange", sync);
		window.addEventListener("popstate", sync);
		return () => {
			window.removeEventListener("hashchange", sync);
			window.removeEventListener("popstate", sync);
		};
	}, [sync]);

	const base = typeof href === "string" ? { pathname: href } : href;
	const target = {
		...base,
		...(state.query ? { query: { ...("query" in base ? base.query : {}), ...state.query } } : {}),
		...(state.hash ? { hash: state.hash } : {}),
	} as ComponentProps<typeof Link>["href"];

	return (
		<Link
			{...props}
			href={target}
			locale={locale}
			// next-intl never prefetches a link to another locale; nor is the current one: a cached
			// prefetch of `/fr/…` (made under the previous locale cookie) would replay its redirect.
			prefetch={false}
			// The URL can change without an event (a panel opened in place): read it again first.
			onPointerEnter={sync}
			onPointerDown={sync}
			onFocus={sync}
		/>
	);
}
