/**
 * Slovenian places from the Register of Spatial Units (Register prostorskih enot, RPE) of the
 * Surveying and Mapping Authority (Geodetska uprava Republike Slovenije, GURS), CC BY 4.0, read
 * from its public web feature service: the statistical regions and the postal areas with their
 * outlines, the municipalities, settlements and streets with their names and bounding boxes only
 * (`propertyName`: no geometry, a few megabytes).
 *
 * Mapped onto the kinds of `directory.places`:
 * - the twelve statistical regions (statistične regije) are departments (`1`–`12`,
 *   `/si/druzinski-zdravnik/osrednjeslovenska`), with no region above them;
 * - the 212 municipalities (občine) are communes of their region, which the register does not
 *   name: a municipality is in the region holding most of its settlements; each carries the
 *   postcodes of its settlements.
 *
 * Settlements (naselja), postal areas and streets are no pages: they locate the insurer's
 * practices (`./locate.ts`), and their names write its addresses. They are kept as one document,
 * the locator, in `directory.meta` (`si:locator`), written by the same command.
 */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { slugifySl } from "@apercura/core";
import { SI_REGIONS } from "@apercura/core/country";
import { z } from "zod";
import type { Sql } from "../../lib/db";
import { downloadFile } from "../../lib/files";
import { type ExistingPlace, type PlaceRow, type PlacesStats, writePlaces } from "../../lib/places";
import { AreaIndex, bboxCentre, bboxOf, type Point, type PolygonGeometry } from "./geometry";

/** The RPE's web feature service. */
export const GURS_WFS = "https://ipi.eprostor.gov.si/wfs-si-gurs-rpe/wfs";

/** The key of the locator in `directory.meta`. */
export const SI_LOCATOR_KEY = "si:locator";

/** The layers read, their file in `--source-dir`, and the properties asked for. */
export const SI_PLACE_LAYERS = {
	regions: { typeName: "STATISTICNE_REGIJE", file: "si-regions.json", properties: null },
	postalAreas: { typeName: "POSTNI_OKOLISI", file: "si-postal-areas.json", properties: null },
	municipalities: {
		typeName: "OBCINE",
		file: "si-municipalities.json",
		properties: "SIFRA,NAZIV,NAZIV_DJ,EID_OBCINA",
	},
	settlements: {
		typeName: "NASELJA",
		file: "si-settlements.json",
		properties: "SIFRA,NAZIV,NAZIV_DJ,EID_NASELJE,EID_OBCINA,SESTAVLJENA_SIFRA",
	},
	streets: { typeName: "ULICE", file: "si-streets.json", properties: "NAZIV,NAZIV_DJ,EID_NASELJE" },
} as const;

/** The date of the register's state the places were read at (`{ "date": "YYYY-MM-DD" }`). */
export const SI_PLACES_STATE_FILE = "si-rpe-state.json";

/** The request of a layer: GeoJSON in WGS 84, every feature (the service gives 20,000 at most). */
export function layerUrl(layer: keyof typeof SI_PLACE_LAYERS, base = GURS_WFS): string {
	const { typeName, properties } = SI_PLACE_LAYERS[layer];
	const url = new URL(base);
	url.search = new URLSearchParams({
		service: "WFS",
		version: "2.0.0",
		request: "GetFeature",
		outputFormat: "application/json",
		typeNames: `SI.GURS.RPE:${typeName}`,
		srsName: "EPSG:4326",
		count: "20000",
		...(properties ? { propertyName: properties } : {}),
	}).toString();
	return url.toString();
}

const Code = z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]).transform(String);
const Name = z.string().trim().min(1);
const OptionalName = z
	.string()
	.nullish()
	.transform((value) => value?.trim() || null);
const Ring = z.array(z.tuple([z.number(), z.number()]).rest(z.number()));
const Geometry = z.union([
	z.object({ type: z.literal("Polygon"), coordinates: z.array(Ring) }),
	z.object({ type: z.literal("MultiPolygon"), coordinates: z.array(z.array(Ring)) }),
]);
const BBox = z.array(z.number()).length(4);

