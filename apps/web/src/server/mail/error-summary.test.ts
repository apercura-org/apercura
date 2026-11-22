import { describe, expect, it } from "vitest";
import { mailErrorSummary } from "./error-summary";

describe("mailErrorSummary", () => {
	it("keeps the error kind and SMTP codes, never the reply that quotes the recipient", () => {
		const error = Object.assign(
			new Error(
				"Can't send mail - all recipients were rejected: 550 5.1.1 <a.patient@example.test>",
			),
			{ code: "EENVELOPE", responseCode: 550, command: "RCPT TO" },
		);
		expect(mailErrorSummary(error)).toBe("Error EENVELOPE SMTP 550 on RCPT TO");
	});

	it("drops values that are not plain codes", () => {
		const error = Object.assign(new Error("boom"), {
			name: "Weird <a.patient@example.test>",
			code: "a.patient@example.test",
			command: "RCPT TO:<a.patient@example.test>",
		});
		expect(mailErrorSummary(error)).toBe("Error");
		expect(mailErrorSummary("a.patient@example.test")).toBe("Unknown error");
	});

	it("names connection failures", () => {
		const error = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:1025"), {
			code: "ESOCKET",
		});
		expect(mailErrorSummary(error)).toBe("Error ESOCKET");
	});
});
