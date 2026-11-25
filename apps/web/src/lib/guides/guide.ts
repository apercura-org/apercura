import { slugify } from "@apercura/core";
import { isListingSlug } from "@apercura/core/taxonomy";
import { Lexer, type Token, type Tokens } from "marked";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

/**
 * The guides (`/fr/guides/{slug}`): articles written in French and stored in the repository as
 * Markdown with a YAML frontmatter (`apps/web/content/guides/{slug}.md`). Health content is
 * YMYL: every article lists its official sources with the date each one was checked, the date
 * it was last updated and the date it was last reviewed against them (docs/guides/editorial-plan.md).
 *
 * This module parses and validates one file, without I/O: the catalog (`./catalog`) imports the
 * files as text, so the content ships with the build (no file read at request time).
 */

export const GUIDE_CATEGORIES = ["patients", "professionnels"] as const;
export type GuideCategory = (typeof GUIDE_CATEGORIES)[number];

/**
 * Hosts a guide may cite as a source: official pages only (Assurance Maladie, the
 * administration, the High Authority for Health, the law, the professional orders, the
 * ministry, the agencies that publish the registry, the data protection authority).
 */
export const OFFICIAL_SOURCE_HOSTS = [
	"www.ameli.fr",
	"annuairesante.ameli.fr",
	"www.service-public.fr",
	"www.service-public.gouv.fr",
	"www.has-sante.fr",
	"www.legifrance.gouv.fr",
	"sante.gouv.fr",
	"solidarites-sante.gouv.fr",
	"www.solidarites-sante.gouv.fr",
	"www.sante.fr",
	"esante.gouv.fr",
	"annuaire.sante.fr",
	"annuaire.esante.gouv.fr",
	"www.data.gouv.fr",
	"www.cnil.fr",
	"www.conseil-national.medecin.fr",
	"www.ordre-chirurgiens-dentistes.fr",
	"www.ordre-sages-femmes.fr",
	"www.ordre-infirmiers.fr",
	"www.ordre.pharmacien.fr",
	"www.carte-vitale.fr",
	"www.complementaire-sante-solidaire.gouv.fr",
	"www.urssaf.fr",
	"www.economie.gouv.fr",
	"france-identite.gouv.fr",
] as const;

const isoDate = z
	.string()
	.regex(/^\d{4}-\d{2}-\d{2}$/, "expected a YYYY-MM-DD date")
	.refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), "not a date");

const officialUrl = z
	.url({ protocol: /^https$/ })
	.refine(
		(value) => (OFFICIAL_SOURCE_HOSTS as readonly string[]).includes(new URL(value).hostname),
		"not an official source host (OFFICIAL_SOURCE_HOSTS)",
	);

export const guideSourceSchema = z.strictObject({
	/** The page's own title, as it reads on the page. */
	title: z.string().min(3),
	url: officialUrl,
	/** Who publishes it: "Assurance Maladie (ameli.fr)", "Service-public.fr"… */
	publisher: z.string().min(2),
	/** The day the page was read and the article's facts checked against it. */
	checkedAt: isoDate,
});

/** Search engines show about 155 characters of a description. */
const DESCRIPTION_MAX = 155;

export const guideFrontmatterSchema = z
	.strictObject({
		/** The article's title, printed as its `h1`. */
		title: z.string().min(10).max(90),
		/** A shorter title for the `<title>` element and the cards, when `title` is long. */
		shortTitle: z.string().min(5).max(52).optional(),
		/** The meta description and the lead under the title. */
		description: z.string().min(50).max(DESCRIPTION_MAX),
		category: z.enum(GUIDE_CATEGORIES),
		/** Position in its category on the index (ascending). */
		order: z.number().int().min(0),
		/** The first publication. */
		publishedAt: isoDate,
		/** The last time the text changed. */
		updatedAt: isoDate,
		/** The last time the text was checked against every source. */
		reviewedAt: isoDate,
		/** Listing slugs (`medecin-generaliste`, `sage-femme`…) whose pages link to this guide. */
		listings: z.array(z.string().refine(isListingSlug, "not a listing slug")).default([]),
		sources: z.array(guideSourceSchema).min(1),
	})
	.refine((value) => value.updatedAt >= value.publishedAt, {
		message: "updatedAt must not be before publishedAt",
		path: ["updatedAt"],
	})
	.refine((value) => value.reviewedAt >= value.updatedAt, {
		message: "reviewedAt must not be before updatedAt",
		path: ["reviewedAt"],
	});

export type GuideFrontmatter = z.infer<typeof guideFrontmatterSchema>;
export type GuideSource = z.infer<typeof guideSourceSchema>;

/** One entry of the table of contents: a second-level heading and its anchor. */
export type GuideHeading = { id: string; text: string };

export type Guide = GuideFrontmatter & {
	slug: string;
	/** The body as Markdown block tokens (rendered by `components/guide-body`). */
	tokens: Token[];
	/** The `##` headings, in order, with unique anchors. */
	headings: GuideHeading[];
	/** Words of the body, for the reading time and the editorial checks. */
	wordCount: number;
};

/** Block tokens the renderer prints. Anything else (raw HTML, images, code) is refused. */
const BLOCK_TYPES = new Set(["heading", "paragraph", "list", "blockquote", "table", "space", "hr"]);
/** Inline tokens the renderer prints. */
const INLINE_TYPES = new Set(["text", "strong", "em", "link", "br", "escape", "codespan"]);

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

