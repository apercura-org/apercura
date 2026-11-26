import { signRevalidation } from "@apercura/core/revalidation";
import { type APIRequestContext, expect, test } from "@playwright/test";
import { E2E_BOOKING_ENV } from "./booking-env";
import { BOOKING_PRACTITIONERS } from "./booking-seed";
import { testDb } from "./pro";

/*
 * Technical SEO of every public page type, read from the SERVER HTML (what
 * crawlers get): one title and description of the right length, a self
 * canonical, the robots policy, one parseable JSON-LD @graph of linked
 * entities, one h1, hreflang on the two homes only. Then status codes, the
 * redirects of the former scheme and hosts, and the sitemaps. Against the
 * SYNTHETIC fixtures (fictitious people, RPPS 1999999xxxx).
 */

const OWNER = { rpps: "19999991383", slug: "ines-essaibm-19999991383" };
const BOOKABLE = BOOKING_PRACTITIONERS.direct.slug;

type Expected = {
	path: string;
	robots: "index, follow" | "noindex, follow";
	/** schema.org types the page's graph must contain. */
	types: string[];
	lang?: "fr" | "en" | "de" | "es" | "it" | "de-AT" | "en-GB" | "cs-CZ";
	/** The homes (`/fr` and the international `/`) print hreflang `fr-FR` and `x-default`. */
	hreflang?: true;
};

