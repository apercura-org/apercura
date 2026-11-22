import { signRevalidation } from "@apercura/core/revalidation";
import { type APIRequestContext, expect, test } from "@playwright/test";
import { E2E_BOOKING_ENV } from "./booking-env";
import { BOOKING_PRACTITIONERS } from "./booking-seed";
import { testDb } from "./pro";

/*
 * Technical SEO of every public page type, read from the SERVER HTML (what
 * crawlers get): one title and description of the right length, a self
 * canonical, the robots policy, one parseable JSON-LD @graph of linked
 * entities, one h1, no hreflang. Then status codes and the sitemaps. Against
 * the SYNTHETIC fixtures (fictitious people, RPPS 1999999xxxx).
 */

const OWNER = { rpps: "19999991383", slug: "ines-essaibm-19999991383" };
const BOOKABLE = BOOKING_PRACTITIONERS.direct.slug;

type Expected = {
	path: string;
	robots: "index, follow" | "noindex, follow";
	/** schema.org types the page's graph must contain. */
	types: string[];
	lang?: "fr" | "en";
};

const PAGES: Expected[] = [
	{ path: "/", robots: "index, follow", types: ["WebPage", "WebSite", "Organization"] },
	{ path: "/medecin-generaliste", robots: "index, follow", types: ["CollectionPage", "ItemList"] },
	{
		path: "/medecin-generaliste/75-paris",
		robots: "index, follow",
		types: ["CollectionPage", "BreadcrumbList", "ItemList"],
	},
	{
		path: "/medecin-generaliste/75-paris/2",
		robots: "noindex, follow",
		types: ["CollectionPage", "BreadcrumbList", "ItemList"],
	},
	{
		path: "/medecin-generaliste/75-paris/paris-15e-arrondissement",
		robots: "index, follow",
		types: ["CollectionPage", "BreadcrumbList", "ItemList"],
	},
	{ path: "/cardiologue/75-paris", robots: "noindex, follow", types: ["CollectionPage"] },
	{ path: "/annuaire", robots: "index, follow", types: ["CollectionPage", "ItemList"] },
	{ path: "/annuaire/75-paris", robots: "index, follow", types: ["CollectionPage", "ItemList"] },
	// Lyon has fewer than three practitioners per listing in the fixtures.
	{ path: "/annuaire/69-rhone/lyon", robots: "noindex, follow", types: ["CollectionPage"] },
	{
		path: "/praticien/camille-exemple-19999990013",
		robots: "index, follow",
		types: ["WebPage", "BreadcrumbList", "IndividualPhysician", "PhysiciansOffice"],
	},
	{
		path: "/praticien/fanny-placebo-19999990088",
		robots: "index, follow",
		types: ["Person", "Hospital"],
	},
	{
		path: "/praticien/alice-specimen-19999990039",
		robots: "index, follow",
		types: ["IndividualPhysician", "MedicalClinic"],
	},
	{ path: `/praticien/${OWNER.slug}`, robots: "index, follow", types: ["Dentist"] },
	{ path: `/praticien/${BOOKABLE}`, robots: "index, follow", types: ["IndividualPhysician"] },
	{
		path: "/etablissement/centre-hospitalier-fictif-2a9999001",
		robots: "index, follow",
		types: ["WebPage", "BreadcrumbList", "Hospital"],
	},
	{ path: "/pro", robots: "index, follow", types: ["WebPage"] },
	{ path: "/a-propos", robots: "index, follow", types: ["AboutPage", "BreadcrumbList"] },
	{ path: "/donnees", robots: "index, follow", types: ["WebPage", "BreadcrumbList"] },
	{ path: "/mentions-legales", robots: "index, follow", types: ["WebPage"] },
	{ path: "/en", robots: "noindex, follow", types: ["WebSite"], lang: "en" },
	{
		path: "/en/practitioner/camille-exemple-19999990013",
		robots: "noindex, follow",
		types: ["IndividualPhysician"],
		lang: "en",
	},
	{ path: "/en/directory", robots: "noindex, follow", types: ["CollectionPage"], lang: "en" },
];

const FORBIDDEN_KEYS = ["aggregateRating", "review", "reviews", "ratingValue"];
/** schema.org LocalBusiness subtypes the pages use (Hospital through EmergencyService). */
const LOCAL_BUSINESSES = new Set([
	"IndividualPhysician",
	"Dentist",
	"PhysiciansOffice",
	"MedicalClinic",
	"Hospital",
]);

