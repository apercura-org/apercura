/**
 * "Niedergelassene Ärzte Steiermark" (Land Steiermark, CC BY 4.0): a point
 * shapefile in a ZIP, ETRS89 longitude/latitude (as good as WGS 84 at this
 * scale). One record per doctor, practice and specialty:
 *
 * - `ARZTNR`: the doctor's number, the stable key;
 * - `GRDTITEL` (professional and degree titles), `VERLTITEL` (academic
 *   titles), `VORNAME`, `NACHNAME`;
 * - `STRASSE`, `PLZ`, `ORT`, `ADRCODE` (the address code of the Austrian
 *   address register, the practice key when present);
 * - `FACH`: "AM - …" (general practitioner) or "FA - …" (specialist);
 * - `ORDINATION`: `Hauptordination` or `Zweitordination`.
 *
 * Records without an address (no street, no postcode) are skipped: a page
 * needs a place.
 */
import { createHash } from "node:crypto";
import { AT_DOCTOR, atSpecialtyCodeOf } from "@apercura/core/taxonomy";
import { readDbf, readShpPoints } from "../../lib/shapefile";
import { readZipEntries } from "../../lib/zip";
import { displayNames, isTitleToken, titleCodeOf } from "./names";
import { type ParseResult, quarantine, skip } from "./types";

const REQUIRED = ["ARZTNR", "NACHNAME", "VORNAME", "STRASSE", "PLZ", "ORT", "FACH", "ORDINATION"];

/** Styria's points are in degrees: inside this box or not in Styria at all. */
const inStyria = (x: number, y: number) => x > 13.4 && x < 16.3 && y > 46.5 && y < 47.9;

/** Parses the Styria ZIP. Throws when the archive or its shapefile is unreadable. */
export function parseSteiermark(archive: Buffer): ParseResult {
	const entries = readZipEntries(archive, (name) => /\.(dbf|shp)$/i.test(name));
	const dbf = entries.find((entry) => /\.dbf$/i.test(entry.name));
	const shp = entries.find((entry) => /\.shp$/i.test(entry.name));
	if (!dbf || !shp) throw new Error("Styria archive has no .dbf and .shp");
	const table = readDbf(dbf.data);
	const points = readShpPoints(shp.data);
	const missing = REQUIRED.filter((name) => !table.fields.some((field) => field.name === name));
	if (missing.length > 0) throw new Error(`Styria table lacks ${missing.join(", ")}`);
	if (points.length !== table.records.length) {
		throw new Error(`Styria: ${table.records.length} records but ${points.length} points`);
	}
	const result: ParseResult = { source: "stmk", lines: 0, rows: [], quarantined: [], skipped: {} };
	for (const [index, record] of table.records.entries()) {
		const lineNo = index + 1;
		result.lines++;
		const number = record.ARZTNR ?? "";
		if (!/^[1-9]\d{0,8}$/.test(number)) {
			quarantine(result, lineNo, "no doctor number", record);
			continue;
		}
		const lastName = (record.NACHNAME ?? "").trim();
		if (!lastName) {
			quarantine(result, lineNo, "no name", record);
			continue;
		}
		const street = (record.STRASSE ?? "").trim();
		const postcode = (record.PLZ ?? "").trim();
		if (!street || !postcode) {
			skip(result, "no address");
			continue;
		}
		if (!/^\d{4}$/.test(postcode)) {
			quarantine(result, lineNo, "postcode", record);
			continue;
		}
		const titles = [record.GRDTITEL, record.VERLTITEL]
			.map((value) => (value ?? "").replace(/^,\s*/, "").trim())
			.filter(Boolean)
			.join(" ");
		// A first name field that still holds a title ("Dr. Anna") keeps the name only.
		const firstName = (record.VORNAME ?? "")
			.split(/\s+/)
			.filter((token) => token && !isTitleToken(token))
			.join(" ");
		const point = points[index];
		const addressCode = (record.ADRCODE ?? "").trim();
		const siteKey = `${number}/${
			/^\d+$/.test(addressCode)
				? addressCode
				: createHash("sha256").update(`${street}|${postcode}`).digest("hex").slice(0, 12)
		}`;
		const display = displayNames(firstName, lastName);
		result.rows.push({
			source: "at-stmk",
			lineNo,
			idScheme: "AT-STMK",
			nationalId: number,
			professionCode: AT_DOCTOR,
			titleCode: titleCodeOf(titles),
			civilityCode: null,
			firstName: display.firstName,
			lastName: display.lastName,
			firstNameSource: firstName,
			lastNameSource: lastName,
			specialtyRaw: (record.FACH ?? "").trim() || null,
			specialty: atSpecialtyCodeOf(record.FACH),
			siteKey,
			siteName: null,
			street,
			postcode,
			city: (record.ORT ?? "").trim() || null,
			stateCode: "6",
			viennaDistrict: null,
			phone: null,
			point: point && inStyria(point.x, point.y) ? { x: point.x, y: point.y, srid: 4326 } : null,
			main: /^haupt/i.test(record.ORDINATION ?? ""),
		});
	}
	return result;
}
