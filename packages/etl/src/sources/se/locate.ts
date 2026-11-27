/**
 * Placing the Swedish facilities in the municipalities of `etl:places --country se`:
 * - a pharmacy by the municipality its register names (`Kommun`, compared without case, hyphens
 *   or the word `kommun`); its county is the municipality's. It is located at the municipality's
 *   point (city precision, no map pin): the register gives no coordinates, and Lantmäteriet's
 *   address points are not read (`docs/data-requests/se.md`);
 * - a health centre by its own point: the municipality of its region's counties whose boundary
 *   holds it, else the one its post town names, else the nearest within 10 km (SCB's simplified
 *   boundaries leave shores and islands outside every municipality: Styrsö, 7 km off Göteborg's).
 *   It is located at its own point.
 */
import type { Sql } from "../../lib/db";
import { placeKey } from "./text";
import type { ParseResult, SeFacility, SeSourceId } from "./types";

export type SeMunicipality = { code: string; name: string; county: string };

/** How a facility was placed (`stats.sources.<source>.placed`). */
export type SePlacedBy = "kommun" | "boundary" | "postTown" | "nearest" | "unplaced";

export type SeLocation = { code: string; by: Exclude<SePlacedBy, "unplaced">; city: string | null };

export type LocatedSeFacility = SeFacility & { location: SeLocation };

export type SePlacedList = {
	source: SeSourceId;
	rows: LocatedSeFacility[];
	placed: Partial<Record<SePlacedBy, number>>;
};

/** The municipalities of Sweden's places, by name key. */
export class SeLocator {
	private readonly byName = new Map<string, SeMunicipality>();
	readonly municipalities: ReadonlyMap<string, SeMunicipality>;

	constructor(municipalities: readonly SeMunicipality[]) {
		this.municipalities = new Map(
			municipalities.map((municipality) => [municipality.code, municipality]),
		);
		for (const municipality of municipalities) {
			this.byName.set(placeKey(municipality.name), municipality);
		}
	}

	get count(): number {
		return this.municipalities.size;
	}

	/** The municipality a name names (`Upplands väsby`, `Malung-Sälen`), or undefined. */
	ofName(name: string | null | undefined): SeMunicipality | undefined {
		return this.byName.get(placeKey(name));
	}

	/**
	 * A facility's post town as a page prints it: the municipality's spelling when they are the
	 * same name (`Upplands väsby` → `Upplands Väsby`), else the list's.
	 */
	cityOf(city: string | null, municipality: SeMunicipality): string | null {
		if (!city) return null;
		return placeKey(city) === placeKey(municipality.name) ? municipality.name : city;
	}
}

/** The municipalities of Sweden's places. */
export async function loadSeLocator(sql: Sql): Promise<SeLocator> {
	const rows = await sql<SeMunicipality[]>`
		SELECT code, name, department_code AS county FROM directory.places
		WHERE country = 'SE' AND kind = 'commune' AND removed_at IS NULL
	`;
	return new SeLocator(rows);
}

/** How far from a municipality's simplified boundary a health centre is still placed in it. */
export const NEAREST_METRES = 10_000;

export type SePointPlace = { boundary: string | null; nearest: string | null };

/**
 * The municipality of `counties` whose boundary holds each point, and the nearest one within
 * `NEAREST_METRES`, from `directory.place_lookup`.
 */
export async function locateSePoints(
	sql: Sql,
	points: readonly { key: string; longitude: number; latitude: number }[],
	counties: readonly string[],
): Promise<Map<string, SePointPlace>> {
	const found = new Map<string, SePointPlace>();
	for (let index = 0; index < points.length; index += 2_000) {
		const chunk = JSON.stringify(points.slice(index, index + 2_000));
		const rows = await sql<{ key: string; boundary: string | null; nearest: string | null }[]>`
			WITH pts AS (
				SELECT r.key, ST_SetSRID(ST_MakePoint(r.longitude, r.latitude), 4326) AS point
				FROM jsonb_to_recordset(${chunk}::text::jsonb)
					AS r (key text, longitude double precision, latitude double precision)
			),
			areas AS (
				SELECT p.code, l.area FROM directory.place_lookup l
				JOIN directory.places p ON p.id = l.place_id AND p.kind = 'commune' AND p.removed_at IS NULL
				WHERE l.country = 'SE' AND p.department_code = ANY (${counties as string[]}::text[])
			)
			SELECT pts.key,
				(SELECT a.code FROM areas a WHERE ST_Intersects(a.area, pts.point)
					ORDER BY a.code LIMIT 1) AS boundary,
				(SELECT a.code FROM areas a
					WHERE ST_DWithin(a.area::geography, pts.point::geography, ${NEAREST_METRES})
					ORDER BY ST_Distance(a.area::geography, pts.point::geography), a.code LIMIT 1) AS nearest
			FROM pts
		`;
		for (const row of rows) found.set(row.key, { boundary: row.boundary, nearest: row.nearest });
	}
	return found;
}

/**
 * Places a list's facilities (by name, or by the point PostGIS found each in); a facility that
 * cannot be placed is quarantined in `result` ("not placed", "outside the region").
 */
export function placeSeList(
	result: ParseResult,
	locator: SeLocator,
	points: ReadonlyMap<string, SePointPlace>,
	counties: readonly string[] | null,
): SePlacedList {
	const placed: SePlacedList["placed"] = {};
	const rows: LocatedSeFacility[] = [];
	const inRegion = (municipality: SeMunicipality | undefined) =>
		municipality && (!counties || counties.includes(municipality.county))
			? municipality
			: undefined;
	for (const row of result.rows) {
		let municipality: SeMunicipality | undefined;
		let by: SeLocation["by"] = "kommun";
		if (row.kommun !== null) {
			municipality = locator.ofName(row.kommun);
		} else {
			const point = points.get(row.nationalId);
			const boundary = point?.boundary ? locator.municipalities.get(point.boundary) : undefined;
			const postTown = inRegion(locator.ofName(row.city));
			const nearest = point?.nearest ? locator.municipalities.get(point.nearest) : undefined;
			municipality = boundary ?? postTown ?? nearest;
			by = boundary ? "boundary" : postTown ? "postTown" : "nearest";
		}
		if (!municipality) {
			placed.unplaced = (placed.unplaced ?? 0) + 1;
			result.quarantined.push({ lineNo: row.lineNo, reason: "not placed", sample: row.nationalId });
			continue;
		}
		if (counties && !counties.includes(municipality.county)) {
			placed.unplaced = (placed.unplaced ?? 0) + 1;
			result.quarantined.push({
				lineNo: row.lineNo,
				reason: "outside the region",
				sample: row.nationalId,
			});
			continue;
		}
		placed[by] = (placed[by] ?? 0) + 1;
		rows.push({
			...row,
			location: { code: municipality.code, by, city: locator.cityOf(row.city, municipality) },
		});
	}
	return { source: result.source, rows, placed };
}