/** The SEO-relevant parts of a server-rendered page. */
function parse(html: string) {
	const attr = (tag: string, name: string) =>
		new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1]?.replace(/&amp;/g, "&") ?? null;
	const tags = (pattern: RegExp) => [...html.matchAll(pattern)].map((match) => match[0]);
	const meta = (key: string) =>
		tags(/<meta\b[^>]*>/g)
			.filter((tag) => attr(tag, "name") === key || attr(tag, "property") === key)
			.map((tag) => attr(tag, "content"));
	return {
		lang: /<html[^>]*\blang="([^"]+)"/.exec(html)?.[1],
		titles: [...html.matchAll(/<title>([^<]*)<\/title>/g)].map((match) =>
			(match[1] ?? "").replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'"),
		),
		meta,
		links: tags(/<link\b[^>]*>/g).map((tag) => ({
			rel: attr(tag, "rel"),
			href: attr(tag, "href"),
			hreflang: attr(tag, "hreflang"),
		})),
		h1: tags(/<h1\b/g).length,
		jsonLd: [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(
			(match) => match[1] ?? "",
		),
	};
}

type Node = Record<string, unknown> & { "@type"?: string; "@id"?: string };

/** Every `{"@id": …}` reference in a value (objects with nothing but an id). */
function references(value: unknown): string[] {
	if (Array.isArray(value)) return value.flatMap(references);
	if (value && typeof value === "object") {
		const entries = Object.entries(value);
		if (entries.length === 1 && entries[0]?.[0] === "@id") return [String(entries[0][1])];
		return entries.flatMap(([, item]) => references(item));
	}
	return [];
}

function keysOf(value: unknown): string[] {
	if (Array.isArray(value)) return value.flatMap(keysOf);
	if (value && typeof value === "object") {
		return Object.entries(value).flatMap(([key, item]) => [key, ...keysOf(item)]);
	}
	return [];
}

async function revalidate(request: APIRequestContext, tags: string[]) {
	const body = JSON.stringify({ tags });
	const timestamp = Math.floor(Date.now() / 1000);
	const response = await request.post("/api/revalidate", {
		data: body,
		headers: {
			"content-type": "application/json",
			"x-apercura-timestamp": String(timestamp),
			"x-apercura-signature": signRevalidation(E2E_BOOKING_ENV.REVALIDATE_SECRET, timestamp, body),
		},
	});
	expect(response.ok()).toBe(true);
}

/** An owner-completed page: published profile with languages and a website (synthetic). */
test.beforeAll(async ({ request }) => {
	const sql = testDb();
	try {
		const [row] = await sql<{ id: number }[]>`
			SELECT id FROM directory.practitioners WHERE national_id = ${OWNER.rpps}
		`;
		if (!row) throw new Error("Import the synthetic fixtures first");
		await sql`
			INSERT INTO directory.practitioner_profiles
				(practitioner_id, headline, languages, website, show_phone, published_at)
			VALUES (${row.id}, 'Cabinet fictif', ${["fr", "en"]}, 'https://cabinet-fictif.example', true, now())
			ON CONFLICT (practitioner_id) DO UPDATE SET languages = EXCLUDED.languages,
				website = EXCLUDED.website, published_at = EXCLUDED.published_at
		`;
		await sql`SELECT directory.refresh_practitioner(${[row.id]}::integer[])`;
		await revalidate(request, [`practitioner:${row.id}`]);
	} finally {
		await sql.end();
	}
});