const PAGES: Expected[] = [
	// The international home: in English, indexed, outside the locales.
	{
		path: "/",
		robots: "index, follow",
		types: ["WebPage", "WebSite", "Organization"],
		lang: "en",
		hreflang: true,
	},
	{
		path: "/fr",
		robots: "index, follow",
		types: ["WebPage", "WebSite", "Organization"],
		hreflang: true,
	},
	{
		path: "/fr/medecin-generaliste",
		robots: "index, follow",
		types: ["CollectionPage", "ItemList"],
	},
	// Austria, indexed in German under its own segment.
	{
		path: "/at",
		robots: "index, follow",
		types: ["WebPage", "WebSite", "Organization"],
		lang: "de-AT",
		hreflang: true,
	},
	{
		path: "/at/allgemeinmedizin/wien",
		robots: "index, follow",
		types: ["CollectionPage", "BreadcrumbList", "ItemList"],
		lang: "de-AT",
	},
	{
		path: "/at/arzt/anna-beispiel-w900001",
		robots: "index, follow",
		types: ["WebPage", "BreadcrumbList", "IndividualPhysician", "PhysiciansOffice"],
		lang: "de-AT",
	},
	// The United Kingdom, indexed in British English under its own segment.
	{
		path: "/gb",
		robots: "index, follow",
		types: ["WebPage", "WebSite", "Organization"],
		lang: "en-GB",
		hreflang: true,
	},
	{
		path: "/gb/gp-practices/stockton-on-tees",
		robots: "index, follow",
		types: ["CollectionPage", "BreadcrumbList", "ItemList"],
		lang: "en-GB",
	},
	{
		path: "/gb/gp-practices/north-east",
		robots: "index, follow",
		types: ["CollectionPage", "BreadcrumbList", "ItemList"],
		lang: "en-GB",
	},
	{
		path: "/gb/practice/the-example-surgery-a99001",
		robots: "index, follow",
		types: ["WebPage", "BreadcrumbList", "MedicalClinic"],
		lang: "en-GB",
	},
	// Czechia, indexed in Czech under its own segment.
	{
		path: "/cz",
		robots: "index, follow",
		types: ["WebPage", "WebSite", "Organization"],
		lang: "cs-CZ",
		hreflang: true,
	},
	{
		path: "/cz/prakticky-lekar/praha/praha-2",
		robots: "index, follow",
		types: ["CollectionPage", "BreadcrumbList", "ItemList"],
		lang: "cs-CZ",
	},
	{
		path: "/cz/zarizeni/mudr-jana-ukazkova-900001",
		robots: "index, follow",
		types: ["WebPage", "BreadcrumbList", "MedicalClinic"],
		lang: "cs-CZ",
	},
	{
		path: "/fr/medecin-generaliste/75-paris",
		robots: "index, follow",
		types: ["CollectionPage", "BreadcrumbList", "ItemList"],
	},
	{
		path: "/fr/medecin-generaliste/75-paris/2",
		robots: "index, follow",
		types: ["CollectionPage", "BreadcrumbList", "ItemList"],
	},
	{
		path: "/fr/medecin-generaliste/75-paris/paris-15e-arrondissement",
		robots: "index, follow",
		types: ["CollectionPage", "BreadcrumbList", "ItemList"],
	},
	{ path: "/fr/cardiologue/75-paris", robots: "noindex, follow", types: ["CollectionPage"] },
	{ path: "/fr/annuaire", robots: "index, follow", types: ["CollectionPage", "ItemList"] },
	{ path: "/fr/annuaire/75-paris", robots: "index, follow", types: ["CollectionPage", "ItemList"] },
	// Lyon has fewer than three practitioners per listing in the fixtures.
	{ path: "/fr/annuaire/69-rhone/lyon", robots: "noindex, follow", types: ["CollectionPage"] },
	{
		path: "/fr/praticien/camille-exemple-19999990013",
		robots: "index, follow",
		types: ["WebPage", "BreadcrumbList", "IndividualPhysician", "PhysiciansOffice"],
	},
	{
		path: "/fr/praticien/fanny-placebo-19999990088",
		robots: "index, follow",
		types: ["Person", "Hospital"],
	},
	{
		path: "/fr/praticien/alice-specimen-19999990039",
		robots: "index, follow",
		types: ["IndividualPhysician", "MedicalClinic"],
	},
	{ path: `/fr/praticien/${OWNER.slug}`, robots: "index, follow", types: ["Dentist"] },
	{ path: `/fr/praticien/${BOOKABLE}`, robots: "index, follow", types: ["IndividualPhysician"] },
	{
		path: "/fr/etablissement/centre-hospitalier-fictif-2a9999001",
		robots: "index, follow",
		types: ["WebPage", "BreadcrumbList", "Hospital"],
	},
	{ path: "/fr/pro", robots: "index, follow", types: ["WebPage"] },
	{ path: "/fr/a-propos", robots: "index, follow", types: ["AboutPage", "BreadcrumbList"] },
	{ path: "/fr/donnees", robots: "index, follow", types: ["WebPage", "BreadcrumbList"] },
	{ path: "/fr/mentions-legales", robots: "index, follow", types: ["WebPage"] },
	{ path: "/fr-en", robots: "noindex, follow", types: ["WebSite"], lang: "en" },
	{
		path: "/fr-en/practitioner/camille-exemple-19999990013",
		robots: "noindex, follow",
		types: ["IndividualPhysician"],
		lang: "en",
	},
	{ path: "/fr-en/directory", robots: "noindex, follow", types: ["CollectionPage"], lang: "en" },
	// German, Spanish and Italian: interface only, never indexed in v1.
	...(
		[
			["de", "behandler", "verzeichnis"],
			["es", "profesional", "directorio"],
			["it", "professionista", "elenco"],
		] as const
	).flatMap(([lang, practitioner, directory]): Expected[] => [
		{ path: `/fr-${lang}`, robots: "noindex, follow", types: ["WebSite"], lang },
		{
			path: `/fr-${lang}/${practitioner}/camille-exemple-19999990013`,
			robots: "noindex, follow",
			types: ["IndividualPhysician"],
			lang,
		},
		{
			path: `/fr-${lang}/${directory}`,
			robots: "noindex, follow",
			types: ["CollectionPage"],
			lang,
		},
	]),
];

const OG_LOCALES = {
	fr: "fr_FR",
	en: "en_GB",
	de: "de_DE",
	es: "es_ES",
	it: "it_IT",
	"de-AT": "de_AT",
	"en-GB": "en_GB",
	"cs-CZ": "cs_CZ",
} as const;

