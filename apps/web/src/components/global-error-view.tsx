import type { CatalogLanguage } from "~/lib/global-error-locale";
import { GLOBAL_ERROR_TEXT } from "~/lib/global-error-text";
import { ErrorView, errorDigest } from "./error-view";

/**
 * The body of app/global-error.tsx, loaded only once a root layout has failed: the text of
 * every language comes with it, and so stays out of every page's JavaScript.
 */
export default function GlobalErrorView({
	language,
	home,
	error,
	retry,
}: {
	language: CatalogLanguage;
	home: string;
	error: unknown;
	retry: () => void;
}) {
	const text = GLOBAL_ERROR_TEXT[language];
	return (
		<>
			<title>{text.metaTitle}</title>
			<ErrorView
				text={text}
				retry={retry}
				digest={errorDigest(error)}
				home={home}
				// The brand, as the logo shows it: no messages provider here for `Site.homeLink`.
				homeLabel="Apercura"
			/>
		</>
	);
}
