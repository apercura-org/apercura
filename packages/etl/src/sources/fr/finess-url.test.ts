import { describe, expect, it } from "vitest";
import { isDataGouvUrl } from "./finess";

describe("isDataGouvUrl", () => {
	it("accepts the dataset's files on data.gouv.fr", () => {
		expect(
			isDataGouvUrl(
				"https://static.data.gouv.fr/resources/finess-structures-1/20261121-032447/finess-structures-journalier-20261121.json.gz",
			),
		).toBe(true);
		expect(isDataGouvUrl("https://www.data.gouv.fr/fr/datasets/r/abc")).toBe(true);
	});

	it("refuses any other host, scheme or credentials a third-party answer could carry", () => {
		for (const url of [
			"http://static.data.gouv.fr/resources/x.json.gz",
			"https://data.gouv.fr.evil.example/x.json.gz",
			"https://evil.example/static.data.gouv.fr/x.json.gz",
			"https://user:pass@static.data.gouv.fr/x.json.gz",
			"https://static.data.gouv.fr:8443/x.json.gz",
			"https://169.254.169.254/latest/meta-data",
			"file:///etc/passwd",
			"not a url",
		]) {
			expect(isDataGouvUrl(url), url).toBe(false);
		}
	});
});
