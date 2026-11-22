"use client";

import { PinIcon } from "@apercura/ui";
import { useEffect, useState } from "react";

type GeoStatus = "idle" | "locating" | "denied" | "unavailable";

export interface NearMeLabels {
	nearMe: string;
	locating: string;
	geoDenied: string;
	geoUnavailable: string;
}

/**
 * "Near me" under a search form: locates the visitor, then submits the form
 * `formId` with the position (`pres`) instead of the place. It only exists
 * where the browser can locate the visitor. It drives the form through the
 * DOM, so it works before the form's own fields are hydrated (the home page
 * hydrates them on first interaction), and it ships neither the class
 * merger nor the message catalogue: the caller passes its class names and
 * labels.
 */
export function NearMeButton({
	formId,
	className,
	labels,
}: {
	formId: string;
	className: string;
	labels: NearMeLabels;
}) {
	const [supported, setSupported] = useState(false);
	const [geo, setGeo] = useState<GeoStatus>("idle");
	useEffect(() => setSupported("geolocation" in navigator), []);

	if (!supported) return null;

	const locate = () => {
		setGeo("locating");
		navigator.geolocation.getCurrentPosition(
			(position) => {
				const form = document.getElementById(formId);
				if (!(form instanceof HTMLFormElement)) return;
				// The interactive form renders this input; the plain one gets it now.
				let pres = form.querySelector<HTMLInputElement>("input[data-near-me]");
				if (!pres) {
					pres = document.createElement("input");
					pres.type = "hidden";
					pres.dataset.nearMe = "";
					form.append(pres);
				}
				// Named only now, so an ordinary search never carries an empty `pres`.
				pres.name = "pres";
				pres.value = `${position.coords.latitude.toFixed(5)},${position.coords.longitude.toFixed(5)}`;
				// Near me replaces the place: the results are ordered by distance.
				const whereInput = form.elements.namedItem("ou") as HTMLInputElement | null;
				if (whereInput) whereInput.value = "";
				form.requestSubmit();
			},
			(error) => setGeo(error.code === error.PERMISSION_DENIED ? "denied" : "unavailable"),
			{ enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
		);
	};

	return (
		<div className="flex flex-wrap items-center gap-x-4 gap-y-2">
			<button type="button" onClick={locate} disabled={geo === "locating"} className={className}>
				<PinIcon className="size-5" />
				{geo === "locating" ? labels.locating : labels.nearMe}
			</button>
			<p role="status" className="text-meta text-ink">
				{geo === "denied" ? labels.geoDenied : geo === "unavailable" ? labels.geoUnavailable : ""}
			</p>
		</div>
	);
}
