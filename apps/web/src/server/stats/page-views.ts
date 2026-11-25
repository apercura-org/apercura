import { createHmac, randomBytes } from "node:crypto";
import type { Database } from "@apercura/db";
import { sql } from "drizzle-orm";
import { resolveClientIp, trustedProxyCount } from "../auth/client-ip";

/*
 * Page views of claimed practitioner pages, for their owners: one counter per page and day, and
 * nothing else. No cookie, no identifier, no IP address and no user agent is stored anywhere;
 * the public page stays a cached, static page (a beacon from the browser counts, see
 * ~/components/page-view-beacon.tsx).
 *
 * Abuse is kept out in memory only: a visitor's address is turned into a keyed hash whose key is
 * random, held by this process alone and replaced every day, so even the in-memory buckets cannot
 * be linked to an address or across days. A bucket is an IPv4 address or an IPv6 /48 (what one
 * subscriber or one cheap server can rotate through). Within a bucket, one view per page every
 * 30 minutes counts, and 30 views an hour across pages. Nothing counts when the visitor's address
 * is unknown (no trusted proxy), when the request does not say it comes from our own page, from
 * crawlers, link previews and monitoring tools, or from browsers that ask not to be tracked
 * (Global Privacy Control, Do Not Track). The figures under-count rather than over-count.
 */

/** Crawlers, link previews, monitoring, headless browsers and HTTP libraries. */
const BOT_AGENT =
	/bot\b|bot\/|crawl|spider|slurp|scrap|preview|facebookexternalhit|embedly|whatsapp|telegram|discord|slack|skype|headless|phantom|puppeteer|playwright|selenium|lighthouse|pagespeed|gtmetrix|pingdom|uptime|monitor|statuscake|curl|wget|httpie|python|java\/|go-http|httpclient|okhttp|axios|node-fetch|undici|libwww|\bbun\/|deno\/|ahrefs|semrush|mj12|yandex|baidu|petal|bytespider|gptbot|chatgpt|claude|ccbot|perplexity|applebot|google-inspectiontool|feedfetcher|validator/i;

export function isLikelyBot(userAgent: string | null): boolean {
	if (!userAgent || userAgent.trim().length < 10) return true;
	return BOT_AGENT.test(userAgent);
}

/** Global Privacy Control or Do Not Track: the visitor asked not to be measured. */
export function optedOut(headers: Headers): boolean {
	return headers.get("sec-gpc") === "1" || headers.get("dnt") === "1";
}

/**
 * Only our own pages may count: browsers send `Sec-Fetch-Site` with every request, and our beacon
 * says `same-origin`. A beacon from another site says `cross-site`, and a request without the
 * header is not from a current browser on our page (a script, an old browser): neither counts. A
 * prefetch is not a view either.
 */
export function fromOurPage(headers: Headers): boolean {
	if (headers.get("sec-fetch-site") !== "same-origin") return false;
	const purpose = headers.get("sec-purpose") ?? headers.get("purpose");
	return !purpose?.includes("prefetch");
}

export interface ViewLimits {
	/** One view of a page per bucket in this window. */
	samePageSeconds: number;
	/** Views per bucket and hour, across pages. */
	perClientPerHour: number;
	/** Bound of the in-memory map: once full, new buckets do not count until windows expire. */
	maxEntries: number;
}

export const DEFAULT_VIEW_LIMITS: ViewLimits = {
	samePageSeconds: 30 * 60,
	perClientPerHour: 30,
	maxEntries: 50_000,
};

/**
 * The bucket of an address: an IPv4 address itself (IPv4-mapped IPv6 included), or the /48
 * prefix of an IPv6 address, the usual allocation of one site: a single subscriber or server
 * cannot multiply its budget by walking its own addresses.
 */
export function viewBucket(ip: string): string {
	const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
	if (mapped?.[1]) return mapped[1];
	if (!ip.includes(":")) return ip;
	const [head = "", tail] = ip.toLowerCase().split("::");
	const left = head ? head.split(":") : [];
	const right = tail === undefined ? [] : tail ? tail.split(":") : [];
	const missing = Math.max(0, 8 - left.length - right.length);
	const groups = [...left, ...Array<string>(missing).fill("0"), ...right];
	return `${groups
		.slice(0, 3)
		.map((group) => group.replace(/^0+(?=.)/, ""))
		.join(":")}::/48`;
}

