import {
	allAtListingSlugs,
	allChListingSlugs,
	allCzListingSlugs,
	allDeListingSlugs,
	allEeListingSlugs,
	allEsListingSlugs,
	allFiListingSlugs,
	allGbListingSlugs,
	allIeListingSlugs,
	allItListingSlugs,
	allLtListingSlugs,
	allNoListingSlugs,
	allPlListingSlugs,
	FR_PROFESSIONS,
	professionOfListingSlug,
	SEARCH_ALIASES,
} from "@apercura/core/taxonomy";
import { describe, expect, it } from "vitest";
import { messagesFor } from "~/i18n/catalogs";
import { LOCALES, type MarketCountry, marketOf } from "~/i18n/locales";
import {
	labelForms,
	resolveListing,
	resolveSearchTerm,
	type SearchTerm,
	suggestListings,
} from "./listing-index";

const MARKETS = [
	"FR",
	"AT",
	"GB",
	"CZ",
	"ES",
	"IT",
	"DE",
	"CH",
	"EE",
	"PL",
	"NO",
	"IE",
	"FI",
	"LT",
] as const satisfies readonly MarketCountry[];

/** The listings of each market (France: its imported professions only). */
const LISTED: Record<MarketCountry, (slug: string) => boolean> = {
	FR: (slug) => {
		const profession = professionOfListingSlug(slug);
		return Boolean(profession && FR_PROFESSIONS[profession]?.enabled);
	},
	AT: (slug) => allAtListingSlugs().has(slug),
	GB: (slug) => allGbListingSlugs().has(slug),
	CZ: (slug) => allCzListingSlugs().has(slug),
	ES: (slug) => allEsListingSlugs().has(slug),
	IT: (slug) => allItListingSlugs().has(slug),
	DE: (slug) => allDeListingSlugs().has(slug),
	CH: (slug) => allChListingSlugs().has(slug),
	EE: (slug) => allEeListingSlugs().has(slug),
	PL: (slug) => allPlListingSlugs().has(slug),
	NO: (slug) => allNoListingSlugs().has(slug),
	IE: (slug) => allIeListingSlugs().has(slug),
	FI: (slug) => allFiListingSlugs().has(slug),
	LT: (slug) => allLtListingSlugs().has(slug),
};

/** Slugs a market maps but does not list yet: France's professions not imported. */
const MAPPED: Record<MarketCountry, (slug: string) => boolean> = {
	FR: (slug) => Object.values(FR_PROFESSIONS).some((p) => p.slug === slug && !p.enabled),
	AT: () => false,
	GB: () => false,
	CZ: () => false,
	ES: () => false,
	IT: () => false,
	DE: () => false,
	CH: () => false,
	EE: () => false,
	PL: () => false,
	NO: () => false,
	IE: () => false,
	FI: () => false,
	LT: () => false,
};

const listing = (slug: string): SearchTerm => ({ kind: "listing", slug });
const UNLISTED: SearchTerm = { kind: "unlisted" };

/** Every alias of a market's table with what it must resolve to. */
function aliasCases(country: MarketCountry): [string, SearchTerm][] {
	return Object.entries(SEARCH_ALIASES[country]).flatMap(([, aliases]) => [
		...Object.entries(aliases.listings).flatMap(([slug, words]) =>
			words.map((word): [string, SearchTerm] => [
				word,
				LISTED[country](slug) ? listing(slug) : UNLISTED,
			]),
		),
		...(aliases.unlisted ?? []).map((word): [string, SearchTerm] => [word, UNLISTED]),
	]);
}

describe.each(MARKETS)("the %s search aliases", (country) => {
	it("name only slugs the market lists, or maps without listing them yet", () => {
		const unknown = Object.values(SEARCH_ALIASES[country]).flatMap((aliases) =>
			Object.keys(aliases.listings).filter(
				(slug) => !LISTED[country](slug) && !MAPPED[country](slug),
			),
		);
		expect(unknown).toEqual([]);
	});

	it.each(aliasCases(country))("resolve %j", (word, expected) => {
		expect(resolveSearchTerm(word, country)).toEqual(expected);
		// Upper case, without accents, plural.
		const plain = word.normalize("NFKD").replace(/\p{Mark}/gu, "");
		expect(resolveSearchTerm(plain.toUpperCase(), country)).toEqual(expected);
		if (!word.endsWith("s")) expect(resolveSearchTerm(`  ${word}s `, country)).toEqual(expected);
	});

	it("never hide an official label of the market", () => {
		const shadowed: string[] = [];
		for (const locale of LOCALES.filter((locale) => marketOf(locale) === country)) {
			const labels = messagesFor(locale).taxonomy.listing as Record<string, string>;
			for (const [slug, message] of Object.entries(labels)) {
				if (!LISTED[country](slug)) continue;
				for (const form of labelForms(message)) {
					if (resolveListing(form, country) !== slug) shadowed.push(`${locale} ${form} (${slug})`);
				}
			}
		}
		expect(shadowed).toEqual([]);
	});
});

