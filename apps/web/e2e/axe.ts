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

export async function axeViolations(page: Page) {
	const results = await new AxeBuilder({ page })
		.withTags(TAGS)
		.exclude(LIVE_ANNOUNCER_ECHO)
		.analyze();
	return results.violations.map((violation) => ({
		id: violation.id,
		impact: violation.impact,
		help: violation.help,
		targets: violation.nodes.map((node) => node.target.join(" ")),
	}));
}