export class GuideError extends Error {
	constructor(slug: string, message: string) {
		super(`Guide "${slug}": ${message}`);
		this.name = "GuideError";
	}
}

/** The plain text of inline tokens (headings, table of contents, word count). */
export function inlineText(tokens: readonly Token[] | undefined): string {
	if (!tokens) return "";
	return tokens
		.map((token) => {
			if ("tokens" in token && Array.isArray(token.tokens) && token.tokens.length > 0) {
				return inlineText(token.tokens);
			}
			return "text" in token && typeof token.text === "string" ? token.text : "";
		})
		.join("");
}

function checkInline(slug: string, tokens: readonly Token[] | undefined): void {
	for (const token of tokens ?? []) {
		if (!INLINE_TYPES.has(token.type)) {
			throw new GuideError(slug, `unsupported inline Markdown "${token.type}": ${token.raw}`);
		}
		if (token.type === "link") {
			const href = (token as Tokens.Link).href;
			if (!/^(https:\/\/|\/fr(\/|$)|#)/.test(href)) {
				throw new GuideError(slug, `links must be https:, /fr/… or #anchor, got "${href}"`);
			}
		}
		if ("tokens" in token && Array.isArray(token.tokens)) checkInline(slug, token.tokens);
	}
}

function checkBlocks(slug: string, tokens: readonly Token[]): void {
	for (const token of tokens) {
		if (!BLOCK_TYPES.has(token.type)) {
			throw new GuideError(slug, `unsupported Markdown block "${token.type}": ${token.raw}`);
		}
		switch (token.type) {
			case "heading": {
				const { depth } = token as Tokens.Heading;
				if (depth !== 2 && depth !== 3) {
					throw new GuideError(
						slug,
						`only ## and ### headings (the title is the h1): ${token.raw}`,
					);
				}
				checkInline(slug, (token as Tokens.Heading).tokens);
				break;
			}
			case "paragraph":
				checkInline(slug, (token as Tokens.Paragraph).tokens);
				break;
			case "blockquote":
				checkBlocks(slug, (token as Tokens.Blockquote).tokens);
				break;
			case "list":
				for (const item of (token as Tokens.List).items) {
					if (item.task) throw new GuideError(slug, "task lists are not supported");
					// Tight list items hold `text` tokens with inline children; loose ones paragraphs.
					for (const child of item.tokens) {
						if (child.type === "text") checkInline(slug, (child as Tokens.Text).tokens);
						else checkBlocks(slug, [child]);
					}
				}
				break;
			case "table": {
				const table = token as Tokens.Table;
				for (const cell of table.header) checkInline(slug, cell.tokens);
				for (const row of table.rows) for (const cell of row) checkInline(slug, cell.tokens);
				break;
			}
		}
	}
}

const RESERVED_IDS = [
	"main",
	"sources",
	"sources-heading",
	"guide-toc-heading",
	"guide-listings-heading",
	"other-guides-heading",
	"related-guides-heading",
];

/** Unique anchors for the `##` and `###` headings, in document order (`slugify`, then `-2`…). */
function anchorHeadings(tokens: readonly Token[]): {
	ids: Map<Token, string>;
	headings: GuideHeading[];
} {
	const ids = new Map<Token, string>();
	// Ids the guide page itself prints (~/app/[locale]/guides/[slug]): never a heading's.
	const used = new Set<string>(RESERVED_IDS);
	const headings: GuideHeading[] = [];
	for (const token of tokens) {
		if (token.type !== "heading") continue;
		const text = inlineText((token as Tokens.Heading).tokens);
		const base = slugify(text) || "section";
		let id = base;
		for (let n = 2; used.has(id); n += 1) id = `${base}-${n}`;
		used.add(id);
		ids.set(token, id);
		if ((token as Tokens.Heading).depth === 2) headings.push({ id, text });
	}
	return { ids, headings };
}

/** A heading token of a parsed guide, with its anchor. */
export type AnchoredHeading = Tokens.Heading & { anchor?: string };

function countWords(markdown: string): number {
	return markdown
		.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
		.split(/\s+/)
		.filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
}

/**
 * Parses one guide file: its YAML frontmatter (validated) and its Markdown body (restricted to
 * the blocks the renderer prints). Throws a `GuideError` naming the file on anything else, so a
 * broken article fails the tests and the build, never a page.
 */
export function parseGuide(slug: string, source: string): Guide {
	if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new GuideError(slug, "invalid slug");
	const match = FRONTMATTER.exec(source);
	if (!match) throw new GuideError(slug, "missing the --- frontmatter --- block");
	const [, yaml = "", body = ""] = match;
	let data: unknown;
	try {
		data = parseYaml(yaml);
	} catch (error) {
		throw new GuideError(slug, `invalid frontmatter YAML: ${(error as Error).message}`);
	}
	const parsed = guideFrontmatterSchema.safeParse(data);
	if (!parsed.success) {
		const issues = parsed.error.issues
			.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
			.join("; ");
		throw new GuideError(slug, `invalid frontmatter: ${issues}`);
	}
	const tokens = new Lexer({ gfm: true }).lex(body);
	checkBlocks(slug, tokens);
	const { ids, headings } = anchorHeadings(tokens);
	for (const [token, id] of ids) (token as AnchoredHeading).anchor = id;
	return { ...parsed.data, slug, tokens, headings, wordCount: countWords(body) };
}
