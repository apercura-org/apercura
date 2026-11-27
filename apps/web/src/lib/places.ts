import { slugifyDe } from "@apercura/core";
import { AT_STATES, PRAGUE_CODE } from "@apercura/core/country";
import type { PlaceRef } from "~/server/queries/types";

/**
 * Cities whose page is their department's, by market: Paris (INSEE 75056, department 75),
 * Wien (Statistik Austria 90001, Bundesland 9) and Praha (RÚIAN 554782, district CZ0100). Their districts list under the
 * department page, and the city itself has no listing or hub page.
 */
export const CITY_IS_DEPARTMENT: Readonly<Record<string, string>> = {
	FR: "75056",
	AT: "90001",
	CZ: PRAGUE_CODE,
};

/**
 * Germany's kreisfreie Städte: a city that is a Kreis of its own (München, Berlin, Hamburg) is
 * the Gemeinde whose official code is its Kreis's followed by `000` (`09162000`, `11000000`).
 * Its Kreis is its department, so its city page is the Kreis's page, like Paris's.
 */
const DE_KREISFREIE_STADT = /^\d{5}000$/;

/**
 * Estonia's towns that are a municipality of their own (Keila, Loksa, Maardu, Narva, Rakvere,
 * Sillamäe, Viljandi, Võru): the town is the municipality's only settlement and has its EHAK
 * code, so its page is the municipality's, like Paris's. Tallinn's, Tartu's and the other
 * towns' municipalities hold several settlements, each a page of its own.
 */
export const EE_TOWN_MUNICIPALITIES: ReadonlySet<string> = new Set([
	"0296",
	"0424",
	"0446",
	"0511",
	"0663",
	"0736",
	"0897",
	"0919",
]);

/** The codes of {@link EE_TOWN_MUNICIPALITIES} as an SQL list (`'0296', '0424'…`). */
export const EE_TOWN_CODES = [...EE_TOWN_MUNICIPALITIES].map((code) => `'${code}'`).join(", ");

/**
 * True for the city that is its own department page (Paris, Wien, Praha, a kreisfreie Stadt, an
 * Estonian town that is a municipality).
 */
export function isDepartmentCity(country: string, code: string): boolean {
	if (country === "DE") return DE_KREISFREIE_STADT.test(code);
	if (country === "EE") return EE_TOWN_MUNICIPALITIES.has(code);
	return CITY_IS_DEPARTMENT[country] === code;
}

/**
 * SQL condition excluding the department cities of every market for the place alias `p`
 * (a plain string, no parameters: the codes are constants): Paris, Wien, Praha, Germany's
 * kreisfreie Städte and Estonia's towns that are a municipality.
 */
export const NOT_DEPARTMENT_CITY = (alias: string) =>
	[
		...Object.entries(CITY_IS_DEPARTMENT).map(
			([country, code]) => `NOT (${alias}.country = '${country}' AND ${alias}.code = '${code}')`,
		),
		`NOT (${alias}.country = 'DE' AND ${alias}.code LIKE '_____000')`,
		// The town and its municipality share a code: only the town (a commune) is left out.
		`NOT (${alias}.country = 'EE' AND ${alias}.kind = 'commune' AND ${alias}.code IN (${EE_TOWN_CODES}))`,
	].join(" AND ");

/**
 * Markets whose regions have listing and hub pages of their own: the United Kingdom (migration
 * 0026), Italy (0028), whose health service is run by its regions, and Switzerland, whose
 * cantons run theirs (`/ch/spital/zuerich`, above the districts' and the communes' pages).
 * France's regions group its departments on the directory page only.
 */
export const REGION_LISTING_MARKETS: ReadonlySet<string> = new Set(["GB", "IT", "CH"]);

/** Slugs of the Austrian Bundesländer (`wien`, `steiermark`, `niederoesterreich`…). */
export const AT_STATE_SLUGS: ReadonlySet<string> = new Set(
	Object.values(AT_STATES).map((name) => slugifyDe(name)),
);

/**
 * A department slug of the market, checked before any database access. France:
 * `{code}-{name}` (2 or 3 digits, or 2a/2b for Corsica). Austria: the slug of one of
 * the nine Bundesländer. The United Kingdom: the slug of a local authority or of a
 * region (England's regions and the other nations list in the same slot), never only
 * digits. Czechia: the slug of a district (okres, `brno-mesto`, `praha`). Spain: the slug of a
 * province (`madrid`, `barcelona`). Italy: the slug of a province or of a region (`roma`,
 * `lazio`). Germany: the slug of a Kreis (`landkreis-muenchen`, `berlin`). Switzerland: the slug of a district or of a canton (`bezirk-zuerich`, `zuerich`). Estonia: the slug of a municipality (`tallinn`,
 * `tartu-linn`, `rae-vald`).
 */
export function isDepartmentSlug(slug: string, country = "FR"): boolean {
	if (country === "AT") return AT_STATE_SLUGS.has(slug);
	if (
		country === "GB" ||
		country === "CZ" ||
		country === "ES" ||
		country === "IT" ||
		country === "DE" ||
		country === "CH" ||
		country === "EE"
	) {
		return isPlaceSlug(slug);
	}
	return /^(?:\d{2,3}|2[ab])-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}

/** A commune or arrondissement slug: lowercase words, never only digits (those are page numbers). */
export function isPlaceSlug(slug: string): boolean {
	return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && !/^\d+$/.test(slug);
}

/**
 * Name of a place with its department code, so homonyms read apart
 * ("Saint-Denis (974)", "Rhône (69)"). Arrondissements already say their city.
 * Austrian and UK places carry no code: nobody knows a Bundesland or Gemeinde by its
 * Statistik Austria number, nor a local authority by its ONS code, nor a Czech district or
 * municipality by its NUTS or RÚIAN code, nor a Spanish province or municipality by its INE
 * code, nor an Italian province or comune by its ISTAT code, nor a German Kreis or Gemeinde by
 * its AGS, nor an Estonian municipality or settlement by its EHAK code, and Vienna's and Prague's
 * districts say their city
 * ("Wien-Alsergrund", "Praha 8").
 */
export function placeLabel(
	place: Pick<PlaceRef, "kind" | "code" | "name" | "departmentCode">,
	country = "FR",
): string {
	if (country !== "FR") return place.name;
	if (place.kind === "department") return `${place.name} (${place.code})`;
	if (place.kind === "arrondissement" || !place.departmentCode) return place.name;
	return `${place.name} (${place.departmentCode})`;
}
