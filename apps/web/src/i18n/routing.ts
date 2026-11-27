import { defineRouting } from "next-intl/routing";
import { DEFAULT_LOCALE, LOCALE_PREFIXES, LOCALES } from "./locales";

type Pathnames = Record<
	string,
	| string
	| Record<
			Exclude<
				(typeof LOCALES)[number],
				| "de-AT"
				| "en-GB"
				| "cs-CZ"
				| "es-ES"
				| "it-IT"
				| "de-DE"
				| "de-CH"
				| "fr-CH"
				| "it-CH"
				| "et-EE"
				| "pl-PL"
				| "nb-NO"
				| "en-IE"
				| "fi-FI"
			>,
			string
	  >
>;

/**
 * The Czech form of each English path segment (`/practitioner/[slug]/report` ->
 * `/zarizeni/[slug]/nahlasit`). The first segments are the Czech reserved segments of
 * `@apercura/core/taxonomy` (`CZ_RESERVED_SEGMENTS`, tested), which never name a listing.
 */
export const CZECH_SEGMENTS: Readonly<Record<string, string>> = {
	search: "hledat",
	practitioner: "zarizeni",
	report: "nahlasit",
	removal: "odstraneni",
	"this-is-me": "to-jsem-ja",
	establishment: "organizace",
	directory: "adresar",
	about: "o-projektu",
	accessibility: "pristupnost",
	privacy: "ochrana-osobnich-udaju",
	"legal-notice": "pravni-informace",
	terms: "podminky-uziti",
};

/** An English path with its segments in Czech; parameters and unknown segments stay. */
function czechPath(path: string): string {
	return path.replace(/[^/]+/g, (segment) => CZECH_SEGMENTS[segment] ?? segment);
}

/**
 * The Estonian form of each English path segment (`/practitioner/[slug]/report` ->
 * `/asutus/[slug]/teata`): a page is a healthcare provider or a pharmacy, an institution
 * ("asutus"), never a person, so an establishment's page is an organisation's. The first
 * segments are the Estonian reserved segments of `@apercura/core/taxonomy`
 * (`EE_RESERVED_SEGMENTS`, tested), which never name a listing.
 */
export const ESTONIAN_SEGMENTS: Readonly<Record<string, string>> = {
	search: "otsing",
	practitioner: "asutus",
	report: "teata",
	removal: "eemaldamine",
	"this-is-me": "see-olen-mina",
	establishment: "organisatsioon",
	directory: "kataloog",
	about: "projektist",
	data: "andmed",
	accessibility: "ligipaasetavus",
	privacy: "privaatsus",
	"legal-notice": "oigusteave",
	terms: "kasutustingimused",
};

/** An English path with its segments in Estonian; parameters and unknown segments stay. */
function estonianPath(path: string): string {
	return path.replace(/[^/]+/g, (segment) => ESTONIAN_SEGMENTS[segment] ?? segment);
}

/**
 * The Polish form of each English path segment (`/practitioner/[slug]/report` ->
 * `/placowka/[slug]/zgloszenie`): Poland lists establishments, never people, so a page is a
 * "placówka". The first segments are the Polish reserved segments of `@apercura/core/taxonomy`
 * (`PL_RESERVED_SEGMENTS`, tested), which never name a listing.
 */
export const POLISH_SEGMENTS: Readonly<Record<string, string>> = {
	search: "szukaj",
	practitioner: "placowka",
	report: "zgloszenie",
	removal: "usuniecie",
	"this-is-me": "to-ja",
	establishment: "organizacja",
	directory: "katalog",
	about: "o-projekcie",
	data: "dane",
	accessibility: "dostepnosc",
	privacy: "prywatnosc",
	"legal-notice": "nota-prawna",
	terms: "regulamin",
};

/** An English path with its segments in Polish; parameters and unknown segments stay. */
function polishPath(path: string): string {
	return path.replace(/[^/]+/g, (segment) => POLISH_SEGMENTS[segment] ?? segment);
}

/**
 * The Norwegian form of each English path segment (`/practitioner/[slug]/report` ->
 * `/virksomhet/[slug]/meld-feil`): a page is an establishment of the Central Coordinating
 * Register for Legal Entities ("virksomhet"), never a person, so an establishment's page is an
 * organisation's. The first segments are the Norwegian reserved segments of
 * `@apercura/core/taxonomy` (`NO_RESERVED_SEGMENTS`, tested), which never name a listing.
 */
export const NORWEGIAN_SEGMENTS: Readonly<Record<string, string>> = {
	search: "sok",
	practitioner: "virksomhet",
	report: "meld-feil",
	removal: "fjerning",
	"this-is-me": "dette-er-meg",
	establishment: "organisasjon",
	directory: "katalog",
	about: "om",
	data: "data",
	accessibility: "tilgjengelighet",
	privacy: "personvern",
	"legal-notice": "juridisk",
	terms: "vilkar",
};