const Areas = z.object({
	features: z
		.array(
			z.object({
				geometry: Geometry,
				properties: z.object({ SIFRA: Code, NAZIV: Name, NAZIV_DJ: OptionalName.optional() }),
			}),
		)
		.min(1),
});
const Municipalities = z.object({
	features: z
		.array(
			z.object({
				bbox: BBox.optional(),
				properties: z.object({
					SIFRA: Code,
					NAZIV: Name,
					NAZIV_DJ: OptionalName.optional(),
					EID_OBCINA: z.union([z.string(), z.number()]).transform(String),
				}),
			}),
		)
		.min(1),
});
const Settlements = z.object({
	features: z
		.array(
			z.object({
				bbox: BBox.optional(),
				properties: z.object({
					SIFRA: Code,
					NAZIV: Name,
					NAZIV_DJ: OptionalName.optional(),
					EID_NASELJE: z.union([z.string(), z.number()]).transform(String),
					EID_OBCINA: z.union([z.string(), z.number()]).transform(String),
					SESTAVLJENA_SIFRA: Code,
				}),
			}),
		)
		.min(1),
});
const Streets = z.object({
	features: z.array(
		z.object({
			bbox: BBox.optional(),
			properties: z.object({
				NAZIV: Name,
				NAZIV_DJ: OptionalName.optional(),
				EID_NASELJE: z.union([z.string(), z.number()]).transform(String),
			}),
		}),
	),
});

export type SiArea = {
	code: string;
	name: string;
	nameDj: string | null;
	geometry: PolygonGeometry;
};

export type SiPlaceSources = {
	/** The day of the register's state the places were read at (`YYYY-MM-DD`). */
	date: string;
	regions: SiArea[];
	postalAreas: SiArea[];
	municipalities: {
		code: string;
		name: string;
		nameDj: string | null;
		eid: string;
		centre: Point | null;
	}[];
	settlements: {
		code: string;
		name: string;
		nameDj: string | null;
		eid: string;
		municipalityEid: string;
		centre: Point | null;
	}[];
	streets: { name: string; nameDj: string | null; settlementEid: string; centre: Point | null }[];
};

/** Reads the layers' GeoJSON; throws when a layer is not what the register publishes. */
export function parseSiPlaceSources(
	json: Record<keyof typeof SI_PLACE_LAYERS, unknown>,
	date: string,
): SiPlaceSources {
	const areas = (value: unknown) =>
		Areas.parse(value).features.map((feature) => ({
			code: feature.properties.SIFRA,
			name: feature.properties.NAZIV,
			nameDj: feature.properties.NAZIV_DJ ?? null,
			geometry: feature.geometry as PolygonGeometry,
		}));
	return {
		date,
		regions: areas(json.regions),
		postalAreas: areas(json.postalAreas),
		municipalities: Municipalities.parse(json.municipalities).features.map((feature) => ({
			code: feature.properties.SIFRA,
			name: feature.properties.NAZIV,
			nameDj: feature.properties.NAZIV_DJ ?? null,
			eid: feature.properties.EID_OBCINA,
			centre: feature.bbox ? bboxCentre(feature.bbox) : null,
		})),
		settlements: Settlements.parse(json.settlements).features.map((feature) => ({
			code: feature.properties.SESTAVLJENA_SIFRA,
			name: feature.properties.NAZIV,
			nameDj: feature.properties.NAZIV_DJ ?? null,
			eid: feature.properties.EID_NASELJE,
			municipalityEid: feature.properties.EID_OBCINA,
			centre: feature.bbox ? bboxCentre(feature.bbox) : null,
		})),
		streets: Streets.parse(json.streets).features.map((feature) => ({
			name: feature.properties.NAZIV,
			nameDj: feature.properties.NAZIV_DJ ?? null,
			settlementEid: feature.properties.EID_NASELJE,
			centre: feature.bbox ? bboxCentre(feature.bbox) : null,
		})),
	};
}

