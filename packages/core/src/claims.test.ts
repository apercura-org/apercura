import { describe, expect, it } from "vitest";
import {
	assessClaim,
	availableMethods,
	bookingOpensAt,
	type ClaimSubject,
	canApprove,
	canSubmitForReview,
	claimPolicyOf,
	pscIdentifierOf,
	pscMatchesRpps,
	registryEmails,
	registryPhones,
} from "./claims";

const RPPS = "10000000009";

const subject = (activities: ClaimSubject["activities"]): ClaimSubject => ({
	rpps: RPPS,
	activities,
});

const office = {
	practiceKind: "office",
	email: "Cabinet@Exemple.test",
	phone: "+33199000001",
	phoneKind: "direct",
};
const hospital = {
	practiceKind: "hospital",
	email: "standard@chu-exemple.test",
	phone: "+33199000002",
	phoneKind: "switchboard",
};

describe("registry contacts", () => {
	it("offers the registry email of a practice or health centre, never a hospital's", () => {
		expect(registryEmails(subject([office, hospital]))).toEqual(["cabinet@exemple.test"]);
		expect(registryEmails(subject([hospital]))).toEqual([]);
		expect(
			registryEmails(
				subject([{ ...office, practiceKind: "health_center", email: "msp@exemple.test" }]),
			),
		).toEqual(["msp@exemple.test"]);
	});

	it("ignores malformed emails and duplicates", () => {
		expect(registryEmails(subject([{ ...office, email: "not an email" }]))).toEqual([]);
		expect(registryEmails(subject([office, office]))).toEqual(["cabinet@exemple.test"]);
	});

	it("lists registry phones of practices only, direct lines first", () => {
		const switchboard = { ...office, phone: "+33199000003", phoneKind: "switchboard" };
		expect(registryPhones(subject([switchboard, office, hospital]))).toEqual([
			"+33199000001",
			"+33199000003",
		]);
	});
});

describe("available methods", () => {
	it("depends on configuration and on the registry", () => {
		const all = { pscEnabled: true, documentsEnabled: true };
		expect(availableMethods(subject([office]), all).map((m) => m.id)).toEqual([
			"psc",
			"registry_email",
			"document",
			"phone_callback",
		]);
		expect(
			availableMethods(subject([hospital]), { pscEnabled: false, documentsEnabled: true }).map(
				(m) => m.id,
			),
		).toEqual(["document"]);
	});
});

describe("Pro Santé Connect identity", () => {
	it("reads SubjectNameID or preferred_username, never sub", () => {
		expect(pscIdentifierOf({ SubjectNameID: `8${RPPS}`, sub: "f81d4fae-7dec" })).toBe(`8${RPPS}`);
		expect(pscIdentifierOf({ preferred_username: `8${RPPS}` })).toBe(`8${RPPS}`);
		expect(pscIdentifierOf({ sub: `8${RPPS}` })).toBeNull();
		expect(pscIdentifierOf({ SubjectNameID: "not-an-id" })).toBeNull();
	});

	it("matches only 8 + the claimed RPPS", () => {
		expect(pscMatchesRpps(`8${RPPS}`, RPPS)).toBe(true);
		expect(pscMatchesRpps(`8${RPPS}`, "19999990013")).toBe(false);
		expect(pscMatchesRpps(RPPS, RPPS)).toBe(false);
		expect(pscMatchesRpps(null, RPPS)).toBe(false);
	});
});

describe("claim assessment", () => {
	it("verifies with Pro Santé Connect or the registry email alone", () => {
		expect(assessClaim({ psc: "passed" }, false)).toEqual({ kind: "verified", via: "psc" });
		expect(assessClaim({ registry_email: "passed" }, false)).toEqual({
			kind: "verified",
			via: "registry_email",
		});
	});

	it("needs both a document and the phone callback otherwise", () => {
		expect(assessClaim({ document: "passed" }, false)).toEqual({
			kind: "incomplete",
			missing: ["phone_callback"],
		});
		expect(assessClaim({ phone_callback: "passed" }, false)).toEqual({
			kind: "incomplete",
			missing: ["document"],
		});
		expect(assessClaim({ document: "passed", phone_callback: "passed" }, false)).toEqual({
			kind: "reviewable",
		});
		expect(assessClaim({ psc: "failed" }, false).kind).toBe("incomplete");
	});

	it("leaves every contest to an administrator", () => {
		expect(assessClaim({ psc: "passed" }, true)).toEqual({ kind: "reviewable" });
	});

	it("submits for review once a document is uploaded", () => {
		expect(canSubmitForReview({}, false)).toBe(false);
		expect(canSubmitForReview({ document: "pending" }, false)).toBe(true);
		expect(canSubmitForReview({ psc: "passed" }, true)).toBe(true);
	});

	it("never lets a contest without Pro Santé Connect beat an owner verified with it", () => {
		const twoMethods = { document: "passed", phone_callback: "passed" } as const;
		expect(canApprove(twoMethods, null)).toBe(true);
		expect(canApprove(twoMethods, { incumbentViaPsc: false })).toBe(true);
		expect(canApprove(twoMethods, { incumbentViaPsc: true })).toBe(false);
		expect(canApprove({ psc: "passed" }, { incumbentViaPsc: true })).toBe(true);
		expect(canApprove({ document: "passed" }, null)).toBe(false);
	});

	it("opens booking at once with Pro Santé Connect, 7 days later otherwise", () => {
		const at = new Date("2026-11-21T10:00:00Z");
		expect(bookingOpensAt(at, true)).toEqual(at);
		expect(bookingOpensAt(at, false)).toEqual(new Date("2026-11-28T10:00:00Z"));
	});
});

describe("claim policy by market", () => {
	const all = { pscEnabled: true, documentsEnabled: true };
	const austrian = (activities: ClaimSubject["activities"]): ClaimSubject => ({
		country: "AT",
		rpps: "7983",
		activities,
	});

	it("keeps France's rules when no market is given", () => {
		expect(claimPolicyOf(undefined)).toEqual(claimPolicyOf("FR"));
		expect(claimPolicyOf("FR").methods).toEqual([
			"psc",
			"registry_email",
			"document",
			"phone_callback",
		]);
	});

	it("offers only a document in Austria, whatever the registry or the configuration", () => {
		expect(availableMethods(austrian([office]), all).map((m) => m.id)).toEqual(["document"]);
		expect(
			availableMethods(austrian([office]), { pscEnabled: true, documentsEnabled: false }),
		).toEqual([]);
		// An unknown market falls back to the document review, never to Pro Santé Connect.
		expect(claimPolicyOf("DE").methods).toEqual(["document"]);
	});

	it("lets an administrator approve an Austrian claim on the document alone", () => {
		expect(assessClaim({ document: "passed" }, false, "AT")).toEqual({ kind: "reviewable" });
		expect(assessClaim({}, false, "AT")).toEqual({ kind: "incomplete", missing: ["document"] });
		expect(canApprove({ document: "passed" }, null, "AT")).toBe(true);
		// France still needs the phone callback too.
		expect(canApprove({ document: "passed" }, null, "FR")).toBe(false);
	});

	it("never verifies an Austrian claim on its own, even with a strong check recorded", () => {
		expect(assessClaim({ psc: "passed" }, false, "AT")).toEqual({
			kind: "incomplete",
			missing: ["document"],
		});
		expect(assessClaim({ registry_email: "passed", document: "passed" }, false, "AT")).toEqual({
			kind: "reviewable",
		});
	});
});
