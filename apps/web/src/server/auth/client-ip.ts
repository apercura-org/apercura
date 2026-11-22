/**
 * Client IP resolution behind a known number of reverse proxies.
 *
 * Each proxy appends the address it received the request from to
 * `X-Forwarded-For`, so with N trusted proxies the client is the N-th entry
 * from the right. Entries further left are written by the client and ignored.
 * With no trusted proxy the header is not trusted at all.
 */

/** Header Better Auth reads the client IP from. Always rewritten by us, never taken from the client. */
export const CLIENT_IP_HEADER = "x-apercura-client-ip";

const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
const IPV6 = /^[0-9a-f:.]+$/i;

function isIp(value: string) {
	return IPV4.test(value) || (value.includes(":") && IPV6.test(value));
}

export function resolveClientIp(forwardedFor: string | null, trustedProxyCount: number) {
	if (!forwardedFor || !Number.isInteger(trustedProxyCount) || trustedProxyCount < 1) {
		return null;
	}
	const hops = forwardedFor
		.split(",")
		.map((hop) => hop.trim())
		.filter(Boolean);
	const candidate = hops[hops.length - trustedProxyCount];
	return candidate && isIp(candidate) ? candidate : null;
}

/** Copies the request headers with our client IP header set (or removed). */
export function withClientIpHeader(headers: Headers, trustedProxyCount: number): Headers {
	const next = new Headers(headers);
	next.delete(CLIENT_IP_HEADER);
	const ip = resolveClientIp(headers.get("x-forwarded-for"), trustedProxyCount);
	if (ip) {
		next.set(CLIENT_IP_HEADER, ip);
	}
	return next;
}

/** Reads TRUSTED_PROXY_COUNT defensively (it is unvalidated in builds that skip env validation). */
export function trustedProxyCount(value: unknown): number {
	const count = Number(value ?? 0);
	return Number.isInteger(count) && count > 0 ? count : 0;
}

/** The eight 16-bit groups of an IPv6 address (an IPv4 tail allowed, no zone id), or null. */
export function ipv6Groups(ip: string): number[] | null {
	let text = ip.toLowerCase().trim();
	const tail = /(\d+\.\d+\.\d+\.\d+)$/.exec(text)?.[1];
	if (tail) {
		if (!IPV4.test(tail)) return null;
		const [a = 0, b = 0, c = 0, d = 0] = tail.split(".").map(Number);
		text = `${text.slice(0, -tail.length)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
	}
	const halves = text.split("::");
	if (halves.length > 2) return null;
	const groupsOf = (part: string | undefined) => (part ? part.split(":") : []);
	const left = groupsOf(halves[0]);
	const right = groupsOf(halves[1]);
	const missing = 8 - left.length - right.length;
	if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
	const groups = [...left, ...Array<string>(halves.length === 2 ? missing : 0).fill("0"), ...right];
	if (!groups.every((group) => /^[0-9a-f]{1,4}$/.test(group))) return null;
	return groups.map((group) => Number.parseInt(group, 16));
}

/** RFC 5952 text of eight groups: lowercase, no leading zeros, the longest zero run as `::`. */
export function formatIpv6(groups: readonly number[]): string {
	let best = { start: -1, length: 0 };
	for (let index = 0; index < groups.length; ) {
		if (groups[index] !== 0) {
			index += 1;
			continue;
		}
		let end = index;
		while (end < groups.length && groups[end] === 0) end += 1;
		if (end - index > best.length) best = { start: index, length: end - index };
		index = end;
	}
	const hex = groups.map((group) => group.toString(16));
	if (best.length < 2) return hex.join(":");
	const head = hex.slice(0, best.start).join(":");
	const rest = hex.slice(best.start + best.length).join(":");
	return `${head}::${rest}`;
}

/**
 * What a practitioner session keeps of the client's address: its network, IPv4 /24
 * (`203.0.113.0/24`) or IPv6 /48 (`2001:db8:1::/48`), enough to recognise "my office" or "my
 * provider" in the session list without identifying a device. An IPv4-mapped IPv6 address counts
 * as IPv4; anything that is not an address gives null. Migration 0016 applies the same rule
 * (and the same text, PostgreSQL's `cidr` output) to the rows stored before.
 */
export function truncateIp(ip: string | null | undefined): string | null {
	const value = ip?.trim();
	if (!value) return null;
	const v4 = IPV4.test(value) ? value : /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(value)?.[1];
	if (v4) {
		if (!IPV4.test(v4)) return null;
		const [a, b, c] = v4.split(".");
		return `${a}.${b}.${c}.0/24`;
	}
	const groups = value.includes(":") ? ipv6Groups(value) : null;
	if (!groups) return null;
	return `${formatIpv6([...groups.slice(0, 3), 0, 0, 0, 0, 0])}/48`;
}
