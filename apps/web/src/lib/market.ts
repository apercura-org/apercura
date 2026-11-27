import {
	austria,
	CH_ATTRIBUTION_DATE,
	cyprus,
	czechia,
	DE_PHARMACY_STATES,
	DE_STATES,
	estonia,
	finland,
	germany,
	ireland,
	italy,
	latvia,
	lithuania,
	malta,
	norway,
	PL_OBTAINED_AT,
	PL_PRODUCED_AT,
	poland,
	SE_COUNTIES,
	SE_HEALTH_CENTRE_COUNTIES,
	slovenia,
	spain,
	sweden,
	switzerland,
	unitedKingdom,
} from "@apercura/core/country";
import {
	AT_PROFESSIONS,
	CH_PROFESSIONS,
	CY_PROFESSIONS,
	CZ_PROFESSIONS,
	DE_PHARMACY,
	DE_PROFESSIONS,
	EE_PROFESSIONS,
	ES_PROFESSIONS,
	FI_PROFESSIONS,
	GB_PROFESSIONS,
	hasBillingSectors,
	IE_PROFESSIONS,
	IT_PROFESSIONS,
	LT_PROFESSIONS,
	LV_GP_PRACTICE,
	LV_PROFESSIONS,
	listingHasBillingSectors,
	MT_PROFESSIONS,
	NO_PROFESSIONS,
	PL_PROFESSIONS,
	professionFor,
	SE_HEALTH_CENTRE,
	SE_PROFESSIONS,
	SI_PROFESSIONS,
} from "@apercura/core/taxonomy";
import { type Locale, marketOf } from "~/i18n/locales";
import { marketAdapter } from "./practitioner-key";

/*
 * What the pages of a locale's market can show. France's pages carry the Assurance Maladie
 * facts (agreement sectors, Carte Vitale) and online booking; Austria's sources publish no
 * such facts and the market has no booking.
 */

/** True when `slug` is a listing page of the locale's market (its own taxonomy). */
export function isMarketListingSlug(locale: Locale, slug: string): boolean {
	return marketAdapter(locale).taxonomy.isListingSlug(slug);
}

/** True when the market's pages show the French Assurance Maladie facts (sectors, Carte Vitale). */
export function showsBillingFacts(locale: Locale): boolean {
	return marketOf(locale) === "FR";
}

/** Fees of a listing are stated as sectors (France, physicians), or as agreements, or not at all. */
export function listingFees(locale: Locale, listingSlug: string): "sector" | "other" {
	return showsBillingFacts(locale) && listingHasBillingSectors(listingSlug) ? "sector" : "other";
}

/** Same as {@link listingFees}, for one practitioner's profession. */
export function professionFees(locale: Locale, professionCode: string): boolean {
	return showsBillingFacts(locale) && hasBillingSectors(professionCode);
}

/** True when the market supports online booking (feature by market, ADR 0002 section 3). */
export function marketBooks(locale: Locale): boolean {
	return marketAdapter(locale).features.booking;
}

/**
 * The profession slug of any market's profession code (`10` → `medecin`, `ARZT` → `aerzte`,
 * `GB_GP` → `gp-practices`, `CZ_GP` → `prakticky-lekar`, `ES_PHARMACY` → `farmacias`,
 * `IT_PHARMACY` → `farmacie`, `DE_PHARMACY` → `apotheken`, `CH_HOSPITAL` → `spital`,
 * `EE_PHARMACY` → `apteegid`, `NO_PHARMACY` → `apotek`,
 * `IE_PHARMACY` → `pharmacy`, `LT_DENTAL` → `odontologijos-klinikos`, `SI_DENTIST` → `zobozdravnik`, `CY_PHARMACY` → `farmakeia`, `SE_PHARMACY` → `apoteken`,
 * `MT_PHARMACY` → `community-pharmacies`).
 */
