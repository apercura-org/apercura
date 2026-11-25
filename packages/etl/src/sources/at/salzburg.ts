/**
 * "Ärzte Land Salzburg" and "Zahnärzte Land Salzburg" (Land Salzburg, lists
 * of the Ärztekammer and the Zahnärztekammer, CC BY 4.0): ArcGIS JSON feature
 * sets in MGI / Austria GK M31 (EPSG:31258), transformed to WGS 84 by the
 * merge (PostGIS).
 *
 * Doctors: `Titel`, `Vorname`, `Nachname`, `TitelNachg`, `Strasse`, `HNR`,
 * `PLZ`, `Ort`, `Fach`, `Kategorie`, `Gruppenpraxis` (the group practice's
 * name), `GeschlechtCode` (M/W), `ADRCD` (address register code).
 * Dentists: `Name` (titles and full name), the same address fields.
 *
 * Neither list numbers its people: the key is derived from the names (and the
 * gender for doctors), see `atNameKey`. A person with several rows (specialties,
 * practices) is one page.
 */
import { createHash } from "node:crypto";
import { AT_DENTIST, AT_DOCTOR, atSpecialtyCodeOf } from "@apercura/core/taxonomy";
import { z } from "zod";
import { atNameKey, displayNames, splitFullName, titleCodeOf } from "./names";
import { type AtSourceId, type ParseResult, quarantine } from "./types";

const text = z
	.union([z.string(), z.number()])
	.nullable()
	.optional()
	.transform((value) => (value === null || value === undefined ? "" : String(value).trim()));

const Address = {
	Strasse: text,
	HNR: text,
	PLZ: text,
	Ort: text,
	ADRCD: text,
};

const DoctorAttributes = z.object({
	Titel: text,
	Vorname: text,
	Nachname: text,
	TitelNachg: text,
	Fach: text,
	Gruppenpraxis: text,
	GeschlechtCode: text,
	...Address,
});

const DentistAttributes = z.object({ Name: text, ...Address });

const Feature = z.object({
	attributes: z.record(z.string(), z.unknown()),
	geometry: z.object({ x: z.number(), y: z.number() }).nullable().optional(),
});

const FeatureSet = z.object({
	spatialReference: z.object({ wkid: z.number() }),
	features: z.array(z.unknown()),
});

/** Salzburg in EPSG:31258 metres: inside this box or not Salzburg at all. */
const inSalzburg = (x: number, y: number) =>
	x > 300_000 && x < 500_000 && y > 200_000 && y < 350_000;

/** "5020.0" → "5020". */
const postcodeOf = (value: string) => value.replace(/\.0+$/, "");

const siteKeyOf = (nationalId: string, addressCode: string, street: string, postcode: string) =>
	`${nationalId}/${
		/^\d+$/.test(addressCode)
			? addressCode
			: createHash("sha256").update(`${street}|${postcode}`).digest("hex").slice(0, 12)
	}`;

/** Parses one of the two Salzburg lists. Throws when the file is not an ArcGIS feature set. */
export function parseSalzburg(text: string, kind: "doctors" | "dentists"): ParseResult {
	const set = FeatureSet.parse(JSON.parse(text));
	const srid = set.spatialReference.wkid;
	const source: AtSourceId = kind === "doctors" ? "sbg" : "sbg-zahn";
	const result: ParseResult = { source, lines: 0, rows: [], quarantined: [], skipped: {} };
	for (const [index, raw] of set.features.entries()) {
		const lineNo = index + 1;
		result.lines++;
		const feature = Feature.safeParse(raw);
		if (!feature.success) {
			quarantine(result, lineNo, "schema", raw);
			continue;
		}
		const attributes = (kind === "doctors" ? DoctorAttributes : DentistAttributes).safeParse(
			feature.data.attributes,
		);
		if (!attributes.success) {
			quarantine(result, lineNo, "schema", raw);
			continue;
		}
		const a = attributes.data as z.infer<typeof DoctorAttributes> &
			z.infer<typeof DentistAttributes>;
		const street = [a.Strasse, a.HNR].filter(Boolean).join(" ");
		const postcode = postcodeOf(a.PLZ);
		if (!a.Strasse || !/^\d{4}$/.test(postcode)) {
			quarantine(result, lineNo, "address", raw);
			continue;
		}
		let titles: string;
		let firstName: string;
		let lastName: string;
		let civility: "M" | "MME" | null = null;
		if (kind === "doctors") {
			titles = [a.Titel, a.TitelNachg].filter(Boolean).join(" ");
			firstName = a.Vorname;
			lastName = a.Nachname;
			const gender = a.GeschlechtCode.toUpperCase();
			civility = gender === "W" ? "MME" : gender === "M" ? "M" : null;
		} else {
			const name = splitFullName(a.Name);
			if (!name) {
				quarantine(result, lineNo, "no name", raw);
				continue;
			}
			({ titles, firstName, lastName } = name);
		}
		if (!lastName) {
			quarantine(result, lineNo, "no name", raw);
			continue;
		}
		const nationalId = atNameKey(lastName, firstName, kind === "doctors" ? (civility ?? "") : "");
		const geometry = feature.data.geometry;
		const display = displayNames(firstName, lastName);
		result.rows.push({
			source: kind === "doctors" ? "at-sbg" : "at-sbg-zahn",
			lineNo,
			idScheme: kind === "doctors" ? "AT-SBG" : "AT-SBGZ",
			nationalId,
			professionCode: kind === "doctors" ? AT_DOCTOR : AT_DENTIST,
			titleCode: titleCodeOf(titles),
			civilityCode: civility,
			firstName: display.firstName,
			lastName: display.lastName,
			firstNameSource: firstName,
			lastNameSource: lastName,
			specialtyRaw: kind === "doctors" ? a.Fach || null : null,
			specialty: kind === "doctors" ? atSpecialtyCodeOf(a.Fach) : { kind: "none" },
			siteKey: siteKeyOf(nationalId, a.ADRCD, street, postcode),
			siteName: kind === "doctors" ? a.Gruppenpraxis || null : null,
			street,
			postcode,
			city: a.Ort || null,
			stateCode: "5",
			viennaDistrict: null,
			phone: null,
			point:
				geometry && srid === 31258 && inSalzburg(geometry.x, geometry.y)
					? { x: geometry.x, y: geometry.y, srid }
					: null,
			main: false,
		});
	}
	return result;
}
