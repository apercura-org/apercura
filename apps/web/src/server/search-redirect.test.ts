import { parseSearchQuery } from "@apercura/core";
import { describe, expect, it, vi } from "vitest";
import type { Locale, MarketCountry } from "~/i18n/locales";
import { listingLabel } from "~/lib/listing-index";
import type { PlaceSuggestion } from "./queries/search";
import { searchRedirect } from "./search-redirect";

/*
 * A small directory: the places of each market a search may name, the listing pages that exist
 * there (`listing@place`) and the market-wide hubs. "Springfield" is in France and the UK.
 */
const place = (
	id: number,
	name: string,
	slug: string,
	departmentSlug: string,
	code = String(id),
): PlaceSuggestion => ({
	id,
	kind: "commune",
	code,
	name,
	slug,
	departmentCode: null,
	departmentName: null,
	departmentSlug,
	population: null,
});

const PLACES: Record<MarketCountry, PlaceSuggestion[]> = {
	FR: [place(1, "Paris", "paris", "75-paris"), place(2, "Springfield", "springfield", "01-ain")],
	AT: [place(10, "Wien", "wien", "wien"), place(11, "Salzburg", "salzburg", "salzburg")],
	GB: [
		place(20, "Bristol", "bristol", "bristol-city-of"),
		place(21, "Springfield", "springfield", "essex"),
		place(22, "Newport", "newport", "newport"),
		place(23, "Newport", "newport-2", "isle-of-wight"),
	],
	CZ: [place(30, "Brno", "brno", "brno-mesto"), place(31, "Praha", "praha", "praha")],
	ES: [place(40, "Madrid", "madrid", "madrid"), place(41, "València", "valencia", "valencia")],
	IT: [
		place(40, "Roma", "roma", "roma"),
		place(41, "Milano", "milano", "milano"),
		place(42, "Napoli", "napoli", "napoli"),
	],
	DE: [
		place(50, "Berlin", "berlin", "berlin", "11000000"),
		place(51, "Unterhaching", "unterhaching", "landkreis-muenchen", "09184148"),
	],
	CH: [
		place(50, "Genève", "geneve", "canton-de-geneve"),
		place(51, "Zürich", "zuerich", "bezirk-zuerich"),
		place(52, "Basel", "basel", "kanton-basel-stadt"),
		place(53, "Lugano", "lugano", "distretto-di-lugano"),
	],
	EE: [
		place(60, "Tartu linn", "tartu-linn", "tartu-linn", "8151"),
		place(61, "Tallinn", "tallinn", "tallinn", "0784"),
	],
};

const LANDINGS = new Set([
	"chirurgien-dentiste@Paris",
	"chirurgien-dentiste@Springfield",
	"dental-practices@Bristol",
	"dental-practices@Springfield",
	"gp-practices@Bristol",
	"zahnaerzte@Salzburg",
	"allgemeinmedizin@Wien",
	"zubni-lekar@Brno",
	"zubni-lekar@Praha",
	"dentistas@Madrid",
	"centros-de-salud@Madrid",
	"farmacias@Madrid",
	"farmacie@Roma",
	"ospedali@Roma",
	"farmacie@Milano",
	"krankenhaeuser@Berlin",
	"apotheken@Berlin",
	"krankenhaeuser@Unterhaching",
	"apotheke@Genève",
	"spital@Genève",
	"spital@Zürich",
	"spital@Lugano",
	"perearstikeskused@Tartu linn",
	"apteegid@Tartu linn",
	"haiglad@Tallinn",
]);

const HUBS = new Set(["chirurgien-dentiste:fr", "dental-practices:gb", "krankenhaeuser:de"]);

vi.mock("./queries/search", () => ({
	matchPlaces: async ({ country, where }: { country: MarketCountry; where: string }) =>
		PLACES[country].filter((candidate) => candidate.name.toLowerCase() === where.toLowerCase()),
	landingTarget: async (listingSlug: string, target: PlaceSuggestion) =>
		LANDINGS.has(`${listingSlug}@${target.name}`)
			? { listingSlug, deptSlug: target.departmentSlug, communeSlug: target.slug }
			: null,
	listingHubExists: async (listingSlug: string, country: string) =>
		HUBS.has(`${listingSlug}:${country.toLowerCase()}`),
	practitionerSlugByRpps: async () => null,
}));

const search = (
	locale: Locale,
	params: { quoi?: string; ou?: string; pres?: string },
	options: { page?: number; chosen?: MarketCountry } = {},
) => searchRedirect(parseSearchQuery(params), options.page ?? 1, locale, options.chosen ?? null);

