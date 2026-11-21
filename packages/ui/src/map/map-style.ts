import { mapPaletteHex } from "../tokens";

/**
 * Re-inks an OpenMapTiles-schema MapLibre style (OpenFreeMap positron or
 * liberty, or any self-hosted equivalent) with the booklet palette. Pure:
 * returns a new style object and never touches the network.
 */

type Paint = Record<string, unknown>;

export interface StyleLayer {
	id: string;
	type: string;
	"source-layer"?: string;
	paint?: Paint;
	layout?: Record<string, unknown>;
	[key: string]: unknown;
}

export interface MapStyle {
	version: number;
	layers: StyleLayer[];
	[key: string]: unknown;
}

type Colors = typeof mapPaletteHex;

function paintFor(layer: StyleLayer, colors: Colors): Paint | null {
	const id = layer.id.toLowerCase();
	const sourceLayer = (layer["source-layer"] ?? "").toLowerCase();
	const is = (...words: string[]) =>
		words.some((word) => id.includes(word) || sourceLayer === word);

	switch (layer.type) {
		case "background":
			return { "background-color": colors.land };
		case "fill":
			if (is("water", "ocean", "lake", "river")) return { "fill-color": colors.water };
			if (is("building"))
				return { "fill-color": colors.building, "fill-outline-color": colors.roadCasing };
			if (is("park", "wood", "forest", "grass", "landcover", "cemetery", "pitch"))
				return { "fill-color": colors.park };
			if (is("landuse", "residential", "aeroway", "industrial"))
				return { "fill-color": colors.landShade };
			return null;
		case "line":
			if (is("water", "river", "waterway", "stream", "canal"))
				return { "line-color": colors.water };
			if (is("boundary", "admin")) return { "line-color": colors.boundary };
			if (is("rail", "transit")) return { "line-color": colors.rail };
			if (is("casing", "outline")) {
				return {
					"line-color": is("motorway", "trunk", "primary")
						? colors.roadMajorCasing
						: colors.roadCasing,
				};
			}
			if (
				is(
					"road",
					"highway",
					"street",
					"path",
					"motorway",
					"trunk",
					"primary",
					"secondary",
					"tertiary",
					"minor",
					"service",
					"bridge",
					"tunnel",
				)
			) {
				return { "line-color": colors.road };
			}
			return null;
		case "symbol":
			return {
				"text-color": is("water", "poi") ? colors.labelMuted : colors.label,
				"text-halo-color": colors.labelHalo,
				"text-halo-width": 1.5,
			};
		default:
			return null;
	}
}

/**
 * Settlement names (city, town, village) are hidden from this zoom on: at the
 * street zoom of a practice map they would sit right under the location pin
 * ("Ly●n"), and the page already prints the address.
 */
export const SETTLEMENT_LABEL_MAX_ZOOM = 13;

const isSettlementLabel = (layer: StyleLayer) =>
	layer.type === "symbol" &&
	(layer["source-layer"] ?? "").toLowerCase() === "place" &&
	/city|town|village|capital|hamlet/i.test(layer.id);

/** Returns a copy of `style` with every recognised layer re-inked. Unknown layers are kept as they are. */
export function themeMapStyle<T extends MapStyle>(style: T, colors: Colors = mapPaletteHex): T {
	return {
		...style,
		layers: style.layers.map((layer) => {
			const paint = paintFor(layer, colors);
			const themed = paint ? { ...layer, paint: { ...layer.paint, ...paint } } : layer;
			if (!isSettlementLabel(layer)) {
				return themed;
			}
			const maxzoom =
				typeof layer.maxzoom === "number"
					? Math.min(layer.maxzoom, SETTLEMENT_LABEL_MAX_ZOOM)
					: SETTLEMENT_LABEL_MAX_ZOOM;
			return { ...themed, maxzoom };
		}),
	};
}

/** Default public style: OpenFreeMap positron (OpenStreetMap data, no API key). */
export const DEFAULT_MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/positron";