/** An English path with its segments in Norwegian; parameters and unknown segments stay. */
function norwegianPath(path: string): string {
	return path.replace(/[^/]+/g, (segment) => NORWEGIAN_SEGMENTS[segment] ?? segment);
}

/**
 * The Finnish form of each English path segment (`/practitioner/[slug]/report` ->
 * `/toimipiste/[slug]/ilmoita`): a page is a service location ("toimipiste"), never a person, so
 * an establishment's page is an organisation's. The first segments are the Finnish reserved
 * segments of `@apercura/core/taxonomy` (`FI_RESERVED_SEGMENTS`, tested), which never name a
 * listing.
 */
export const FINNISH_SEGMENTS: Readonly<Record<string, string>> = {
	search: "haku",
	practitioner: "toimipiste",
	report: "ilmoita",
	removal: "poisto",
	"this-is-me": "tama-on-meidan",
	establishment: "organisaatio",
	directory: "hakemisto",
	about: "tietoa",
	data: "aineisto",
	accessibility: "saavutettavuus",
	privacy: "tietosuoja",
	"legal-notice": "oikeudelliset-tiedot",
	terms: "kayttoehdot",
};

/** An English path with its segments in Finnish; parameters and unknown segments stay. */
function finnishPath(path: string): string {
	return path.replace(/[^/]+/g, (segment) => FINNISH_SEGMENTS[segment] ?? segment);
}

/**
 * The Spanish market's form of a Spanish path: a centre's page under `/centro` (Spain lists
 * centres, never people), so an establishment's page moves from `/centro` to `/organizacion`.
 * Every first segment is a Spanish reserved segment of `@apercura/core/taxonomy`
 * (`ES_RESERVED_SEGMENTS`, tested), which never names a listing.
 */
function spanishMarketPath(path: string): string {
	if (path.startsWith("/centro/")) return path.replace("/centro/", "/organizacion/");
	return path.replace("/profesional/", "/centro/");
}

/**
 * The Italian market's form of an Italian path: a place's page under `/struttura` (Italy lists
 * pharmacies and hospitals, never people), so an establishment's page moves from `/struttura` to
 * `/organizzazione`. Every first segment is an Italian reserved segment of
 * `@apercura/core/taxonomy` (`IT_RESERVED_SEGMENTS`, tested), which never names a listing.
 */
function italianMarketPath(path: string): string {
	if (path.startsWith("/struttura/")) return path.replace("/struttura/", "/organizzazione/");
	return path.replace("/professionista/", "/struttura/");
}

/**
 * The German market's form of a German path: a facility's page under `/einrichtung` (Germany
 * lists hospitals, clinics and pharmacies, never people), so an establishment's page moves from
 * `/einrichtung` to `/organisation`. Every first segment is a German reserved segment of
 * `@apercura/core/taxonomy` (`DE_RESERVED_SEGMENTS`, tested), which never names a listing.
 */
function germanMarketPath(path: string): string {
	if (path.startsWith("/einrichtung/")) return path.replace("/einrichtung/", "/organisation/");
	return path.replace("/behandler/", "/einrichtung/");
}

/**
 * The Swiss market's form of a German or French path: a facility's page under `/einrichtung`
 * (German) or `/etablissement` (French), since Switzerland lists facilities, never people, so an
 * establishment's page moves to `/organisation` in both. Italian takes Italy's form
 * (`italianMarketPath`). Every first segment is a Swiss reserved segment of
 * `@apercura/core/taxonomy` (`CH_RESERVED_SEGMENTS`, tested), which never names a listing.
 */
function swissMarketPath(path: string, person: string, facility: string): string {
	if (path.startsWith(`/${facility}/`)) return path.replace(`/${facility}/`, "/organisation/");
	return path.replace(`/${person}/`, `/${facility}/`);
}

