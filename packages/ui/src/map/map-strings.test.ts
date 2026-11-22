import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { MAP_STRING_KEYS, type MapStrings, mapLibreLocale } from "./map-strings";

/** The string ids MapLibre declares in its default (English) locale. */
function mapLibreIds(): Set<string> {
	const root = dirname(createRequire(import.meta.url).resolve("maplibre-gl/package.json"));
	const source = readFileSync(join(root, "src/ui/default_locale.ts"), "utf8");
	return new Set([...source.matchAll(/'([A-Za-z]+\.[A-Za-z]+)':/g)].map((match) => match[1] ?? ""));
}

const strings = Object.fromEntries(
	MAP_STRING_KEYS.map((key) => [key, `translated ${key}`]),
) as MapStrings;

describe("mapLibreLocale", () => {
	it("maps every key to a string id MapLibre knows", () => {
		const known = mapLibreIds();
		const locale = mapLibreLocale(strings);
		expect(Object.keys(locale)).toHaveLength(MAP_STRING_KEYS.length);
		for (const id of Object.keys(locale)) expect(known, id).toContain(id);
	});

	it("covers the strings of the controls and gestures the map uses", () => {
		const locale = mapLibreLocale(strings);
		expect(locale["CooperativeGesturesHandler.MacHelpText"]).toBe("translated scrollZoomMac");
		expect(locale["CooperativeGesturesHandler.WindowsHelpText"]).toBe(
			"translated scrollZoomWindows",
		);
		expect(locale["CooperativeGesturesHandler.MobileHelpText"]).toBe("translated twoFingers");
		expect(locale["NavigationControl.ZoomIn"]).toBe("translated zoomIn");
		expect(locale["AttributionControl.ToggleAttribution"]).toBe("translated toggleAttribution");
		expect(locale["Map.Title"]).toBe("translated map");
	});

	it("keeps MapLibre's defaults without strings", () => {
		expect(mapLibreLocale(undefined)).toEqual({});
		expect(mapLibreLocale({ zoomIn: "" })).toEqual({});
	});
});