for (const expected of PAGES) {
	test(`${expected.path}: metadata, robots and one JSON-LD graph in the server HTML`, async ({
		request,
		baseURL,
	}) => {
		const response = await request.get(expected.path, { maxRedirects: 0 });
		expect(response.status()).toBe(200);
		const page = parse(await response.text());
		const origin = new URL(baseURL ?? "").origin;

		expect(page.lang).toBe(expected.lang ?? "fr");
		expect(page.titles).toHaveLength(1);
		const title = page.titles[0] ?? "";
		expect(title).toMatch(/ · Apercura$|^Apercura · /);
		expect(title.length).toBeLessThanOrEqual(60);
		const [description] = page.meta("description");
		expect(description?.length).toBeGreaterThan(40);
		expect(description?.length).toBeLessThanOrEqual(155);
		expect(page.h1).toBe(1);

		// Self canonical, absolute; robots by the indexing rules; never hreflang in v1.
		const canonical = page.links.filter((link) => link.rel === "canonical");
		expect(canonical).toHaveLength(1);
		expect(new URL(canonical[0]?.href ?? "").pathname.replace(/\/$/, "")).toBe(
			expected.path.replace(/\/$/, ""),
		);
		expect(canonical[0]?.href?.startsWith(origin)).toBe(true);
		expect(page.meta("robots")).toEqual([expected.robots]);
		expect(page.links.filter((link) => link.hreflang)).toEqual([]);
		expect(response.headers().link ?? "").not.toContain("hreflang");
		if (expected.lang === "en") expect(response.headers()["x-robots-tag"]).toContain("noindex");

		// Open Graph and Twitter cards.
		expect(page.meta("og:locale")).toEqual([expected.lang === "en" ? "en_GB" : "fr_FR"]);
		expect(page.meta("og:site_name")).toEqual(["Apercura"]);
		expect(page.meta("og:image")[0]).toMatch(new RegExp(`^${origin}/og/[a-z-]+\\.png$`));
		expect(page.meta("twitter:card")).toEqual(["summary_large_image"]);

		// One JSON-LD graph (client navigation may keep another route in a hidden
		// Activity; crawlers read this server HTML, which holds only this page).
		expect(page.jsonLd).toHaveLength(1);
		const data = JSON.parse(page.jsonLd[0] ?? "") as {
			"@context": string;
			"@graph": Node[];
		};
		expect(data["@context"]).toBe("https://schema.org");
		const nodes = data["@graph"];
		const types = nodes.map((node) => node["@type"]);
		for (const type of expected.types) expect(types).toContain(type);
		const ids = nodes.map((node) => node["@id"]).filter(Boolean);
		expect(new Set(ids).size).toBe(ids.length);
		for (const id of ids) expect(id?.startsWith(origin)).toBe(true);
		// Internal references resolve within the graph, or name the site entities or
		// another page's entity (an establishment's own page).
		for (const id of references(nodes)) {
			const known =
				ids.includes(id) ||
				id === `${origin}/#website` ||
				id === `${origin}/#organization` ||
				/#establishment$/.test(id);
			expect(known, `unresolved reference ${id}`).toBe(true);
		}
		const keys = keysOf(data);
		for (const forbidden of FORBIDDEN_KEYS) expect(keys).not.toContain(forbidden);

		// Google's LocalBusiness requirements (name, address) on every local business of
		// the graph, and BreadcrumbList items with a position, a name and an absolute URL.
		for (const node of nodes.filter((item) => LOCAL_BUSINESSES.has(item["@type"] ?? ""))) {
			expect(node.name, node["@id"]).toBeTruthy();
			const address = node.address as Record<string, string> | undefined;
			expect(address?.addressCountry, node["@id"]).toBe("FR");
			expect(address?.addressLocality ?? address?.postalCode, node["@id"]).toBeTruthy();
		}
		for (const crumbs of nodes.filter((item) => item["@type"] === "BreadcrumbList")) {
			const items = crumbs.itemListElement as { position: number; name: string; item: string }[];
			expect(items[0]?.item).toBe(expected.lang === "en" ? `${origin}/en` : `${origin}/`);
			items.forEach((item, index) => {
				expect(item.position).toBe(index + 1);
				expect(item.name).toBeTruthy();
				expect(item.item.startsWith(origin)).toBe(true);
			});
		}
	});
}

test("the practitioner graph: RPPS, specialty enum, places and geo with six decimals", async ({
	request,
}) => {
	const html = await (await request.get("/praticien/camille-exemple-19999990013")).text();
	const nodes = JSON.parse(parse(html).jsonLd[0] ?? "")["@graph"] as Node[];
	const person = nodes.find((node) => node["@type"] === "IndividualPhysician") as Node;
	expect(person.identifier).toEqual({
		"@type": "PropertyValue",
		propertyID: "RPPS",
		value: "19999990013",
	});
	expect(person.medicalSpecialty).toBe("https://schema.org/PrimaryCare");
	expect(person).not.toHaveProperty("potentialAction");
	expect(person).not.toHaveProperty("givenName");
	const office = nodes.find((node) => node["@type"] === "PhysiciansOffice") as Node;
	const geo = office.geo as { latitude: string; longitude: string } | undefined;
	if (geo) {
		expect(geo.latitude).toMatch(/^-?\d+\.\d{5,}$/);
		expect(geo.longitude).toMatch(/^-?\d+\.\d{5,}$/);
	}
	if (person.telephone) expect(person.telephone).toMatch(/^\+[1-9]\d{6,14}$/);
});

