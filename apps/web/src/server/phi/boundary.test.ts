/**
 * The `phi` module is the only path to patient data in clear. Biome's
 * `noRestrictedImports` (biome.json) refuses imports of the crypto package
 * elsewhere, static or dynamic; this test checks that the rule is still
 * configured that way and closes the doors it does not watch: Node's own
 * ciphers, the package's root entry and the platform-key module.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import * as core from "@apercura/core";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../../../..");

function sources(directory: string): string[] {
	return readdirSync(join(root, directory), { withFileTypes: true }).flatMap((entry) => {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) {
			return ["node_modules", ".next", "dist", "coverage"].includes(entry.name)
				? []
				: sources(path);
		}
		return /\.(ts|tsx|mts|js|mjs)$/.test(entry.name) ? [path.split(sep).join("/")] : [];
	});
}

const files = ["apps/web/src", "apps/web/e2e", "packages", "scripts", "docker"].flatMap(
	(directory) => sources(directory),
);
const read = (file: string) => readFileSync(join(root, file), "utf8");
const isTest = (file: string) => /\.test\.tsx?$|^apps\/web\/e2e\//.test(file);

const CRYPTO_PACKAGE = "packages/core/src/crypto/";
const PHI = "apps/web/src/server/phi/";
const PLATFORM = "apps/web/src/server/crypto/";

describe("patient data decryption boundary", () => {
	it("scans the repository", () => {
		expect(files.length).toBeGreaterThan(100);
		expect(files).toContain(`${PHI}index.ts`);
	});

	it("keeps the Biome rule on, with the crypto package, phi and the platform key as the only exceptions", () => {
		const config = JSON.parse(read("biome.json"));
		const rule = config.linter.rules.style.noRestrictedImports;
		expect(rule.level).toBe("error");
		expect(Object.keys(rule.options.paths)).toContain("@apercura/core/crypto");
		expect(rule.options.patterns.flatMap((pattern: { group: string[] }) => pattern.group)).toEqual(
			expect.arrayContaining(["**/core/src/crypto", "**/core/src/crypto/**"]),
		);
		const exempt = config.overrides
			.filter(
				(override: { linter?: { rules?: { style?: { noRestrictedImports?: unknown } } } }) =>
					override.linter?.rules?.style?.noRestrictedImports === "off",
			)
			.flatMap((override: { includes: string[] }) => override.includes);
		expect(exempt.sort()).toEqual(
			["apps/web/src/server/crypto/**", "apps/web/src/server/phi/**", "packages/core/**"].sort(),
		);
	});

	it("uses Node's ciphers in the crypto package only", () => {
		const offenders = files.filter(
			(file) =>
				!file.startsWith(CRYPTO_PACKAGE) &&
				!file.endsWith("boundary.test.ts") &&
				/createDecipheriv|createCipheriv|subtle\.(decrypt|encrypt|unwrapKey|wrapKey)/.test(
					read(file),
				),
		);
		expect(offenders).toEqual([]);
	});

	it("never exposes decryption through the package's root entry", () => {
		for (const name of [
			"decryptField",
			"decryptBytes",
			"unwrapDek",
			"parseKeyring",
			"encryptField",
		]) {
			expect(Object.keys(core)).not.toContain(name);
		}
	});

	it("imports the crypto package from phi and the platform key only", () => {
		const offenders = files.filter((file) => {
			if (file.startsWith("packages/core/") || file.startsWith(PHI) || file.startsWith(PLATFORM)) {
				return false;
			}
			return /["'](@apercura\/core\/crypto|[./]*\/?(?:packages\/)?core\/src\/crypto)/.test(
				read(file),
			);
		});
		expect(offenders).toEqual([]);
	});

	it("opens platform-key data (claim documents, reports, contact requests) from their services only", () => {
		const offenders = files.filter((file) => {
			if (isTest(file) || file.startsWith(PLATFORM)) return false;
			const text = read(file);
			const importsPlatform = /from ["'](?:~\/server|\.\.)\/crypto\/platform["']/.test(text);
			const opens = /\bopen(Text|Bytes)\b/.test(text);
			return (
				importsPlatform &&
				opens &&
				![
					"apps/web/src/server/claims/service.ts",
					"apps/web/src/server/gdpr/service.ts",
					"apps/web/src/server/contact-requests/service.ts",
				].includes(file)
			);
		});
		expect(offenders).toEqual([]);
	});

	it("reads patient fields in clear only through the audited functions of phi", () => {
		// Only phi selects the encrypted patient columns together with a key: anyone else
		// handling them passes ciphertext through (purge sets them to null).
		const offenders = files.filter((file) => {
			if (isTest(file) || file.startsWith(PHI) || file.startsWith("packages/core/")) return false;
			const text = read(file);
			// The platform key decrypts with the master keys, never with a practice's data key.
			if (file.startsWith(PLATFORM)) return /\b(unwrapDek|dataKeyCache|activeDataKey)\b/.test(text);
			return /\b(decryptField|unwrapDek|dataKeyCache|activeDataKey)\b/.test(text);
		});
		expect(offenders).toEqual([]);
	});
});