const FORBIDDEN_KEYS = ["aggregateRating", "review", "reviews", "ratingValue"];
/** schema.org LocalBusiness subtypes the pages use (Hospital through EmergencyService). */
const LOCAL_BUSINESSES = new Set([
	"IndividualPhysician",
	"Dentist",
	"PhysiciansOffice",
	"MedicalClinic",
	"Hospital",
	"Pharmacy",
]);

const ENTITIES: Record<string, string> = {
	"&amp;": "&",
	"&#x27;": "'",
	"&#39;": "'",
	"&quot;": '"',
};

/** HTML entities decoded in a single pass (never twice: `&amp;#39;` stays `&#39;`). */
const decode = (text: string) =>
	text.replace(/&(?:amp|#x27|#39|quot);/g, (entity) => ENTITIES[entity] ?? entity);

/** The SEO-relevant parts of a server-rendered page. */
function parse(html: string) {
	const attr = (tag: string, name: string) => {
		// Attribute names are case-insensitive (React prints `hrefLang`).
		const value = new RegExp(`\\b${name}="([^"]*)"`, "i").exec(tag)?.[1];
		return value === undefined ? null : decode(value);
	};
	const tags = (pattern: RegExp) => [...html.matchAll(pattern)].map((match) => match[0]);
	const meta = (key: string) =>
		tags(/<meta\b[^>]*>/g)
			.filter((tag) => attr(tag, "name") === key || attr(tag, "property") === key)
			.map((tag) => attr(tag, "content"));
	return {
		lang: /<html[^>]*\blang="([^"]+)"/.exec(html)?.[1],
		titles: [...html.matchAll(/<title>([^<]*)<\/title>/g)].map((match) => decode(match[1] ?? "")),
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
		expect(title.length).toBeLessThanOrEqual(60);
		// The brand ends every title, unless a practitioner's (or a UK practice's, a Czech
		// facility's) place would not fit with it.
		if (!/ · Apercura$|^Apercura · /.test(title)) {
			expect(expected.path).toMatch(
				/^\/(?:fr(?:-[a-z]{2})?\/[a-z]+\/[a-z0-9-]+-\d{11}|at\/arzt\/[a-z0-9-]+-[a-z]{1,2}\d{1,9}|gb\/practice\/[a-z0-9-]+-[a-z0-9]{2,12}|cz\/zarizeni\/[a-z0-9-]+-\d{1,9})$/,
			);
			expect(`${title} · Apercura`.length).toBeGreaterThan(60);
		}
		const [description] = page.meta("description");
		expect(description?.length).toBeGreaterThan(40);
		expect(description?.length).toBeLessThanOrEqual(155);
		expect(page.h1).toBe(1);

		// Self canonical, absolute; robots by the indexing rules; hreflang on the homes only.
		const canonical = page.links.filter((link) => link.rel === "canonical");
		expect(canonical).toHaveLength(1);
		expect(new URL(canonical[0]?.href ?? "").pathname.replace(/\/$/, "")).toBe(
			expected.path.replace(/\/$/, ""),
		);
		expect(canonical[0]?.href?.startsWith(origin)).toBe(true);
		expect(page.meta("robots")).toEqual([expected.robots]);
		const alternates = page.links
			.filter((link) => link.hreflang)
			.map((link) => ({
				rel: link.rel,
				hreflang: link.hreflang,
				href: link.href?.replace(/\/$/, ""),
			}));
		if (expected.hreflang) {
			// The homes of the open markets and the international one.
			expect(alternates).toHaveLength(5);
			expect(alternates).toEqual(
				expect.arrayContaining([
					{ rel: "alternate", hreflang: "fr-FR", href: `${origin}/fr` },
					{ rel: "alternate", hreflang: "de-AT", href: `${origin}/at` },
					{ rel: "alternate", hreflang: "en-GB", href: `${origin}/gb` },
					{ rel: "alternate", hreflang: "cs-CZ", href: `${origin}/cz` },
					{ rel: "alternate", hreflang: "x-default", href: origin },
				]),
			);
		} else {
			expect(alternates).toEqual([]);
		}
		expect(response.headers().link ?? "").not.toContain("hreflang");
		if (expected.robots === "noindex, follow" && (expected.lang ?? "fr") !== "fr") {
			expect(response.headers()["x-robots-tag"]).toContain("noindex");
		} else if (expected.robots === "index, follow") {
			expect(response.headers()["x-robots-tag"]).toBeUndefined();
		}

		// Open Graph and Twitter cards.
		expect(page.meta("og:locale")).toEqual([OG_LOCALES[expected.lang ?? "fr"]]);
		expect(page.meta("og:site_name")).toEqual(["Apercura"]);
		// A practitioner page shows its own card (`/og/praticien/{slug}.png`, `gb.{slug}` for a UK
		// practice, `cz.{slug}` for a Czech facility), others a generic image.
		expect(page.meta("og:image")[0]).toMatch(
			new RegExp(`^${origin}/og/(?:praticien/(?:gb\\.|cz\\.)?[a-z0-9-]+|[a-z-]+)\\.png$`),
		);
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
			expect(address?.addressCountry, node["@id"]).toBe(
				expected.path.startsWith("/at")
					? "AT"
					: expected.path.startsWith("/gb")
						? "GB"
						: expected.path.startsWith("/cz")
							? "CZ"
							: "FR",
			);
			expect(address?.addressLocality ?? address?.postalCode, node["@id"]).toBeTruthy();
		}
		for (const crumbs of nodes.filter((item) => item["@type"] === "BreadcrumbList")) {
			const items = crumbs.itemListElement as { position: number; name: string; item: string }[];
			const lang = expected.lang ?? "fr";
			const home =
				lang === "fr"
					? `${origin}/fr`
					: lang === "de-AT"
						? `${origin}/at`
						: lang === "en-GB"
							? `${origin}/gb`
							: lang === "cs-CZ"
								? `${origin}/cz`
								: `${origin}/fr-${lang}`;
			expect(items[0]?.item).toBe(home);
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
	const html = await (await request.get("/fr/praticien/camille-exemple-19999990013")).text();
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
	const html = await (await request.get(`/fr/praticien/${BOOKABLE}`)).text();
	const page = parse(html);
	const person = (JSON.parse(page.jsonLd[0] ?? "")["@graph"] as Node[]).find(
		(node) => node["@type"] === "IndividualPhysician",
	) as Node;
	expect(person.potentialAction).toMatchObject({
		"@type": "ReserveAction",
		target: { urlTemplate: expect.stringMatching(/\?rdv=1$/) },
	});
	expect(page.meta("description")[0]).toMatch(/rendez-vous en ligne/);

	const closed = parse(
		await (await request.get("/fr/praticien/camille-exemple-19999990013")).text(),
	);
	expect(closed.meta("description")[0]).not.toMatch(/rendez-vous/);
});

