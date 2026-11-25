import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { OG_FONT_FILES, OG_FONT_SUBSETS, OG_FONT_WEIGHTS } from "./font-files";

// The web app's root: where the server runs, and where the font paths start.
const appRoot = fileURLToPath(new URL("../../../", import.meta.url));

describe("OG_FONT_FILES", () => {
	it("lists every cut the images draw with", () => {
		expect(OG_FONT_FILES).toHaveLength(OG_FONT_SUBSETS.length * OG_FONT_WEIGHTS.length);
	});

	it.each(OG_FONT_FILES)("%s is installed", (file) => {
		expect(existsSync(`${appRoot}${file}`)).toBe(true);
	});
});
