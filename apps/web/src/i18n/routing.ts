import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
	locales: ["fr", "en"],
	// French is served without a prefix (`/`), English under `/en`.
	defaultLocale: "fr",
	localePrefix: "as-needed",
	// English pages stay noindex in v1: do not announce them as hreflang alternates.
	alternateLinks: false,
	/**
	 * Internal (French) pathnames and their English forms. Listing pages keep
	 * their French slugs in both locales: they are data, not interface text.
	 * English pages exist for the interface but stay `noindex` in v1.
	 */
	pathnames: {
		"/": "/",
		"/pro": "/pro",
		"/_ui": "/_ui",
		"/recherche": { fr: "/recherche", en: "/search" },
		"/praticien/[slug]": { fr: "/praticien/[slug]", en: "/practitioner/[slug]" },
		"/etablissement/[slug]": { fr: "/etablissement/[slug]", en: "/establishment/[slug]" },
		"/annuaire": { fr: "/annuaire", en: "/directory" },
		"/annuaire/[dept]": { fr: "/annuaire/[dept]", en: "/directory/[dept]" },
		"/annuaire/[dept]/[commune]": {
			fr: "/annuaire/[dept]/[commune]",
			en: "/directory/[dept]/[commune]",
		},
		"/[specialite]": "/[specialite]",
		"/[specialite]/[dept]/[[...rest]]": "/[specialite]/[dept]/[[...rest]]",
		"/a-propos": { fr: "/a-propos", en: "/about" },
		"/open-source": "/open-source",
		"/donnees": { fr: "/donnees", en: "/data" },
		"/accessibilite": { fr: "/accessibilite", en: "/accessibility" },
		"/confidentialite": { fr: "/confidentialite", en: "/privacy" },
		"/mentions-legales": { fr: "/mentions-legales", en: "/legal-notice" },
		"/conditions": { fr: "/conditions", en: "/terms" },
	},
});

export type Locale = (typeof routing.locales)[number];
export type AppPathname = keyof typeof routing.pathnames;
