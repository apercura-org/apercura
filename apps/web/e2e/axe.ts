import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";

/** WCAG 2.0, 2.1 and 2.2 A/AA rules, the automated part of the RGAA 4.1 baseline. */
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

export async function axeViolations(page: Page) {
	const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
	return results.violations.map((violation) => ({
		id: violation.id,
		impact: violation.impact,
		help: violation.help,
		targets: violation.nodes.map((node) => node.target.join(" ")),
	}));
}
