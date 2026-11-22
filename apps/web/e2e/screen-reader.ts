import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { expect, type Locator, type Page } from "@playwright/test";

/**
 * A virtual screen reader in the test browser: `@guidepup/virtual-screen-reader` walks the real
 * page's accessibility tree the way a screen reader's reading cursor does, and logs what it
 * would say, live-region announcements included. It needs no operating-system screen reader and
 * no system settings, so it runs in CI. It does not replace a pass with VoiceOver and NVDA: it
 * reads names, roles, states and announcements from the DOM, not what a given screen reader and
 * browser pair actually speaks.
 *
 * The library's browser build is injected into each page after it loads (specs using it set
 * `bypassCSP`, since the practitioner space and /rdv only run scripts carrying their nonce).
 */

const require = createRequire(import.meta.url);

/** The browser build wrapped in a function that publishes its `virtual` instance on `window`. */
const SCRIPT = (() => {
	const source = readFileSync(
		require.resolve("@guidepup/virtual-screen-reader/browser.js"),
		"utf8",
	);
	// The module's one export statement, followed by licence comments and the source map link.
	const exportStatement = /export\s*\{([^}]*)\};?/;
	const match = source.match(exportStatement);
	const local = match?.[1]
		?.split(",")
		.map((entry) => entry.trim().split(/\s+as\s+/))
		.find(([, exported]) => exported === "virtual")?.[0];
	if (!match || !local) {
		throw new Error(
			"Unexpected @guidepup/virtual-screen-reader browser build: no `virtual` export",
		);
	}
	return `(() => {${source.replace(exportStatement, "")}\nwindow.__screenReader = ${local};})();`;
})();

/** Commands of the reading cursor used by the specs (`virtual.commands`). */
export type ScreenReaderCommand =
	| "moveToNextHeading"
	| "moveToNextLandmark"
	| "moveToNextLink"
	| "moveToNextForm";

declare global {
	interface Window {
		// biome-ignore lint/suspicious/noExplicitAny: the injected library's instance, typed by its own build.
		__screenReader: any;
	}
}

export class ScreenReader {
	private constructor(private readonly page: Page) {}

	/**
	 * Starts the reader on the page (or on one element of it: the cursor then stays inside). The
	 * phrase log starts empty; announcements of live regions anywhere in the page are logged.
	 */
	static async start(page: Page, container?: Locator): Promise<ScreenReader> {
		await page.waitForLoadState("load");
		if (!(await page.evaluate(() => "__screenReader" in window))) {
			await page.addScriptTag({ content: SCRIPT });
		}
		const handle = container ? await container.elementHandle() : null;
		await page.evaluate(async (element) => {
			await window.__screenReader.stop();
			await window.__screenReader.start({ container: element ?? document.body });
		}, handle);
		return new ScreenReader(page);
	}

	/** Moves the reading cursor `times` items forward (VO+Right, NVDA's down arrow). */
	async next(times = 1) {
		await this.page.evaluate(async (count) => {
			for (let index = 0; index < count; index += 1) {
				await window.__screenReader.next();
			}
		}, times);
	}

	/** Reads on until `pattern` is spoken (or `max` items), like a user listening down the page. */
	async readUntil(pattern: RegExp, max = 400): Promise<string[]> {
		const source = pattern.source;
		const flags = pattern.flags;
		const found = await this.page.evaluate(
			async ({ source, flags, max }) => {
				const target = new RegExp(source, flags);
				for (let index = 0; index < max; index += 1) {
					await window.__screenReader.next();
					if (target.test(await window.__screenReader.lastSpokenPhrase())) {
						return true;
					}
				}
				return false;
			},
			{ source, flags, max },
		);
		const log = await this.log();
		expect(found, `"${pattern}" was never spoken. Log:\n${log.join("\n")}`).toBe(true);
		return log;
	}

	/** Runs a cursor command `times` times (next heading, next landmark…). */
	async perform(command: ScreenReaderCommand, times = 1) {
		await this.page.evaluate(
			async ({ command, times }) => {
				for (let index = 0; index < times; index += 1) {
					await window.__screenReader.perform(window.__screenReader.commands[command]);
				}
			},
			{ command, times },
		);
	}

	/** Every phrase spoken since the start (or the last `clear`). */
	log(): Promise<string[]> {
		return this.page.evaluate(() => window.__screenReader.spokenPhraseLog());
	}

	async clear() {
		await this.page.evaluate(() => window.__screenReader.clearSpokenPhraseLog());
	}

	async stop() {
		await this.page.evaluate(() => window.__screenReader.stop());
	}
}

/**
 * Asserts that the log contains phrases matching `expected`, in this order (other phrases may
 * come between them). Strings match a whole phrase; regular expressions match within one.
 */
export function expectPhrasesInOrder(
	log: readonly string[],
	expected: readonly (string | RegExp)[],
) {
	let position = 0;
	for (const phrase of expected) {
		const index = log.findIndex(
			(spoken, at) =>
				at >= position && (typeof phrase === "string" ? spoken === phrase : phrase.test(spoken)),
		);
		expect(
			index,
			`Expected "${phrase}" after phrase ${position} of the spoken log:\n${log
				.map((spoken, at) => `${at}: ${spoken}`)
				.join("\n")}`,
		).toBeGreaterThanOrEqual(0);
		position = index + 1;
	}
}
