"use client";

import { buttonStyles, MapView } from "@apercura/ui";
import { useId, useState } from "react";

export interface ResultsMapProps {
	pins: { lat: number; lon: number; label: string }[];
	styleUrl: string;
	labels: { show: string; hide: string; region: string; fallback: string };
}

/**
 * "Show on the map" for a page of results. The map (and MapLibre) loads only
 * when the visitor asks for it; the list above stays the primary view.
 */
export function ResultsMap({ pins, styleUrl, labels }: ResultsMapProps) {
	const [open, setOpen] = useState(false);
	const id = useId();
	const first = pins[0];
	if (!first) return null;
	return (
		<div className="flex flex-col gap-3">
			<button
				type="button"
				aria-expanded={open}
				aria-controls={id}
				onClick={() => setOpen((value) => !value)}
				className={buttonStyles({ intent: "ink", size: "md", className: "self-start" })}
			>
				{open ? labels.hide : labels.show}
			</button>
			<div id={id} hidden={!open}>
				{open ? (
					<MapView
						className="h-80 sm:h-96"
						center={first}
						styleUrl={styleUrl}
						label={labels.region}
						markerLabel={first.label}
						markers={pins}
						fallback={<p className="bg-paper/90 p-2 text-meta text-ink">{labels.fallback}</p>}
					/>
				) : null}
			</div>
		</div>
	);
}