test("an owner-completed page links the owner's website and languages", async ({ request }) => {
	// The import refresh is revalidated in the background: the next render carries it.
	await expect
		.poll(
			async () => {
				const html = await (await request.get(`/fr/praticien/${OWNER.slug}`)).text();
				const nodes = JSON.parse(parse(html).jsonLd[0] ?? "")["@graph"] as Node[];
				const dentist = nodes.find((node) => node["@type"] === "Dentist");
				return { sameAs: dentist?.sameAs, knowsLanguage: dentist?.knowsLanguage };
			},
			{ timeout: 15_000 },
		)
		.toEqual({ sameAs: "https://cabinet-fictif.example", knowsLanguage: ["fr", "en"] });
});

test("both homes print the same WebSite and Organization, with a logo that answers", async ({
	request,
	baseURL,
}) => {
	const origin = new URL(baseURL ?? "").origin;
	const siteEntities = async (path: string) => {
		const html = await (await request.get(path)).text();
		const nodes = JSON.parse(parse(html).jsonLd[0] ?? "")["@graph"] as Node[];
		return nodes.filter((node) => node["@type"] === "WebSite" || node["@type"] === "Organization");
	};
	const international = await siteEntities("/");
	// One @id names one entity: nothing in it depends on the page's language.
	for (const path of ["/fr", "/fr-en", "/fr-de"]) {
		expect(await siteEntities(path), path).toEqual(international);
	}
	const website = international.find((node) => node["@type"] === "WebSite") as Node;
	expect(website).toMatchObject({
		"@id": `${origin}/#website`,
		url: `${origin}/`,
		name: "Apercura",
		publisher: { "@id": `${origin}/#organization` },
	});
	// Google retired the sitelinks search box; the search pages are disallowed in robots.txt.
	expect(website).not.toHaveProperty("potentialAction");
	const organization = international.find((node) => node["@type"] === "Organization") as Node;
	const logo = organization.logo as { url: string; width: string; height: string };
	expect(logo).toMatchObject({ width: "512", height: "512" });
	const image = await request.get(logo.url);
	expect(image.status()).toBe(200);
	expect(image.headers()["content-type"]).toBe("image/png");
});

