/**
 * HTTP security headers and the Content-Security-Policy of every page.
 *
 * Two policies, because cached pages cannot carry a per-request nonce:
 *
 * - **Nonce** (the practitioner space, the appointment page): scripts run only
 *   from our origin or with the request's nonce. Next.js applies the nonce to
 *   its own inline scripts; the static shell of a partially prerendered page
 *   keeps one React timing script without it, allowed by its hash.
 *   `'strict-dynamic'` is left out on purpose: the shell's `<script src>` tags
 *   are prerendered without the nonce, so they are allowed by `'self'`.
 * - **Static** (cached public pages): `'self' 'unsafe-inline'` scripts, since
 *   the inline data scripts of a prerendered page cannot be hashed in advance.
 *   No user-provided HTML is ever rendered there (page texts are plain text).
 *
 * Both forbid `eval` (outside development), plugins, framing, `<base>` and
 * form posts to other origins. MapLibre runs its worker from our origin and
 * ALTCHA from a `blob:` URL, hence `worker-src 'self' blob:`; map styles,
 * tiles, glyphs and sprites come from the origin of NEXT_PUBLIC_MAP_STYLE_URL.
 *
 * Pure module: imported by next.config.ts, the proxy and tests.
 */

/**
 * React's timing script (`$RT`), emitted without a nonce in the prerendered
 * shell of a partially prerendered page. Its hash is pinned by a test against
 * the React build Next.js ships, so an upgrade that changes it fails CI.
 */
export const REACT_TIMING_SCRIPT = "requestAnimationFrame(function(){$RT=performance.now()});";
export const REACT_TIMING_SCRIPT_HASH = "'sha256-7mu4H06fwDCjmnxxr/xNHyuQC6pLTHr4M2E4jXw5WZs='";

export interface CspOptions {
	/** The request's nonce (base64), for the practitioner space and the appointment page. */
	nonce?: string | undefined;
	/** `next dev` needs `eval` (React's debugging) and a WebSocket (hot reload). */
	development?: boolean;
	/** Origins of the map style, tiles, glyphs and sprites. */
	mapOrigins?: readonly string[];
	/** Origins photos are served from when it is not the app (S3_PUBLIC_URL). */
	imageOrigins?: readonly string[];
	/** Behind HTTPS: ask the browser to upgrade any `http:` subresource. */
	upgradeInsecureRequests?: boolean;
}

/** The origin of a URL, or null when it is not an http(s) URL. */
export function originOf(url: string | undefined | null): string | null {
	if (!url) return null;
	try {
		const parsed = new URL(url);
		return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.origin : null;
	} catch {
		return null;
	}
}

const unique = (values: readonly (string | null | undefined)[]) => [
	...new Set(values.filter((value): value is string => Boolean(value))),
];

export function contentSecurityPolicy(options: CspOptions = {}): string {
	const dev = options.development === true;
	const map = unique(options.mapOrigins ?? []);
	const images = unique(options.imageOrigins ?? []);
	if (options.nonce !== undefined && !/^[A-Za-z0-9+/_-]{16,}={0,2}$/.test(options.nonce)) {
		throw new Error("Invalid CSP nonce");
	}
	const scripts = options.nonce
		? ["'self'", `'nonce-${options.nonce}'`, REACT_TIMING_SCRIPT_HASH]
		: ["'self'", "'unsafe-inline'"];
	if (dev) scripts.push("'unsafe-eval'");
	const directives: [string, ...string[]][] = [
		["default-src", "'self'"],
		["script-src", ...scripts],
		// React renders `style` attributes and the widgets inject <style> elements.
		["style-src", "'self'", "'unsafe-inline'"],
		["img-src", "'self'", "data:", "blob:", ...map, ...images],
		["font-src", "'self'", "data:"],
		["connect-src", "'self'", ...map, ...(dev ? ["ws:", "wss:"] : [])],
		["worker-src", "'self'", "blob:"],
		["child-src", "'self'", "blob:"],
		["manifest-src", "'self'"],
		["media-src", "'self'"],
		["frame-src", "'none'"],
		["object-src", "'none'"],
		["base-uri", "'none'"],
		["form-action", "'self'"],
		["frame-ancestors", "'none'"],
	];
	if (options.upgradeInsecureRequests) directives.push(["upgrade-insecure-requests"]);
	return directives.map((directive) => directive.join(" ")).join("; ");
}

/** Policy of API responses (JSON, files): nothing may load, run or frame them. */
export const API_CONTENT_SECURITY_POLICY =
	"default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

/** Geolocation for "near me" on our own pages; every other powerful feature off. */
export const PERMISSIONS_POLICY = [
	"accelerometer=()",
	"autoplay=()",
	"browsing-topics=()",
	"camera=()",
	"display-capture=()",
	"geolocation=(self)",
	"gyroscope=()",
	"hid=()",
	"magnetometer=()",
	"microphone=()",
	"midi=()",
	"payment=()",
	"publickey-credentials-create=(self)",
	"publickey-credentials-get=(self)",
	"screen-wake-lock=()",
	"serial=()",
	"usb=()",
	"xr-spatial-tracking=()",
].join(", ");

/** Two years and every subdomain: what the HSTS preload list requires (https://hstspreload.org). */
export const HSTS = "max-age=63072000; includeSubDomains";
/** The same with `preload`: the domain may then be submitted to the browsers' preload list. */
export const HSTS_PRELOAD = `${HSTS}; preload`;

/**
 * Headers every response carries (pages, API, assets). HSTS only when the
 * public origin is HTTPS in a production build: a browser would otherwise
 * pin a development host to HTTPS. `preload` only when asked (HSTS_PRELOAD):
 * it signals consent to the preload list, which is slow to leave, so forks and
 * self-hosted instances do not send it by default.
 */
export function baseSecurityHeaders(options: {
	production: boolean;
	appUrl: string | undefined;
	preload?: boolean;
}) {
	const headers = [
		{ key: "X-Content-Type-Options", value: "nosniff" },
		{ key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
		{ key: "X-Frame-Options", value: "DENY" },
		{ key: "Permissions-Policy", value: PERMISSIONS_POLICY },
		// Sign-in with Pro Santé Connect is a full-page redirect, never a popup.
		{ key: "Cross-Origin-Opener-Policy", value: "same-origin" },
		{ key: "X-Permitted-Cross-Domain-Policies", value: "none" },
	];
	if (options.production && options.appUrl?.startsWith("https://")) {
		headers.push({
			key: "Strict-Transport-Security",
			value: options.preload ? HSTS_PRELOAD : HSTS,
		});
	}
	return headers;
}

/**
 * The practitioner space and the appointment page, under any locale prefix (`fr`, `fr-en`…):
 * rendered per request.
 */
export function noncePathPattern(prefixes: readonly string[]): RegExp {
	const prefix = prefixes.map((segment) => segment.replace(/[^A-Za-z-]/g, "")).join("|");
	// `/pro` itself is the public, cached presentation page: static policy.
	return new RegExp(`^/(?:${prefix})/(?:pro/.+|rdv/?)$`);
}

/** A fresh nonce: 16 random bytes in base64. */
export function newNonce(): string {
	const bytes = new Uint8Array(16);
	crypto.getRandomValues(bytes);
	return btoa(String.fromCharCode(...bytes));
}
