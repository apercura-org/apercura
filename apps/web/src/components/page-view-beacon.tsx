"use client";

import { useEffect } from "react";

/**
 * Counts one view of a claimed practitioner page for its owner's statistics: an empty POST to
 * `/api/page-views/{id}` once the page has loaded, so the page itself stays static and cached.
 * It carries no cookie, no referrer, no identifier and no data; browsers that ask not to be tracked (Global
 * Privacy Control, Do Not Track) send nothing. Renders nothing.
 */
export function PageViewBeacon({ practitionerId }: { practitionerId: number }) {
	useEffect(() => {
		const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
		if (nav.globalPrivacyControl === true || nav.doNotTrack === "1") return;
		// fetch rather than sendBeacon: it can leave every cookie out (`credentials: "omit"`).
		void fetch(`/api/page-views/${practitionerId}`, {
			method: "POST",
			keepalive: true,
			credentials: "omit",
			cache: "no-store",
			referrerPolicy: "no-referrer",
		}).catch(() => undefined);
	}, [practitionerId]);
	return null;
}
