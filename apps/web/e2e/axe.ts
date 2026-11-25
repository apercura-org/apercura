import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";

/** WCAG 2.0, 2.1 and 2.2 A/AA rules, the automated part of the RGAA 4.1 baseline. */
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

/**
 * React Aria's live announcer says "done" for a pending button by pointing a transient
 * `role="img"` node at the button (`aria-labelledby`). When the button leaves the page with the
 * step it finished, that already-spoken node dangles for 7 s until the announcer removes it: not
 * part of our pages, so it is left out of the audit.
 */
const LIVE_ANNOUNCER_ECHO = '[role="log"][aria-relevant="additions"] > [role="img"]';

/** Waits for every finite animation and transition: audit the settled page, not a fade. */
async function settle(page: Page) {
	await page.evaluate(() =>
		Promise.all(
			document
				.getAnimations()
				.filter(
					(animation) => animation.effect?.getTiming().iterations !== Number.POSITIVE_INFINITY,
				)
				.map((animation) => animation.finished.catch(() => undefined)),
		),
	);
}

async function analyze(page: Page, scheme: "light" | "dark") {
	const results = await new AxeBuilder({ page })
		.withTags(TAGS)
		.exclude(LIVE_ANNOUNCER_ECHO)
		.analyze();
	return results.violations.map((violation) => ({
		id: violation.id,
		impact: violation.impact,
		help: violation.help,
		scheme,
		targets: violation.nodes.map((node) => node.target.join(" ")),
	}));
}

/**
 * The page's WCAG A/AA violations in both colour themes: light, then dark (the system's
 * preference, which the page follows when the visitor chose no theme), then the browser's
 * own scheme again.
 */
export async function axeViolations(page: Page) {
	const violations = [];
	for (const scheme of ["light", "dark"] as const) {
		await page.emulateMedia({ colorScheme: scheme });
		// One frame for the new custom properties to apply, then let colour transitions end.
		await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
		await settle(page);
		violations.push(...(await analyze(page, scheme)));
	}
	await page.emulateMedia({ colorScheme: null });
	await settle(page);
	return violations;
}
