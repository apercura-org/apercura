import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { buttonStyles } from "@apercura/ui";
import { describe, expect, it } from "vitest";

/*
 * The Stamp Law (DESIGN.md): violet means an action that moves the visitor forward, a verified
 * page or a booked slot. Buttons default to ink, so every stamp is written out on purpose, and
 * no stamped button may carry a step back, a cancellation or a removal.
 */

const ROOTS = [
	new URL("../", import.meta.url).pathname,
	new URL("../../../../packages/ui/src/", import.meta.url).pathname,
];

function sources(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) return sources(path);
		return entry.name.endsWith(".tsx") ? [path] : [];
	});
}

/** Translation keys printed inside each stamped `<Button>` / `<LinkButton>`, per file and line. */
function stampedLabels(): { where: string; keys: string[] }[] {
	const found: { where: string; keys: string[] }[] = [];
	for (const root of ROOTS) {
		for (const file of sources(root)) {
			const text = readFileSync(file, "utf8");
			for (const match of text.matchAll(
				/<(Button|LinkButton)\b(?:(?!<\/?(?:Button|LinkButton)\b)[\s\S])*?\bintent="stamp"/g,
			)) {
				const close = text.indexOf(`</${match[1]}>`, match.index);
				const body = text.slice(match.index, close === -1 ? undefined : close);
				const keys = [...body.matchAll(/\bt\("([^"]+)"/g)].map((key) => key[1] ?? "");
				const line = text.slice(0, match.index).split("\n").length;
				found.push({ where: `${relative(root, file)}:${line}`, keys });
			}
		}
	}
	return found;
}

const BACKWARD = /cancel|remove|delete|pause|suspend|reject|refuse|decline|withdraw|signOut|back/i;

describe("the Stamp Law", () => {
	it("defaults buttons to ink, so violet is always deliberate", () => {
		expect(buttonStyles()).toContain("border-ink");
		expect(buttonStyles()).not.toContain("bg-stamp");
	});

	it("never stamps a step back, a cancellation or a removal", () => {
		const stamped = stampedLabels();
		expect(stamped.length).toBeGreaterThan(10);
		const offenders = stamped.filter(({ keys }) => keys.some((key) => BACKWARD.test(key)));
		expect(offenders).toEqual([]);
	});
});