/** Reads the layers saved in a directory (fixtures, `--source-dir`). */
export async function readSiPlaceSources(dir: string): Promise<SiPlaceSources> {
	const json = {} as Record<keyof typeof SI_PLACE_LAYERS, unknown>;
	for (const [layer, { file }] of Object.entries(SI_PLACE_LAYERS)) {
		json[layer as keyof typeof SI_PLACE_LAYERS] = JSON.parse(
			await readFile(join(dir, file), "utf8"),
		);
	}
	const state = z
		.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })
		.parse(JSON.parse(await readFile(join(dir, SI_PLACES_STATE_FILE), "utf8")));
	return parseSiPlaceSources(json, state.date);
}

/** Downloads the five layers into `dir`, one request at a time, then reads them. */
export async function fetchSiPlaceSources(
	dir: string,
	today: string,
	base = GURS_WFS,
): Promise<SiPlaceSources> {
	for (const [layer, { file }] of Object.entries(SI_PLACE_LAYERS)) {
		await downloadFile({
			key: layer,
			url: layerUrl(layer as keyof typeof SI_PLACE_LAYERS, base),
			path: join(dir, file),
			text: true,
		});
	}
	await writeFile(join(dir, SI_PLACES_STATE_FILE), JSON.stringify({ date: today }));
	return readSiPlaceSources(dir);
}

/** A settlement of the locator: where a practice of the insurer's lists is put. */
export type SiLocatorSettlement = {
	/** The register's composite code (municipality and settlement: `134035`). */
	code: string;
	name: string;
	nameDj: string | null;
	/** The municipality's code (`61`, Ljubljana). */
	municipality: string;
	/**
	 * The postal areas of the settlement: the one holding its centre first, then those holding its
	 * streets (a city's districts have post offices of their own: `1231 Ljubljana - Črnuče`).
	 */
	postcodes: string[];
	longitude: number;
	latitude: number;
};

/** A street of the locator, with the settlement and postal area it is in. */
export type SiLocatorStreet = {
	name: string;
	nameDj: string | null;
	/** The settlement's composite code. */
	settlement: string;
	postcode: string | null;
	longitude: number | null;
	latitude: number | null;
};

/** What `./locate.ts` reads: the register's settlements, postal areas and street names. */
export type SiLocator = {
	date: string;
	settlements: SiLocatorSettlement[];
	postalAreas: {
		code: string;
		name: string;
		nameDj: string | null;
		longitude: number;
		latitude: number;
	}[];
	streets: SiLocatorStreet[];
};

/**
 * The locator and the places of the register. A settlement's point is the centre of its bounding
 * box, its postal area the one holding that point; a municipality's region is the one holding
 * most of its settlements' points, its point that of its settlement of the same name (its seat),
 * else of its first settlement.
 */
