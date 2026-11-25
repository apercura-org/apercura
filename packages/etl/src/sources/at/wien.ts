/**
 * "Ärzte Standorte Wien" (Stadt Wien, data from the Ärztekammer für Wien,
 * CC BY 4.0, updated daily): the WFS layer `ogdwien:ARZTOGD` as GeoJSON in
 * WGS 84. One feature per doctor, practice and specialty:
 *
 * - `NAME`: titles and full name ("Dr. Anna Muster");
 * - `ADRESSE`: district and street ("09., Beispielgasse 1/2"), the district
 *   giving the postcode (1090) and the Gemeindebezirk;
 * - `FACH`: specialty label; `TELEFON`: phone, often without the 01 of Vienna;
 * - `INTERNET`: the doctor's page in the chamber's practice plan,
 *   `https://praxisplan.at/{doctor}/{name}/ordination/{practice}`: the doctor
 *   number is the stable key (one number, one name), the practice number the
 *   location's.
 */

import { toE164At } from "@apercura/core";
import { AT_DOCTOR, atSpecialtyCodeOf } from "@apercura/core/taxonomy";
import { z } from "zod";
import { displayNames, splitFullName, titleCodeOf } from "./names";
import { type ParseResult, quarantine } from "./types";

const Feature = z.object({
	type: z.literal("Feature"),
	geometry: z
		.object({ type: z.literal("Point"), coordinates: z.tuple([z.number(), z.number()]) })
		.nullable(),
	properties: z.object({
		NAME: z.string().min(1),
		ADRESSE: z.string().min(1),
		FACH: z.string().nullable().optional(),
		TELEFON: z.string().nullable().optional(),
		INTERNET: z.string().nullable().optional(),
	}),
});

const Collection = z.object({
	type: z.literal("FeatureCollection"),
	features: z.array(z.unknown()),
});

const PRACTICE_LINK = /^https:\/\/praxisplan\.at\/([1-9]\d{0,8})\/[^/]*\/ordination\/(\d{1,4})\/?$/;
const ADDRESS = /^(\d{1,2})\.,\s*(.+)$/;

/** Vienna's points are in WGS 84: inside this box or not Vienna at all. */
const inVienna = ([lon, lat]: [number, number]) =>
	lon > 16.1 && lon < 16.7 && lat > 48.0 && lat < 48.4;

/** Parses the Vienna GeoJSON. Throws when the file is not a feature collection. */
export function parseWien(text: string): ParseResult {
	const collection = Collection.parse(JSON.parse(text));
	const result: ParseResult = { source: "wien", lines: 0, rows: [], quarantined: [], skipped: {} };
	for (const [index, raw] of collection.features.entries()) {
		const lineNo = index + 1;
		result.lines++;
		const parsed = Feature.safeParse(raw);
		if (!parsed.success) {
			quarantine(result, lineNo, "schema", raw);
			continue;
		}
		const { properties, geometry } = parsed.data;
		const link = PRACTICE_LINK.exec(properties.INTERNET?.trim() ?? "");
		if (!link) {
			quarantine(result, lineNo, "no practice link", raw);
			continue;
		}
		const address = ADDRESS.exec(properties.ADRESSE.trim());
		const district = Number(address?.[1]);
		if (!address || !(district >= 1 && district <= 23)) {
			quarantine(result, lineNo, "no district", raw);
			continue;
		}
		const name = splitFullName(properties.NAME);
		if (!name?.lastName) {
			quarantine(result, lineNo, "no name", raw);
			continue;
		}
		const coordinates = geometry?.coordinates;
		const display = displayNames(name.firstName, name.lastName);
		result.rows.push({
			source: "at-wien",
			lineNo,
			idScheme: "AT-WIEN",
			nationalId: link[1] ?? "",
			professionCode: AT_DOCTOR,
			titleCode: titleCodeOf(name.titles),
			civilityCode: null,
			firstName: display.firstName,
			lastName: display.lastName,
			firstNameSource: name.firstName,
			lastNameSource: name.lastName,
			specialtyRaw: properties.FACH?.trim() || null,
			specialty: atSpecialtyCodeOf(properties.FACH),
			siteKey: `${link[1]}/${Number(link[2])}`,
			siteName: null,
			street: (address[2] ?? "").trim() || null,
			postcode: `1${String(district).padStart(2, "0")}0`,
			city: "Wien",
			stateCode: "9",
			viennaDistrict: district,
			phone: toE164At(properties.TELEFON, { localAreaCode: "1" }),
			point:
				coordinates && inVienna(coordinates)
					? { x: coordinates[0], y: coordinates[1], srid: 4326 }
					: null,
			main: Number(link[2]) === 1,
		});
	}
	return result;
}
