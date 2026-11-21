import { z } from "zod";
import { routing } from "~/i18n/routing";
import { suggestListings } from "~/lib/listing-index";
import { suggestPlaces, suggestPractitioners } from "~/server/queries/search";
import { enforceRateLimit, type RateLimit } from "~/server/rate-limit";
import { createTRPCRouter, publicProcedure } from "../init";

/** Suggestions are typed letter by letter: generous, but bounded per client. */
const SUGGEST_LIMIT: Omit<RateLimit, "scope"> = { limit: 120, windowSeconds: 60 };

const query = z.string().trim().min(1).max(80);

/**
 * Autocomplete of the booklet search. Public, rate limited per client, never
 * ranked by anything but text similarity and population.
 */
export const searchRouter = createTRPCRouter({
	/** "Qui ?": specialties and professions from the taxonomy, then practitioners by name. */
	who: publicProcedure
		.input(z.object({ q: query, locale: z.enum(routing.locales) }))
		.query(async ({ ctx, input }) => {
			await enforceRateLimit(ctx.headers, { scope: "search", ...SUGGEST_LIMIT });
			const listings = suggestListings(input.q, input.locale, 5).map((entry) => ({
				slug: entry.slug,
				label: entry.label,
			}));
			const practitioners = input.q.length >= 2 ? await suggestPractitioners(input.q, 6) : [];
			return { listings, practitioners };
		}),

	/** "Où ?": communes, arrondissements and departments, with their department. */
	where: publicProcedure.input(z.object({ q: query })).query(async ({ ctx, input }) => {
		await enforceRateLimit(ctx.headers, { scope: "search", ...SUGGEST_LIMIT });
		const places = input.q.length >= 2 ? await suggestPlaces(input.q, 8) : [];
		return {
			places: places.map((place) => ({
				id: place.id,
				kind: place.kind,
				name: place.name,
				departmentCode: place.departmentCode,
				departmentName: place.departmentName,
			})),
		};
	}),
});
