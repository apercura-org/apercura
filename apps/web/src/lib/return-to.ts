/**
 * Where to go back after signing in or up, carried as `?suite=` through the
 * sign-in, second-factor, enrolment, sign-up and email-confirmation pages.
 *
 * Only an allowlist of internal practitioner-space paths is accepted, parsed
 * into a typed route (never echoed back as a raw string), so the parameter
 * can never become an open redirect: the claim of one page (an RPPS in France, a list key such
 * as `w7983` in Austria, `gb:a81001` in the UK, `cz:39781` in Czechia, `es:1328000001` in Spain,
 * `it:f9000001` in Italy, `de:k0a1b2c3d4e` in Germany, `ch:h123456789` in Switzerland, `pl:290629` in Poland, `ie:p10000612` in Ireland, `fi:b18aa7f8…` in Finland, `lt:5271-12679435` in Lithuania, `se:a7312446003969` in Sweden, see ~/lib/practitioner-ref),
 * or one team
 * invitation (an invited person creates their account first).
 */

export const RETURN_PARAM = "suite";

export type ReturnTo =
	| { pathname: "/pro/revendiquer"; query: { rpps: string } }
	| { pathname: "/pro/revendiquer/[id]"; params: { id: string } }
	| { pathname: "/pro/invitation/[id]"; params: { id: string } };

/** The claim start, a claim or an invitation (its id, a UUID), in any locale's space. */
const PRO_ROUTE =
	/^(?:\/en)?\/pro\/(revendiquer|invitation)(?:\/([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}))?$/;
/**
 * A practitioner reference: an RPPS (France), a regional list key (Austria, `w7983`), a UK
 * practice key (`gb:a81001`), a Czech facility number (`cz:39781`), a Spanish centre code
 * (`es:1328000001`), an Italian place key (`it:f9000001`, `it:p002112`, `it:s010030`), a German
 * facility key (`de:k0a1b2c3d4e`, `de:th420`), a Swiss one (`ch:h123456789`) or an Estonian
 * provider or pharmacy key (`ee:l01909`, `ee:ap457`), a Polish establishment number
 * (`pl:290629`) or an Irish facility key (`ie:p10000612`, `ie:n738`) or a Finnish service location's key
 * (`fi:b18aa7f87eca4b97a8e8b438d2e29427`) or a Lithuanian page key (`lt:5271-12679435`,
 * `lt:5271-v00141024`) or a Cypriot facility key (`cy:f101`, `cy:m3fa9c01b2e`) or a Swedish one (`se:a7312446003969`,
 * `se:v2321000131e000000007600`).
 */
const RPPS =
	/^(?:\d{11}|[a-z]{1,2}[1-9]\d{0,8}|gb:[a-z0-9]{2,12}|cz:[1-9]\d{0,8}|es:(?:0[1-9]|1\d)\d{8}|it:(?:f\d{1,8}|[ps]\d{6})|de:(?:k|r|bb)[0-9a-f]{10}|de:th[1-9]\d{0,6}|ch:[a-z]{1,3}[1-9]\d{0,13}|ee:(?:l\d{5}|ap[1-9]\d{0,6})|pl:[1-9]\d{0,9}|no:[89]\d{8}|ie:[pnhc][1-9]\d{0,9}|fi:[0-9a-f]{32}|lt:[1-9]\d{0,6}-(?:[1-9]\d{0,9}|v[0-9a-f]{8})|cy:(?:f[1-9]\d{0,5}|m[0-9a-f]{10})|lv:(?:g\d{9}|[sa][1-9]\d{0,8})|se:(?:a\d{13}|v\d{10}[0-9a-z]{1,24}))$/;
const BASE = "http://internal.invalid";

/** The allowlisted route a `?suite=` value designates, or null for anything else. */
export function parseReturnTo(raw: unknown): ReturnTo | null {
	if (typeof raw !== "string" || raw.length > 200) return null;
	// Relative paths only: no scheme, no host, no protocol-relative or backslash tricks.
	if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return null;
	let url: URL;
	try {
		url = new URL(raw, BASE);
	} catch {
		return null;
	}
	const route = PRO_ROUTE.exec(url.pathname);
	if (url.origin !== BASE || url.hash || !route) return null;
	const [, kind, id] = route;
	if (!id) {
		// The claim start, for one page: `?rpps=` and nothing else.
		const rpps = url.searchParams.get("rpps") ?? "";
		if (kind !== "revendiquer" || !RPPS.test(rpps) || [...url.searchParams.keys()].length !== 1) {
			return null;
		}
		return { pathname: "/pro/revendiquer", query: { rpps } };
	}
	if (url.search !== "") return null;
	return kind === "invitation"
		? { pathname: "/pro/invitation/[id]", params: { id } }
		: { pathname: "/pro/revendiquer/[id]", params: { id } };
}

/** The `?suite=` value of a route (locale-free: these paths are the same in every locale). */
export function serializeReturnTo(target: ReturnTo): string {
	return target.pathname === "/pro/revendiquer"
		? `/pro/revendiquer?rpps=${target.query.rpps}`
		: target.pathname.replace("[id]", target.params.id);
}

/** Adds `?suite=` to a route's query when there is somewhere to come back to. */
export function withReturnTo<Path extends string>(
	pathname: Path,
	target: ReturnTo | null,
): { pathname: Path; query?: Record<string, string> } {
	return target ? { pathname, query: { [RETURN_PARAM]: serializeReturnTo(target) } } : { pathname };
}

/** In the browser: the allowlisted return target of the current URL, if any. */
export function currentReturnTo(): ReturnTo | null {
	if (typeof window === "undefined") return null;
	return parseReturnTo(new URLSearchParams(window.location.search).get(RETURN_PARAM));
}