const listing = (locale: Locale, specialite: string, dept: string, commune: string) => ({
	href: {
		pathname: "/[specialite]/[dept]/[[...rest]]",
		params: { specialite, dept, rest: [commune] },
	},
	locale,
});

const searchPage = (locale: Locale, query: Record<string, string>) => ({
	href: { pathname: "/recherche", query },
	locale,
});

describe("a search for a place of another market", () => {
	it("moves to that market's listing, the profession carried over", async () => {
		expect(await search("fr", { quoi: "dentiste", ou: "Bristol" })).toEqual(
			listing("en-GB", "dental-practices", "bristol-city-of", "bristol"),
		);
		expect(await search("fr", { quoi: "dentiste", ou: "Praha" })).toEqual(
			listing("cs-CZ", "zubni-lekar", "praha", "praha"),
		);
		expect(await search("fr", { quoi: "médecin généraliste", ou: "Wien" })).toEqual(
			listing("de-AT", "allgemeinmedizin", "wien", "wien"),
		);
		expect(await search("en-GB", { quoi: "GP", ou: "Wien" })).toEqual(
			listing("de-AT", "allgemeinmedizin", "wien", "wien"),
		);
	});

	it("moves to Spain's listing from any market, in Spanish", async () => {
		expect(await search("fr", { quoi: "dentiste", ou: "Madrid" })).toEqual(
			listing("es-ES", "dentistas", "madrid", "madrid"),
		);
		expect(await search("cs-CZ", { quoi: "zubař", ou: "Madrid" })).toEqual(
			listing("es-ES", "dentistas", "madrid", "madrid"),
		);
		expect(await search("en-GB", { quoi: "GP", ou: "Madrid" })).toEqual(
			listing("es-ES", "centros-de-salud", "madrid", "madrid"),
		);
		// France in Spanish moves to Spain in Spanish, and back.
		expect(await search("es", { quoi: "farmacia", ou: "Madrid" })).toEqual(
			listing("es-ES", "farmacias", "madrid", "madrid"),
		);
		expect(await search("es-ES", { quoi: "dentista", ou: "Paris" })).toEqual(
			listing("es", "chirurgien-dentiste", "75-paris", "paris"),
		);
		// Spain lists no such listing in València: its search, in its own words.
		expect(await search("fr", { quoi: "dentiste", ou: "València" })).toEqual(
			searchPage("es-ES", { quoi: listingLabel("dentistas", "es-ES") ?? "", ou: "València" }),
		);
	});

	it("moves to Italy's listing from any market, under the city's Italian name", async () => {
		expect(await search("fr", { quoi: "pharmacie", ou: "Rome" })).toEqual(
			listing("it-IT", "farmacie", "roma", "roma"),
		);
		expect(await search("fr", { quoi: "pharmacie", ou: "Roma" })).toEqual(
			listing("it-IT", "farmacie", "roma", "roma"),
		);
		expect(await search("en-GB", { quoi: "pharmacy", ou: "Milan" })).toEqual(
			listing("it-IT", "farmacie", "milano", "milano"),
		);
		expect(await search("fr", { quoi: "hôpital", ou: "Rome" })).toEqual(
			listing("it-IT", "ospedali", "roma", "roma"),
		);
		expect(await search("cs-CZ", { quoi: "lékárna", ou: "Řím" })).toEqual(
			listing("it-IT", "farmacie", "roma", "roma"),
		);
		// France in Italian moves to Italy in Italian.
		expect(await search("it", { quoi: "farmacia", ou: "Roma" })).toEqual(
			listing("it-IT", "farmacie", "roma", "roma"),
		);
		// No listing page fits: Italy's search, the place under its own name.
		expect(await search("fr", { ou: "Rome" })).toEqual(searchPage("it-IT", { ou: "Roma" }));
		expect(await search("fr", { quoi: "pharmacie", ou: "Naples" })).toEqual(
			searchPage("it-IT", { quoi: listingLabel("farmacie", "it-IT") ?? "", ou: "Napoli" }),
		);
		// An Italian city the places do not know: Italy's search says so, never "not covered".
		expect(await search("fr", { quoi: "pharmacie", ou: "Turin" })).toEqual(
			searchPage("it-IT", { quoi: listingLabel("farmacie", "it-IT") ?? "", ou: "Turin" }),
		);
		expect(await search("it-IT", { quoi: "farmacia", ou: "Torino" })).toBeNull();
	});

	it("moves to Germany's listing, in German, for the care it lists", async () => {
		expect(await search("fr", { quoi: "hôpital", ou: "Berlin" })).toEqual(
			listing("de-DE", "krankenhaeuser", "berlin", "berlin"),
		);
		expect(await search("es-ES", { quoi: "hospital", ou: "Berlin" })).toEqual(
			listing("de-DE", "krankenhaeuser", "berlin", "berlin"),
		);
		expect(await search("en-GB", { quoi: "pharmacy", ou: "Berlin" })).toEqual(
			listing("de-DE", "apotheken", "berlin", "berlin"),
		);
		expect(await search("de-DE", { quoi: "Krankenhaus", ou: "Unterhaching" })).toEqual(
			listing("de-DE", "krankenhaeuser", "landkreis-muenchen", "unterhaching"),
		);
		// France in German (`/fr-de`) moves to Germany, and Germany to France in German.
		expect(await search("de", { quoi: "Klinik", ou: "Berlin" })).toEqual(
			listing("de-DE", "krankenhaeuser", "berlin", "berlin"),
		);
		expect(await search("de-DE", { quoi: "Zahnarzt", ou: "Paris" })).toEqual(
			listing("de", "chirurgien-dentiste", "75-paris", "paris"),
		);
		// Germany lists no practitioner: its search says so, in German.
		expect(await search("fr", { quoi: "dentiste", ou: "Berlin" })).toEqual(
			searchPage("de-DE", { ou: "Berlin" }),
		);
		expect(await search("de-DE", { quoi: "Hausarzt", ou: "Berlin" })).toBeNull();
	});
	it("moves to Estonia's listing, in Estonian, for the care it lists", async () => {
		expect(await search("fr", { quoi: "pharmacie", ou: "Tartu linn" })).toEqual(
			listing("et-EE", "apteegid", "tartu-linn", "tartu-linn"),
		);
		expect(await search("en-GB", { quoi: "family doctor", ou: "Tartu linn" })).toEqual(
			listing("et-EE", "perearstikeskused", "tartu-linn", "tartu-linn"),
		);
		// A city typed in another language is looked up under its own name ("Tallin" → Tallinn).
		expect(await search("fr", { quoi: "hôpital", ou: "Tallin" })).toEqual(
			listing("et-EE", "haiglad", "tallinn", "tallinn"),
		);
		expect(await search("et-EE", { quoi: "haigla", ou: "Tallinn" })).toEqual(
			listing("et-EE", "haiglad", "tallinn", "tallinn"),
		);
		// "Estonie" moves to Estonia's home.
		expect(await search("fr", { ou: "Estonie" })).toEqual({ href: "/", locale: "et-EE" });
	});
	it("moves to Switzerland's listing in the visitor's language, the city under its own name", async () => {
		// A French reader lands on Switzerland in French, an Italian one in Italian, the others
		// on its German pages.
		expect(await search("fr", { quoi: "pharmacie", ou: "Genève" })).toEqual(
			listing("fr-CH", "apotheke", "canton-de-geneve", "geneve"),
		);
		expect(await search("fr", { quoi: "pharmacie", ou: "Genf" })).toEqual(
			listing("fr-CH", "apotheke", "canton-de-geneve", "geneve"),
		);
		expect(await search("en-GB", { quoi: "hospital", ou: "Zurich" })).toEqual(
			listing("de-CH", "spital", "bezirk-zuerich", "zuerich"),
		);
		expect(await search("it-IT", { quoi: "ospedale", ou: "Zurigo" })).toEqual(
			listing("it-CH", "spital", "bezirk-zuerich", "zuerich"),
		);
		expect(await search("it", { quoi: "ospedale", ou: "Lugano" })).toEqual(
			listing("it-CH", "spital", "distretto-di-lugano", "lugano"),
		);
		expect(await search("fr", { quoi: "hôpital", ou: "Ginevra" })).toEqual(
			listing("fr-CH", "spital", "canton-de-geneve", "geneve"),
		);
		// From Switzerland in French, France stays France in French.
		expect(await search("fr-CH", { quoi: "dentiste", ou: "Paris" })).toEqual(
			listing("fr", "chirurgien-dentiste", "75-paris", "paris"),
		);
		// No listing page fits: Switzerland's search, the place under its own name.
		expect(await search("fr", { quoi: "hôpital", ou: "Bâle" })).toEqual(
			searchPage("fr-CH", { quoi: listingLabel("spital", "fr-CH") ?? "", ou: "Basel" }),
		);
		// A doctor is not listed in Switzerland: its search, without the care it does not list.
		expect(await search("fr", { quoi: "médecin", ou: "Genève" })).toEqual(
			searchPage("fr-CH", { ou: "Genève" }),
		);
		// A Swiss city the places do not know: Switzerland's search says so, never "not covered".
		expect(await search("fr", { quoi: "pharmacie", ou: "Lausanne" })).toEqual(
			searchPage("fr-CH", { quoi: listingLabel("apotheke", "fr-CH") ?? "", ou: "Lausanne" }),
		);
		expect(await search("en-GB", { ou: "Bern" })).toEqual(searchPage("de-CH", { ou: "Bern" }));
		expect(await search("fr-CH", { quoi: "pharmacie", ou: "Lausanne" })).toBeNull();
		expect(await search("de-CH", { quoi: "Apotheke", ou: "Zürich" })).toBeNull();
	});

	it("reads the words of the market searched too", async () => {
		expect(await search("fr", { quoi: "zubař", ou: "Brno" })).toEqual(
			listing("cs-CZ", "zubni-lekar", "brno-mesto", "brno"),
		);
		expect(await search("en-GB", { quoi: "Zahnarzt", ou: "Salzburg" })).toEqual(
			listing("de-AT", "zahnaerzte", "salzburg", "salzburg"),
		);
	});

	it("opens in the visitor's language when the market offers it", async () => {
		expect(await search("en-GB", { quoi: "dentist", ou: "Paris" })).toEqual(
			listing("en", "chirurgien-dentiste", "75-paris", "paris"),
		);
		expect(await search("de-AT", { quoi: "Zahnarzt", ou: "Paris" })).toEqual(
			listing("de", "chirurgien-dentiste", "75-paris", "paris"),
		);
		expect(await search("en", { quoi: "dentist", ou: "Bristol" })).toEqual(
			listing("en-GB", "dental-practices", "bristol-city-of", "bristol"),
		);
		expect(await search("cs-CZ", { quoi: "zubař", ou: "Paris" })).toEqual(
			listing("fr", "chirurgien-dentiste", "75-paris", "paris"),
		);
	});

	it("prefers the page's own market when both know the place", async () => {
		expect(await search("fr", { quoi: "dentiste", ou: "Springfield" })).toEqual(
			listing("fr", "chirurgien-dentiste", "01-ain", "springfield"),
		);
		expect(await search("en-GB", { quoi: "dentist", ou: "Springfield" })).toEqual(
			listing("en-GB", "dental-practices", "essex", "springfield"),
		);
	});

	it("lands on that market's search with the place set when no listing page fits", async () => {
		// The UK lists no cardiologists: the place alone.
		expect(await search("fr", { quoi: "cardiologue", ou: "Bristol" })).toEqual(
			searchPage("en-GB", { ou: "Bristol" }),
		);
		// Austria lists dentists, none in Wien: its search says so, in its own words.
		expect(await search("fr", { quoi: "dentiste", ou: "Wien" })).toEqual(
			searchPage("de-AT", { quoi: listingLabel("zahnaerzte", "de-AT") ?? "", ou: "Wien" }),
		);
		// Homonyms: that market's search lists them.
		expect(await search("fr", { quoi: "dentiste", ou: "Newport" })).toEqual(
			searchPage("en-GB", { quoi: "Dental practices", ou: "Newport" }),
		);
		// A name is kept as typed.
		expect(await search("fr", { quoi: "Dupont", ou: "Bristol" })).toEqual(
			searchPage("en-GB", { quoi: "Dupont", ou: "Bristol" }),
		);
		expect(await search("fr", { ou: "Bristol" })).toEqual(searchPage("en-GB", { ou: "Bristol" }));
	});

	it("leaves the page's own market alone", async () => {
		expect(await search("fr", { quoi: "dentiste", ou: "Paris" })).toEqual(
			listing("fr", "chirurgien-dentiste", "75-paris", "paris"),
		);
		expect(await search("fr", { quoi: "cardiologue", ou: "Paris" })).toBeNull();
		expect(await search("fr", { quoi: "Dupont", ou: "Paris" })).toBeNull();
		expect(await search("fr", { quoi: "dentiste", ou: "Nullepart" })).toBeNull();
		expect(await search("fr", { quoi: "dentiste", ou: "Bristol" }, { page: 2 })).toBeNull();
		expect(await search("fr", { quoi: "dentiste" })).toEqual({
			href: { pathname: "/[specialite]", params: { specialite: "chirurgien-dentiste" } },
			locale: "fr",
		});
	});
});

