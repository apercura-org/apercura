import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { textOf } from "./text";

describe("textOf", () => {
	it("reads strings, numbers and nested elements", () => {
		expect(textOf(["Appeler le ", createElement("span", null, "01 99 00 01 01")])).toBe(
			"Appeler le 01 99 00 01 01",
		);
		expect(textOf(42)).toBe("42");
	});

	it("leaves out what assistive technology does not read", () => {
		expect(textOf([createElement("svg", { "aria-hidden": "true" }), "Fermer", null, false])).toBe(
			"Fermer",
		);
	});
});