interface Window {
	count: number;
	until: number;
}

/**
 * In-memory windows keyed by hashed buckets. Nothing is persisted; a restart forgets everything,
 * which only means a visitor may count once more.
 */
export class ViewLimiter {
	private readonly windows = new Map<string, Window>();
	private key: Buffer = randomBytes(32);
	private keyDay = "";

	constructor(private readonly limits: ViewLimits = DEFAULT_VIEW_LIMITS) {}

	/** The keyed hash of a client's bucket; the key changes every (UTC) day. */
	private bucketOf(ip: string, nowMs: number): string {
		const day = new Date(nowMs).toISOString().slice(0, 10);
		if (day !== this.keyDay) {
			this.key = randomBytes(32);
			this.keyDay = day;
			this.windows.clear();
		}
		return createHmac("sha256", this.key).update(viewBucket(ip)).digest("base64url");
	}

	/**
	 * Counts one hit against `key`. A bucket the map does not hold yet only gets a window while
	 * there is room: a flood of new addresses fills the map and then stops counting, it never
	 * pushes out (and so resets) the windows of the buckets already there.
	 */
	private hit(key: string, max: number, seconds: number, nowMs: number): boolean {
		const current = this.windows.get(key);
		if (current && current.until > nowMs) {
			current.count += 1;
			return current.count <= max;
		}
		if (!current && this.windows.size >= this.limits.maxEntries) return false;
		this.windows.set(key, { count: 1, until: nowMs + seconds * 1_000 });
		return true;
	}

	/** Drops the elapsed windows once the map is full. */
	private sweep(nowMs: number) {
		if (this.windows.size < this.limits.maxEntries) return;
		for (const [key, window] of this.windows) {
			if (window.until <= nowMs) this.windows.delete(key);
		}
	}

	/** Whether this view counts. `ip` null (visitors cannot be told apart): never. */
	allow(ip: string | null, practitionerId: number, nowMs: number): boolean {
		if (ip === null) return false;
		const bucket = this.bucketOf(ip, nowMs);
		this.sweep(nowMs);
		if (!this.hit(`client:${bucket}`, this.limits.perClientPerHour, 3_600, nowMs)) return false;
		return this.hit(`seen:${bucket}:${practitionerId}`, 1, this.limits.samePageSeconds, nowMs);
	}

	/** For tests. */
	get size() {
		return this.windows.size;
	}
}

const limiter = new ViewLimiter();

/**
 * Whether a beacon counts: from one of our pages, not a bot, not opted out, within the limits.
 * Says nothing about the page: `recordPageView` only counts claimed, active pages.
 */
export function shouldCountView(
	headers: Headers,
	practitionerId: number,
	nowMs = Date.now(),
	options: { limiter?: ViewLimiter; trustedProxies?: unknown } = {},
): boolean {
	if (!fromOurPage(headers) || optedOut(headers) || isLikelyBot(headers.get("user-agent"))) {
		return false;
	}
	const ip = resolveClientIp(
		headers.get("x-forwarded-for"),
		trustedProxyCount(options.trustedProxies ?? process.env.TRUSTED_PROXY_COUNT),
	);
	return (options.limiter ?? limiter).allow(ip, practitionerId, nowMs);
}

/**
 * Adds one view to today's counter (Europe/Paris day) of a claimed, active page. A page that is
 * not claimed keeps no statistics at all: nothing is written.
 */
export async function recordPageView(db: Pick<Database, "execute">, practitionerId: number) {
	const result = await db.execute(sql`
		INSERT INTO directory.page_view_days (practitioner_id, day, views)
		SELECT p.id, (now() AT TIME ZONE 'Europe/Paris')::date, 1
		FROM directory.practitioners p
		WHERE p.id = ${practitionerId} AND p.claim_status = 'claimed' AND p.status = 'active'
			AND p.withheld_at IS NULL
		ON CONFLICT (practitioner_id, day)
		DO UPDATE SET views = directory.page_view_days.views + 1
	`);
	return (result.count ?? 0) > 0;
}
