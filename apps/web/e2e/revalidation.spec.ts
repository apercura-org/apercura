import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { type APIRequestContext, expect, test } from "@playwright/test";
import { E2E_BOOKING_ENV } from "./booking-env";
import { testDb } from "./pro";

/*
 * An import's revalidation, end to end (#97): the pages and sitemaps are cached, the data
 * changes, the import's own outbox drain sends its tags to `/api/revalidate`, and the next
 * requests see the change. Against the SYNTHETIC fixtures; the practitioner and the listing
 * below are no other spec's, and both are put back as imported at the end.
 */

const PRACTITIONER = { rpps: "19999991052", slug: "fabien-essaiaf-19999991052" };
const LISTING = { key: "sage-femme:fr", path: "/fr/sage-femme" };
/** A date no fixture has: the sitemap index shows it once the import's change is read. */
const LASTMOD = "2031-06-15";
/** `COARSE_TAG_THRESHOLD` of packages/etl/src/outbox.ts: more tags, and the drain goes coarse. */
const COARSE_TAG_THRESHOLD = 20_000;

test.describe.configure({ mode: "serial" });

const sql = testDb();

async function text(request: APIRequestContext, path: string): Promise<string> {
	const response = await request.get(path);
	expect(response.status(), path).toBe(200);
	return response.text();
}

const title = (html: string) => /<title>([^<]*)<\/title>/.exec(html)?.[1] ?? "";

/** What the import changed, as each cached response shows it. */
async function snapshot(request: APIRequestContext) {
	const index = await text(request, "/sitemap.xml");
	const chunk = /<loc>[^<]*(\/sitemaps\/fr\/praticiens-0\.xml)<\/loc><lastmod>([^<]+)</.exec(index);
	const urls = await text(request, "/sitemaps/fr/praticiens-0.xml");
	const entry = new RegExp(`/praticien/${PRACTITIONER.slug}</loc><lastmod>([^<]+)<`).exec(urls);
	return {
		indexLastmod: chunk?.[2],
		chunkLastmod: entry?.[1],
		practitionerTitle: title(await text(request, `/fr/praticien/${PRACTITIONER.slug}`)),
		listingTitle: title(await text(request, LISTING.path)),
	};
}

type DrainResult = { pending: number; sent: number; coarse: boolean; status: string };

/**
 * The import's outbox drain against this server: `etl:outbox`, the same `drainOutbox` that
 * `etl:fr` runs after its commit.
 */
function drain(baseURL: string): DrainResult {
	const root = fileURLToPath(new URL("../../..", import.meta.url));
	const output = execFileSync("bun", ["packages/etl/src/cli.ts", "etl:outbox"], {
		cwd: root,
		env: {
			...process.env,
			APP_URL: baseURL,
			REVALIDATE_SECRET: E2E_BOOKING_ENV.REVALIDATE_SECRET,
		},
		encoding: "utf8",
	});
	const line = /Revalidation: (\{.*\})/.exec(output)?.[1];
	if (!line) throw new Error(`etl:outbox printed no result:\n${output}`);
	return JSON.parse(line) as DrainResult;
}

let original: { lastName: string; updatedAt: Date; count: number } | undefined;

test.beforeAll(async () => {
	const [row] = await sql<{ lastName: string; updatedAt: Date; count: number }[]>`
		SELECT pg.payload ->> 'lastName' AS "lastName", pg.content_updated_at AS "updatedAt",
			(SELECT practitioner_count FROM directory.landing_pages WHERE key = ${LISTING.key}) AS count
		FROM directory.practitioner_pages pg
		JOIN directory.practitioners p ON p.id = pg.practitioner_id
		WHERE p.national_id = ${PRACTITIONER.rpps}
	`;
	if (!row) throw new Error("Import packages/etl/fixtures/fr first.");
	original = row;
});

