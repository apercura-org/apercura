import { describe, expect, it } from "vitest";
import { parseReturnTo, serializeReturnTo } from "./return-to";

describe("return after sign-in", () => {
	it("accepts the claim of one RPPS and one claim page", () => {
		expect(parseReturnTo("/pro/revendiquer?rpps=19999990047")).toEqual({
			pathname: "/pro/revendiquer",
			query: { rpps: "19999990047" },
		});
		expect(parseReturnTo("/en/pro/revendiquer?rpps=19999990047")?.pathname).toBe(
			"/pro/revendiquer",
		);
		const id = "f9c702d1-53d8-4603-9044-bd356e864099";
		const claim = parseReturnTo(`/pro/revendiquer/${id}`);
		expect(claim).toEqual({ pathname: "/pro/revendiquer/[id]", params: { id } });
		expect(serializeReturnTo(claim as NonNullable<typeof claim>)).toBe(`/pro/revendiquer/${id}`);
	});

	it("refuses anything else, including open redirects", () => {
		for (const value of [
			"https://evil.example/pro/revendiquer?rpps=19999990047",
			"//evil.example/pro/revendiquer?rpps=19999990047",
			"/\\evil.example",
			"/pro/revendiquer?rpps=1999999004",
			"/pro/revendiquer?rpps=19999990047&next=https://evil.example",
			"/pro/revendiquer/../admin/revendications",
			"/pro/admin/revendications",
			"/pro/revendiquer?rpps=19999990047#x",
			"javascript:alert(1)",
			"",
			null,
			42,
		]) {
			expect(parseReturnTo(value)).toBeNull();
		}
	});
});