test("a department listing never links the Paris city, whose URL redirects back to it", async ({
	request,
}) => {
	// The Paris city (Insee 75056) is the department page: a listing of practitioners whose
	// address names only "Paris" must not appear among the department's communes. Synthetic
	// rows on a listing no other spec reads; a count bump shows the page was rendered again.
	const sql = testDb();
	const department = "/fr/dermatologue/75-paris";
	const [city] = await sql<{ id: number }[]>`
		SELECT id FROM directory.places WHERE code = '75056' AND kind = 'commune'
	`;
	const [paris] = await sql<{ id: number }[]>`
		SELECT id FROM directory.places WHERE code = '75' AND kind = 'department'
	`;
	const [arrondissement] = await sql<{ id: number; count: number }[]>`
		SELECT lp.id, lp.practitioner_count AS count FROM directory.landing_pages lp
		JOIN directory.places p ON p.id = lp.place_id AND p.kind = 'arrondissement'
		WHERE lp.listing_slug = 'dermatologue' AND p.department_code = '75'
		ORDER BY lp.id LIMIT 1
	`;
	if (!city || !paris || !arrondissement) throw new Error("Import the synthetic fixtures first");
	const cityKey = `dermatologue:${city.id}`;
	try {
		await sql`
			INSERT INTO directory.landing_pages
				(key, listing_slug, place_id, practitioner_count, payload, indexable, content_hash)
			VALUES (${cityKey}, 'dermatologue', ${city.id}, 3, '{}', true, 'e2e')
		`;
		await sql`
			UPDATE directory.landing_pages SET practitioner_count = 7 WHERE id = ${arrondissement.id}
		`;
		await revalidate(request, [`listing:dermatologue:${paris.id}`]);
		await expect
			.poll(async () => (await (await request.get(department)).text()).includes("7 praticiens"), {
				timeout: 15_000,
			})
			.toBe(true);
		const html = await (await request.get(department)).text();
		expect(html).toContain('href="/fr/dermatologue/75-paris/paris-');
		expect(html).not.toContain('href="/fr/dermatologue/75-paris/paris"');
	} finally {
		await sql`DELETE FROM directory.landing_pages WHERE key = ${cityKey}`;
		await sql`
			UPDATE directory.landing_pages SET practitioner_count = ${arrondissement.count}
			WHERE id = ${arrondissement.id}
		`;
		await revalidate(request, [`listing:dermatologue:${paris.id}`]);
		await sql.end();
	}
});