export function professionSlugOf(code: string): string {
	return (
		professionFor(code)?.slug ??
		AT_PROFESSIONS[code]?.slug ??
		GB_PROFESSIONS[code]?.slug ??
		CZ_PROFESSIONS[code]?.slug ??
		ES_PROFESSIONS[code]?.slug ??
		IT_PROFESSIONS[code]?.slug ??
		DE_PROFESSIONS[code]?.slug ??
		CH_PROFESSIONS[code]?.slug ??
		EE_PROFESSIONS[code]?.slug ??
		PL_PROFESSIONS[code]?.slug ??
		NO_PROFESSIONS[code]?.slug ??
		IE_PROFESSIONS[code]?.slug ??
		FI_PROFESSIONS[code]?.slug ??
		LT_PROFESSIONS[code]?.slug ??
		SI_PROFESSIONS[code]?.slug ??
		CY_PROFESSIONS[code]?.slug ??
		LV_PROFESSIONS[code]?.slug ??
		SE_PROFESSIONS[code]?.slug ??
		MT_PROFESSIONS[code]?.slug ??
		""
	);
}

/**
 * The sources a practitioner's page is built from, by the activities' source (`at-wien`…),
 * with their licence attribution word for word: what the Austrian page prints as its
 * provenance (CC BY 4.0 requires it). Empty for French sources, whose provenance line is the
 * catalog's.
 */
export function austrianSourcesOf(
	activitySources: readonly (string | undefined)[],
): { name: string; attribution: string }[] {
	const ids = new Set(activitySources.filter(Boolean));
	return austria.registries
		.filter((registry) => ids.has(registry.id) && registry.attribution)
		.map((registry) => ({ name: registry.name, attribution: registry.attribution ?? "" }));
}

/** The UK registry of a site source: a branch surgery comes from the ODS GP practices' reports. */
const GB_REGISTRY_OF_SOURCE: Readonly<Record<string, string>> = { "gb-ods-branch": "gb-ods-gp" };

/**
 * The sources a UK practice's page is built from, with their Open Government Licence
 * attribution word for word: the practice's list (`gb-ods-gp`, `gb-phs-gp`…) and, when one of
 * its places is located by its postcode (Great Britain only: Northern Irish postcodes are not
 * in Code-Point Open), Ordnance Survey's Code-Point Open.
 */
export function ukSourcesOf(
	activities: readonly {
		source?: string;
		site?: { postcode: string | null; geoPrecision: string | null } | null;
	}[],
): { name: string; attribution: string }[] {
	const ids = new Set<string>();
	for (const activity of activities) {
		if (!activity.source) continue;
		ids.add(GB_REGISTRY_OF_SOURCE[activity.source] ?? activity.source);
		const site = activity.site;
		if (site?.postcode && !site.postcode.startsWith("BT") && site.geoPrecision === "street") {
			ids.add("gb-postcodes");
		}
	}
	return unitedKingdom.registries
		.filter((registry) => ids.has(registry.id) && registry.attribution)
		.map((registry) => ({ name: registry.name, attribution: registry.attribution ?? "" }));
}

/**
 * The sources a Czech facility's page is built from, with their CC BY 4.0 attribution word for
 * word: the NRPZS (its name, address, kind and fields of care) and RÚIAN (ČÚZK), whose regions,
 * districts and municipalities place it.
 */
export function czechSourcesOf(): { name: string; attribution: string }[] {
	return czechia.registries
		.filter((registry) => registry.attribution)
		.map((registry) => ({ name: registry.name, attribution: registry.attribution ?? "" }));
}

/**
 * The sources a Lithuanian institution's page is built from, with their CC BY 4.0 attribution
 * word for word: VASPVT's licence register (its name, address and licensed services) and the
 * Address Register (VĮ Registrų centras), whose counties, municipalities and settlements place and
 * locate it.
 */
export function lithuanianSourcesOf(): { name: string; attribution: string }[] {
	return lithuania.registries
		.filter((registry) => registry.attribution)
		.map((registry) => ({ name: registry.name, attribution: registry.attribution ?? "" }));
}

/** The REGCESS source of Spain's centres: its attribution takes the date of the data. */
export const REGCESS_SOURCE_ID = "es-regcess";

/**
 * The attribution of a Spanish source, word for word: the Ministry of Health's legal notice
 * asks for the source and the date of its last update ("Fuente: Ministerio de Sanidad, REGCESS,
 * actualizado 1 de diciembre de 2026"), so REGCESS's line takes the date of the import the page
 * is built from, written in Spanish whatever the interface. Without a date (no import recorded)
 * the line is the source alone.
 */
export function spanishAttribution(sourceId: string, updatedAt: string | null): string {
	const registry = spain.registries.find((source) => source.id === sourceId);
	const attribution = registry?.attribution ?? "";
	if (sourceId !== REGCESS_SOURCE_ID || !updatedAt) return attribution;
	const date = new Intl.DateTimeFormat("es-ES", {
		dateStyle: "long",
		timeZone: "UTC",
	}).format(new Date(`${updatedAt.slice(0, 10)}T00:00:00Z`));
	return `${attribution}, actualizado ${date}`;
}

