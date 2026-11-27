/**
 * The little plane geometry the Slovenian places need, on WGS 84 longitudes and latitudes
 * (Slovenia spans three degrees: a ray cast on degrees decides inside or outside as well as on a
 * projection would). Pure functions, no I/O.
 */

export type Point = { longitude: number; latitude: number };

/** A GeoJSON polygon or multipolygon's coordinates, `[longitude, latitude]` pairs. */
export type PolygonGeometry =
	| { type: "Polygon"; coordinates: number[][][] }
	| { type: "MultiPolygon"; coordinates: number[][][][] };

/** `[west, south, east, north]`. */
export type BBox = [number, number, number, number];

/** The centre of a bounding box. */
export function bboxCentre(bbox: readonly number[]): Point | null {
	const [west, south, east, north] = bbox;
	if (
		west === undefined ||
		south === undefined ||
		east === undefined ||
		north === undefined ||
		![west, south, east, north].every(Number.isFinite)
	) {
		return null;
	}
	return { longitude: (west + east) / 2, latitude: (south + north) / 2 };
}

/** The bounding box of a polygon or multipolygon. */
export function bboxOf(geometry: PolygonGeometry): BBox {
	const box: BBox = [Infinity, Infinity, -Infinity, -Infinity];
	const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
	for (const polygon of polygons) {
		for (const [longitude = 0, latitude = 0] of polygon[0] ?? []) {
			box[0] = Math.min(box[0], longitude);
			box[1] = Math.min(box[1], latitude);
			box[2] = Math.max(box[2], longitude);
			box[3] = Math.max(box[3], latitude);
		}
	}
	return box;
}

const inBox = (box: BBox, point: Point) =>
	point.longitude >= box[0] &&
	point.longitude <= box[2] &&
	point.latitude >= box[1] &&
	point.latitude <= box[3];

/** True when the point is inside the ring (even-odd rule; a point on an edge may go either way). */
function inRing(ring: readonly number[][], point: Point): boolean {
	let inside = false;
	for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
		const [xi = 0, yi = 0] = ring[i] ?? [];
		const [xj = 0, yj = 0] = ring[j] ?? [];
		if (
			yi > point.latitude !== yj > point.latitude &&
			point.longitude < ((xj - xi) * (point.latitude - yi)) / (yj - yi) + xi
		) {
			inside = !inside;
		}
	}
	return inside;
}

/** True when the point is inside the polygon or one of the multipolygon's parts (holes out). */
export function contains(geometry: PolygonGeometry, point: Point, box?: BBox): boolean {
	if (box && !inBox(box, point)) return false;
	const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
	return polygons.some(
		([outer, ...holes]) =>
			outer !== undefined && inRing(outer, point) && !holes.some((hole) => inRing(hole, point)),
	);
}

/** A squared distance on the plane, with longitudes shrunk to the latitude (enough to rank). */
export function distance2(a: Point, b: Point): number {
	const dx = (a.longitude - b.longitude) * Math.cos((a.latitude * Math.PI) / 180);
	const dy = a.latitude - b.latitude;
	return dx * dx + dy * dy;
}

/** An index of areas to find the one containing a point (bounding boxes first). */
export class AreaIndex<T> {
	private readonly areas: { item: T; geometry: PolygonGeometry; box: BBox; centre: Point }[];

	constructor(items: readonly { item: T; geometry: PolygonGeometry }[]) {
		this.areas = items.map(({ item, geometry }) => {
			const box = bboxOf(geometry);
			return {
				item,
				geometry,
				box,
				centre: { longitude: (box[0] + box[2]) / 2, latitude: (box[1] + box[3]) / 2 },
			};
		});
	}

	/** The area containing the point, else the one whose box centre is nearest (a point on a border). */
	find(point: Point): T | null {
		for (const area of this.areas) {
			if (contains(area.geometry, point, area.box)) return area.item;
		}
		let best: { item: T; d: number } | null = null;
		for (const area of this.areas) {
			if (!inBox(area.box, point)) continue;
			const d = distance2(area.centre, point);
			if (!best || d < best.d) best = { item: area.item, d };
		}
		return best?.item ?? null;
	}
}