test("icons, manifest and the favicon answer outside the locale routing", async ({ request }) => {
	const manifest = await (await request.get("/manifest.webmanifest")).json();
	const icons = manifest.icons as { src: string; sizes: string; purpose: string }[];
	expect(icons.map(({ sizes, purpose }) => `${sizes} ${purpose}`)).toEqual([
		"192x192 any",
		"512x512 any",
		"192x192 maskable",
		"512x512 maskable",
	]);
	const pngs = ["/icon/48", "/apple-icon", "/brand/apercura-logo.png", ...icons.map((i) => i.src)];
	for (const path of pngs) {
		const response = await request.get(path);
		expect(response.status(), path).toBe(200);
		expect(response.headers()["content-type"], path).toBe("image/png");
	}
	// The scheme-aware SVG favicon, linked from every page next to the raster sizes.
	const html = await (await request.get("/fr")).text();
	const svgIcon = html.match(
		/<link rel="icon" href="(\/icon\.svg[^"]*)"[^>]*type="image\/svg\+xml"/,
	);
	expect(svgIcon, "an SVG icon link").not.toBeNull();
	const svg = await request.get(svgIcon?.[1] ?? "");
	expect(svg.status()).toBe(200);
	expect(svg.headers()["content-type"]).toContain("image/svg+xml");
	expect(await svg.text()).toContain("prefers-color-scheme:dark");
	const favicon = await request.get("/favicon.ico", { maxRedirects: 0 });
	expect(favicon.status()).toBe(308);
	expect(favicon.headers().location).toBe("/icon/48");
});

test.describe("status codes and redirects", () => {
	/** The single target of a redirect (Next.js 16.4 may repeat an identical Location header). */
	const locationOf = (response: { headers(): Record<string, string> }) => {
		const targets = new Set(
			(response.headers().location ?? "").split(/,\s*/).map((location) => {
				const url = new URL(location, "http://x");
				return `${url.pathname}${url.search}`;
			}),
		);
		expect(targets.size).toBe(1);
		return [...targets][0];
	};

	for (const [from, to] of [
		["/fr/Medecin-Generaliste/75-Paris", "/fr/medecin-generaliste/75-paris"],
		["/FR/annuaire", "/fr/annuaire"],
		["/fr/praticien/Camille-Exemple-19999990013", "/fr/praticien/camille-exemple-19999990013"],
		["/fr/medecin-generaliste/", "/fr/medecin-generaliste"],
		["/fr-en/annuaire", "/fr-en/directory"],
		["/fr/medecin-generaliste/75-paris/paris", "/fr/medecin-generaliste/75-paris"],
		["/fr/annuaire/75-paris/paris", "/fr/annuaire/75-paris"],
		[
			"/fr/etablissement/autre-nom-2a9999001",
			"/fr/etablissement/centre-hospitalier-fictif-2a9999001",
		],
	] as const) {
		test(`${from} answers 308 to ${to}`, async ({ request }) => {
			const response = await request.get(from, { maxRedirects: 0 });
			expect(response.status()).toBe(308);
			expect(locationOf(response)).toBe(to);
		});
	}

	// The former scheme on the canonical host itself: French pages had no prefix, other
	// locales their code. Old locale prefixes stay temporary: /de, /es, /it are future markets.
	for (const [from, to, status] of [
		["/medecin-generaliste/75-paris", "/fr/medecin-generaliste/75-paris", 301],
		["/Medecin-Generaliste/75-Paris?page=2", "/fr/medecin-generaliste/75-paris?page=2", 301],
		["/praticien/camille-exemple-19999990013", "/fr/praticien/camille-exemple-19999990013", 301],
		["/mentions-legales", "/fr/mentions-legales", 301],
		["/pro/connexion", "/fr/pro/connexion", 301],
		["/en", "/fr-en", 307],
		["/en/legal-notice", "/fr-en/legal-notice", 307],
		["/de/impressum", "/fr-de/impressum", 307],
		[
			"/it/professionista/camille-exemple-19999990013",
			"/fr-it/professionista/camille-exemple-19999990013",
			307,
		],
		["/sitemaps/pages-0.xml", "/sitemaps/fr/pages-0.xml", 301],
	] as const) {
		test(`${from} (former scheme) answers ${status} to ${to}`, async ({ request }) => {
			const response = await request.get(from, { maxRedirects: 0 });
			expect(response.status()).toBe(status);
			expect(locationOf(response)).toBe(to);
		});
	}

	test("the root is the international home, never a redirect on the visitor's language", async ({
		request,
	}) => {
		for (const language of ["fr-FR,fr;q=0.9", "de-DE", "en-GB", ""]) {
			const response = await request.get("/", {
				maxRedirects: 0,
				headers: language ? { "accept-language": language } : {},
			});
			expect(response.status(), language).toBe(200);
			expect(response.headers()["set-cookie"], language).toBeUndefined();
		}
	});

	test("unknown pages answer a real 404 with noindex, never a soft 404", async ({ request }) => {
		for (const path of [
			"/fr/inconnu",
			"/fr/m%C3%A9decin-generaliste",
			"/fr/praticien/camille-exemple-19999990014",
			"/fr/etablissement/inconnu-759999999",
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
			"/fr/recherche?quoi=Exemple",
			"/fr/pro/connexion",
			"/fr/praticien/camille-exemple-19999990013/signaler",
			"/fr-en/practitioner/camille-exemple-19999990013/report",
		]) {
			const response = await request.get(path, { maxRedirects: 0 });
			expect(response.headers()["x-robots-tag"], path).toContain("noindex");
		}
		expect((await request.get("/fr/pro")).headers()["x-robots-tag"]).toBeUndefined();
		expect((await request.get("/")).headers()["x-robots-tag"]).toBeUndefined();
	});
});