/**
 * The sources a Spanish centre's page is built from, with the attribution each requires word for
 * word: REGCESS (Ministerio de Sanidad: its name, kind, care units and address), dated by
 * `updatedAt` (the last Spanish import, `YYYY-MM-DD`), and the IGN (CC BY 4.0), whose
 * communities, provinces and municipalities place it.
 */
export function spanishSourcesOf(
	updatedAt: string | null,
): { name: string; attribution: string }[] {
	return spain.registries
		.filter((registry) => registry.attribution)
		.map((registry) => ({
			name: registry.name,
			attribution: spanishAttribution(registry.id, updatedAt),
		}));
}

/** The ISTAT boundaries that place Italy's sites (no date: they are a year's, named in the line). */
export const ISTAT_SOURCE_ID = "it-istat";

/**
 * The file key of an Italian list in `directory.etl_runs.files` (`farmacie`), by its source id
 * (`it-farmacie`, also its sites' source).
 */
export const IT_FILE_OF_SOURCE: Readonly<Record<string, string>> = {
	"it-farmacie": "farmacie",
	"it-parafarmacie": "parafarmacie",
	"it-posti-letto": "posti-letto",
};

/**
 * The date of an Italian list's data (`YYYY-MM-DD`): the publication date of the file the last
 * Italian import read (its `Last-Modified`), else the day of that import; null before any.
 */
export function italianSourceDate(
	sourceId: string | undefined,
	status: { importedAt: string; files: Readonly<Record<string, string>> } | null,
): string | null {
	if (!status) return null;
	const file = sourceId ? IT_FILE_OF_SOURCE[sourceId] : undefined;
	return (file ? status.files[file] : undefined) ?? status.importedAt;
}

/**
 * The attribution of an Italian source, word for word: the Italian Open Data Licence asks for
 * the source and the licensor, and the Ministry of Health's lists are cited with the date of
 * their data ("Fonte: Ministero della Salute, Farmacie, IODL 2.0, aggiornato al 26 novembre
 * 2026"), written in Italian whatever the interface. Without a date (no import recorded) the
 * line is the source alone; ISTAT's names the year of its boundaries itself.
 */
export function italianAttribution(sourceId: string, updatedAt: string | null): string {
	const registry = italy.registries.find((source) => source.id === sourceId);
	const attribution = registry?.attribution ?? "";
	if (sourceId === ISTAT_SOURCE_ID || !updatedAt || !attribution) return attribution;
	const date = new Intl.DateTimeFormat("it-IT", { dateStyle: "long", timeZone: "UTC" }).format(
		new Date(`${updatedAt.slice(0, 10)}T00:00:00Z`),
	);
	return `${attribution}, aggiornato al ${date}`;
}

/**
 * The sources an Italian page is built from, with the attribution each requires word for word:
 * the ministry's list of the place (pharmacies, parapharmacies or hospital bed counts), dated by
 * `updatedAt` (`YYYY-MM-DD`), and ISTAT's boundaries (CC BY 4.0), whose municipalities place it.
 */
export function italianSourcesOf(
	activitySources: readonly (string | undefined)[],
	updatedAt: string | null,
): { name: string; attribution: string }[] {
	const ids = new Set([...activitySources.filter(Boolean), ISTAT_SOURCE_ID]);
	return italy.registries
		.filter((registry) => ids.has(registry.id) && registry.attribution)
		.map((registry) => ({
			name: registry.name,
			attribution: italianAttribution(registry.id, updatedAt),
		}));
}

/**
 * The German registry of a site source: a prevention or rehabilitation clinic comes from the
 * same directory as the hospitals (Destatis publishes both in one workbook).
 */
const DE_REGISTRY_OF_SOURCE: Readonly<Record<string, string>> = {
	"de-destatis-rhv": "de-destatis-khv",
};

/** The Destatis municipalities' directory, which places every German facility. */
const DE_PLACES_REGISTRY = "de-destatis-gv";

/**
 * The sources a German facility's page is built from, with the attribution each requires word
 * for word: the facility's list (the Destatis directory, Thuringia's or Brandenburg's pharmacies)
 * and Destatis's municipalities' directory, which places it.
 */