/** The words of the issue and others people type, per market. */
const EVERYDAY: Record<MarketCountry, [string, SearchTerm][]> = {
	FR: [
		["dentiste", listing("chirurgien-dentiste")],
		["Dentistes", listing("chirurgien-dentiste")],
		["un dentiste", listing("chirurgien-dentiste")],
		["généraliste", listing("medecin-generaliste")],
		["generaliste", listing("medecin-generaliste")],
		["médecin traitant", listing("medecin-generaliste")],
		["Médecin de famille", listing("medecin-generaliste")],
		["mon médecin traitant", listing("medecin-generaliste")],
		["ophtalmo", listing("ophtalmologue")],
		["gynéco", listing("gynecologue")],
		["psy", listing("psychiatre")],
		["ORL", listing("orl")],
		["dermato", listing("dermatologue")],
		["cardio", listing("cardiologue")],
		["pédiatre", listing("pediatre")],
		["sage femme", listing("sage-femme")],
		["sages-femmes", listing("sage-femme")],
		["infirmière libérale", listing("infirmier")],
		["infirmiers libéraux", listing("infirmier")],
		["orthodontiste", listing("orthodontiste")],
		["chirurgien-dentiste", listing("chirurgien-dentiste")],
		["médecin", listing("medecin")],
		["médecin généraliste", listing("medecin-generaliste")],
		// The interface languages of the France pages.
		["dentist", listing("chirurgien-dentiste")],
		["GP", listing("medecin-generaliste")],
		["Zahnarzt", listing("chirurgien-dentiste")],
		["Zahnaerztin", listing("chirurgien-dentiste")],
		["médico de cabecera", listing("medecin-generaliste")],
		["medico di base", listing("medecin-generaliste")],
		// Professions France maps but does not import yet.
		["kinésithérapeute", UNLISTED],
		["kiné", UNLISTED],
		["kinesitherapie", UNLISTED],
		["pharmacie", UNLISTED],
		["pharmacien", UNLISTED],
		["Pharmacienne", UNLISTED],
		["psychologue", UNLISTED],
		["orthophoniste", UNLISTED],
		["podologue", UNLISTED],
		["pédicure-podologue", UNLISTED],
		["ostéopathe", UNLISTED],
		["Orthoptiste", UNLISTED],
		["physiotherapist", UNLISTED],
	],
	AT: [
		["Hausarzt", listing("allgemeinmedizin")],
		["Hausärztin", listing("allgemeinmedizin")],
		["Hausaerztin", listing("allgemeinmedizin")],
		["der Hausarzt", listing("allgemeinmedizin")],
		["Zahnarzt", listing("zahnaerzte")],
		["Zahnärzte", listing("zahnaerzte")],
		["Kinderarzt", listing("kinderheilkunde")],
		["Frauenarzt", listing("frauenheilkunde")],
		["Augenarzt", listing("augenheilkunde")],
		["HNO", listing("hals-nasen-ohrenheilkunde")],
		["HNO Arzt", listing("hals-nasen-ohrenheilkunde")],
		["Hautarzt", listing("dermatologie")],
		["Internist", listing("innere-medizin")],
		["Gefäßchirurg", listing("gefaesschirurgie")],
		["Gefässchirurg", listing("gefaesschirurgie")],
		["Gefäßchirurgie", listing("gefaesschirurgie")],
		["Allgemeinmedizin", listing("allgemeinmedizin")],
		["Apotheke", UNLISTED],
		["Physiotherapeutin", UNLISTED],
	],
	GB: [
		["GP", listing("gp-practices")],
		["GPs", listing("gp-practices")],
		["the GP", listing("gp-practices")],
		["doctor", listing("gp-practices")],
		["doctors", listing("gp-practices")],
		["doctor's surgery", listing("gp-practices")],
		["family doctor", listing("gp-practices")],
		["surgery", listing("gp-practices")],
		["GP practices", listing("gp-practices")],
		["dentist", listing("dental-practices")],
		["dental", listing("dental-practices")],
		["NHS dentist", listing("dental-practices")],
		["chemist", listing("pharmacies")],
		["pharmacy", listing("pharmacies")],
		["Pharmacies", listing("pharmacies")],
		["optician", UNLISTED],
		["physio", UNLISTED],
		["hospital", UNLISTED],
		["cardiologist", UNLISTED],
	],
	CZ: [
		["zubař", listing("zubni-lekar")],
		["zubar", listing("zubni-lekar")],
		["zubní", listing("zubni-lekar")],
		["zubní lékař", listing("zubni-lekar")],
		["stomatolog", listing("zubni-lekar")],
		["praktik", listing("prakticky-lekar")],
		["praktický lékař", listing("prakticky-lekar")],
		["Praktičtí lékaři", listing("prakticky-lekar")],
		["obvodní lékař", listing("prakticky-lekar")],
		["lékárna", listing("lekarna")],
		["lékárny", listing("lekarna")],
		["pediatr", listing("detsky-lekar")],
		["dětský lékař", listing("detsky-lekar")],
		["gynekolog", listing("gynekolog")],
		["fyzioterapeut", listing("fyzioterapeut")],
		["rehabilitace", listing("fyzioterapeut")],
		["psycholog", listing("psycholog")],
		["logoped", listing("logoped")],
		["porodní asistentka", listing("porodni-asistentka")],
		["dentist", listing("zubni-lekar")],
		["nemocnice", UNLISTED],
	],
	ES: [
		["dentista", listing("dentistas")],
		["Dentistas", listing("dentistas")],
		["un dentista", listing("dentistas")],
		["el dentista", listing("dentistas")],
		["odontólogo", listing("dentistas")],
		["clínica dental", listing("dentistas")],
		["médico de cabecera", listing("centros-de-salud")],
		["medico de cabecera", listing("centros-de-salud")],
		["médico de familia", listing("centros-de-salud")],
		["centro de salud", listing("centros-de-salud")],
		["ambulatorio", listing("centros-de-salud")],
		["consultorio", listing("centros-de-salud")],
		["médico", listing("centros-de-salud")],
		["médico general", listing("medicina-general")],
		["pediatra", listing("pediatras")],
		["farmacia", listing("farmacias")],
		["Farmacias", listing("farmacias")],
		["fisio", listing("fisioterapeutas")],
		["fisioterapeuta", listing("fisioterapeutas")],
		["ginecólogo", listing("ginecologos")],
		["ginecóloga", listing("ginecologos")],
		["oculista", listing("oftalmologos")],
		["oftalmólogo", listing("oftalmologos")],
		["traumatólogo", listing("traumatologos")],
		["otorrino", listing("otorrinos")],
		["dermatólogo", listing("dermatologos")],
		["psicólogo", listing("psicologos")],
		["psiquiatra", listing("psiquiatras")],
		["podólogo", listing("podologos")],
		["logopeda", listing("logopedas")],
		["matrona", listing("matronas")],
		["enfermera", listing("enfermeria")],
		["urgencias", listing("hospitales")],
		["hospital", listing("hospitales")],
		["dentist", listing("dentistas")],
		["GP", listing("centros-de-salud")],
		["óptica", UNLISTED],
		["laboratorio", UNLISTED],
	],
	IT: [
		["farmacia", listing("farmacie")],
		["Farmacie", listing("farmacie")],
		["la farmacia", listing("farmacie")],
		["una farmacia", listing("farmacie")],
		["farmacia di turno", listing("farmacie")],
		["dispensario farmaceutico", listing("farmacie")],
		["parafarmacia", listing("parafarmacie")],
		["ospedale", listing("ospedali")],
		["l'ospedale", listing("ospedali")],
		["pronto soccorso", listing("ospedali")],
		["policlinico", listing("ospedali")],
		["casa di cura", listing("case-di-cura")],
		["clinica privata", listing("case-di-cura")],
		["pharmacie", listing("farmacie")],
		["hôpital", listing("ospedali")],
		["pharmacy", listing("farmacie")],
		["hospital", listing("ospedali")],
		["Apotheke", listing("farmacie")],
		["Krankenhaus", listing("ospedali")],
		["medico di base", UNLISTED],
		["dentista", UNLISTED],
		["pediatra", UNLISTED],
		["guardia medica", UNLISTED],
	],
	DE: [
		["Krankenhaus", listing("krankenhaeuser")],
		["Krankenhäuser", listing("krankenhaeuser")],
		["ein Krankenhaus", listing("krankenhaeuser")],
		["das Krankenhaus", listing("krankenhaeuser")],
		["Klinik", listing("krankenhaeuser")],
		["Klinikum", listing("krankenhaeuser")],
		["Notaufnahme", listing("krankenhaeuser")],
		["Geburtsklinik", listing("krankenhaeuser")],
		["Kreißsaal", listing("krankenhaeuser")],
		["Kreisssaal", listing("krankenhaeuser")],
		["Uniklinik", listing("krankenhaeuser")],
		["Kinderklinik", listing("kinderkliniken")],
		["Kinderkrankenhaus", listing("kinderkliniken")],
		["Psychiatrie", listing("psychiatrische-kliniken")],
		["Psychosomatik", listing("psychiatrische-kliniken")],
		["Reha", listing("reha-kliniken")],
		["Rehaklinik", listing("reha-kliniken")],
		["Kurklinik", listing("reha-kliniken")],
		["Apotheke", listing("apotheken")],
		["Apotheken", listing("apotheken")],
		["Apotheker", listing("apotheken")],
		// Visitors' languages.
		["hospital", listing("krankenhaeuser")],
		["hôpital", listing("krankenhaeuser")],
		["urgences", listing("krankenhaeuser")],
		["pharmacie", listing("apotheken")],
		["pharmacy", listing("apotheken")],
		// Germany lists facilities, not practitioners.
		["Hausarzt", UNLISTED],
		["Zahnarzt", UNLISTED],
		["Kinderarzt", UNLISTED],
		["Physiotherapie", UNLISTED],
		["médecin", UNLISTED],
		["dentist", UNLISTED],
	],
	CH: [
		["Spital", listing("spital")],
		["das Spital", listing("spital")],
		["Kantonsspital", listing("spital")],
		["Notfall", listing("spital")],
		["hôpital", listing("spital")],
		["l'hôpital", listing("spital")],
		["urgences", listing("spital")],
		["ospedale", listing("spital")],
		["pronto soccorso", listing("spital")],
		["hospital", listing("spital")],
		["Psychiatrie", listing("psychiatrische-klinik")],
		["clinique psychiatrique", listing("psychiatrische-klinik")],
		["Reha", listing("rehaklinik")],
		["Geburtshaus", listing("geburtshaus")],
		["maison de naissance", listing("geburtshaus")],
		["Altersheim", listing("pflegeheim")],
		["Pflegeheim", listing("pflegeheim")],
		["EMS", listing("pflegeheim")],
		["casa per anziani", listing("pflegeheim")],
		["Apotheke", listing("apotheke")],
		["pharmacie", listing("apotheke")],
		["farmacia", listing("apotheke")],
		["pharmacy", listing("apotheke")],
		["Arzt", UNLISTED],
		["Hausarzt", UNLISTED],
		["Zahnarzt", UNLISTED],
		["médecin", UNLISTED],
		["medico", UNLISTED],
	],
	EE: [
		["perearst", listing("perearstikeskused")],
		["Perearst", listing("perearstikeskused")],
		["perearsti", listing("perearstikeskused")],
		["perearstikeskus", listing("perearstikeskused")],
		["haigla", listing("haiglad")],
		["EMO", listing("haiglad")],
		["kliinikum", listing("haiglad")],
		["hambaarst", listing("hambaravi")],
		["hambaravi", listing("hambaravi")],
		["ortodont", listing("hambaravi")],
		["silmaarst", listing("eriarstiabi")],
		["kardioloog", listing("eriarstiabi")],
		["günekoloog", listing("eriarstiabi")],
		["koduõde", listing("oendusabi")],
		["õendusabi", listing("oendusabi")],
		["ämmaemand", listing("ammaemandusabi")],
		["füsioterapeut", listing("fusioteraapia")],
		["psühholoog", listing("psuhholoogiline-ravi")],
		["logopeed", listing("logopeedia")],
		["apteek", listing("apteegid")],
		["apteegid", listing("apteegid")],
		["Apteek", listing("apteegid")],
		// Visitors' languages.
		["pharmacy", listing("apteegid")],
		["dentist", listing("hambaravi")],
		["family doctor", listing("perearstikeskused")],
		["hôpital", listing("haiglad")],
		["pharmacie", listing("apteegid")],
	],
	PL: [
		["szpital", listing("szpitale")],
		["SOR", listing("szpitale")],
		["lekarz rodzinny", listing("przychodnie-poz")],
		["przychodnia", listing("przychodnie-poz")],
		["POZ", listing("przychodnie-poz")],
		["dentysta", listing("stomatologia")],
		["stomatolog", listing("stomatologia")],
		["ginekolog", listing("poradnie-ginekologiczne")],
		["kardiolog", listing("poradnie-kardiologiczne")],
		["okulista", listing("poradnie-okulistyczne")],
		["psychiatra", listing("poradnie-zdrowia-psychicznego")],
		["fizjoterapeuta", listing("rehabilitacja")],
		["laboratorium", listing("diagnostyka")],
		["hospicjum", listing("hospicja")],
		["dentist", listing("stomatologia")],
		["hospital", listing("szpitale")],
		["apteka", UNLISTED],
		["pharmacy", UNLISTED],
	],
	NO: [
		["fastlege", listing("legekontorer")],
		["Fastlege", listing("legekontorer")],
		["legesenter", listing("legekontorer")],
		["legevakt", listing("legevakter")],
		["sykehus", listing("sykehus")],
		["sjukehus", listing("sykehus")],
		["DPS", listing("psykisk-helsevern")],
		["BUP", listing("psykisk-helsevern")],
		["øyelege", listing("legespesialister")],
		["hudlege", listing("legespesialister")],
		["tannlege", listing("tannklinikker")],
		["kjeveortoped", listing("tannklinikker")],
		["sykehjem", listing("sykehjem")],
		["sjukeheim", listing("sykehjem")],
		["apotek", listing("apotek")],
		["Apotek", listing("apotek")],
		["fysioterapeut", UNLISTED],
		["psykolog", UNLISTED],
		// Visitors' languages.
		["pharmacy", listing("apotek")],
		["dentist", listing("tannklinikker")],
		["family doctor", listing("legekontorer")],
		["hôpital", listing("sykehus")],
		["pharmacie", listing("apotek")],
	],
	IE: [
		["pharmacy", listing("pharmacy")],
		["chemist", listing("pharmacy")],
		["the chemist's", listing("pharmacy")],
		["nursing home", listing("nursing-homes")],
		["care home", listing("nursing-homes")],
		["hospital", listing("hospitals")],
		["A&E", listing("hospitals")],
		["health centre", listing("health-centres")],
		["primary care centre", listing("health-centres")],
		["pharmacie", listing("pharmacy")],
		["Krankenhaus", listing("hospitals")],
		["GP", UNLISTED],
		["dentist", UNLISTED],
	],
	FI: [
		["terveyskeskus", listing("terveysasemat")],
		["Terveysasema", listing("terveysasemat")],
		["lääkäri", listing("terveysasemat")],
		["laakari", listing("terveysasemat")],
		["sote-keskus", listing("terveysasemat")],
		["hammaslääkäri", listing("hammashoitolat")],
		["hammashoitola", listing("hammashoitolat")],
		["neuvola", listing("neuvolat")],
		["äitiysneuvola", listing("neuvolat")],
		["päivystys", listing("paivystys")],
		["ensiapu", listing("paivystys")],
		["sairaala", listing("sairaalat")],
		["keskussairaala", listing("sairaalat")],
		["psykiatri", listing("mielenterveys-ja-paihdepalvelut")],
		["A-klinikka", listing("mielenterveys-ja-paihdepalvelut")],
		["fysioterapia", listing("kuntoutus")],
		["laboratorio", listing("laboratoriot-ja-kuvantaminen")],
		["röntgen", listing("laboratoriot-ja-kuvantaminen")],
		// Visitors' languages.
		["dentist", listing("hammashoitolat")],
		["health centre", listing("terveysasemat")],
		["dentiste", listing("hammashoitolat")],
		// No pharmacy and no private clinic in the Finnish Service Catalogue.
		["apteekki", UNLISTED],
		["pharmacy", UNLISTED],
		["lääkäriasema", UNLISTED],
	],
	LT: [
		["ligoninė", listing("ligonines")],
		["Ligoninės", listing("ligonines")],
		["ligonine", listing("ligonines")],
		["šeimos gydytojas", listing("seimos-medicina")],
		["seimos gydytojas", listing("seimos-medicina")],
		["poliklinika", listing("seimos-medicina")],
		["PSPC", listing("seimos-medicina")],
		["odontologas", listing("odontologijos-klinikos")],
		["dantų gydytojas", listing("odontologijos-klinikos")],
		["stomatologas", listing("odontologijos-klinikos")],
		["kardiologas", listing("medicinos-centrai")],
		["klinika", listing("medicinos-centrai")],
		["psichologas", listing("psichikos-sveikatos-centrai")],
		["kineziterapeutas", listing("reabilitacija")],
		["slauga namuose", listing("slauga")],
		["laboratorija", listing("laboratorijos")],
		["dentist", listing("odontologijos-klinikos")],
		["hôpital", listing("ligonines")],
		["Zahnarzt", listing("odontologijos-klinikos")],
		["vaistinė", UNLISTED],
		["pharmacy", UNLISTED],
	],
};

