import { describe, expect, it } from "vitest";
import { BookingError } from "./errors";
import { checkHomeAddress } from "./home-visit";

/** Synthetic home-visit type: Paris 14e and 15e. */
const home = { location: "home", serviceAreaCodes: ["75114", "75115"] };
const site = { location: "site", serviceAreaCodes: [] };

const codeOf = (run: () => unknown) => {
	try {
		run();
		return null;
	} catch (error) {
		return error instanceof BookingError ? error.code : "other";
	}
};

describe("checkHomeAddress", () => {
	it("returns the cleaned address of a commune inside the area", () => {
		expect(
			checkHomeAddress(home, { street: "  12 rue Fictive \n\n Bât. B ", communeCode: "75115" }),
		).toEqual({ street: "12 rue Fictive\nBât. B", communeCode: "75115" });
	});

	it("refuses a commune outside the area before anything is stored", () => {
		expect(
			codeOf(() => checkHomeAddress(home, { street: "12 rue Fictive", communeCode: "75116" })),
		).toBe("OUTSIDE_AREA");
		expect(
			codeOf(() =>
				checkHomeAddress(
					{ ...home, serviceAreaCodes: [] },
					{
						street: "12 rue Fictive",
						communeCode: "75115",
					},
				),
			),
		).toBe("OUTSIDE_AREA");
	});

	it("requires an address from patients, not from the practice", () => {
		expect(codeOf(() => checkHomeAddress(home, null))).toBe("INVALID_INPUT");
		expect(codeOf(() => checkHomeAddress(home, { street: " \n ", communeCode: "75115" }))).toBe(
			"INVALID_INPUT",
		);
		expect(checkHomeAddress(home, null, { required: false })).toBeNull();
	});

	it("ignores an address sent for a type at the practice", () => {
		expect(checkHomeAddress(site, { street: "12 rue Fictive", communeCode: "75115" })).toBeNull();
	});
});