export function germanSourcesOf(
	activitySources: readonly (string | undefined)[],
): { name: string; attribution: string }[] {
	const ids = new Set<string>();
	for (const source of activitySources) {
		if (source) ids.add(DE_REGISTRY_OF_SOURCE[source] ?? source);
	}
	if (ids.size === 0) return [];
	ids.add(DE_PLACES_REGISTRY);
	return germany.registries
		.filter((registry) => ids.has(registry.id) && registry.attribution)
		.map((registry) => ({ name: registry.name, attribution: registry.attribution ?? "" }));
}

/**
 * The Land and Spatial Development Board's sources that place and locate every Estonian page:
 * the administrative and settlement units (EHAK) and the address data system's points (ADS).
 */
export const EE_PLACE_SOURCE_IDS: readonly string[] = ["ee-ehak", "ee-ads"];

/**
 * The sources an Estonian page is built from, with the attribution each asks for word for word:
 * its register (the Health Board's providers, CC BY-NC-SA 3.0, or the State Agency of Medicines'
 * pharmacies) and the Land and Spatial Development Board's places and addresses.
 */
export function estonianSourcesOf(
	activitySources: readonly (string | undefined)[],
): { name: string; attribution: string }[] {
	const ids = new Set(activitySources.filter((source): source is string => Boolean(source)));
	if (ids.size === 0) return [];
	for (const id of EE_PLACE_SOURCE_IDS) ids.add(id);
	return estonia.registries
		.filter((registry) => ids.has(registry.id) && registry.attribution)
		.map((registry) => ({ name: registry.name, attribution: registry.attribution ?? "" }));
}

/**
 * Kartverket's sources that place and locate every Norwegian page: the cadastre's addresses
 * (Matrikkelen – Adresse) and the counties and municipalities (administrative divisions).
 */
export const NO_PLACE_SOURCE_IDS: readonly string[] = ["no-adresser", "no-kommuner"];

/**
 * The sources a Norwegian page is built from, with the attribution each asks for word for word:
 * the Central Coordinating Register for Legal Entities (NLOD 2.0, the change said, as its § 5
 * asks) and Kartverket's addresses, counties and municipalities (CC BY 4.0).
 */
export function norwegianSourcesOf(
	activitySources: readonly (string | undefined)[],
): { name: string; attribution: string }[] {
	const ids = new Set(activitySources.filter((source): source is string => Boolean(source)));
	if (ids.size === 0) return [];
	for (const id of NO_PLACE_SOURCE_IDS) ids.add(id);
	return norway.registries
		.filter((registry) => ids.has(registry.id) && registry.attribution)
		.map((registry) => ({ name: registry.name, attribution: registry.attribution ?? "" }));
}

/**
 * The sources a Finnish page is built from, with their credit: the Finnish Service Catalogue
 * (PTV, CC0 1.0: no attribution is required, Apercura names it anyway) and Statistics Finland's
 * municipalities, wellbeing services counties and regions (CC BY 4.0, "Lähde: Tilastokeskus").
 */
export function finnishSourcesOf(
	activitySources: readonly (string | undefined)[],
): { name: string; attribution: string }[] {
	if (!activitySources.some(Boolean)) return [];
	return finland.registries
		.filter((registry) => registry.attribution)
		.map((registry) => ({ name: registry.name, attribution: registry.attribution ?? "" }));
}

/**
 * The sources that place and locate every Cypriot page: Cyprus Post's table of postcodes by
 * municipality and community (their codes, centres and Latin names) and the Statistical
 * Service's 2021 census (the municipalities and communities it counted, their population).
 */
export const CY_PLACE_SOURCE_IDS: readonly string[] = ["cy-tk", "cy-apografi"];

/**
 * The sources a Cypriot page is built from, with the attribution each asks for word for word:
 * the Ministry of Health's list the facility comes from (private pharmacies, state hospitals or
 * state health centres, CC BY 4.0, the change said), then Cyprus Post's postcodes and CYSTAT's
 * census (CC BY 4.0).
 */
export function cypriotSourcesOf(
	activitySources: readonly (string | undefined)[],
): { name: string; attribution: string }[] {
	const ids = new Set(activitySources.filter((source): source is string => Boolean(source)));
	if (ids.size === 0) return [];
	for (const id of CY_PLACE_SOURCE_IDS) ids.add(id);
	return cyprus.registries
		.filter((registry) => ids.has(registry.id) && registry.attribution)
		.map((registry) => ({ name: registry.name, attribution: registry.attribution ?? "" }));
}

