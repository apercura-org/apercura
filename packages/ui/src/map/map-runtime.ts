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
	signal: AbortSignal;
}

export async function createMap({
	container,
	styleUrl,
	center,
	zoom,
	markerLabel,
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

	const pin = document.createElement("div");
	pin.className = "apercura-map-pin";
	pin.setAttribute("role", "img");
	pin.setAttribute("aria-label", markerLabel);
	// MapLibre positions the marker element with its own transform, so the shape is a child.
	pin.append(document.createElement("span"));
	new maplibregl.Marker({ element: pin, anchor: "bottom" })
		.setLngLat([center.lon, center.lat])
		.addTo(map);

	return map;
}
