"use client";

import type { ReactNode } from "react";
import { I18nProvider, RouterProvider } from "react-aria-components";

export interface UIProviderProps {
	/** BCP 47 locale for React Aria's date, number and built-in strings (e.g. `fr-FR`). */
	locale: string;
	/** Client-side navigation for React Aria links (pass the app router's `push`). */
	navigate?: (href: string) => void;
	children: ReactNode;
}

/** Wraps client islands that use React Aria components. */
export function UIProvider({ locale, navigate, children }: UIProviderProps) {
	const content = <I18nProvider locale={locale}>{children}</I18nProvider>;
	return navigate ? <RouterProvider navigate={navigate}>{content}</RouterProvider> : content;
}
