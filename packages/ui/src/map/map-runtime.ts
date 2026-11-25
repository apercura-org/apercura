/**
 * The heavy half of `MapView`: MapLibre GL and its stylesheet. Imported only
 * with a dynamic `import()`, so pages without a map never download it.
 */
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { mapPaletteDarkHex, mapPaletteHex } from "../tokens";
import { type MapStrings, mapLibreLocale } from "./map-strings";
import { type MapStyle, themeMapStyle } from "./map-style";

/*
 * MapLibre runs tile parsing in a standalone module worker. Bundlers cannot see
 * how MapLibre locates it, so point MapLibre at the file the bundler emits.
 */
maplibregl.setWorkerUrl(new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).href);

export interface CreateMapOptions {
	container: HTMLElement;
	styleUrl: string;
	center: { lat: number; lon: number };
	zoom: number;
	markerLabel: string;
	/** Several pins (search results): replaces the single pin and fits them all in view. */
	markers?: { lat: number; lon: number; label: string }[];
	/** Translated control titles, gestures hint and accessible names (MapLibre's are English). */
	strings?: MapStrings;
	signal: AbortSignal;
}

function addPin(map: maplibregl.Map, at: { lat: number; lon: number }, label: string) {
	const pin = document.createElement("div");
	pin.className = "apercura-map-pin";
	pin.setAttribute("role", "img");
	pin.setAttribute("aria-label", label);
	// MapLibre positions the marker element with its own transform, so the shape is a child.
	pin.append(document.createElement("span"));
	new maplibregl.Marker({ element: pin, anchor: "bottom" }).setLngLat([at.lon, at.lat]).addTo(map);
}

const DARK_QUERY = "(prefers-color-scheme: dark)";

/** The page's theme: the stored choice on <html> (/theme.js), else the system's. */
function pageIsDark(): boolean {
	const chosen = document.documentElement.getAttribute("data-theme");
	if (chosen === "dark" || chosen === "light") return chosen === "dark";
	return window.matchMedia(DARK_QUERY).matches;
}

const paletteFor = (dark: boolean) => (dark ? mapPaletteDarkHex : mapPaletteHex);

/**
 * Re-inks the map when the theme changes while it is open (the theme switch, or the system
 * turning dark at dusk). Stops with `signal`.
 */
function followTheme(map: maplibregl.Map, source: MapStyle, signal: AbortSignal) {
	let dark = pageIsDark();
	const update = () => {
		const next = pageIsDark();
		if (next === dark) return;
		dark = next;
		map.setStyle(
			themeMapStyle(source, paletteFor(dark)) as unknown as maplibregl.StyleSpecification,
		);
	};
	const observer = new MutationObserver(update);
	observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
	const media = window.matchMedia(DARK_QUERY);
	media.addEventListener("change", update);
	signal.addEventListener("abort", () => {
		observer.disconnect();
		media.removeEventListener("change", update);
	});
}

export async function createMap({
	container,
	styleUrl,
	center,
	zoom,
	markerLabel,
	markers,
	strings,
	signal,
}: CreateMapOptions) {
	const response = await fetch(styleUrl, { signal });
	if (!response.ok) {
		throw new Error(`Map style request failed: ${response.status}`);
	}
	const source = (await response.json()) as MapStyle;
	const style = themeMapStyle(source, paletteFor(pageIsDark()));
	signal.throwIfAborted();

	const map = new maplibregl.Map({
		container,
		style: style as unknown as maplibregl.StyleSpecification,
		center: [center.lon, center.lat],
		zoom,
		attributionControl: { compact: false },
		cooperativeGestures: true,
		maxZoom: 19,
		locale: mapLibreLocale(strings),
	});
	map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
	followTheme(map, source, signal);

	if (markers && markers.length > 0) {
		for (const marker of markers) addPin(map, marker, marker.label);
		if (markers.length > 1) {
			const bounds = new maplibregl.LngLatBounds();
			for (const marker of markers) bounds.extend([marker.lon, marker.lat]);
			map.fitBounds(bounds, { padding: 48, maxZoom: 16, duration: 0 });
		}
	} else {
		addPin(map, center, markerLabel);
	}

	return map;
}
