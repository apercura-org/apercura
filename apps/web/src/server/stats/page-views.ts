import { createHmac, randomBytes } from "node:crypto";
import type { Database } from "@apercura/db";
import { sql } from "drizzle-orm";
import { resolveClientIp, trustedProxyCount } from "../auth/client-ip";
import { ipBucket } from "../rate-limit-key";

/*
 * Page views of claimed practitioner pages, for their owners: one counter per page and day, and
 * nothing else. No cookie, no identifier, no IP address and no user agent is stored anywhere;
 * the public page stays a cached, static page (a beacon from the browser counts, see
 * ~/components/page-view-beacon.tsx).
 *
 * Abuse is kept out in memory only: a visitor's address is turned into a keyed hash whose key is
 * random, held by this process alone and replaced every day, so even the in-memory buckets cannot
 * be linked to an address or across days. Within a bucket, one view per page every 30 minutes
 * counts, and 30 views an hour across pages; crawlers, link previews and monitoring tools are left
 * out by their user agent, and browsers that ask not to be tracked (Global Privacy Control, Do Not
 * Track) are not counted.
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
 * Only our own pages may count: browsers send `Sec-Fetch-Site` with every request, and a beacon
 * from another site (an attempt to inflate a page's figures) says `cross-site`. A prefetch is not
 * a view either.
 */
export function fromOurPage(headers: Headers): boolean {
	const site = headers.get("sec-fetch-site");
	if (site !== null && site !== "same-origin") return false;
	const purpose = headers.get("sec-purpose") ?? headers.get("purpose");
	return !purpose?.includes("prefetch");
}

export interface ViewLimits {
	/** One view of a page per bucket in this window. */
	samePageSeconds: number;
	/** Views per bucket and hour, across pages. */
	perClientPerHour: number;
	/** Views of one page per hour when visitors cannot be told apart (no trusted proxy). */
	perPageWithoutClientPerHour: number;
	/** Bound of the in-memory map. */
	maxEntries: number;
}

export const DEFAULT_VIEW_LIMITS: ViewLimits = {
	samePageSeconds: 30 * 60,
	perClientPerHour: 30,
	perPageWithoutClientPerHour: 120,
	maxEntries: 50_000,
};

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
		return createHmac("sha256", this.key).update(ipBucket(ip)).digest("base64url");
	}

	private hit(key: string, max: number, seconds: number, nowMs: number): boolean {
		const current = this.windows.get(key);
		if (!current || current.until <= nowMs) {
			this.windows.set(key, { count: 1, until: nowMs + seconds * 1_000 });
			return true;
		}
		current.count += 1;
		return current.count <= max;
	}

	private sweep(nowMs: number) {
		if (this.windows.size < this.limits.maxEntries) return;
		for (const [key, window] of this.windows) {
			if (window.until <= nowMs) this.windows.delete(key);
		}
		// Still full (a flood of distinct addresses): forget the oldest half.
		if (this.windows.size >= this.limits.maxEntries) {
			let drop = Math.ceil(this.windows.size / 2);
			for (const key of this.windows.keys()) {
				if (drop-- <= 0) break;
				this.windows.delete(key);
			}
		}
	}

	/** Whether this view counts. `ip` null: visitors cannot be told apart. */
	allow(ip: string | null, practitionerId: number, nowMs: number): boolean {
		this.sweep(nowMs);
		if (ip === null) {
			return this.hit(
				`page:${practitionerId}`,
				this.limits.perPageWithoutClientPerHour,
				3_600,
				nowMs,
			);
		}
		const bucket = this.bucketOf(ip, nowMs);
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
