"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { PinIcon } from "../icons";
import type { MapStrings } from "./map-strings";
import { DEFAULT_MAP_STYLE_URL } from "./map-style";

export interface MapViewProps {
	center: { lat: number; lon: number };
	zoom?: number;
	/** MapLibre style URL. Pass `NEXT_PUBLIC_MAP_STYLE_URL`; defaults to OpenFreeMap positron. */
	styleUrl?: string;
	/** Accessible name of the map region, e.g. "Map: Cabinet de l'Exemple". */
	label: string;
	/** Accessible name of the location pin. */
	markerLabel: string;
	/**
	 * Several labelled pins (e.g. search results) instead of the single pin at
	 * `center`; the map fits them all in view.
	 */
	markers?: { lat: number; lon: number; label: string }[];
	/**
	 * The strings MapLibre shows (control titles, the "Ctrl + scroll" hint,
	 * accessible names) in the page's language; MapLibre's own are English.
	 */
	strings?: MapStrings;
	/**
	 * Shown until the map is ready, and kept if WebGL or the network fails:
	 * the address and directions links, so the page never depends on the map.
	 */
	fallback: ReactNode;
	className?: string;
}

type Status = "idle" | "loading" | "ready" | "failed";

/**
 * Lazy MapLibre GL map. Renders the fallback on the server and in the first
 * client paint, then loads MapLibre only when the map scrolls near the viewport.
 */
export function MapView({
	center,
	zoom = 15,
	styleUrl = DEFAULT_MAP_STYLE_URL,
	label,
	markerLabel,
	markers,
	strings,
	fallback,
	className,
}: MapViewProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const [status, setStatus] = useState<Status>("idle");
	const { lat, lon } = center;
	// A stable dependency: a new array with the same pins must not rebuild the map.
	const markersKey = markers ? JSON.stringify(markers) : "";
	const stringsKey = strings ? JSON.stringify(strings) : "";

	useEffect(() => {
		const container = containerRef.current;
		if (!container) {
			return;
		}
		const controller = new AbortController();
		let map: { remove: () => void } | undefined;

		const load = () => {
			setStatus("loading");
			import("./map-runtime")
				.then(({ createMap }) =>
					createMap({
						container,
						styleUrl,
						center: { lat, lon },
						zoom,
						markerLabel,
						...(markersKey ? { markers: JSON.parse(markersKey) as MapViewProps["markers"] } : {}),
						...(stringsKey ? { strings: JSON.parse(stringsKey) as MapStrings } : {}),
						signal: controller.signal,
					}),
				)
				.then((created) => {
					map = created;
					created.once("load", () => setStatus("ready"));
				})
				.catch(() => {
					if (!controller.signal.aborted) {
						setStatus("failed");
					}
				});
		};

		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) {
					observer.disconnect();
					load();
				}
			},
			{ rootMargin: "200px" },
		);
		observer.observe(container);

		return () => {
			observer.disconnect();
			controller.abort();
			map?.remove();
		};
	}, [styleUrl, lat, lon, zoom, markerLabel, markersKey, stringsKey]);

	return (
		<section
			aria-label={label}
			data-status={status}
			// A plain join, not `cn`: the map is on every practitioner page, and class merging
			// would ship tailwind-merge to the browser for a base no caller overrides.
			className={[
				"apercura-map relative overflow-hidden rounded-panel border border-rule-soft bg-paper-shade",
				className,
			]
				.filter(Boolean)
				.join(" ")}
		>
			{/* MapLibre's own stylesheet makes this node `position: relative`, so size it with the parent. */}
			<div ref={containerRef} className="h-full w-full" />
			{status === "ready" ? null : (
				// Until the map is ready (or if it never loads), the pin stands with the address.
				<div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center">
					<PinIcon className="size-8 text-ink" />
					{fallback}
				</div>
			)}
		</section>
	);
}
