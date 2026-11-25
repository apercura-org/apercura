import { professionFor, professionOfListingSlug } from "@apercura/core/taxonomy";
import carteVitale from "../../../content/guides/carte-vitale-et-appli-carte-vitale.md";
import commentFonctionneApercura from "../../../content/guides/comment-fonctionne-apercura.md";
import dentiste100Sante from "../../../content/guides/dentiste-100-sante.md";
import infirmierADomicile from "../../../content/guides/infirmier-a-domicile.md";
import medecinTraitant from "../../../content/guides/medecin-traitant.md";
import retraitEtDroitsRgpd from "../../../content/guides/retrait-et-droits-rgpd.md";
import revendiquerSaPage from "../../../content/guides/revendiquer-sa-page-praticien.md";
import secteurs from "../../../content/guides/secteur-1-secteur-2-optam.md";
import suiviDeGrossesse from "../../../content/guides/suivi-de-grossesse-sage-femme.md";
import urgences from "../../../content/guides/urgences-medecin-de-garde.md";
import { GUIDE_CATEGORIES, type Guide, type GuideCategory, parseGuide } from "./guide";

/**
 * Every guide file, by slug (its file name). A new article is a Markdown file in
 * `content/guides/` and one line here; `catalog.test.ts` fails on a file left out.
 * The files are bundled as text, so the guides need no file system at request time.
 */
export const GUIDE_FILES: Readonly<Record<string, string>> = {
	"medecin-traitant": medecinTraitant,
	"secteur-1-secteur-2-optam": secteurs,
	"carte-vitale-et-appli-carte-vitale": carteVitale,
	"dentiste-100-sante": dentiste100Sante,
	"infirmier-a-domicile": infirmierADomicile,
	"suivi-de-grossesse-sage-femme": suiviDeGrossesse,
	"urgences-medecin-de-garde": urgences,
	"comment-fonctionne-apercura": commentFonctionneApercura,
	"revendiquer-sa-page-praticien": revendiquerSaPage,
	"retrait-et-droits-rgpd": retraitEtDroitsRgpd,
};

/** Every guide, parsed and validated once, by category then by `order`. */
export const GUIDES: readonly Guide[] = Object.entries(GUIDE_FILES)
	.map(([slug, source]) => parseGuide(slug, source))
	.sort(
		(a, b) =>
			GUIDE_CATEGORIES.indexOf(a.category) - GUIDE_CATEGORIES.indexOf(b.category) ||
			a.order - b.order ||
			a.slug.localeCompare(b.slug),
	);

const BY_SLUG = new Map(GUIDES.map((guide) => [guide.slug, guide]));

export function guideBySlug(slug: string): Guide | undefined {
	return BY_SLUG.get(slug);
}

export function guidesIn(category: GuideCategory): Guide[] {
	return GUIDES.filter((guide) => guide.category === category);
}

/** The last change of any guide: the index page's date (YYYY-MM-DD). */
export const GUIDES_UPDATED_AT: string =
	GUIDES.map((guide) => guide.updatedAt)
		.sort()
		.at(-1) ?? "1970-01-01";

/**
 * The guides a directory page links to (listing, practitioner): those whose `listings` hold one
 * of the page's listing slugs (`medecin-generaliste`, its profession `medecin`…), in the
 * catalog's order, `limit` at most.
 */
export function relatedGuides(listingSlugs: readonly (string | null | undefined)[], limit = 3) {
	const wanted = new Set(listingSlugs.filter((slug): slug is string => Boolean(slug)));
	if (wanted.size === 0) return [];
	return GUIDES.filter((guide) => guide.listings.some((slug) => wanted.has(slug))).slice(0, limit);
}

/** The guides of a listing page: those of the listing itself, then those of its profession. */
export function guidesForListing(listingSlug: string, limit = 3): Guide[] {
	const profession = professionOfListingSlug(listingSlug);
	return relatedGuides([listingSlug, profession ? professionFor(profession)?.slug : null], limit);
}

/** The guides' French paths (index first) and their last change, for the sitemap and the warm-up. */
export function guidePaths(): { path: string; lastmod: string }[] {
	return [
		{ path: "/guides", lastmod: GUIDES_UPDATED_AT },
		...GUIDES.map((guide) => ({ path: `/guides/${guide.slug}`, lastmod: guide.updatedAt })),
	];
}
