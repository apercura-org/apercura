import { parseSearchQuery } from "@apercura/core";
import { HELSINKI_CODE, OSLO_MUNICIPALITY, PRAGUE_CODE, WARSAW_CODE } from "@apercura/core/country";
import { describe, expect, it, vi } from "vitest";
import { LOCALES, type Locale, type MarketCountry, marketOf } from "~/i18n/locales";
import type { PlaceSuggestion } from "./queries/search";
import { placesOfQuery, searchRedirect } from "./search-redirect";

/*
 * The capitals and main cities of every open market, each beside a smaller place of the same
 * name in its own market (the village Vilnius in Kupiškis beside Vilnius the capital, #195). What
 * tells them apart is what each market's places carry: the city's level (a city that is a
 * department of its own: Vilnius, Warszawa, Praha, Berlin…), its population (France, Germany,
 * Spain, Ireland), else its places of care. The village comes first, as the database's order
 * may put it.
 */
type City = {
	country: MarketCountry;
	name: string;
	code: string;
	departmentSlug: string;
	/** The population both places carry, in a market that publishes it: the city's, the village's. */
	population?: readonly [number, number];
	/** Other names it is typed by. */
	typed?: readonly string[];
};

const CITIES: readonly City[] = [
	{ country: "LT", name: "Vilnius", code: "31003", departmentSlug: "vilniaus-miesto-savivaldybe" },
	{ country: "LT", name: "Kaunas", code: "17507", departmentSlug: "kauno-miesto-savivaldybe" },
	{ country: "EE", name: "Tallinn", code: "0784", departmentSlug: "tallinn" },
	{ country: "EE", name: "Tartu", code: "8151", departmentSlug: "tartu-linn" },
	{ country: "SI", name: "Ljubljana", code: "061", departmentSlug: "osrednjeslovenska" },
	{ country: "SI", name: "Maribor", code: "070", departmentSlug: "podravska" },
	{ country: "PL", name: "Warszawa", code: WARSAW_CODE, departmentSlug: "warszawa" },
	{ country: "PL", name: "Kraków", code: "1261011", departmentSlug: "krakow" },
	{ country: "FI", name: "Helsinki", code: HELSINKI_CODE, departmentSlug: "helsinki" },
	{ country: "NO", name: "Oslo", code: OSLO_MUNICIPALITY, departmentSlug: "oslo" },
	{ country: "NO", name: "Bergen", code: "4601", departmentSlug: "vestland" },
	{
		country: "IE",
		name: "Dublin",
		code: "DUB",
		departmentSlug: "dublin",
		population: [1_260_000, 400],
	},
	{ country: "IE", name: "Cork", code: "CRK", departmentSlug: "cork", population: [222_000, 300] },
	{ country: "CZ", name: "Praha", code: PRAGUE_CODE, departmentSlug: "praha" },
	{ country: "AT", name: "Wien", code: "90001", departmentSlug: "wien" },
	{ country: "CH", name: "Bern", code: "351", departmentSlug: "verwaltungskreis-bern-mittelland" },
	{ country: "CH", name: "Zürich", code: "261", departmentSlug: "bezirk-zuerich" },
	{
		country: "ES",
		name: "Madrid",
		code: "28079",
		departmentSlug: "madrid",
		population: [3_330_000, 900],
	},
	{ country: "IT", name: "Roma", code: "058091", departmentSlug: "roma", typed: ["Rome"] },
	{ country: "DE", name: "Berlin", code: "11000000", departmentSlug: "berlin" },
	{ country: "GB", name: "London", code: "E63000001", departmentSlug: "westminster" },
	{
		country: "FR",
		name: "Paris",
		code: "75056",
		departmentSlug: "75-paris",
		population: [2_100_000, 1_200],
	},
];

const cityPlace = (city: City, index: number): PlaceSuggestion => ({
	id: 1000 + index,
	kind: "commune",
	code: city.code,
	name: city.name,
	slug: city.name.toLowerCase(),
	departmentCode: null,
	departmentName: null,
	departmentSlug: city.departmentSlug,
	population: city.population?.[0] ?? null,
});

