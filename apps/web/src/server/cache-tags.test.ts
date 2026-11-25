import { SITEMAP_CACHE_TAG } from "@apercura/core/revalidation";
import { describe, expect, it } from "vitest";
import { cacheTags, revalidationProfile } from "./cache-tags";

describe("cache tags", () => {
	it("are the tags the import sends, coarse ones included (#97)", () => {
		// packages/etl/src/outbox.ts derives `{kind}:*` from the precise tags and sends `sitemap`.
		expect(cacheTags.sitemap).toBe(SITEMAP_CACHE_TAG);
		expect(cacheTags.coarse).toEqual({
			practitioner: `${cacheTags.practitioner(12).split(":")[0]}:*`,
			listing: `${cacheTags.listing("cardiologue", 75).split(":")[0]}:*`,
			site: `${cacheTags.site(3).split(":")[0]}:*`,
			place: `${cacheTags.place(75).split(":")[0]}:*`,
		});
	});

	it("expire the sitemaps at once, pages stale-while-revalidate", () => {
		expect(revalidationProfile(cacheTags.sitemap)).toEqual({ expire: 0 });
		for (const tag of [
			...Object.values(cacheTags.coarse),
			cacheTags.practitioner(12),
			cacheTags.listing("medecin-generaliste", null),
		]) {
			expect(revalidationProfile(tag)).toBe("max");
		}
	});
});
