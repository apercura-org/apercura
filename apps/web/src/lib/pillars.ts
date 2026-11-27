/**
 * The four commitments printed on the home page, the same in every market: one deployment
 * serves them all, so each commitment holds for every market's pages.
 *
 * The hosting pillar is conditional: Apercura may only say health data is hosted
 * by an HDS-certified host when the deployment really is (`PUBLIC_HDS_HOST` set,
 * naming that host). Otherwise the pillar only promises application-level
 * encryption, of what is encrypted everywhere (claim documents, error reports, removal
 * requests) and of appointments where a market books, and names no host or place. No
 * variant ever says Apercura itself is HDS-certified.
 */
export type Pillar =
	| { key: "free" }
	| { key: "openSource" }
	| { key: "hostedInFrance"; host: string }
	| { key: "encrypted" }
	| { key: "selfHostable" };

export function getPillars(hdsHost: string | null | undefined): Pillar[] {
	const host = hdsHost?.trim();
	return [
		{ key: "free" },
		{ key: "openSource" },
		host ? { key: "hostedInFrance", host } : { key: "encrypted" },
		{ key: "selfHostable" },
	];
}