describe("a search in the country chosen in the form", () => {
	it("runs in that market", async () => {
		expect(await search("fr", { quoi: "dentiste" }, { chosen: "GB" })).toEqual({
			href: { pathname: "/[specialite]", params: { specialite: "dental-practices" } },
			locale: "en-GB",
		});
		expect(await search("fr", { quoi: "dentiste", ou: "Springfield" }, { chosen: "GB" })).toEqual(
			listing("en-GB", "dental-practices", "essex", "springfield"),
		);
		expect(await search("fr", { quoi: "Dupont" }, { chosen: "CZ" })).toEqual(
			searchPage("cs-CZ", { quoi: "Dupont" }),
		);
		expect(await search("fr", {}, { chosen: "AT" })).toEqual(searchPage("de-AT", {}));
	});

	it("still finds a place of another market", async () => {
		expect(await search("fr", { quoi: "dentiste", ou: "Paris" }, { chosen: "GB" })).toEqual(
			listing("fr", "chirurgien-dentiste", "75-paris", "paris"),
		);
		expect(await search("fr", { quoi: "dentiste", ou: "Bristol" }, { chosen: "CZ" })).toEqual(
			listing("en-GB", "dental-practices", "bristol-city-of", "bristol"),
		);
	});

	it("says so in that market when no market knows the place", async () => {
		expect(await search("fr", { quoi: "dentiste", ou: "Nullepart" }, { chosen: "GB" })).toEqual(
			searchPage("en-GB", { quoi: "Dental practices", ou: "Nullepart" }),
		);
	});

	it("is the page's market when it names it", async () => {
		expect(await search("fr", { quoi: "Dupont" }, { chosen: "FR" })).toBeNull();
		expect(await search("fr", { quoi: "dentiste", ou: "Paris" }, { chosen: "FR" })).toEqual(
			listing("fr", "chirurgien-dentiste", "75-paris", "paris"),
		);
	});
});

