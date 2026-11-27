/**
 * Placing the Irish facilities in the places of `etl:places --country ie`, never by Eircode (the
 * Eircode database and its coordinates are not open data):
 * - a register's facility (a pharmacy, a nursing home) by the town and county its list writes:
 *   the town is looked for among the county's census towns by name (or a part of a compound
 *   name, `Stranorlar` in Ballybofey-Stranorlar), then by their other names (the gazetteer's
 *   localities, `Tallaght` in Dublin), trying the town column first, then the address's parts
 *   from the end; else the only town of that name or other name in the whole country, when its
 *   built-up area reaches into the list's county across the border (Athlone, a Westmeath town,
 *   for a pharmacy in Monksland whose register says Co. Roscommon); else the county itself
 *   (placed, not located). It is located at its town's point (city precision, no map pin);
 * - an HSE facility by its layer's point: the town whose boundary holds it, else the town its
 *   address names in the county whose boundary holds it, else that county, else the county its
 *   address names. It is located at its own point.
 */
import type { Sql } from "../../lib/db";
import { cleanText, compoundParts, townKey } from "./names";
import type { IeFacility } from "./types";

export type IeTownEntry = {
	code: string;
	name: string;
	countyCode: string;
	aliases: string[];
	/** Every county the town's built-up area reaches into (its own, and across a border: Athlone into Roscommon). */
	counties: string[];
};

/** How a facility was placed (`stats.place.<source>.<how>`). */
export type IePlacedBy =
	| "town"
	| "alias"
	| "otherCounty"
	| "county"
	| "point"
	| "addressTown"
	| "pointCounty"
	| "addressCounty";

export type IeLocation = {
	/** `commune` (a census town) or `department` (a county). */
	kind: "commune" | "department";
	code: string;
	by: IePlacedBy;
	/** The town as the page prints it under the street (`Tallaght`, `Dublin 15`), or null. */
	city: string | null;
	/** The street lines as the page prints them, or null. */
	street: string | null;
};

/** A key's places, kept only while it names one place. */
class KeyIndex {
	private readonly codes = new Map<string, Set<string>>();

	add(key: string, code: string) {
		if (!key) return;
		const set = this.codes.get(key) ?? new Set<string>();
		set.add(code);
		this.codes.set(key, set);
	}

	/** The one place of a key, or null when there is none or more than one. */
	only(key: string): string | null {
		const set = this.codes.get(key);
		return set?.size === 1 ? ([...set][0] ?? null) : null;
	}
}

/** The keys a town is matched by: its name and its compound name's parts. */
const nameKeys = (name: string) => [townKey(name), ...compoundParts(name).map(townKey)];

export class IeLocator {
	private readonly towns = new Map<string, IeTownEntry>();
	private readonly namesByCounty = new Map<string, KeyIndex>();
	private readonly aliasesByCounty = new Map<string, KeyIndex>();
	private readonly names = new KeyIndex();
	private readonly aliases = new KeyIndex();
	private readonly counties: ReadonlySet<string>;

	constructor(towns: readonly IeTownEntry[], counties: readonly string[]) {
		this.counties = new Set(counties);
		for (const town of towns) {
			this.towns.set(town.code, town);
			const names = this.namesByCounty.get(town.countyCode) ?? new KeyIndex();
			this.namesByCounty.set(town.countyCode, names);
			const aliases = this.aliasesByCounty.get(town.countyCode) ?? new KeyIndex();
			this.aliasesByCounty.set(town.countyCode, aliases);
			for (const key of nameKeys(town.name)) {
				names.add(key, town.code);
				this.names.add(key, town.code);
			}
			for (const alias of town.aliases) {
				aliases.add(townKey(alias), town.code);
				this.aliases.add(townKey(alias), town.code);
			}
		}
	}

	get townCount() {
		return this.towns.size;
	}

	/** True when `value` names the town (by its name, a part of it, or another name). */
	private isNameOf(code: string, value: string): boolean {
		const town = this.towns.get(code);
		const key = townKey(value);
		if (!town || !key) return false;
		return (
			nameKeys(town.name).includes(key) || town.aliases.some((alias) => townKey(alias) === key)
		);
	}

	/**
	 * The street and the town a page prints: the register's town column when it has one, else
	 * the address part naming the facility's town, else (a facility placed in its county, or by
	 * a point outside the part's names) the address's last part when it has two or more.
	 */
	private address(facility: IeFacility, townCode: string | null, matched: string | null) {
		if (facility.townColumn !== null || facility.street !== null) {
			return { city: facility.townColumn, street: facility.street };
		}
		const parts = facility.addressParts;
		let at = matched === null ? -1 : parts.lastIndexOf(matched);
		if (at < 0 && townCode) at = parts.findLastIndex((part) => this.isNameOf(townCode, part));
		if (at < 0) at = parts.findLastIndex((part) => /^dublin\s*\d{1,2}w?$/i.test(part));
		if (at < 0 && parts.length >= 2) at = parts.length - 1;
		const city = at < 0 ? null : (parts[at] ?? null);
		const street = parts.filter((_, index) => index !== at).join(", ");
		return { city, street: street || null };
	}

	/** The county's town one of the facility's towns names, by name then other name, and which one. */
	private inCounty(facility: IeFacility, county: string) {
		const names = this.namesByCounty.get(county);
		const aliases = this.aliasesByCounty.get(county);
		for (const candidate of facility.towns) {
			const key = townKey(candidate);
			if (!key) continue;
			const byName = names?.only(key);
			if (byName) return { code: byName, by: "town" as const, candidate };
			const byAlias = aliases?.only(key);
			if (byAlias) return { code: byAlias, by: "alias" as const, candidate };
		}
		return null;
	}

