import type { Locator, Page } from "@playwright/test";

/**
 * The status messages in `scope` (a form's confirmation, "Copied"), without the polite region
 * each Astryx button keeps inside itself to announce its own pending state.
 */
export function statusMessages(scope: Page | Locator): Locator {
	return scope.locator('[role="status"]:not(button [role="status"])');
}