/**
 * The places of Switzerland's pages: the Federal Statistical Office's communes, districts and
 * cantons and swisstopo's localities, credited on every Swiss page.
 */
export const CH_PLACE_SOURCE_IDS: readonly string[] = ["ch-bfs-gemeinden", "ch-swisstopo-plz"];

/**
 * The attribution of a Swiss source, word for word, in the page's language when its publisher
 * words it in that language (the FOPH's in German, French and Italian), else as published. SITG's
 * (Geneva) asks for the day the data was downloaded: the day of the Swiss import the page is
 * built from, written in French like the rest of its line. Without a date (no import recorded),
 * the line says the import's day is unknown rather than printing the placeholder.
 */
export function swissAttribution(
	sourceId: string,
	language: string,
	importedAt: string | null,
): string {
	const registry = switzerland.registries.find((source) => source.id === sourceId);
	const attribution = registry?.attributions?.[language] ?? registry?.attribution ?? "";
	if (!attribution.includes(CH_ATTRIBUTION_DATE)) return attribution;
	const date = importedAt
		? new Intl.DateTimeFormat("fr-CH", { dateStyle: "long", timeZone: "UTC" }).format(
				new Date(`${importedAt.slice(0, 10)}T00:00:00Z`),
			)
		: null;
	return date
		? attribution.replace(CH_ATTRIBUTION_DATE, date)
		: attribution.replace(/,? (?:téléchargé )?en date du \{date\}/, "");
}

/**
 * The sources a Swiss facility's page is built from, with the attribution each requires word for
 * word in the page's language (`language`: `de`, `fr`, `it`): the list of its activity (the
 * FOPH's hospital figures or a canton's list), the further lists it is completed from (`quelle`
 * qualifications: a FOPH site with the Bern list's coordinates), and the places of the Federal
 * Statistical Office and swisstopo. `importedAt` dates SITG's line (Geneva's lists).
 */
export function swissSourcesOf(
	sourceIds: readonly (string | undefined)[],
	language: string,
	importedAt: string | null,
): { name: string; attribution: string }[] {
	const ids = new Set([...sourceIds.filter(Boolean), ...CH_PLACE_SOURCE_IDS]);
	return switzerland.registries
		.filter((registry) => ids.has(registry.id) && registry.attribution)
		.map((registry) => ({
			name: registry.name,
			attribution: swissAttribution(registry.id, language, importedAt),
		}));
}

/** RPWDL, the register of Poland's establishments: its attribution states two dates. */
export const RPWDL_SOURCE_ID = "pl-rpwdl";

/**
 * The attribution of a Polish source, word for word: the reuse conditions of RPWDL on dane.gov.pl
 * ask for the source, the time the information was produced and the time it was obtained (art. 15
 * ust. 1 pkt 1 of the open data act), so its line takes the date of the register's report the
 * last Polish import read (`producedAt`) and the day of that import (`obtainedAt`, both
 * `YYYY-MM-DD`), written in Polish like the rest of the line. Without a date (no import
 * recorded) the line says the source and its licence only. TERYT's and PRG's lines name no date
 * to fill.
 */
export function polishAttribution(
	sourceId: string,
	producedAt: string | null,
	obtainedAt: string | null,
): string {
	const registry = poland.registries.find((source) => source.id === sourceId);
	const attribution = registry?.attribution ?? "";
	if (!attribution.includes(PL_PRODUCED_AT)) return attribution;
	const date = (value: string) =>
		new Intl.DateTimeFormat("pl-PL", { dateStyle: "long", timeZone: "UTC" }).format(
			new Date(`${value.slice(0, 10)}T00:00:00Z`),
		);
	if (!producedAt || !obtainedAt) {
		return attribution.replace(/ Czas wytworzenia: .*?; czas pozyskania: .*?\./, "");
	}
	return attribution
		.replace(PL_PRODUCED_AT, date(producedAt))
		.replace(PL_OBTAINED_AT, date(obtainedAt));
}

/**
 * The sources a Polish establishment's page is built from, with the attribution each requires
 * word for word: RPWDL (Centrum e-Zdrowia: its name, kind, cells and addresses), dated by the
 * register's report and the import (`polishAttribution`), TERYT (GUS), whose voivodeships,
 * powiats and gminas place it, and PRG (GUGiK), whose boundaries locate it.
 */
