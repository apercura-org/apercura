import { describe, expect, it } from "vitest";
import { type Permissions, roleCan } from "./access";

const cases: Array<[Permissions, { owner: boolean; practitioner: boolean; assistant: boolean }]> = [
	[{ agenda: ["read"] }, { owner: true, practitioner: true, assistant: true }],
	[{ agenda: ["write"] }, { owner: true, practitioner: true, assistant: true }],
	[{ agenda: ["open"] }, { owner: true, practitioner: false, assistant: false }],
	[{ page: ["read"] }, { owner: true, practitioner: true, assistant: false }],
	[{ page: ["update"] }, { owner: true, practitioner: true, assistant: false }],
	[{ security: ["read"] }, { owner: true, practitioner: false, assistant: false }],
	[{ security: ["update"] }, { owner: true, practitioner: false, assistant: false }],
	[{ member: ["create"] }, { owner: true, practitioner: false, assistant: false }],
	[{ invitation: ["create"] }, { owner: true, practitioner: false, assistant: false }],
	[{ audit: ["read"] }, { owner: true, practitioner: false, assistant: false }],
	[{ organization: ["delete"] }, { owner: true, practitioner: false, assistant: false }],
	[
		{ agenda: ["write"], page: ["update"] },
		{ owner: true, practitioner: true, assistant: false },
	],
];

describe("organization roles", () => {
	for (const [permissions, expected] of cases) {
		it(`${JSON.stringify(permissions)}`, () => {
			expect({
				owner: roleCan("owner", permissions),
				practitioner: roleCan("practitioner", permissions),
				assistant: roleCan("assistant", permissions),
			}).toEqual(expected);
		});
	}

	it("grants nothing to unknown roles, including Better Auth's built-in ones", () => {
		for (const role of ["admin", "member", "", "Owner", "__proto__", "constructor"]) {
			expect(roleCan(role, { agenda: ["read"] })).toBe(false);
		}
	});

	it("reads comma-separated roles as the union of their permissions", () => {
		expect(roleCan("assistant,practitioner", { page: ["update"] })).toBe(true);
		expect(roleCan("assistant, admin", { page: ["update"] })).toBe(false);
	});

	it("never authorizes an empty request", () => {
		expect(roleCan("owner", {})).toBe(false);
		expect(roleCan("owner", { agenda: [] })).toBe(false);
	});
});
