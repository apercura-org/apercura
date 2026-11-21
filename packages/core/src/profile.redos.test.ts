import { describe, expect, it } from "vitest";
import { hasMarkup } from "./profile";

describe("hasMarkup", () => {
	it("detects tags, entities and markdown links", () => {
		for (const v of [
			"<b>x</b>",
			"< script>",
			"</ div>",
			"<!-- c -->",
			"&amp;",
			"&#39;",
			"[a](b)",
			"![i](s)",
		]) {
			expect(hasMarkup(v)).toBe(true);
		}
	});
	it("accepts plain text", () => {
		for (const v of ["2 < 3 et 5 > 4", "Tarif : 30 € [secteur 1]", "R&D", "(voir plus bas)"]) {
			expect(hasMarkup(v)).toBe(false);
		}
	});
	it("stays fast on pathological input", () => {
		const start = performance.now();
		hasMarkup(`<${" ".repeat(50_000)}1`);
		hasMarkup("[".repeat(50_000));
		hasMarkup("](".repeat(30_000));
		expect(performance.now() - start).toBeLessThan(200);
	});
});
