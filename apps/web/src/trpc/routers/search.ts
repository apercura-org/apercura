import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { marketOf } from "~/i18n/locales";
import { routing } from "~/i18n/routing";
import { suggestListings } from "~/lib/listing-index";
import { suggestPlaces, suggestPractitioners } from "~/server/queries/search";
import { clientRateLimitKey, type RateLimitRule } from "~/server/rate-limit";
import type { Context } from "../init";
import { createTRPCRouter, publicProcedure } from "../init";

/** Suggestions are typed letter by letter: generous, but bounded per client. */
const SUGGEST_LIMIT: RateLimitRule = { max: 120, windowSeconds: 60 };

async function limitSuggestions(ctx: Context) {
	if (!(await ctx.rateLimit(clientRateLimitKey("search", ctx.headers), SUGGEST_LIMIT))) {
		throw new TRPCError({ code: "TOO_MANY_REQUESTS" });
	}
}

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
			await limitSuggestions(ctx);
			const listings = suggestListings(input.q, input.locale, 5).map((entry) => ({
				slug: entry.slug,
				label: entry.label,
			}));
			const practitioners =
				input.q.length >= 2 ? await suggestPractitioners(input.q, 6, marketOf(input.locale)) : [];
			return { listings, practitioners };
		}),

	/** "Où ?": communes, arrondissements and departments, with their department. */
	where: publicProcedure
		.input(z.object({ q: query, locale: z.enum(routing.locales).default("fr") }))
		.query(async ({ ctx, input }) => {
			await limitSuggestions(ctx);
			const places =
				input.q.length >= 2 ? await suggestPlaces(input.q, 8, marketOf(input.locale)) : [];
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
