"use client";

import { PinIcon } from "@apercura/ui";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

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
 *
 * It renders in the form's slot `slotId`, printed after the country choice, so the two share a
 * row. The home swaps its plain form for the interactive one on first use: the slot is looked up
 * again whenever the search's content changes.
 */
export function NearMeButton({
	formId,
	slotId,
	className,
	labels,
}: {
	formId: string;
	/** Id of the form's empty slot after the country choice, where the action renders. */
	slotId: string;
	className: string;
	labels: NearMeLabels;
}) {
	const [supported, setSupported] = useState(false);
	const [geo, setGeo] = useState<GeoStatus>("idle");
	const [slot, setSlot] = useState<HTMLElement | null>(null);
	useEffect(() => setSupported("geolocation" in navigator), []);
	useEffect(() => {
		const find = () => setSlot(document.getElementById(slotId));
		find();
		const form = document.getElementById(formId);
		const root = form?.closest("search") ?? form?.parentElement;
		if (!root) return;
		const observer = new MutationObserver(find);
		observer.observe(root, { childList: true, subtree: true });
		return () => observer.disconnect();
	}, [formId, slotId]);

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

	const action = (
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
	return slot ? createPortal(action, slot) : action;
}
