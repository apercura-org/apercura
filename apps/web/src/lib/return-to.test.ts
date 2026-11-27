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

	it("accepts one team invitation, so an invited person comes back after signing up", () => {
		const id = "0b6f6f5e-4d1c-4c55-9a57-3a2f7d8e9c10";
		const target = parseReturnTo(`/pro/invitation/${id}`);
		expect(target).toEqual({ pathname: "/pro/invitation/[id]", params: { id } });
		expect(serializeReturnTo(target as NonNullable<typeof target>)).toBe(`/pro/invitation/${id}`);
		expect(parseReturnTo(`/en/pro/invitation/${id}`)?.pathname).toBe("/pro/invitation/[id]");
		expect(parseReturnTo(`/pro/invitation/${id}?x=1`)).toBeNull();
		expect(parseReturnTo("/pro/invitation/not-an-id")).toBeNull();
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

describe("returning to an Austrian claim", () => {
	it("accepts a list key, never anything that looks like a path", () => {
		expect(parseReturnTo("/pro/revendiquer?rpps=w7983")).toEqual({
			pathname: "/pro/revendiquer",
			query: { rpps: "w7983" },
		});
		expect(parseReturnTo("/pro/revendiquer?rpps=st45")?.pathname).toBe("/pro/revendiquer");
		expect(parseReturnTo("/pro/revendiquer?rpps=w0")).toBeNull();
		expect(parseReturnTo("/pro/revendiquer?rpps=w7983/..")).toBeNull();
		expect(parseReturnTo("/pro/revendiquer?rpps=abc7983")).toBeNull();
	});
});

describe("returning to a UK claim", () => {
	it("accepts a `gb:` practice key, never anything that looks like a path", () => {
		expect(parseReturnTo("/pro/revendiquer?rpps=gb:a99001")).toEqual({
			pathname: "/pro/revendiquer",
			query: { rpps: "gb:a99001" },
		});
		expect(parseReturnTo("/pro/revendiquer?rpps=gb%3Asg89001")).toEqual({
			pathname: "/pro/revendiquer",
			query: { rpps: "gb:sg89001" },
		});
		expect(parseReturnTo("/pro/revendiquer?rpps=gb:a99001/..")).toBeNull();
		expect(parseReturnTo("/pro/revendiquer?rpps=gb:")).toBeNull();
	});
});

describe("returning to a Spanish claim", () => {
	it("accepts an `es:` centre code, never anything that looks like a path", () => {
		expect(parseReturnTo("/pro/revendiquer?rpps=es:1328000001")).toEqual({
			pathname: "/pro/revendiquer",
			query: { rpps: "es:1328000001" },
		});
		expect(parseReturnTo("/pro/revendiquer?rpps=es:1328000001/..")).toBeNull();
		expect(parseReturnTo("/pro/revendiquer?rpps=es:2328000001")).toBeNull();
		expect(parseReturnTo("/pro/revendiquer?rpps=es:")).toBeNull();
	});
});

describe("returning to a Czech claim", () => {
	it("accepts a `cz:` facility number, never anything that looks like a path", () => {
		expect(parseReturnTo("/pro/revendiquer?rpps=cz:900001")).toEqual({
			pathname: "/pro/revendiquer",
			query: { rpps: "cz:900001" },
		});
		expect(parseReturnTo("/pro/revendiquer?rpps=cz%3A900001")?.pathname).toBe("/pro/revendiquer");
		expect(parseReturnTo("/pro/revendiquer?rpps=cz:900001/..")).toBeNull();
		expect(parseReturnTo("/pro/revendiquer?rpps=cz:0900001")).toBeNull();
		expect(parseReturnTo("/pro/revendiquer?rpps=cz:")).toBeNull();
	});
});

describe("returning to an Italian claim", () => {
	it("accepts an `it:` place key, never anything that looks like a path", () => {
		expect(parseReturnTo("/pro/revendiquer?rpps=it:f9000001")).toEqual({
			pathname: "/pro/revendiquer",
			query: { rpps: "it:f9000001" },
		});
		expect(parseReturnTo("/pro/revendiquer?rpps=it:s990001")?.pathname).toBe("/pro/revendiquer");
		expect(parseReturnTo("/pro/revendiquer?rpps=it:f9000001/..")).toBeNull();
		expect(parseReturnTo("/pro/revendiquer?rpps=it:p2112")).toBeNull();
		expect(parseReturnTo("/pro/revendiquer?rpps=it:")).toBeNull();
	});
});

describe("returning to a German claim", () => {
	it("accepts a `de:` facility key, never anything that looks like a path", () => {
		expect(parseReturnTo("/pro/revendiquer?rpps=de:k0a1b2c3d4e")).toEqual({
			pathname: "/pro/revendiquer",
			query: { rpps: "de:k0a1b2c3d4e" },
		});
		expect(parseReturnTo("/pro/revendiquer?rpps=de:th9001")).toEqual({
			pathname: "/pro/revendiquer",
			query: { rpps: "de:th9001" },
		});
		expect(parseReturnTo("/pro/revendiquer?rpps=de:k0a1b2c3d4e/..")).toBeNull();
		expect(parseReturnTo("/pro/revendiquer?rpps=de:x0a1b2c3d4e")).toBeNull();
		expect(parseReturnTo("/pro/revendiquer?rpps=de:")).toBeNull();
	});
});
describe("returning to a Swiss claim", () => {
	it("accepts a `ch:` facility key, never anything that looks like a path", () => {
		expect(parseReturnTo("/pro/revendiquer?rpps=ch:h123456789")).toEqual({
			pathname: "/pro/revendiquer",
			query: { rpps: "ch:h123456789" },
		});
		expect(parseReturnTo("/pro/revendiquer?rpps=ch:blp7601001796874")?.pathname).toBe(
			"/pro/revendiquer",
		);
		expect(parseReturnTo("/pro/revendiquer?rpps=ch:h123456789/..")).toBeNull();
		expect(parseReturnTo("/pro/revendiquer?rpps=ch:h0123")).toBeNull();
		expect(parseReturnTo("/pro/revendiquer?rpps=ch:")).toBeNull();
	});

	it("accepts an `ie:` facility key of each Irish list, never anything that looks like a path", () => {
		for (const ref of ["ie:p10000612", "ie:n738", "ie:h123456789", "ie:c123456789"]) {
			expect(parseReturnTo(`/pro/revendiquer?rpps=${ref}`)).toEqual({
				pathname: "/pro/revendiquer",
				query: { rpps: ref },
			});
		}
		expect(parseReturnTo("/pro/revendiquer?rpps=ie:p1234/..")).toBeNull();
		expect(parseReturnTo("/pro/revendiquer?rpps=ie:x1234")).toBeNull();
		expect(parseReturnTo("/pro/revendiquer?rpps=ie:p0123")).toBeNull();
		expect(parseReturnTo("/pro/revendiquer?rpps=ie:")).toBeNull();
	});

	it("accepts an `mt:` pharmacy licence key, never anything that looks like a path", () => {
		expect(parseReturnTo("/pro/revendiquer?rpps=mt:dl001")).toEqual({
			pathname: "/pro/revendiquer",
			query: { rpps: "mt:dl001" },
		});
		expect(parseReturnTo("/pro/revendiquer?rpps=mt:dl001/..")).toBeNull();
		expect(parseReturnTo("/pro/revendiquer?rpps=mt:dl12")).toBeNull();
		expect(parseReturnTo("/pro/revendiquer?rpps=mt:")).toBeNull();
	});
});

describe("returning to an Estonian claim", () => {
	it("accepts an `ee:` provider or pharmacy key, never anything that looks like a path", () => {
		expect(parseReturnTo("/pro/revendiquer?rpps=ee:l01909")).toEqual({
			pathname: "/pro/revendiquer",
			query: { rpps: "ee:l01909" },
		});
		expect(parseReturnTo("/pro/revendiquer?rpps=ee:ap457")).toEqual({
			pathname: "/pro/revendiquer",
			query: { rpps: "ee:ap457" },
		});
		expect(parseReturnTo("/pro/revendiquer?rpps=ee:l01909/..")).toBeNull();
		expect(parseReturnTo("/pro/revendiquer?rpps=ee:l1909")).toBeNull();
		expect(parseReturnTo("/pro/revendiquer?rpps=ee:")).toBeNull();
	});
});

describe("returning to a Norwegian claim", () => {
	it("accepts a `no:` organisation number, never anything that looks like a path", () => {
		expect(parseReturnTo("/pro/revendiquer?rpps=no:910000039")).toEqual({
			pathname: "/pro/revendiquer",
			query: { rpps: "no:910000039" },
		});
		expect(parseReturnTo("/pro/revendiquer?rpps=no:910000039/..")).toBeNull();
		expect(parseReturnTo("/pro/revendiquer?rpps=no:91000003")).toBeNull();
		expect(parseReturnTo("/pro/revendiquer?rpps=no:")).toBeNull();
	});
});

describe("returning to a Finnish claim", () => {
	it("accepts an `fi:` service location key, never anything that looks like a path", () => {
		const key = "b18aa7f87eca4b97a8e8b438d2e29427";
		expect(parseReturnTo(`/pro/revendiquer?rpps=fi:${key}`)).toEqual({
			pathname: "/pro/revendiquer",
			query: { rpps: `fi:${key}` },
		});
		expect(parseReturnTo(`/pro/revendiquer?rpps=fi:${key}/..`)).toBeNull();
		expect(parseReturnTo(`/pro/revendiquer?rpps=fi:${key.slice(2)}`)).toBeNull();
	});
});

describe("returning to a Lithuanian claim", () => {
	it("accepts an `lt:` page key, never anything that looks like a path", () => {
		expect(parseReturnTo("/pro/revendiquer?rpps=lt:9000-90000001")).toEqual({
			pathname: "/pro/revendiquer",
			query: { rpps: "lt:9000-90000001" },
		});
		expect(parseReturnTo("/pro/revendiquer?rpps=lt:9000-v0a1b2c3d")).toEqual({
			pathname: "/pro/revendiquer",
			query: { rpps: "lt:9000-v0a1b2c3d" },
		});
		expect(parseReturnTo("/pro/revendiquer?rpps=lt:9000-90000001/..")).toBeNull();
		expect(parseReturnTo("/pro/revendiquer?rpps=lt:9000")).toBeNull();
		expect(parseReturnTo("/pro/revendiquer?rpps=lt:")).toBeNull();
	});
});

describe("returning to a Cypriot claim", () => {
	it("accepts a `cy:` facility key, never anything that looks like a path", () => {
		expect(parseReturnTo("/pro/revendiquer?rpps=cy:f101")).toEqual({
			pathname: "/pro/revendiquer",
			query: { rpps: "cy:f101" },
		});
		expect(parseReturnTo("/pro/revendiquer?rpps=cy:m3fa9c01b2e")).toEqual({
			pathname: "/pro/revendiquer",
			query: { rpps: "cy:m3fa9c01b2e" },
		});
		expect(parseReturnTo("/pro/revendiquer?rpps=cy:f101/..")).toBeNull();
		expect(parseReturnTo("/pro/revendiquer?rpps=cy:m3fa9c01b2")).toBeNull();
		expect(parseReturnTo("/pro/revendiquer?rpps=cy:")).toBeNull();
	});
});

describe("returning to a Latvian claim", () => {
	it("accepts an `lv:` place key, never anything that looks like a path", () => {
		expect(parseReturnTo("/pro/revendiquer?rpps=lv:g010000006")).toEqual({
			pathname: "/pro/revendiquer",
			query: { rpps: "lv:g010000006" },
		});
		expect(parseReturnTo("/pro/revendiquer?rpps=lv:a324")).toEqual({
			pathname: "/pro/revendiquer",
			query: { rpps: "lv:a324" },
		});
		expect(parseReturnTo("/pro/revendiquer?rpps=lv:g0100/..")).toBeNull();
		expect(parseReturnTo("/pro/revendiquer?rpps=lv:x324")).toBeNull();
		expect(parseReturnTo("/pro/revendiquer?rpps=lv:")).toBeNull();
	});
});

describe("returning to a Swedish claim", () => {
	it("accepts a `se:` pharmacy or health centre key, never anything that looks like a path", () => {
		expect(parseReturnTo("/pro/revendiquer?rpps=se:a7359999000014")).toEqual({
			pathname: "/pro/revendiquer",
			query: { rpps: "se:a7359999000014" },
		});
		expect(parseReturnTo("/pro/revendiquer?rpps=se:v5560000000ex0001")).toEqual({
			pathname: "/pro/revendiquer",
			query: { rpps: "se:v5560000000ex0001" },
		});
		expect(parseReturnTo("/pro/revendiquer?rpps=se:a7359999000014/..")).toBeNull();
		expect(parseReturnTo("/pro/revendiquer?rpps=se:a735999900001")).toBeNull();
		expect(parseReturnTo("/pro/revendiquer?rpps=se:")).toBeNull();
	});
});
