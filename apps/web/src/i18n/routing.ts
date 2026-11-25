import { defineRouting } from "next-intl/routing";
import { DEFAULT_LOCALE, LOCALE_PREFIXES, LOCALES } from "./locales";

export const routing = defineRouting({
	locales: LOCALES,
	defaultLocale: DEFAULT_LOCALE,
	// Every locale under its prefix: `/fr` (France, in French), `/fr-en`, `/fr-de`… The root `/`
	// is the international home, outside the locales; the proxy handles unprefixed paths.
	localePrefix: { mode: "always", prefixes: LOCALE_PREFIXES },
	// The root never redirects on the visitor's language (crawlers would never see it), so
	// neither detection nor its cookie is needed: public pages stay cacheable, cookie-free.
	localeDetection: false,
	localeCookie: false,
	// hreflang is written by the pages themselves (`pageMetadata`), only between indexed pages.
	alternateLinks: false,
	/**
	 * Internal (French) pathnames and their forms in the other locales. Listing
	 * pages keep their French slugs in every locale: they are data, not interface
	 * text. Pages in other locales exist for the interface but stay `noindex` in v1.
	 */
	pathnames: {
		"/": "/",
		"/pro": "/pro",
		// Practitioner space: the same French paths in every locale (never indexed).
		"/pro/connexion": "/pro/connexion",
		"/pro/connexion/verification": "/pro/connexion/verification",
		"/pro/inscription": "/pro/inscription",
		"/pro/verification-email": "/pro/verification-email",
		"/pro/securite": "/pro/securite",
		"/pro/tableau-de-bord": "/pro/tableau-de-bord",
		"/pro/revendiquer": "/pro/revendiquer",
		"/pro/revendiquer/[id]": "/pro/revendiquer/[id]",
		"/pro/revendication-email": "/pro/revendication-email",
		"/pro/bienvenue": "/pro/bienvenue",
		"/pro/page": "/pro/page",
		"/pro/aujourdhui": "/pro/aujourdhui",
		"/pro/agenda": "/pro/agenda",
		"/pro/agenda/reglages": "/pro/agenda/reglages",
		"/pro/agenda/journal": "/pro/agenda/journal",
		"/pro/equipe": "/pro/equipe",
		"/pro/invitation/[id]": "/pro/invitation/[id]",
		"/pro/admin/revendications": "/pro/admin/revendications",
		"/pro/admin/revendications/[id]": "/pro/admin/revendications/[id]",
		"/pro/admin/signalements": "/pro/admin/signalements",
		"/_ui": "/_ui",
		// Manage an appointment from the email link (token in the fragment, never indexed).
		"/rdv": "/rdv",
		"/recherche": { fr: "/recherche", en: "/search", de: "/suche", es: "/buscar", it: "/cerca" },
		"/praticien/[slug]": {
			fr: "/praticien/[slug]",
			en: "/practitioner/[slug]",
			de: "/behandler/[slug]",
			es: "/profesional/[slug]",
			it: "/professionista/[slug]",
		},
		"/praticien/[slug]/signaler": {
			fr: "/praticien/[slug]/signaler",
			en: "/practitioner/[slug]/report",
			de: "/behandler/[slug]/meldung",
			es: "/profesional/[slug]/notificacion",
			it: "/professionista/[slug]/segnalazione",
		},
		"/praticien/[slug]/retrait": {
			fr: "/praticien/[slug]/retrait",
			en: "/practitioner/[slug]/removal",
			de: "/behandler/[slug]/entfernung",
			es: "/profesional/[slug]/retirada",
			it: "/professionista/[slug]/rimozione",
		},
		"/etablissement/[slug]": {
			fr: "/etablissement/[slug]",
			en: "/establishment/[slug]",
			de: "/einrichtung/[slug]",
			es: "/centro/[slug]",
			it: "/struttura/[slug]",
		},
		"/annuaire": {
			fr: "/annuaire",
			en: "/directory",
			de: "/verzeichnis",
			es: "/directorio",
			it: "/elenco",
		},
		"/annuaire/[dept]": {
			fr: "/annuaire/[dept]",
			en: "/directory/[dept]",
			de: "/verzeichnis/[dept]",
			es: "/directorio/[dept]",
			it: "/elenco/[dept]",
		},
		"/annuaire/[dept]/[commune]": {
			fr: "/annuaire/[dept]/[commune]",
			en: "/directory/[dept]/[commune]",
			de: "/verzeichnis/[dept]/[commune]",
			es: "/directorio/[dept]/[commune]",
			it: "/elenco/[dept]/[commune]",
		},
		"/[specialite]": "/[specialite]",
		"/[specialite]/[dept]/[[...rest]]": "/[specialite]/[dept]/[[...rest]]",
		"/a-propos": {
			fr: "/a-propos",
			en: "/about",
			de: "/ueber-uns",
			es: "/acerca-de",
			it: "/chi-siamo",
		},
		"/open-source": "/open-source",
		"/donnees": { fr: "/donnees", en: "/data", de: "/daten", es: "/datos", it: "/dati" },
		"/accessibilite": {
			fr: "/accessibilite",
			en: "/accessibility",
			de: "/barrierefreiheit",
			es: "/accesibilidad",
			it: "/accessibilita",
		},
		"/confidentialite": {
			fr: "/confidentialite",
			en: "/privacy",
			de: "/datenschutz",
			es: "/privacidad",
			it: "/privacy",
		},
		"/mentions-legales": {
			fr: "/mentions-legales",
			en: "/legal-notice",
			de: "/impressum",
			es: "/aviso-legal",
			it: "/note-legali",
		},
		"/conditions": {
			fr: "/conditions",
			en: "/terms",
			de: "/nutzungsbedingungen",
			es: "/condiciones",
			it: "/condizioni",
		},
	},
});

export type { Locale } from "./locales";
export type AppPathname = keyof typeof routing.pathnames;