describe.each(MARKETS)("the everyday words of %s", (country) => {
	it.each(EVERYDAY[country])("%j", (word, expected) => {
		expect(resolveSearchTerm(word, country)).toEqual(expected);
	});
});

describe("a name", () => {
	it.each([
		["Dupont", "FR"],
		["Fictif", "FR"],
		["Jean-Pierre Fictif", "FR"],
		["Essai", "FR"],
		["Beispiel", "AT"],
		["Fictional Medical Centre", "GB"],
		["Kentish Example Practice", "GB"],
		["Jana Ukázková", "CZ"],
		["Ana María Ejemplo Sanz", "ES"],
		["Farmacia Ejemplo Mayor", "ES"],
		["Rossi", "IT"],
		["Farmacia Esempio", "IT"],
		["Kantonsspital Beispiel AG", "CH"],
		["Muster", "CH"],
		["Example Pharmacy Cork", "IE"],
		["", "FR"],
	] as const)("%j is a name search in %s", (word, country) => {
		expect(resolveSearchTerm(word, country)).toBeNull();
	});

	it("is not read with another market's words", () => {
		expect(resolveSearchTerm("zubař", "FR")).toBeNull();
		expect(resolveListing("Hausarzt", "GB")).toBeNull();
		expect(resolveListing("GP", "AT")).toBe("allgemeinmedizin");
		expect(resolveListing("dentiste", "CZ")).toBeNull();
		expect(resolveListing("zubař", "ES")).toBeNull();
		expect(resolveListing("dentiste", "ES")).toBeNull();
		expect(resolveListing("zubař", "IT")).toBeNull();
		expect(resolveListing("farmacia", "FR")).toBeNull();
		expect(resolveListing("Spital", "AT")).toBeNull();
		expect(resolveListing("zubař", "CH")).toBeNull();
	});
});

