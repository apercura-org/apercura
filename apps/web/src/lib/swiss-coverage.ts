import { CH_CANTONS, CH_LIST_CANTONS } from "@apercura/core/country";
import {
	CH_HOSPITAL_KINDS,
	CH_NURSING_HOME,
	CH_PHARMACY,
	CH_PROFESSIONS,
} from "@apercura/core/taxonomy";

/*
 * What the Swiss pages say they cover, from what the directory publishes: the FOPH's figures
 * give every canton's hospitals and clinics; a canton's own lists add its nursing homes, its
 * pharmacies, or points and phone numbers for its hospitals. A canton is named for a kind only
 * when a published facility of that kind comes from (or is credited to) its list, so a list
 * that could not be read, or was never imported, is never claimed, whichever canton it is.
 */

/** A registry a published Swiss facility comes from or is credited to, with its kind. */
export type SwissCoverageRow = { registry: string; professionCode: string };

/** Canton abbreviations (`ZH`), in the order of the Federal Constitution. */
export type SwissCoverage = {
	/** Cantons whose hospital list adds to the FOPH's sites, or gives pages of its own. */
	hospitalLists: string[];
	/** Cantons whose list of nursing homes is published. */
	nursingHomes: string[];
	/** Cantons whose list of pharmacies is published. */
	pharmacies: string[];
	/** Every registry with at least one published facility (`ch-bag-kzp`, `ch-zh-heime`…). */
	registries: string[];
};

/** Before the first import, or without a database: nothing is published, nothing is claimed. */
export const NO_SWISS_COVERAGE: SwissCoverage = {
	hospitalLists: [],
	nursingHomes: [],
	pharmacies: [],
	registries: [],
};

const HOSPITAL_KINDS: ReadonlySet<string> = new Set(CH_HOSPITAL_KINDS);

const byConstitution = (codes: Iterable<string>) =>
	[...new Set(codes)].sort((a, b) => (CH_CANTONS[a]?.number ?? 99) - (CH_CANTONS[b]?.number ?? 99));

/** The cantons of each kind of facility, from the registries of the published facilities. */
export function shapeSwissCoverage(rows: readonly SwissCoverageRow[]): SwissCoverage {
	const hospitalLists: string[] = [];
	const nursingHomes: string[] = [];
	const pharmacies: string[] = [];
	for (const { registry, professionCode } of rows) {
		const canton = CH_LIST_CANTONS[registry];
		if (!canton) continue;
		if (professionCode === CH_NURSING_HOME) nursingHomes.push(canton);
		else if (professionCode === CH_PHARMACY) pharmacies.push(canton);
		else if (HOSPITAL_KINDS.has(professionCode)) hospitalLists.push(canton);
	}
	return {
		hospitalLists: byConstitution(hospitalLists),
		nursingHomes: byConstitution(nursingHomes),
		pharmacies: byConstitution(pharmacies),
		registries: [...new Set(rows.map((row) => row.registry))].sort(),
	};
}

/**
 * A translator of the `SwissCoverage` namespace: next-intl's, from `getTranslations` or
 * `createTranslator`. Its keys are checked by the catalogs' tests, not by this type.
 */
// biome-ignore lint/suspicious/noExplicitAny: next-intl's translators type their keys strictly.
type Translator = (key: any, values?: any) => string;

export type SwissCoverageTexts = {
	/** The home's opening line: every hospital, and the homes and pharmacies of the cantons covered. */
	hook: string;
	/** One sentence per kind (hospitals, nursing homes, pharmacies), for the home and the data page. */
	summary: string[];
	/** What a listing of a kind covers (`pflegeheim`, `apotheke`, or a hospital listing). */
	listing: (listingSlug: string) => string;
	/** The search's answer to a profession the directory does not list. */
	unlisted: string;
};

/**
 * The coverage statements in a page's language: canton names from the catalog, joined as the
 * language joins a list ("Zürich, Bern und Jura", « de Zurich, de Berne et du Jura »), with the
 * cases of one canton and of none.
 */
export function swissCoverageTexts(
	t: Translator,
	locale: string,
	coverage: SwissCoverage,
): SwissCoverageTexts {
	const join = (items: string[]) =>
		new Intl.ListFormat(locale, { style: "long", type: "conjunction" }).format(items);
	const name = (code: string): string => t(`cantons.${code}`);
	// How many cantons, as the catalogs choose their words: none, one, or several (a `select`, the
	// same in every language, rather than each language's plural categories).
	const args = (codes: string[], label: (code: string) => string = name) => ({
		amount: codes.length === 0 ? "none" : codes.length === 1 ? "one" : "other",
		cantons: join(codes.map(label)),
	});
	const homes = args(coverage.nursingHomes);
	const hospitals = args(coverage.hospitalLists);
	const pharmacies = args(coverage.pharmacies);
	// On a pharmacy listing and in the summaries, which pharmacies each canton's list holds.
	const pharmacyLists = args(coverage.pharmacies, (code) =>
		t("pharmacyCanton", { canton: code, name: name(code) }),
	);
	const others = [
		...(coverage.nursingHomes.length > 0 ? [t("homesOf", homes)] : []),
		...(coverage.pharmacies.length > 0 ? [t("pharmaciesOf", pharmacies)] : []),
	];
	return {
		hook: others.length > 0 ? t("hookWith", { others: join(others) }) : t("hook"),
		summary: [t("hospitals", hospitals), t("homes", homes), t("pharmacies", pharmacyLists)],
		listing: (listingSlug) =>
			t("listing", {
				kind: listingSlug,
				...(listingSlug === CH_PROFESSIONS[CH_NURSING_HOME]?.slug
					? homes
					: listingSlug === CH_PROFESSIONS[CH_PHARMACY]?.slug
						? pharmacyLists
						: hospitals),
			}),
		unlisted: t("unlisted", { listed: join([t("hospitalsEverywhere"), ...others]) }),
	};
}
