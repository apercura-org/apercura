"use client";

import "../astryx/styles";
import { InternationalizationProvider } from "@astryxdesign/core/i18n";
import { LinkProvider } from "@astryxdesign/core/Link";
import { type AnchorHTMLAttributes, createContext, type ReactNode, use } from "react";
import { AstryxStringsContext } from "../astryx/strings";

export interface UIProviderProps {
	/** BCP 47 locale for Astryx's dates, numbers and its own words (e.g. `fr-FR`). */
	locale: string;
	/** Client-side navigation for Astryx links (pass the app router's `push`). */
	navigate?: (href: string) => void;
	children: ReactNode;
}

/** Wraps a client island built on Astryx with its locale and, when given, client-side navigation. */
export function UIProvider({ locale, navigate, children }: UIProviderProps) {
	const strings = use(AstryxStringsContext);
	const content = (
		<InternationalizationProvider
			locale={locale}
			overrides={strings ? { [locale]: strings.messages } : undefined}
		>
			{children}
		</InternationalizationProvider>
	);
	if (!navigate) return content;
	return (
		<NavigateContext value={navigate}>
			<LinkProvider component={RouterLink}>{content}</LinkProvider>
		</NavigateContext>
	);
}

const NavigateContext = createContext<(href: string) => void>(() => {});

/** An anchor that navigates on the client, as the app's router does. */
function RouterLink({ href, onClick, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) {
	const navigate = use(NavigateContext);
	return (
		<a
			{...props}
			href={href}
			onClick={(event) => {
				onClick?.(event);
				if (event.defaultPrevented || !href || event.metaKey || event.ctrlKey || event.shiftKey)
					return;
				event.preventDefault();
				navigate(href);
			}}
		/>
	);
}