describe("a search for a European place outside the open markets", () => {
	it("stays on the page for a country not covered yet, or one of its cities", async () => {
		expect(await search("fr", { quoi: "dentiste", ou: "Warszawa" })).toBeNull();
		expect(await search("fr", { quoi: "dentiste", ou: "Kraków" })).toBeNull();
		expect(await search("fr", { quoi: "dentiste", ou: "Pologne" })).toBeNull();
		expect(await search("fr", { ou: "Bruxelles" })).toBeNull();
		expect(await search("fr", { quoi: "dentiste", ou: "Wrocław" })).toBeNull();
		expect(await search("en-GB", { quoi: "dentist", ou: "Poland" })).toBeNull();
		// Even when another market was chosen in the form: this page says so.
		expect(await search("fr", { quoi: "dentiste", ou: "Warszawa" }, { chosen: "GB" })).toBeNull();
		expect(await search("fr", { quoi: "Dupont", ou: "Pologne" }, { chosen: "CZ" })).toBeNull();
	});

	it("never says Spain is not covered: its cities move the search to /es", async () => {
		expect(await search("fr", { ou: "Madrid" })).toEqual(searchPage("es-ES", { ou: "Madrid" }));
		expect(await search("fr", { quoi: "dentiste", ou: "Madrid" })).toEqual(
			listing("es-ES", "dentistas", "madrid", "madrid"),
		);
		// A Spanish city the places do not know: Spain's search says so, not this page.
		expect(await search("fr", { quoi: "dentiste", ou: "Barcelona" })).toEqual(
			searchPage("es-ES", { quoi: listingLabel("dentistas", "es-ES") ?? "", ou: "Barcelona" }),
		);
		expect(await search("es-ES", { quoi: "dentista", ou: "Barcelona" })).toBeNull();
	});

	it("never says Germany is not covered: its cities move the search to /de", async () => {
		expect(await search("fr", { ou: "Berlin" })).toEqual(searchPage("de-DE", { ou: "Berlin" }));
		// A German city the places do not know: Germany's search says so, not this page.
		expect(await search("fr", { quoi: "hôpital", ou: "München" })).toEqual(
			searchPage("de-DE", { quoi: listingLabel("krankenhaeuser", "de-DE") ?? "", ou: "München" }),
		);
		expect(await search("de-DE", { quoi: "Krankenhaus", ou: "München" })).toBeNull();
	});

	it("still lets a place of an open market win over a homonymous foreign city", async () => {
		expect(await search("fr", { quoi: "dentiste", ou: "Wien" })).toEqual(
			searchPage("de-AT", { quoi: listingLabel("zahnaerzte", "de-AT") ?? "", ou: "Wien" }),
		);
		expect(await search("fr", { quoi: "dentiste", ou: "Praha" })).toEqual(
			listing("cs-CZ", "zubni-lekar", "praha", "praha"),
		);
	});
});