export function buildSiPlaces(sources: SiPlaceSources): {
	locator: SiLocator;
	municipalities: {
		code: string;
		name: string;
		region: string | null;
		point: Point | null;
		postcodes: string[];
	}[];
} {
	const regions = new AreaIndex(
		sources.regions.map((area) => ({ item: area.code, geometry: area.geometry })),
	);
	const postal = new AreaIndex(
		sources.postalAreas.map((area) => ({ item: area.code, geometry: area.geometry })),
	);
	const municipalityOfEid = new Map(sources.municipalities.map((m) => [m.eid, m]));
	const streetsOf = new Map<string, SiLocatorStreet[]>();
	const streets: SiLocatorStreet[] = [];
	const settlementOfEid = new Map(
		sources.settlements.map((settlement) => [settlement.eid, settlement.code]),
	);
	for (const street of sources.streets) {
		const settlement = settlementOfEid.get(street.settlementEid);
		if (!settlement) continue;
		const row: SiLocatorStreet = {
			name: street.name,
			nameDj: street.nameDj,
			settlement,
			postcode: street.centre ? postal.find(street.centre) : null,
			longitude: street.centre ? round(street.centre.longitude) : null,
			latitude: street.centre ? round(street.centre.latitude) : null,
		};
		streets.push(row);
		const list = streetsOf.get(settlement) ?? [];
		list.push(row);
		streetsOf.set(settlement, list);
	}
	streets.sort((a, b) => a.settlement.localeCompare(b.settlement) || a.name.localeCompare(b.name));
	const settlements: SiLocatorSettlement[] = [];
	const votes = new Map<string, Map<string, number>>();
	for (const settlement of sources.settlements) {
		const municipality = municipalityOfEid.get(settlement.municipalityEid);
		if (!municipality || !settlement.centre) continue;
		const region = regions.find(settlement.centre);
		if (region) {
			const tally = votes.get(municipality.code) ?? new Map<string, number>();
			tally.set(region, (tally.get(region) ?? 0) + 1);
			votes.set(municipality.code, tally);
		}
		const own = postal.find(settlement.centre);
		const ofStreets = (streetsOf.get(settlement.code) ?? [])
			.map((street) => street.postcode)
			.filter((code): code is string => Boolean(code) && code !== own);
		settlements.push({
			code: settlement.code,
			name: settlement.name,
			nameDj: settlement.nameDj,
			municipality: municipality.code,
			postcodes: [...new Set([...(own ? [own] : []), ...ofStreets.sort()])],
			longitude: round(settlement.centre.longitude),
			latitude: round(settlement.centre.latitude),
		});
	}
	settlements.sort((a, b) => Number(a.code) - Number(b.code));
	const postalAreas = sources.postalAreas
		.map((area) => {
			// The centre of a postal area: its settlements' points, else its outline's box.
			const own = settlements.filter((settlement) => settlement.postcodes[0] === area.code);
			const box = bboxOf(area.geometry);
			const centre =
				own.length > 0
					? {
							longitude: own.reduce((sum, s) => sum + s.longitude, 0) / own.length,
							latitude: own.reduce((sum, s) => sum + s.latitude, 0) / own.length,
						}
					: { longitude: (box[0] + box[2]) / 2, latitude: (box[1] + box[3]) / 2 };
			return {
				code: area.code,
				name: area.name,
				nameDj: area.nameDj,
				longitude: round(centre.longitude),
				latitude: round(centre.latitude),
			};
		})
		.sort((a, b) => Number(a.code) - Number(b.code));

	const municipalities = sources.municipalities
		.map((municipality) => {
			const own = settlements.filter((settlement) => settlement.municipality === municipality.code);
			const seat =
				own.find((settlement) => settlement.name === municipality.name) ??
				own.find((settlement) => municipality.name.startsWith(settlement.name)) ??
				null;
			const tally = [...(votes.get(municipality.code) ?? new Map<string, number>()).entries()].sort(
				(a, b) => b[1] - a[1] || Number(a[0]) - Number(b[0]),
			);
			let point: Point | null = seat
				? { longitude: seat.longitude, latitude: seat.latitude }
				: (municipality.centre ?? null);
			if (!point && own[0]) point = { longitude: own[0].longitude, latitude: own[0].latitude };
			return {
				code: municipality.code,
				name: municipality.name,
				region: tally[0]?.[0] ?? (point ? regions.find(point) : null),
				point,
				postcodes: [...new Set(own.flatMap((settlement) => settlement.postcodes))].sort(),
			};
		})
		.sort((a, b) => Number(a.code) - Number(b.code));
	return {
		locator: { date: sources.date, settlements, postalAreas, streets },
		municipalities,
	};
}

const round = (value: number) => Math.round(value * 1e6) / 1e6;

/**
 * The place rows of Slovenia. Existing slugs are kept; a renamed place gets a new slug and keeps
 * the old one as an alias, as in France.
 */