/**
 * The paths of the markets opened after France, derived from a language's own, not listed, so
 * the table every client island ships stays the size of France's:
 * - Austria (`de-AT`): the German paths, with a doctor's page under `/arzt` (every practitioner
 *   of its sources is a doctor or a dentist);
 * - the United Kingdom (`en-GB`): the English paths, with a practice's page under `/practice`
 *   (the UK lists practices, never people);
 * - Czechia (`cs-CZ`): the English paths with their segments in Czech (`CZECH_SEGMENTS`), a
 *   facility's page under `/zarizeni`;
 * - Spain (`es-ES`): the Spanish paths, with a centre's page under `/centro` and an
 *   establishment's under `/organizacion` (`spanishMarketPath`);
 * - Italy (`it-IT`): the Italian paths, with a place's page under `/struttura` and an
 *   establishment's under `/organizzazione` (`italianMarketPath`);
 * - Germany (`de-DE`): the German paths, with a facility's page under `/einrichtung` and an
 *   establishment's under `/organisation` (`germanMarketPath`);
 * - Switzerland: the German paths under `/ch` (`de-CH`, a facility under `/einrichtung`), the
 *   French ones under `/ch-fr` (`fr-CH`, under `/etablissement`), an establishment under
 *   `/organisation` in both (`swissMarketPath`), and Italy's Italian ones under `/ch-it`
 *   (`it-CH`);
 * - Estonia (`et-EE`): the English paths with their segments in Estonian (`ESTONIAN_SEGMENTS`),
 *   a provider's or pharmacy's page under `/asutus`;
 * - Poland (`pl-PL`): the English paths with their segments in Polish (`POLISH_SEGMENTS`), an
 *   establishment's page under `/placowka`;
 * - Norway (`nb-NO`): the English paths with their segments in Norwegian (`NORWEGIAN_SEGMENTS`),
 *   an establishment's page under `/virksomhet`;
 * - Ireland (`en-IE`): the English paths, with a facility's page under `/facility` (Ireland
 *   lists pharmacies, nursing homes, hospitals and health centres, never people); an
 *   establishment keeps `/establishment`. Every first segment is an Irish reserved segment of
 *   `@apercura/core/taxonomy` (`IE_RESERVED_SEGMENTS`, tested);
 * - Finland (`fi-FI`): the English paths with their segments in Finnish (`FINNISH_SEGMENTS`), a
 *   service location's page under `/toimipiste`.
 */
function withMarkets<T extends Pathnames>(pathnames: T) {
	return Object.fromEntries(
		Object.entries(pathnames).map(([key, value]) => [
			key,
			typeof value === "string"
				? value
				: {
						...value,
						"de-AT": value.de.replace("/behandler/", "/arzt/"),
						"en-GB": value.en.replace("/practitioner/", "/practice/"),
						"cs-CZ": czechPath(value.en),
						"es-ES": spanishMarketPath(value.es),
						"it-IT": italianMarketPath(value.it),
						"de-DE": germanMarketPath(value.de),
						"de-CH": swissMarketPath(value.de, "behandler", "einrichtung"),
						"fr-CH": swissMarketPath(value.fr, "praticien", "etablissement"),
						"it-CH": italianMarketPath(value.it),
						"et-EE": estonianPath(value.en),
						"pl-PL": polishPath(value.en),
						"nb-NO": norwegianPath(value.en),
						"en-IE": value.en.replace("/practitioner/", "/facility/"),
						"fi-FI": finnishPath(value.en),
					},
		]),
	) as {
		[K in keyof T]: T[K] extends string
			? T[K]
			: T[K] & {
					"de-AT": string;
					"en-GB": string;
					"cs-CZ": string;
					"es-ES": string;
					"it-IT": string;
					"de-DE": string;
					"de-CH": string;
					"fr-CH": string;
					"it-CH": string;
					"et-EE": string;
					"pl-PL": string;
					"nb-NO": string;
					"en-IE": string;
					"fi-FI": string;
				};
	};
}

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
	 * pages keep their market's slugs in every locale: they are data, not interface
	 * text. Austria's and the UK's are derived from the German and English ones (`withMarkets`).
	 */
	pathnames: withMarkets({
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
		"/pro/statistiques": "/pro/statistiques",
		"/pro/partager": "/pro/partager",
		"/pro/partager/affiche": "/pro/partager/affiche",
		"/pro/aujourdhui": "/pro/aujourdhui",
		"/pro/agenda": "/pro/agenda",
		"/pro/agenda/reglages": "/pro/agenda/reglages",
		"/pro/agenda/journal": "/pro/agenda/journal",
		"/pro/equipe": "/pro/equipe",
		"/pro/invitation/[id]": "/pro/invitation/[id]",
		"/pro/admin/revendications": "/pro/admin/revendications",
		"/pro/admin/revendications/[id]": "/pro/admin/revendications/[id]",
		"/pro/admin/signalements": "/pro/admin/signalements",
		"/pro/admin/contacts": "/pro/admin/contacts",
		"/_ui": "/_ui",
		// Manage an appointment from the email link (token in the fragment, never indexed).
		"/rdv": "/rdv",
		"/recherche": {
			fr: "/recherche",
			en: "/search",
			de: "/suche",
			es: "/buscar",
			it: "/cerca",
		},
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
		// "I am this practitioner, contact me": for those who cannot claim the page themselves.
		"/praticien/[slug]/c-est-moi": {
			fr: "/praticien/[slug]/c-est-moi",
			en: "/practitioner/[slug]/this-is-me",
			de: "/behandler/[slug]/das-bin-ich",
			es: "/profesional/[slug]/soy-yo",
			it: "/professionista/[slug]/sono-io",
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
		// Guides: articles written in French, at the same path in every locale (indexed in French only).
		"/guides": "/guides",
		"/guides/[slug]": "/guides/[slug]",
		"/donnees": {
			fr: "/donnees",
			en: "/data",
			de: "/daten",
			es: "/datos",
			it: "/dati",
		},
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
	}),
});

export type { Locale } from "./locales";
export type AppPathname = keyof typeof routing.pathnames;
