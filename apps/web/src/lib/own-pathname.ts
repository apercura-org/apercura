/**
 * Which locale's route table reads a page path. next-intl's middleware matches a path against
 * every locale's form of each internal pathname in turn, so a path that is one locale's form of a
 * page can be read as another locale's form of an earlier one and redirected there: France's
 * `/fr/etablissement/{slug}` (an establishment) is also the Swiss French form of a facility's
 * page (`/ch-fr/etablissement/{slug}`), `/fr-it/struttura/{slug}` Italy's, `/fr-de/einrichtung/…`
 * Switzerland's German one. A path whose own locale has a static form for it is read with that
 * locale's table only (`ownPathnames`); any other path keeps next-intl's matching, which also
 * moves a page typed in another language's words to its own (`/fr/practitioner/…` →
 * `/fr/praticien/…`). Pure functions, no framework import.
 */

type LocalizedPathnames = Readonly<Record<string, string | Readonly<Record<string, string>>>>;

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A route template (`/etablissement/[slug]`, `/[specialite]/[dept]/[[...rest]]`) as a pattern. */
export function templatePattern(template: string): RegExp {
	const segments = template.split("/").filter(Boolean);
	const body = segments
		.map((segment) => {
			if (/^\[\[\.\.\.[^\]]+\]\]$/.test(segment)) return "(?:/[^?#]+)?";
			if (/^\[\.\.\.[^\]]+\]$/.test(segment)) return "/[^?#]+";
			if (/^\[[^\]]+\]$/.test(segment)) return "/[^/?#]+";
			return `/${escapeRegExp(segment)}`;
		})
		.join("");
	return new RegExp(`^${body || "/?"}/?$`, "i");
}

/** A locale's form of an internal pathname (a string is the same in every locale). */
const formOf = (entry: string | Readonly<Record<string, string>>, locale: string) =>
	typeof entry === "string" ? entry : (entry[locale] ?? null);

/**
 * True when `path` (without its locale prefix: `/etablissement/x`) is the locale's own form of a
 * page that starts with a fixed segment, so that the locale's table alone must read it.
 */
export function hasOwnStaticForm(
	pathnames: LocalizedPathnames,
	locale: string,
	path: string,
): boolean {
	for (const entry of Object.values(pathnames)) {
		const form = formOf(entry, locale);
		if (!form || /^\/\[/.test(form) || form === "/") continue;
		if (templatePattern(form).test(path)) return true;
	}
	return false;
}

/**
 * The route table of one locale: every internal pathname with that locale's form for every
 * locale, so no other locale's form of a page can claim a path of this one.
 */
export function ownPathnames<T extends LocalizedPathnames>(pathnames: T, locale: string): T {
	return Object.fromEntries(
		Object.entries(pathnames).map(([internal, entry]) => {
			if (typeof entry === "string") return [internal, entry];
			const form = entry[locale] ?? internal;
			return [internal, Object.fromEntries(Object.keys(entry).map((key) => [key, form]))];
		}),
	) as T;
}
