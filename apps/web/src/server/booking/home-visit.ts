import { isInServiceArea, normalizeHomeAddress } from "@apercura/core/booking";
import { places, sites } from "@apercura/db/schema";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Executor } from "~/server/db-executor";
import type { AppointmentTypeRow } from "./availability";
import { BookingError } from "./errors";

/*
 * Home visits (issue #75): communes of a service area, by INSEE code, read from the directory's
 * places (communes and municipal arrondissements imported by the ETL), and the patient's address
 * checked against the area before anything is stored.
 */

/** A commune (or arrondissement) of a service area, as printed. */
export interface AreaCommune {
	code: string;
	name: string;
	/** Postcodes of the commune, as published (Paris has 21, most communes one). */
	postcodes: string[];
	departmentCode: string | null;
}

const KINDS = ["commune", "arrondissement"];

const communeColumns = {
	code: places.code,
	name: places.name,
	postcodes: places.postcodes,
	departmentCode: places.departmentCode,
};

/**
 * The communes of these INSEE codes, in the order of `codes`. A code the directory no longer
 * holds (a commune merged since) is left out; a removed commune keeps its name.
 */
export async function areaCommunes(db: Executor, codes: readonly string[]): Promise<AreaCommune[]> {
	if (codes.length === 0) {
		return [];
	}
	const rows = await db
		.select(communeColumns)
		.from(places)
		.where(and(inArray(places.kind, KINDS), inArray(places.code, [...codes])));
	const byCode = new Map(rows.map((row) => [row.code, row]));
	return codes.flatMap((code) => {
		const row = byCode.get(code);
		return row ? [row] : [];
	});
}

/** Name of each commune of `codes` (one query for many appointments). */
export async function communeNames(
	db: Executor,
	codes: readonly (string | null | undefined)[],
): Promise<Map<string, string>> {
	const wanted = [...new Set(codes.filter((code): code is string => Boolean(code)))];
	const rows = await areaCommunes(db, wanted);
	return new Map(rows.map((row) => [row.code, row.name]));
}

/** Whether every code names a current commune or arrondissement of the directory. */
export async function assertKnownCommunes(db: Executor, codes: readonly string[]): Promise<void> {
	if (codes.length === 0) {
		return;
	}
	const rows = await db
		.select({ code: places.code })
		.from(places)
		.where(
			and(inArray(places.kind, KINDS), inArray(places.code, [...codes]), isNull(places.removedAt)),
		);
	if (new Set(rows.map((row) => row.code)).size !== new Set(codes).size) {
		throw new BookingError("UNKNOWN_COMMUNE");
	}
}

/**
 * Communes for the service area editor: names starting with the query first, then by word
 * similarity, or by postcode or INSEE code when the query is a number. Departments are left out.
 */
export async function searchCommunes(
	db: Executor,
	query: string,
	limit = 10,
): Promise<AreaCommune[]> {
	const q = sql`directory.text_norm(${query})`;
	return db
		.select(communeColumns)
		.from(places)
		.where(
			and(
				inArray(places.kind, KINDS),
				isNull(places.removedAt),
				sql`(
					${q} <% directory.text_norm(${places.name})
					or (${q} ~ '^[0-9]{2,5}$' and exists (
						select 1 from unnest(${places.postcodes}) as pc where pc like ${q} || '%'))
					or upper(${query}) = ${places.code}
				)`,
			),
		)
		.orderBy(
			sql`(directory.text_norm(${places.name}) like ${q} || '%') desc`,
			sql`word_similarity(${q}, directory.text_norm(${places.name})) desc`,
			sql`${places.population} desc nulls last`,
			asc(places.id),
		)
		.limit(limit);
}

/**
 * Communes whose centre lies within `radiusKm` of the site, nearest first: a quick way to fill a
 * service area, which the practitioner then trims. A commune split into arrondissements (Paris,
 * Lyon, Marseille) is replaced by its arrondissements.
 */
export async function communesAround(
	db: Executor,
	siteId: number,
	radiusKm: number,
	limit: number,
): Promise<AreaCommune[]> {
	const [site] = await db
		.select({ found: sql<boolean>`${sites.location} is not null` })
		.from(sites)
		.where(eq(sites.id, siteId))
		.limit(1);
	if (!site?.found) {
		throw new BookingError("SITE_NOT_LOCATED");
	}
	return db
		.select(communeColumns)
		.from(places)
		.innerJoin(sites, eq(sites.id, siteId))
		.where(
			and(
				inArray(places.kind, KINDS),
				isNull(places.removedAt),
				sql`${places.centroid} is not null`,
				sql`st_dwithin(${places.centroid}, ${sites.location}, ${radiusKm * 1000})`,
				sql`not exists (
					select 1 from directory.places a
					where a.parent_id = ${places.id} and a.kind = 'arrondissement' and a.removed_at is null
				)`,
			),
		)
		.orderBy(sql`st_distance(${places.centroid}, ${sites.location})`, asc(places.id))
		.limit(limit);
}

/** What the patient typed for a home visit. */
export interface HomeAddressInput {
	street: string;
	communeCode: string;
}

/** A home-visit address checked against the type: ready to encrypt. */
export interface CheckedHomeAddress {
	street: string;
	communeCode: string;
}

/**
 * The address of a home visit, or null for a type at the site (an address sent for one is
 * ignored, never stored). Refuses a missing or malformed address (`INVALID_INPUT`) and a commune
 * outside the type's service area (`OUTSIDE_AREA`), before anything is held or stored.
 */
export function checkHomeAddress(
	type: Pick<AppointmentTypeRow, "location" | "serviceAreaCodes">,
	input: HomeAddressInput | null | undefined,
	options: { required: boolean } = { required: true },
): CheckedHomeAddress | null {
	if (type.location !== "home") {
		return null;
	}
	if (!input) {
		if (options.required) {
			throw new BookingError("INVALID_INPUT");
		}
		return null;
	}
	const street = normalizeHomeAddress(input.street);
	const communeCode = input.communeCode.trim().toUpperCase();
	if (!street) {
		throw new BookingError("INVALID_INPUT");
	}
	if (!isInServiceArea(type.serviceAreaCodes, communeCode)) {
		throw new BookingError("OUTSIDE_AREA");
	}
	return { street, communeCode };
}