describe("the suggestions of “Qui ?”", () => {
	const slugs = (query: string, locale: Parameters<typeof suggestListings>[1]) =>
		suggestListings(query, locale).map((entry) => entry.slug);

	it("offer the listing an everyday word names, in the locale's language", () => {
		expect(slugs("Hausar", "de-AT")).toContain("allgemeinmedizin");
		expect(slugs("zubař", "cs-CZ")).toContain("zubni-lekar");
		expect(slugs("médico de cab", "es-ES")).toEqual(["centros-de-salud"]);
		expect(slugs("oculis", "es-ES")).toEqual(["oftalmologos"]);
		expect(slugs("doctor", "en-GB")).toEqual(["gp-practices"]);
		expect(slugs("farmacia di", "it-IT")).toEqual(["farmacie"]);
		expect(slugs("pronto", "it-IT")).toEqual(["ospedali"]);
		expect(slugs("Apothe", "de-CH")).toEqual(["apotheke"]);
		expect(slugs("EMS", "fr-CH")).toEqual(["pflegeheim"]);
		expect(slugs("casa per an", "it-CH")).toEqual(["pflegeheim"]);
		expect(slugs("médecin trait", "fr")).toEqual(["medecin-generaliste"]);
		expect(slugs("dentist", "en")).toContain("chirurgien-dentiste");
	});

	it("never offer care the market does not list", () => {
		expect(slugs("kiné", "fr")).toEqual([]);
		expect(slugs("pharmacie", "fr")).toEqual([]);
		expect(slugs("Apotheke", "de-AT")).toEqual([]);
		expect(slugs("optician", "en-GB")).toEqual([]);
		expect(slugs("óptica", "es-ES")).toEqual([]);
		expect(slugs("dentista", "it-IT")).toEqual([]);
		expect(slugs("Zahnarzt", "de-CH")).toEqual([]);
		expect(slugs("Apotheke", "it-IT")).toEqual([]);
	});
});