const villagePlace = (city: City, index: number): PlaceSuggestion => ({
	id: 2000 + index,
	kind: "commune",
	code: `9${index}`,
	name: city.name,
	slug: `${city.name.toLowerCase()}-village`,
	departmentCode: null,
	departmentName: null,
	departmentSlug: "elsewhere",
	population: city.population?.[1] ?? null,
});

const PLACES = CITIES.flatMap((city, index) => [
	{ country: city.country, place: villagePlace(city, index) },
	{ country: city.country, place: cityPlace(city, index) },
]);
/** Places of care: a city has many, a village one; two villages of a size have as many. */
const SITES = new Map<number, number>(
	CITIES.flatMap((_, index) => [
		[1000 + index, 120],
		[2000 + index, 1],
	]),
);

/** Two villages of one size, in a market without population: still a choice. */
const TWINS: readonly { country: MarketCountry; place: PlaceSuggestion }[] = [
	{ country: "LT", place: { ...villagePlace(CITIES[0] as City, 90), name: "Pavyzdžiai" } },
	{
		country: "LT",
		place: { ...villagePlace(CITIES[0] as City, 91), name: "Pavyzdžiai", slug: "pavyzdziai-2" },
	},
];

vi.mock("./queries/search", () => ({
	matchPlaces: async ({ country, where }: { country: MarketCountry; where: string }) =>
		[...PLACES, ...TWINS]
			.filter(
				(entry) =>
					entry.country === country && entry.place.name.toLowerCase() === where.toLowerCase(),
			)
			.map((entry) => entry.place),
	placeSiteCounts: async (_country: string, ids: readonly number[]) =>
		new Map(ids.map((id) => [id, SITES.get(id) ?? 0])),
	landingTarget: async (listingSlug: string, target: PlaceSuggestion) =>
		listingSlug === "odontologijos-klinikos" && target.id === 1000
			? { listingSlug, deptSlug: target.departmentSlug }
			: null,
	departmentLandingTarget: async () => null,
	listingHubExists: async () => false,
	practitionerSlugByRpps: async () => null,
}));

/** The market and the places a search for `ou` from `locale` ends on, as the search page reads them. */
async function landing(locale: Locale, ou: string) {
	const target = await searchRedirect(parseSearchQuery({ ou }), 1, locale);
	const href = target?.href;
	const query =
		href && typeof href === "object" && "query" in href && href.query
			? parseSearchQuery(href.query as { ou?: string })
			: parseSearchQuery({ ou });
	const market = marketOf(target?.locale ?? locale);
	return { market, places: (await placesOfQuery(market, query)).places };
}

describe.each(
	CITIES.flatMap((city, index) =>
		[city.name, ...(city.typed ?? [])].map((typed) => ({ city, index, typed })),
	),
)("$typed, a main city of $city.country beside a smaller homonym", ({ city, index, typed }) => {
	it.each(LOCALES)("is the one place a search for it lands on, from /%s", async (locale) => {
		expect(await landing(locale, typed)).toEqual({
			market: city.country,
			places: [cityPlace(city, index)],
		});
	});
});

describe("a capital's homonyms", () => {
	it("go to the capital's listing directly (#195)", async () => {
		expect(
			await searchRedirect(parseSearchQuery({ quoi: "dentiste", ou: "Vilnius" }), 1, "fr"),
		).toEqual({
			href: {
				pathname: "/[specialite]/[dept]/[[...rest]]",
				params: {
					specialite: "odontologijos-klinikos",
					dept: "vilniaus-miesto-savivaldybe",
					rest: undefined,
				},
			},
			locale: "lt-LT",
		});
	});

	it("leave two places of a size to the visitor", async () => {
		expect((await placesOfQuery("LT", parseSearchQuery({ ou: "Pavyzdžiai" }))).places).toEqual(
			TWINS.map((entry) => entry.place),
		);
	});
});
