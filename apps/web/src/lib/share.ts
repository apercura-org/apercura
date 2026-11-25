import { localePath } from "~/i18n/paths";
import { siteOrigin } from "./site-url";

/**
 * The public page's address in French, the language of the market patients search in: the one
 * to print and to share, whatever the language of the practitioner space.
 */
export function publicPageUrl(slug: string): string {
	return `${siteOrigin()}${localePath("fr", "/praticien/[slug]", { slug })}`;
}