test("only a bookable page carries a ReserveAction and promises booking", async ({ request }) => {
	const html = await (await request.get(`/praticien/${BOOKABLE}`)).text();
	const page = parse(html);
	const person = (JSON.parse(page.jsonLd[0] ?? "")["@graph"] as Node[]).find(
		(node) => node["@type"] === "IndividualPhysician",
	) as Node;
	expect(person.potentialAction).toMatchObject({
		"@type": "ReserveAction",
		target: { urlTemplate: expect.stringMatching(/\?rdv=1$/) },
	});
	expect(page.meta("description")[0]).toMatch(/rendez-vous en ligne/);

	const closed = parse(await (await request.get("/praticien/camille-exemple-19999990013")).text());
	expect(closed.meta("description")[0]).not.toMatch(/rendez-vous/);
});

test("an owner-completed page links the owner's website and languages", async ({ request }) => {
	// The import refresh is revalidated in the background: the next render carries it.
	await expect
		.poll(
			async () => {
				const html = await (await request.get(`/praticien/${OWNER.slug}`)).text();
				const nodes = JSON.parse(parse(html).jsonLd[0] ?? "")["@graph"] as Node[];
				const dentist = nodes.find((node) => node["@type"] === "Dentist");
				return { sameAs: dentist?.sameAs, knowsLanguage: dentist?.knowsLanguage };
			},
			{ timeout: 15_000 },
		)
		.toEqual({ sameAs: "https://cabinet-fictif.example", knowsLanguage: ["fr", "en"] });
});

test("the sitelinks search box target answers", async ({ request }) => {
	const html = await (await request.get("/")).text();
	const nodes = JSON.parse(parse(html).jsonLd[0] ?? "")["@graph"] as Node[];
	const website = nodes.find((node) => node["@type"] === "WebSite") as Node;
	const template = (website.potentialAction as { target: { urlTemplate: string } }).target
		.urlTemplate;
	const response = await request.get(template.replace("{search_term_string}", "Exemple"), {
		maxRedirects: 0,
	});
	expect([200, 307]).toContain(response.status());
});

test("icons, manifest and the favicon answer outside the locale routing", async ({ request }) => {
	for (const path of ["/icon/48", "/icon/192", "/icon/512", "/apple-icon"]) {
		const response = await request.get(path);
		expect(response.status(), path).toBe(200);
		expect(response.headers()["content-type"]).toBe("image/png");
	}
	const manifest = await (await request.get("/manifest.webmanifest")).json();
	expect(manifest.icons).toHaveLength(2);
	const favicon = await request.get("/favicon.ico", { maxRedirects: 0 });
	expect(favicon.status()).toBe(308);
	expect(favicon.headers().location).toBe("/icon/48");
});

test.describe("status codes and redirects", () => {
	for (const [from, to] of [
		["/fr", "/"],
		["/fr/medecin-generaliste/75-paris", "/medecin-generaliste/75-paris"],
		["/Medecin-Generaliste/75-Paris", "/medecin-generaliste/75-paris"],
		["/praticien/Camille-Exemple-19999990013", "/praticien/camille-exemple-19999990013"],
		["/medecin-generaliste/", "/medecin-generaliste"],
		["/en/annuaire", "/en/directory"],
		["/medecin-generaliste/75-paris/paris", "/medecin-generaliste/75-paris"],
		["/annuaire/75-paris/paris", "/annuaire/75-paris"],
		["/etablissement/autre-nom-2a9999001", "/etablissement/centre-hospitalier-fictif-2a9999001"],
	] as const) {
		test(`${from} answers 308 to ${to}`, async ({ request }) => {
			const response = await request.get(from, { maxRedirects: 0 });
			expect(response.status()).toBe(308);
			// Next.js 16.4 repeats the (identical) Location header on the first, uncached render
			// of a page-level redirect; clients follow either copy.
			const targets = new Set(
				(response.headers().location ?? "")
					.split(/,\s*/)
					.map((location) => new URL(location, "http://x").pathname),
			);
			expect([...targets]).toEqual([to]);
		});
	}

	test("unknown pages answer a real 404 with noindex, never a soft 404", async ({ request }) => {
		for (const path of [
			"/inconnu",
			"/m%C3%A9decin-generaliste",
			"/praticien/camille-exemple-19999990014",
			"/etablissement/inconnu-759999999",
		]) {
			const response = await request.get(path, { maxRedirects: 0 });
			expect(response.status(), path).toBe(404);
			expect(parse(await response.text()).meta("robots")).toContain("noindex");
		}
	});

	test("search, the practitioner space and its forms are noindex in headers too", async ({
		request,
	}) => {
		for (const path of [
			"/recherche?quoi=Exemple",
			"/pro/connexion",
			"/praticien/camille-exemple-19999990013/signaler",
		]) {
			const response = await request.get(path, { maxRedirects: 0 });
			expect(response.headers()["x-robots-tag"], path).toContain("noindex");
		}
		expect((await request.get("/pro")).headers()["x-robots-tag"]).toBeUndefined();
	});
});

