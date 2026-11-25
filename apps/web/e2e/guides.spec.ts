import { expect, test } from "@playwright/test";
import { axeViolations } from "./axe";

/*
 * The guides (`/fr/guides`): the index and one article, their accessibility, indexing,
 * structured data, Open Graph image and sitemap entries. The articles are French whatever
 * the interface language; other locales stay `noindex`.
 */

const GUIDE = "/fr/guides/medecin-traitant";
const PUBLIC = "public, max-age=0, s-maxage=300, stale-while-revalidate=3600";

type Node = { "@type": string; [key: string]: unknown };

async function graphOf(page: import("@playwright/test").Page): Promise<Node[]> {
	const scripts = await page.locator('script[type="application/ld+json"]').allTextContents();
	expect(scripts).toHaveLength(1);
	return (JSON.parse(scripts[0] ?? "{}") as { "@graph": Node[] })["@graph"];
}

for (const path of ["/fr/guides", GUIDE, "/fr-en/guides", "/fr-en/guides/medecin-traitant"]) {
	test(`${path} answers 200 with no axe violations`, async ({ page }) => {
		const response = await page.goto(path);
		expect(response?.status()).toBe(200);
		await expect(page.locator("main h1")).toBeVisible();
		expect(await axeViolations(page)).toEqual([]);
	});
}

test("the index lists every guide by audience, indexable, with its structured data", async ({
	page,
	request,
}) => {
	const response = await request.get("/fr/guides");
	expect(response.headers()["cache-control"]).toBe(PUBLIC);
	await page.goto("/fr/guides");
	await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /^index/);
	await expect(page.getByRole("heading", { level: 2, name: "Pour les patients" })).toBeVisible();
	await expect(
		page.getByRole("heading", { level: 2, name: "Pour les professionnels de santé" }),
	).toBeVisible();
	await expect(page.locator(`main a[href="${GUIDE}"]`).first()).toBeVisible();
	const types = (await graphOf(page)).map((node) => node["@type"]);
	expect(types).toEqual(expect.arrayContaining(["CollectionPage", "BreadcrumbList", "ItemList"]));
	// The footer links to the guides from every page.
	await expect(page.locator('footer a[href="/fr/guides"]')).toBeVisible();
});

test("an article shows its dates, contents, sources and an Article by the editorial team", async ({
	page,
}) => {
	await page.goto(GUIDE);
	await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /^index/);
	await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
		"href",
		new RegExp(`${GUIDE}$`),
	);
	await expect(page.locator('meta[property="og:type"]')).toHaveAttribute("content", "article");
	await expect(page.locator('meta[property="og:image"]').first()).toHaveAttribute(
		"content",
		/\/og\/guides\/medecin-traitant\.png$/,
	);

	// Dates as machine-readable times; the emergency numbers on every patient guide.
	await expect(page.locator("main time").first()).toHaveAttribute(
		"datetime",
		/^\d{4}-\d{2}-\d{2}$/,
	);
	await expect(page.getByText(/116 117 ou 15, selon votre région/).first()).toBeVisible();

	// Every entry of the table of contents points at a heading of the article.
	const toc = page.getByRole("navigation", { name: "Sommaire" });
	const anchors = await toc
		.locator("a")
		.evaluateAll((links) => links.map((link) => link.getAttribute("href") ?? ""));
	expect(anchors.length).toBeGreaterThanOrEqual(3);
	for (const anchor of anchors) await expect(page.locator(`article h2${anchor}`)).toHaveCount(1);

	// Sources: official pages, each with the day it was checked.
	const sources = page.locator("section#sources li");
	expect(await sources.count()).toBeGreaterThan(0);
	await expect(sources.first()).toContainText("consultée le");
	for (const href of await page
		.locator("section#sources li a")
		.evaluateAll((links) => links.map((link) => link.getAttribute("href") ?? ""))) {
		expect(href).toMatch(/^https:\/\//);
	}

	const graph = await graphOf(page);
	const article = graph.find((node) => node["@type"] === "Article");
	expect(article).toMatchObject({
		inLanguage: "fr-FR",
		author: { "@type": "Organization", name: "Équipe éditoriale d’Apercura" },
		publisher: { "@type": "Organization", name: "Apercura" },
	});
	expect(article?.datePublished).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	expect(article?.dateModified).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	expect(JSON.stringify(graph)).not.toContain('"Person"');
	const breadcrumb = graph.find((node) => node["@type"] === "BreadcrumbList");
	expect(breadcrumb?.itemListElement).toHaveLength(3);
	expect(graph.find((node) => node["@type"] === "WebPage")?.lastReviewed).toMatch(
		/^\d{4}-\d{2}-\d{2}$/,
	);
});

test("other locales print the French article, noindex", async ({ page }) => {
	await page.goto("/fr-en/guides/medecin-traitant");
	await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
	await expect(page.locator("main article")).toHaveAttribute("lang", "fr");
	await expect(page.getByText("These guides are written in French.")).toBeVisible();
});

test("an unknown guide answers 404", async ({ request }) => {
	expect((await request.get("/fr/guides/inconnu")).status()).toBe(404);
	expect((await request.get("/og/guides/inconnu.png")).status()).toBe(404);
});

test("each guide has its own Open Graph image", async ({ request }) => {
	const response = await request.get("/og/guides/medecin-traitant.png");
	expect(response.status()).toBe(200);
	expect(response.headers()["content-type"]).toBe("image/png");
});

test("the static pages sitemap lists the guides with their last change", async ({ request }) => {
	const xml = await (await request.get("/sitemaps/fr/pages-0.xml")).text();
	expect(xml).toMatch(/<loc>[^<]+\/fr\/guides<\/loc><lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/);
	expect(xml).toMatch(
		/<loc>[^<]+\/fr\/guides\/medecin-traitant<\/loc><lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/,
	);
	expect(xml).not.toContain("/fr-en/guides");
});
