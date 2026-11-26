import { CheckIcon } from "@apercura/ui";
import type { ReactNode } from "react";
import type { Href } from "~/i18n/navigation";
import type { Locale } from "~/i18n/routing";
import { HeaderMenu } from "./header-menu";
import { HEADER_MENU_ITEM } from "./header-menu-item";
import { LocaleSwitchLink } from "./locale-switch-link";

interface LanguagePickerProps {
	/** The page's language. */
	locale: Locale;
	/** The current page: every option links to it in another language (ADR 0002 §2). */
	href: Href;
	/** Landmark name, e.g. "Langue". */
	label: string;
	/** The toggle's text and accessible name, naming the current language: "Langue : Français". */
	current: ReactNode;
	/** Each language offered, named in itself ("Français", "English"…). */
	names: Partial<Record<Locale, string>>;
	/** Keep the fragment (the appointment page's token lives there). */
	keepHash?: boolean;
	className?: string;
}

/**
 * The language picker: the languages of this market's pages, each a link to the current page in
 * that language, in a header menu captioned "Langue" (the market is the country menu's choice).
 */
export function LanguagePicker({
	locale,
	href,
	label,
	current,
	names,
	keepHash = false,
	className,
}: LanguagePickerProps) {
	return (
		<HeaderMenu label={label} toggle={current} className={className}>
			{(Object.keys(names) as Locale[]).map((other) => (
				<li key={other}>
					<LocaleSwitchLink
						href={href}
						locale={other}
						keepHash={keepHash}
						hrefLang={other}
						lang={other}
						aria-current={other === locale ? "true" : undefined}
						className={HEADER_MENU_ITEM}
					>
						{names[other]}
						{other === locale ? <CheckIcon className="size-4 text-stamp" /> : null}
					</LocaleSwitchLink>
				</li>
			))}
		</HeaderMenu>
	);
}