export function polishSourcesOf(
	producedAt: string | null,
	obtainedAt: string | null,
): { name: string; attribution: string }[] {
	return poland.registries
		.filter((registry) => registry.attribution)
		.map((registry) => ({
			name: registry.name,
			attribution: polishAttribution(registry.id, producedAt, obtainedAt),
		}));
}

/** The Register of Spatial Units (GURS), whose regions, municipalities and settlements place Slovenia's doctors. */
export const SI_PLACES_SOURCE_ID = "si-rpe";

/** A date (`YYYY-MM-DD`) as Slovenia writes it (`26. 11. 2026`), whatever the interface. */
export function slovenianDate(date: string): string {
	return new Intl.DateTimeFormat("sl-SI", {
		day: "numeric",
		month: "numeric",
		year: "numeric",
		timeZone: "UTC",
	}).format(new Date(`${date.slice(0, 10)}T00:00:00Z`));
}

/**
 * The attribution of a Slovenian source, word for word, with the date of its data as its
 * publisher asks (CC BY 4.0; GURS: "the date of the state of the data"): the date of the ZZZS
 * list the last Slovenian import read, or of the places it located the doctors with, written in
 * Slovenian ("…, stanje 26. 11. 2026"). Without a date the line is the source alone.
 */
export function slovenianAttribution(sourceId: string, date: string | null | undefined): string {
	const attribution =
		slovenia.registries.find((source) => source.id === sourceId)?.attribution ?? "";
	return attribution && date ? `${attribution}, stanje ${slovenianDate(date)}` : attribution;
}

/**
 * The sources a Slovenian doctor's page is built from, with the attribution each requires: the
 * ZZZS list of each of its practices (`si-zzzs-sa`, `si-zzzs-gin`, `si-zzzs-zob`, one line for
 * the three, dated by the newest list of the page) and the GURS register that places it. `dates`
 * holds the date of each list's data (`directory.etl_runs.files`, by source id).
 */
export function slovenianSourcesOf(
	activitySources: readonly (string | undefined)[],
	dates: Readonly<Record<string, string>> = {},
): { name: string; attribution: string }[] {
	const lists = [...new Set(activitySources.filter((id): id is string => Boolean(id)))].filter(
		(id) => id.startsWith("si-zzzs-"),
	);
	if (lists.length === 0) return [];
	const newest = lists
		.map((id) => dates[id])
		.filter((date): date is string => Boolean(date))
		.sort()
		.at(-1);
	const names = slovenia.registries
		.filter((registry) => lists.includes(registry.id))
		.map((registry) => registry.name);
	const places = slovenia.registries.find((registry) => registry.id === SI_PLACES_SOURCE_ID);
	return [
		{ name: names.join("; "), attribution: slovenianAttribution(lists[0] ?? "", newest) },
		...(places
			? [
					{
						name: places.name,
						attribution: slovenianAttribution(SI_PLACES_SOURCE_ID, dates[SI_PLACES_SOURCE_ID]),
					},
				]
			: []),
	];
}

/** The State Land Service's address register, which places every Latvian page. */
const LV_PLACES_REGISTRY = "lv-var";

/**
 * The sources a Latvian page is built from, with their credit word for word: the list of its
 * activity (the National Health Service's GPs with the Ministry of the Interior's addresses for a
 * GP practice, the Ministry's list for a hospital, the State Agency of Medicines' register for a
 * pharmacy) and the State Land Service's address register (CC BY 4.0), which places it. The CC0
 * lists ask for no credit; they are credited anyway.
 */
export function latvianSourcesOf(
	activitySources: readonly (string | undefined)[],
): { name: string; attribution: string }[] {
	const ids = new Set<string>();
	for (const source of activitySources) {
		if (!source) continue;
		ids.add(source);
		// A GP practice's address is the Ministry of the Interior's.
		if (source === "lv-nvd-gp") ids.add("lv-vkcp");
	}
	if (ids.size === 0) return [];
	ids.add(LV_PLACES_REGISTRY);
	return latvia.registries
		.filter((registry) => ids.has(registry.id) && registry.attribution)
		.map((registry) => ({ name: registry.name, attribution: registry.attribution ?? "" }));
}