/** Pages another spec unpublishes and publishes again during the run (owner.spec.ts). */
const MUTATED_BY_OTHER_SPECS = ["/fr/praticien/benoit-essaial-19999991110"];

/** Requests in flight at once when the sitemap test walks its chunks and their URLs. */
const SITEMAP_CONCURRENCY = 10;

/**
 * `fn` over every item with at most `limit` calls in flight, results in the items' order.
 * After a failure no new item starts, and the calls already running are awaited before the
 * first error is rethrown, so none outlives the test and its request context.
 */
async function mapConcurrently<T, R>(
	items: readonly T[],
	limit: number,
	fn: (item: T) => Promise<R>,
): Promise<R[]> {
	const results: R[] = new Array(items.length);
	let next = 0;
	let failed = false;
	const worker = async () => {
		while (!failed && next < items.length) {
			const index = next++;
			try {
				results[index] = await fn(items[index] as T);
			} catch (error) {
				failed = true;
				throw error;
			}
		}
	};
	const settled = await Promise.allSettled(
		Array.from({ length: Math.min(limit, items.length) }, worker),
	);
	const rejected = settled.find((outcome) => outcome.status === "rejected");
	if (rejected) throw rejected.reason;
	return results;
}

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
		expect(chunks.length).toBeGreaterThan(2);
		// The international home, then each open market's files under its segment.
		expect(chunks.slice(0, 2)).toEqual([
			`${origin}/sitemaps/international.xml`,
			`${origin}/sitemaps/fr/pages-0.xml`,
		]);
		expect(chunks).toContain(`${origin}/sitemaps/at/pages-0.xml`);
		expect(chunks).toContain(`${origin}/sitemaps/gb/pages-0.xml`);
		expect(chunks).toContain(`${origin}/sitemaps/gb/praticiens-0.xml`);
		expect(chunks).toContain(`${origin}/sitemaps/cz/pages-0.xml`);
		expect(chunks).toContain(`${origin}/sitemaps/cz/praticiens-0.xml`);
		for (const chunk of chunks.slice(1))
			expect(/\/sitemaps\/(fr|at|gb|cz)\//.test(chunk), chunk).toBe(true);
		for (const lastmod of indexXml.matchAll(LASTMOD)) {
			expect(lastmod[1]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		}

		const started = Date.now();
		const chunkLocs = await mapConcurrently(chunks, SITEMAP_CONCURRENCY, async (chunk) => {
			expect(chunk.startsWith(`${origin}/sitemaps/`), chunk).toBe(true);
			const response = await request.get(chunk);
			expect(response.status(), chunk).toBe(200);
			const xml = await response.text();
			expect(xml, chunk).toMatch(
				/<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/,
			);
			expect(xml, chunk).not.toMatch(/changefreq|priority/);
			const locs = [...xml.matchAll(LOC)].map((match) => match[1] ?? "");
			expect(locs.length, chunk).toBeGreaterThan(0);
			expect(locs.length, chunk).toBeLessThanOrEqual(50_000);
			for (const lastmod of xml.matchAll(LASTMOD)) {
				expect(lastmod[1], chunk).toMatch(/^\d{4}-\d{2}-\d{2}$/);
			}
			return locs;
		});
		// In the index's order, whatever order the chunks answered in.
		const urls = chunkLocs.flat();
		expect(new Set(urls).size).toBe(urls.length);
		expect(urls).toContain(`${origin}/`);
		expect(urls).toContain(`${origin}/fr`);
		expect(urls).toContain(`${origin}/at`);
		expect(urls).toContain(`${origin}/gb`);
		expect(urls).toContain(`${origin}/cz`);

		await mapConcurrently(urls, SITEMAP_CONCURRENCY, async (url) => {
			// owner.spec.ts removes and restores this claimed page while the specs run in
			// parallel (#119): the sitemap, cached up to five minutes, may still list it meanwhile.
			if (MUTATED_BY_OTHER_SPECS.some((path) => url === `${origin}${path}`)) return;
			// The international home and each market's own language: France in French, Austria in
			// German, the UK in English, Czechia in Czech. Interface translations (/fr-de…) are never
			// listed.
			expect(
				url === `${origin}/` ||
					[`${origin}/fr`, `${origin}/at`, `${origin}/gb`, `${origin}/cz`].some(
						(home) => url === home || url.startsWith(`${home}/`),
					),
				url,
			).toBe(true);
			expect(url, url).not.toMatch(/\/recherche|\/pro\/|\/rdv/);
			const response = await request.get(url, { maxRedirects: 0 });
			expect(response.status(), url).toBe(200);
			expect(response.headers()["x-robots-tag"], url).toBeUndefined();
			const page = parse(await response.text());
			expect(page.meta("robots"), url).toEqual(["index, follow"]);
			const canonical = page.links.find((link) => link.rel === "canonical")?.href ?? "";
			expect(canonical.replace(/\/$/, ""), url).toBe(url.replace(/\/$/, ""));
		});
		test.info().annotations.push({
			type: "sitemap",
			description: `${chunks.length} chunks and ${urls.length} URLs checked in ${Date.now() - started} ms (concurrency ${SITEMAP_CONCURRENCY})`,
		});
	});

	test("robots.txt points to the index and never hides a noindex page linked publicly", async ({
		request,
	}) => {
		const body = await (await request.get("/robots.txt")).text();
		expect(body).toMatch(/^Sitemap: https?:\/\/[^\s]+\/sitemap\.xml$/m);
		const disallowed = [...body.matchAll(/^Disallow: (.+)$/gm)].map((match) => match[1] ?? "");
		for (const path of [
			"/",
			"/fr",
			"/fr/pro",
			"/fr/pro/connexion",
			"/fr/pro/inscription",
			"/fr/pro/revendiquer?rpps=19999990013",
			"/fr/praticien/camille-exemple-19999990013/signaler",
			"/fr-en/practitioner/camille-exemple-19999990013",
			"/fr-de/behandler/camille-exemple-19999990013",
			"/fr-es/profesional/camille-exemple-19999990013",
			"/fr-it/professionista/camille-exemple-19999990013",
			"/fr-it/professionista/camille-exemple-19999990013/segnalazione",
		]) {
			expect(
				disallowed.some((prefix) => path.startsWith(prefix)),
				path,
			).toBe(false);
		}
	});
});
