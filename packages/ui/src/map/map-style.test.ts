import { describe, expect, it } from "vitest";
import { mapPaletteDarkHex, mapPaletteHex } from "../tokens";
import { type MapStyle, SETTLEMENT_LABEL_MAX_ZOOM, themeMapStyle } from "./map-style";

const style: MapStyle = {
	version: 8,
	name: "fixture",
	layers: [
		{ id: "background", type: "background", paint: { "background-color": "#f8f4f0" } },
		{ id: "water", type: "fill", "source-layer": "water", paint: { "fill-color": "#aad" } },
		{ id: "building", type: "fill", "source-layer": "building", paint: { "fill-opacity": 0.5 } },
		{ id: "highway_primary_casing", type: "line", "source-layer": "transportation" },
		{ id: "highway_minor", type: "line", "source-layer": "transportation" },
		{ id: "place_city", type: "symbol", "source-layer": "place" },
		{ id: "place_suburb", type: "symbol", "source-layer": "place" },
		{ id: "hillshade", type: "hillshade" },
	],
};

describe("themeMapStyle", () => {
	const themed = themeMapStyle(style);
	const paint = (id: string) => themed.layers.find((layer) => layer.id === id)?.paint;

	it("re-inks known layers with the site palette", () => {
		expect(paint("background")).toEqual({ "background-color": mapPaletteHex.land });
		expect(paint("water")).toEqual({ "fill-color": mapPaletteHex.water });
		expect(paint("highway_primary_casing")).toEqual({
			"line-color": mapPaletteHex.roadMajorCasing,
		});
		expect(paint("highway_minor")).toEqual({ "line-color": mapPaletteHex.road });
		expect(paint("place_city")).toMatchObject({ "text-color": mapPaletteHex.label });
	});

	it("keeps unrelated paint properties and unknown layers", () => {
		expect(paint("building")).toMatchObject({
			"fill-opacity": 0.5,
			"fill-color": mapPaletteHex.building,
		});
		expect(themed.layers.find((layer) => layer.id === "hillshade")).toBe(style.layers[7]);
		expect(themed.name).toBe("fixture");
	});

	it("hides settlement names at practice zoom so the pin never covers them", () => {
		const layer = (id: string) => themed.layers.find((item) => item.id === id);
		expect(layer("place_city")?.maxzoom).toBe(SETTLEMENT_LABEL_MAX_ZOOM);
		expect(layer("place_suburb")?.maxzoom).toBeUndefined();
	});

	it("does not mutate its input", () => {
		expect(style.layers[0]?.paint).toEqual({ "background-color": "#f8f4f0" });
	});

	it("uses hex colours MapLibre can parse", () => {
		for (const value of [...Object.values(mapPaletteHex), ...Object.values(mapPaletteDarkHex)]) {
			expect(value).toMatch(/^#[0-9a-f]{6}$/);
		}
	});

	it("re-inks the same layers with the dark palette for the dark theme", () => {
		const dark = themeMapStyle(style, mapPaletteDarkHex);
		const darkPaint = (id: string) => dark.layers.find((layer) => layer.id === id)?.paint;
		expect(darkPaint("background")).toEqual({ "background-color": mapPaletteDarkHex.land });
		expect(darkPaint("place_city")).toMatchObject({ "text-color": mapPaletteDarkHex.label });
		expect(mapPaletteDarkHex.land).not.toBe(mapPaletteHex.land);
	});
});