describe("a search for an open country by name", () => {
	it("goes to that market's home when nothing else is asked", async () => {
		expect(await search("fr", { ou: "Autriche" })).toEqual({ href: "/", locale: "de-AT" });
		expect(await search("fr", { ou: "Royaume-Uni" })).toEqual({ href: "/", locale: "en-GB" });
		expect(await search("en", { ou: "UK" })).toEqual({ href: "/", locale: "en-GB" });
		expect(await search("de-AT", { ou: "Tschechien" })).toEqual({ href: "/", locale: "cs-CZ" });
		// Spain is open since #148: its name, in any language, leads to /es.
		expect(await search("fr", { ou: "Espagne" })).toEqual({ href: "/", locale: "es-ES" });
		expect(await search("en-GB", { ou: "Spain" })).toEqual({ href: "/", locale: "es-ES" });
		// France in Spanish reads Spain in Spanish.
		expect(await search("es", { ou: "España" })).toEqual({ href: "/", locale: "es-ES" });
		// Italy is open since #150: its name, in any language, leads to /it.
		expect(await search("fr", { ou: "Italie" })).toEqual({ href: "/", locale: "it-IT" });
		expect(await search("en-GB", { ou: "Italy" })).toEqual({ href: "/", locale: "it-IT" });
		expect(await search("it", { ou: "Italia" })).toEqual({ href: "/", locale: "it-IT" });
		// Germany is open since #152: "Allemagne", "Deutschland" lead to /de.
		expect(await search("fr", { ou: "Allemagne" })).toEqual({ href: "/", locale: "de-DE" });
		expect(await search("de-AT", { ou: "Deutschland" })).toEqual({ href: "/", locale: "de-DE" });
		expect(await search("fr", { quoi: "hôpital", ou: "Allemagne" })).toEqual({
			href: { pathname: "/[specialite]", params: { specialite: "krankenhaeuser" } },
			locale: "de-DE",
		});
		// Switzerland is open: its name leads to /ch, /ch-fr or /ch-it, in the visitor's language.
		expect(await search("fr", { ou: "Suisse" })).toEqual({ href: "/", locale: "fr-CH" });
		expect(await search("en-GB", { ou: "Switzerland" })).toEqual({ href: "/", locale: "de-CH" });
		expect(await search("it-IT", { ou: "Svizzera" })).toEqual({ href: "/", locale: "it-CH" });
		expect(await search("de-AT", { ou: "Schweiz" })).toEqual({ href: "/", locale: "de-CH" });
		// The page's own market: its home, in the visitor's language.
		expect(await search("en", { ou: "France" })).toEqual({ href: "/", locale: "en" });
	});

	it("goes to that market's hub for the care asked, or its search for a name", async () => {
		expect(await search("fr", { quoi: "dentiste", ou: "UK" })).toEqual({
			href: { pathname: "/[specialite]", params: { specialite: "dental-practices" } },
			locale: "en-GB",
		});
		expect(await search("fr", { quoi: "Dupont", ou: "Tchéquie" })).toEqual(
			searchPage("cs-CZ", { quoi: "Dupont" }),
		);
		expect(await search("fr", { quoi: "Dupont", ou: "France" })).toEqual(
			searchPage("fr", { quoi: "Dupont" }),
		);
		expect(await search("fr", { quoi: "Dupont", ou: "Espagne" })).toEqual(
			searchPage("es-ES", { quoi: "Dupont" }),
		);
		expect(await search("fr", { quoi: "pharmacie", ou: "Italie" })).toEqual(
			searchPage("it-IT", { quoi: listingLabel("farmacie", "it-IT") ?? "" }),
		);
		expect(await search("fr", { quoi: "Dupont", ou: "Italie" })).toEqual(
			searchPage("it-IT", { quoi: "Dupont" }),
		);
		expect(await search("fr", { quoi: "pharmacie", ou: "Suisse" })).toEqual(
			searchPage("fr-CH", { quoi: listingLabel("apotheke", "fr-CH") ?? "" }),
		);
	});
});