/**
 * The places of Ireland's pages: Tailte Éireann's counties and the CSO's towns (Census Built Up
 * Areas), credited on every Irish page (CC BY 4.0).
 */
export const IE_PLACE_SOURCE_IDS: readonly string[] = ["ie-counties", "ie-towns"];

/**
 * The sources an Irish facility's page is built from, with the attribution each publisher asks
 * for word for word: the facility's list (the PSI's register of pharmacies, HIQA's register of
 * designated centres for older people, or the HSE's Health Atlas layer of hospitals or of health
 * centres: the site's source is the registry's id) and the places of Tailte Éireann and the CSO.
 */
export function irishSourcesOf(
	activitySources: readonly (string | undefined)[],
): { name: string; attribution: string }[] {
	const listed = activitySources.filter((source): source is string => Boolean(source));
	if (listed.length === 0) return [];
	const ids = new Set([...listed, ...IE_PLACE_SOURCE_IDS]);
	return ireland.registries
		.filter((registry) => ids.has(registry.id) && registry.attribution)
		.map((registry) => ({ name: registry.name, attribution: registry.attribution ?? "" }));
}

/** Statistics Sweden's counties and municipalities, which place every Swedish page (CC0 1.0). */
export const SE_PLACE_SOURCE_IDS: readonly string[] = ["se-scb-granser"];

/**
 * The sources a Swedish facility's page is built from, with the credit each asks for: the
 * facility's list (Läkemedelsverket's register of licensed pharmacies under CC BY 4.0, the change
 * said, or Västra Götalandsregionen's health centres under CC0 1.0: the site's source is the
 * registry's id) and Statistics Sweden's counties and municipalities.
 */
export function swedishSourcesOf(
	activitySources: readonly (string | undefined)[],
): { name: string; attribution: string }[] {
	const listed = activitySources.filter((source): source is string => Boolean(source));
	if (listed.length === 0) return [];
	const ids = new Set([...listed, ...SE_PLACE_SOURCE_IDS]);
	return sweden.registries
		.filter((registry) => ids.has(registry.id) && registry.attribution)
		.map((registry) => ({ name: registry.name, attribution: registry.attribution ?? "" }));
}

/**
 * The sources a Maltese pharmacy's page is built from, with the CC BY 4.0 attribution each
 * publisher asks for word for word: the Medicines Authority's register of licensed pharmacies,
 * and the places of the Planning Authority (the localities' boundaries), the NSO and the Address
 * Registrar (the districts and the localities' names). Every page carries all three.
 */
export function malteseSourcesOf(
	activitySources: readonly (string | undefined)[],
): { name: string; attribution: string }[] {
	if (!activitySources.some(Boolean)) return [];
	return malta.registries
		.filter((registry) => registry.attribution)
		.map((registry) => ({ name: registry.name, attribution: registry.attribution ?? "" }));
}

/** The sources of the HSE's Health Atlas, a March 2020 snapshot (`IE_HSE_ATLAS_DATE`). */
export const IE_HSE_SOURCES: ReadonlySet<string> = new Set([
	"ie-hse-hospitals",
	"ie-hse-health-centres",
]);

/**
 * The open-data sources of a page in a market whose licences require their attribution
 * (Austria's and Czechia's CC BY 4.0, the UK's OGL, Spain's Ministry of Health and IGN, Italy's
 * IODL 2.0 and CC BY 4.0, Germany's Destatis, CC BY 4.0 and dl-de/by-2-0 sources, Slovenia's
 * CC BY 4.0 lists and places); empty for
 * IODL 2.0 and CC BY 4.0, Germany's Destatis, CC BY 4.0 and dl-de/by-2-0 sources, Switzerland's,
 * Estonia's CC BY-NC-SA 3.0, CC0 and Land Board sources, Ireland's re-use conditions and CC BY 4.0, Lithuania's CC BY 4.0,
 * Sweden's CC BY 4.0 and CC0 lists, Malta's CC BY 4.0); empty for
 * France, whose provenance line is the catalog's. `sourceDate` dates Spain's REGCESS line,
 * Italy's list and the obtaining of Poland's register, `producedAt` the production of Poland's.
 */
