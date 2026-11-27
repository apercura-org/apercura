/** Reading the SEO-relevant parts of a server-rendered page (seo.spec.ts, sitemap.spec.ts). */

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
export function parse(html: string) {
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