test.afterAll(async ({ baseURL }) => {
	if (original) {
		await sql`
			UPDATE directory.practitioner_pages pg
			SET payload = jsonb_set(pg.payload, '{lastName}', to_jsonb(${original.lastName}::text)),
				content_updated_at = ${original.updatedAt}
			FROM directory.practitioners p
			WHERE p.id = pg.practitioner_id AND p.national_id = ${PRACTITIONER.rpps}
		`;
		await sql`
			UPDATE directory.landing_pages SET practitioner_count = ${original.count}
			WHERE key = ${LISTING.key}
		`;
		await sql`
			INSERT INTO directory.invalidation_outbox (tag) VALUES ('practitioner:*'), ('listing:*')
			ON CONFLICT (tag) DO NOTHING
		`;
		if (baseURL) drain(baseURL);
	}
	await sql.end();
});

test("a national import's coarse tags refresh the sitemaps at once, and the pages", async ({
	request,
	baseURL,
}) => {
	test.setTimeout(120_000);
	if (!baseURL || !original) throw new Error("no base URL");
	// Cached: read twice, the second answer comes from the app's cache.
	await snapshot(request);
	const before = await snapshot(request);
	expect(before.indexLastmod).not.toBe(LASTMOD);

	// The import commits: another name, a later change date, another count.
	const renamed = `${original.lastName}-Revalide`;
	await sql`
		UPDATE directory.practitioner_pages pg
		SET payload = jsonb_set(pg.payload, '{lastName}', to_jsonb(${renamed}::text)),
			content_updated_at = ${LASTMOD}::date + interval '12 hours'
		FROM directory.practitioners p
		WHERE p.id = pg.practitioner_id AND p.national_id = ${PRACTITIONER.rpps}
	`;
	await sql`
		UPDATE directory.landing_pages SET practitioner_count = practitioner_count + 1000
		WHERE key = ${LISTING.key}
	`;
	// Still the cached answers: what follows is the revalidation's doing, not a cache miss.
	expect(await snapshot(request)).toEqual(before);

	// Past COARSE_TAG_THRESHOLD the drain sends `{kind}:*` (and `sitemap`) instead.
	await sql`
		INSERT INTO directory.invalidation_outbox (tag)
		SELECT 'practitioner:' || g FROM generate_series(900000000, ${900000000 + COARSE_TAG_THRESHOLD}) g
		UNION ALL VALUES ('listing:sage-femme:fr'), ('site:1'), ('place:1')
		ON CONFLICT (tag) DO NOTHING
	`;
	const result = drain(baseURL);
	expect(result).toMatchObject({ coarse: true, status: "done" });

	// The sitemaps are expired, not stale: the very next request reads the new data.
	const after = await snapshot(request);
	expect(after.indexLastmod).toBe(LASTMOD);
	expect(after.chunkLastmod).toBe(LASTMOD);
	// Pages are stale-while-revalidate: the old copy at most once more, then the new one.
	await expect
		.poll(async () => (await snapshot(request)).practitionerTitle, { timeout: 30_000 })
		.toContain(renamed);
	await expect
		.poll(async () => (await snapshot(request)).listingTitle, { timeout: 30_000 })
		.not.toBe(before.listingTitle);
});

test("a small import's precise tags refresh the sitemaps too", async ({ request, baseURL }) => {
	if (!baseURL || !original) throw new Error("no base URL");
	const [page] = await sql<{ id: number }[]>`
		SELECT id FROM directory.practitioners WHERE national_id = ${PRACTITIONER.rpps}
	`;
	await snapshot(request);
	await sql`
		UPDATE directory.practitioner_pages SET content_updated_at = ${LASTMOD}::date + interval '1 day 12 hours'
		WHERE practitioner_id = ${page?.id ?? 0}
	`;
	// One practitioner's tag: it never matches the sitemap queries' tags, `sitemap` does.
	await sql`
		INSERT INTO directory.invalidation_outbox (tag) VALUES (${`practitioner:${page?.id}`})
		ON CONFLICT (tag) DO NOTHING
	`;
	expect(drain(baseURL)).toMatchObject({ coarse: false, status: "done" });
	expect((await snapshot(request)).indexLastmod).toBe("2031-06-16");
});