export function buildSiPlaceRows(
	municipalities: ReturnType<typeof buildSiPlaces>["municipalities"],
	existing: ExistingPlace[],
): PlaceRow[] {
	const existingByKey = new Map(existing.map((place) => [`${place.kind}:${place.code}`, place]));
	const keep = (kind: PlaceRow["kind"], code: string, name: string, fresh: () => string) => {
		const known = existingByKey.get(`${kind}:${code}`);
		if (known && known.name === name) return { slug: known.slug, previous: null };
		const slug = fresh();
		return { slug, previous: known && known.slug !== slug ? known.slug : null };
	};
	const taken = new Map<string, Set<string>>();
	for (const place of existing) {
		if (place.kind !== "commune") continue;
		const set = taken.get(place.departmentCode ?? "") ?? new Set<string>();
		set.add(place.slug);
		taken.set(place.departmentCode ?? "", set);
	}
	const rows: PlaceRow[] = [];
	for (const [code, name] of Object.entries(SI_REGIONS)) {
		const { slug, previous } = keep("department", code, name, () => slugifySl(name));
		rows.push({
			kind: "department",
			code,
			name,
			slug,
			department_code: code,
			region_code: null,
			parent_kind: null,
			parent_code: null,
			longitude: null,
			latitude: null,
			population: null,
			postcodes: [],
			previous_slug: previous,
		});
	}
	for (const municipality of municipalities) {
		if (!municipality.region || !SI_REGIONS[municipality.region]) continue;
		const region = municipality.region;
		const { slug, previous } = keep("commune", municipality.code, municipality.name, () => {
			const set = taken.get(region) ?? new Set<string>();
			taken.set(region, set);
			const base = slugifySl(municipality.name) || municipality.code;
			const fresh = set.has(base) ? `${base}-${municipality.code}` : base;
			set.add(fresh);
			return fresh;
		});
		rows.push({
			kind: "commune",
			code: municipality.code,
			name: municipality.name,
			slug,
			department_code: region,
			region_code: null,
			parent_kind: "department",
			parent_code: region,
			longitude: municipality.point?.longitude ?? null,
			latitude: municipality.point?.latitude ?? null,
			population: null,
			postcodes: municipality.postcodes,
			previous_slug: previous,
		});
	}
	return rows;
}

/**
 * Upserts Slovenia's places (country `SI`) and its locator; no other market's places are read or
 * touched. Throws when a region would be left without municipalities (a broken layer).
 */
export async function importSiPlaces(
	sql: Sql,
	sources: SiPlaceSources,
	runId: number,
): Promise<PlacesStats & { settlements: number; postalAreas: number; streets: number }> {
	const built = buildSiPlaces(sources);
	const regionsWith = new Set(built.municipalities.map((municipality) => municipality.region));
	const empty = Object.keys(SI_REGIONS).filter((code) => !regionsWith.has(code));
	if (empty.length > 0)
		throw new Error(`statistical regions without municipalities: ${empty.join(", ")}`);
	const stats = await writePlaces(
		sql,
		"SI",
		(existing) => buildSiPlaceRows(built.municipalities, existing),
		runId,
		{ regions: 0, communes: built.municipalities.length, arrondissements: 0 },
	);
	await sql`
		INSERT INTO directory.meta (key, value, updated_at)
		VALUES (${SI_LOCATOR_KEY}, ${JSON.stringify(built.locator)}, now())
		ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = now()
	`;
	return {
		...stats,
		settlements: built.locator.settlements.length,
		postalAreas: built.locator.postalAreas.length,
		streets: built.locator.streets.length,
	};
}

/** The locator written by `importSiPlaces`, or null before Slovenia's places are imported. */
export async function loadSiLocator(sql: Sql): Promise<SiLocator | null> {
	const [row] = await sql<{ value: string }[]>`
		SELECT value FROM directory.meta WHERE key = ${SI_LOCATOR_KEY}
	`;
	return row ? (JSON.parse(row.value) as SiLocator) : null;
}