export function openDataSourcesOf(
	country: string,
	activities: Parameters<typeof ukSourcesOf>[0],
	sourceDate: string | null = null,
	{
		language = "de",
		sources = [],
		producedAt = null,
		dates = {},
	}: {
		language?: string;
		sources?: readonly string[];
		producedAt?: string | null;
		/** Slovenia: the date of each list's data, by source id. */
		dates?: Readonly<Record<string, string>>;
	} = {},
): { name: string; attribution: string }[] {
	if (country === "AT") return austrianSourcesOf(activities.map((activity) => activity.source));
	if (country === "GB") return ukSourcesOf(activities);
	if (country === "CZ") return activities.length > 0 ? czechSourcesOf() : [];
	if (country === "LT") return activities.length > 0 ? lithuanianSourcesOf() : [];
	if (country === "ES") return activities.length > 0 ? spanishSourcesOf(sourceDate) : [];
	if (country === "IT") {
		return activities.length > 0
			? italianSourcesOf(
					activities.map((activity) => activity.source),
					sourceDate,
				)
			: [];
	}
	if (country === "DE") return germanSourcesOf(activities.map((activity) => activity.source));
	if (country === "EE") return estonianSourcesOf(activities.map((activity) => activity.source));
	if (country === "FI") return finnishSourcesOf(activities.map((activity) => activity.source));
	if (country === "PL") {
		// `sourceDate` is the import's day (the time of obtaining), `producedAt` the register's report's.
		return activities.length > 0 ? polishSourcesOf(producedAt, sourceDate) : [];
	}
	if (country === "NO") return norwegianSourcesOf(activities.map((activity) => activity.source));
	if (country === "IE") return irishSourcesOf(activities.map((activity) => activity.source));
	if (country === "SI") {
		return slovenianSourcesOf(
			activities.map((activity) => activity.source),
			dates,
		);
	}
	if (country === "CY") return cypriotSourcesOf(activities.map((activity) => activity.source));
	if (country === "LV") return latvianSourcesOf(activities.map((activity) => activity.source));
	if (country === "SE") return swedishSourcesOf(activities.map((activity) => activity.source));
	if (country === "MT") return malteseSourcesOf(activities.map((activity) => activity.source));
	if (country === "CH") {
		return activities.length > 0
			? swissSourcesOf(
					[...activities.map((activity) => activity.source), ...sources],
					language,
					sourceDate,
				)
			: [];
	}
	return [];
}

/**
 * True when a listing is Latvia's GP practices: only the practices whose address the Ministry of
 * the Interior's list gives are listed (about a quarter of the National Health Service's), which
 * its pages say under the title.
 */
export function gpCoverageNoteOf(locale: Locale, listingSlug: string): boolean {
	return marketOf(locale) === "LV" && listingSlug === LV_PROFESSIONS[LV_GP_PRACTICE]?.slug;
}

/**
 * The Länder whose pharmacies a German listing covers, in the locale's words ("Thüringen und
 * Brandenburg"), when the listing is Germany's pharmacies: no other Land publishes a current
 * list of its pharmacies as open data. Null for any other listing.
 */
export function pharmacyCoverageOf(locale: Locale, listingSlug: string): string | null {
	if (marketOf(locale) !== "DE" || listingSlug !== DE_PROFESSIONS[DE_PHARMACY]?.slug) return null;
	return new Intl.ListFormat(locale, { type: "conjunction" }).format(
		DE_PHARMACY_STATES.map((code) => DE_STATES[code] ?? code),
	);
}

/**
 * What a listing of a locale's market covers when it does not cover the whole country, as a
 * catalog key of `Listing` and the places in the locale's words: Germany's pharmacies, listed for
 * the Länder that publish a current open list (`pharmacyCoverage`), and Sweden's health centres,
 * listed for the regions that publish theirs under an open licence (`healthCentreCoverage`,
 * "Västra Götalands län"). Null for a listing that covers its whole market.
 */
export function listingCoverageOf(
	locale: Locale,
	listingSlug: string,
): { key: "pharmacyCoverage" | "healthCentreCoverage"; places: string } | null {
	const pharmacies = pharmacyCoverageOf(locale, listingSlug);
	if (pharmacies) return { key: "pharmacyCoverage", places: pharmacies };
	if (marketOf(locale) !== "SE" || listingSlug !== SE_PROFESSIONS[SE_HEALTH_CENTRE]?.slug) {
		return null;
	}
	return {
		key: "healthCentreCoverage",
		places: new Intl.ListFormat(locale, { type: "conjunction" }).format(
			SE_HEALTH_CENTRE_COUNTIES.map((code) => SE_COUNTIES[code] ?? code),
		),
	};
}
