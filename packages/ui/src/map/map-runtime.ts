/**
 * The heavy half of `MapView`: MapLibre GL and its stylesheet. Imported only
 * with a dynamic `import()`, so pages without a map never download it.
 */
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
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

export async function createMap({
	container,
	styleUrl,
	center,
	zoom,
	markerLabel,
	markers,
	signal,
}: CreateMapOptions) {
	const response = await fetch(styleUrl, { signal });
	if (!response.ok) {
		throw new Error(`Map style request failed: ${response.status}`);
	}
	const style = themeMapStyle((await response.json()) as MapStyle);
	signal.throwIfAborted();

	const map = new maplibregl.Map({
		container,
		style: style as unknown as maplibregl.StyleSpecification,
		center: [center.lon, center.lat],
		zoom,
		attributionControl: { compact: false },
		cooperativeGestures: true,
		maxZoom: 19,
	});
	map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

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