test.describe("sitemaps", () => {
	const LOC = /<loc>([^<]+)<\/loc>/g;
	const LASTMOD = /<lastmod>([^<]+)<\/lastmod>/g;

	test("the index and every chunk are valid sitemaps of indexable canonical 200 URLs", async ({
		request,
		baseURL,
	}) => {
		test.setTimeout(240_000);
		const origin = new URL(baseURL ?? "").origin;
		const index = await request.get("/sitemap.xml");
		expect(index.headers()["content-type"]).toContain("xml");
		const indexXml = await index.text();
		expect(indexXml).toMatch(
			/^<\?xml version="1\.0" encoding="UTF-8"\?>\n<sitemapindex xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/,
		);
		const chunks = [...indexXml.matchAll(LOC)].map((match) => match[1] ?? "");
		expect(chunks.length).toBeGreaterThan(1);
		for (const lastmod of indexXml.matchAll(LASTMOD)) {
			expect(lastmod[1]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		}

		const urls: string[] = [];
		for (const chunk of chunks) {
			expect(chunk.startsWith(`${origin}/sitemaps/`)).toBe(true);
			const response = await request.get(chunk);
			expect(response.status(), chunk).toBe(200);
			const xml = await response.text();
			expect(xml).toMatch(/<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
			expect(xml).not.toMatch(/changefreq|priority/);
			const locs = [...xml.matchAll(LOC)].map((match) => match[1] ?? "");
			expect(locs.length).toBeGreaterThan(0);
			expect(locs.length).toBeLessThanOrEqual(50_000);
			for (const lastmod of xml.matchAll(LASTMOD)) {
				expect(lastmod[1]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
			}
			urls.push(...locs);
		}
		expect(new Set(urls).size).toBe(urls.length);

		for (const url of urls) {
			expect(url.startsWith(origin), url).toBe(true);
			expect(url, url).not.toMatch(/\/en(\/|$)|\/recherche|\/pro\/|\/rdv/);
			const response = await request.get(url, { maxRedirects: 0 });
			expect(response.status(), url).toBe(200);
			expect(response.headers()["x-robots-tag"], url).toBeUndefined();
			const page = parse(await response.text());
			expect(page.meta("robots"), url).toEqual(["index, follow"]);
			const canonical = page.links.find((link) => link.rel === "canonical")?.href ?? "";
			expect(canonical.replace(/\/$/, ""), url).toBe(url.replace(/\/$/, ""));
		}
	});

	test("robots.txt points to the index and never hides a noindex page linked publicly", async ({
		request,
	}) => {
		const body = await (await request.get("/robots.txt")).text();
		expect(body).toMatch(/^Sitemap: https?:\/\/[^\s]+\/sitemap\.xml$/m);
		const disallowed = [...body.matchAll(/^Disallow: (.+)$/gm)].map((match) => match[1] ?? "");
		for (const path of [
			"/pro",
			"/pro/connexion",
			"/pro/inscription",
			"/pro/revendiquer?rpps=19999990013",
			"/praticien/camille-exemple-19999990013/signaler",
			"/en/practitioner/camille-exemple-19999990013",
		]) {
			expect(
				disallowed.some((prefix) => path.startsWith(prefix)),
				path,
			).toBe(false);
		}
	});
});