	/** Places a register's facility by the towns its list writes (see the module's comment). */
	placeByName(facility: IeFacility): IeLocation | null {
		const county =
			facility.countyCode && this.counties.has(facility.countyCode) ? facility.countyCode : null;
		const at = (code: string, by: IePlacedBy, matched: string): IeLocation => ({
			kind: "commune",
			code,
			by,
			...this.address(facility, code, matched),
		});
		const own = county ? this.inCounty(facility, county) : null;
		if (own) return at(own.code, own.by, own.candidate);
		for (const candidate of facility.towns) {
			const key = townKey(candidate);
			if (!key) continue;
			const other = this.names.only(key) ?? this.aliases.only(key);
			// Only a town across the border: a name alone (Beaumont, Grange, Clonard) is too common.
			const reaches = other && county ? this.towns.get(other)?.counties.includes(county) : false;
			if (other && reaches) return at(other, "otherCounty", candidate);
		}
		if (county) {
			return {
				kind: "department",
				code: county,
				by: "county",
				...this.address(facility, null, null),
			};
		}
		return null;
	}

	/**
	 * Places an HSE facility by what PostGIS found its point in (`locateIePoints`): its town;
	 * else the town its address names in the county holding the point (a hospital's grounds at
	 * the edge of its town's built-up area: Cavan General Hospital); else that county, else the
	 * county its address names.
	 */
	placeByPoint(
		facility: IeFacility,
		found: { town: string | null; county: string | null },
	): IeLocation | null {
		if (found.town && this.towns.has(found.town)) {
			return {
				kind: "commune",
				code: found.town,
				by: "point",
				...this.address(facility, found.town, null),
			};
		}
		const named = found.county ? this.inCounty(facility, found.county) : null;
		if (named) {
			return {
				kind: "commune",
				code: named.code,
				by: "addressTown",
				...this.address(facility, named.code, named.candidate),
			};
		}
		const county =
			found.county && this.counties.has(found.county)
				? { code: found.county, by: "pointCounty" as const }
				: facility.countyCode && this.counties.has(facility.countyCode)
					? { code: facility.countyCode, by: "addressCounty" as const }
					: null;
		if (!county) return null;
		return {
			kind: "department",
			code: county.code,
			by: county.by,
			...this.address(facility, null, null),
		};
	}

	/** The county of a town. */
	countyOf(code: string): string | null {
		return this.towns.get(code)?.countyCode ?? null;
	}
}

/** Reads Ireland's towns, counties and the towns' other names (`etl:places --country ie`). */
export async function loadIeLocator(sql: Sql): Promise<IeLocator> {
	// The counties a town's area reaches into: their interiors meet (a shared border is not enough).
	const towns = await sql<
		{
			code: string;
			name: string;
			county: string;
			aliases: string[] | null;
			counties: string[] | null;
		}[]
	>`
		SELECT p.code, p.name, p.department_code AS county, l.aliases,
			(SELECT array_agg(d.code ORDER BY d.code)
				FROM directory.place_lookup cl
				JOIN directory.places d ON d.id = cl.place_id AND d.kind = 'department' AND d.removed_at IS NULL
				WHERE cl.country = 'IE' AND l.area IS NOT NULL AND ST_Intersects(cl.area, l.area)
					AND ST_Relate(cl.area, l.area, '2********')) AS counties
		FROM directory.places p
		LEFT JOIN directory.place_lookup l ON l.place_id = p.id
		WHERE p.country = 'IE' AND p.kind = 'commune' AND p.removed_at IS NULL
	`;
	const counties = await sql<{ code: string }[]>`
		SELECT code FROM directory.places
		WHERE country = 'IE' AND kind = 'department' AND removed_at IS NULL
	`;
	return new IeLocator(
		towns.map((town) => ({
			code: town.code,
			name: cleanText(town.name),
			countyCode: town.county,
			aliases: town.aliases ?? [],
			counties: town.counties ?? [town.county],
		})),
		counties.map((county) => county.code),
	);
}

/**
 * The town and the county whose stored boundaries hold each point (`directory.place_lookup`),
 * by the point's key.
 */
export async function locateIePoints(
	sql: Sql,
	points: readonly { key: string; longitude: number; latitude: number }[],
): Promise<Map<string, { town: string | null; county: string | null }>> {
	const found = new Map<string, { town: string | null; county: string | null }>();
	for (let index = 0; index < points.length; index += 2_000) {
		const chunk = JSON.stringify(points.slice(index, index + 2_000));
		const rows = await sql<{ key: string; town: string | null; county: string | null }[]>`
			WITH pts AS (
				SELECT r.key, ST_SetSRID(ST_MakePoint(r.longitude, r.latitude), 4326) AS point
				FROM jsonb_to_recordset(${chunk}::text::jsonb)
					AS r (key text, longitude double precision, latitude double precision)
			)
			SELECT pts.key,
				(SELECT p.code FROM directory.place_lookup l
					JOIN directory.places p ON p.id = l.place_id AND p.kind = 'commune' AND p.removed_at IS NULL
					WHERE l.country = 'IE' AND ST_Intersects(l.area, pts.point)
					ORDER BY p.population DESC NULLS LAST, p.code LIMIT 1) AS town,
				(SELECT p.code FROM directory.place_lookup l
					JOIN directory.places p ON p.id = l.place_id AND p.kind = 'department' AND p.removed_at IS NULL
					WHERE l.country = 'IE' AND ST_Intersects(l.area, pts.point)
					ORDER BY p.code LIMIT 1) AS county
			FROM pts
		`;
		for (const row of rows) found.set(row.key, { town: row.town, county: row.county });
	}
	return found;
}
