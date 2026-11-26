/**
 * The colour theme: light, dark, or the system's (the default). The choice is a device
 * preference, never sent to the server: it lives in localStorage and is applied by
 * `/theme.js`, a tiny same-origin script the root layouts load in <head>, before the first
 * paint. Pages stay static and cacheable (the HTML is the same for everyone) and the CSP is
 * untouched (`script-src 'self'`).
 *
 * The script sets `data-theme` on <html> to a stored `light` or `dark`; with no choice it
 * leaves it unset and the stylesheet follows `prefers-color-scheme`. Without JavaScript the
 * system decides, and the theme control (which needs JavaScript) stays hidden: the script
 * also marks the document with `data-js`.
 */

export const THEMES = ["light", "dark", "system"] as const;
export type ThemeChoice = (typeof THEMES)[number];

export const THEME_STORAGE_KEY = "apercura-theme";

/** The name of the theme control's radio buttons, which /theme.js drives. */
export const THEME_INPUT_NAME = THEME_STORAGE_KEY;

/**
 * The body of `/theme.js`, plain ES5 with no dependency, every storage access guarded (private
 * mode, disabled storage). It:
 * - applies the stored choice to <html> (`data-theme`) and marks the document (`data-js`);
 * - drives the theme control (radios named `apercura-theme`, ~/components/theme-switch): it
 *   checks the stored choice, stores and applies a new one, and keeps every control in step,
 *   those a client-side navigation renders and those of other tabs included.
 * The control needs no React code, so it works before hydration and adds nothing to the pages'
 * JavaScript.
 */
export const THEME_SCRIPT = `(function () {
	var root = document.documentElement;
	var key = ${JSON.stringify(THEME_STORAGE_KEY)};
	root.setAttribute("data-js", "");
	function stored() {
		try {
			var value = localStorage.getItem(key);
			return value === "light" || value === "dark" ? value : null;
		} catch (error) {
			return null;
		}
	}
	var theme = stored();
	function apply() {
		if (theme) root.setAttribute("data-theme", theme);
		else root.removeAttribute("data-theme");
	}
	function sync() {
		var inputs = document.querySelectorAll('input[name="' + key + '"]');
		for (var i = 0; i < inputs.length; i++) inputs[i].checked = inputs[i].value === (theme || "system");
	}
	apply();
	function watch() {
		sync();
		new MutationObserver(sync).observe(document.body, { childList: true, subtree: true });
	}
	// Loaded late (the 404, which the browser renders from its data), the document is ready.
	if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", watch);
	else watch();
	document.addEventListener("change", function (event) {
		var input = event.target;
		if (!input || input.name !== key) return;
		theme = input.value === "light" || input.value === "dark" ? input.value : null;
		try {
			if (theme) localStorage.setItem(key, theme);
			else localStorage.removeItem(key);
		} catch (error) {}
		apply();
		sync();
	});
	window.addEventListener("storage", function (event) {
		if (event.key !== key && event.key !== null) return;
		theme = stored();
		apply();
		sync();
	});
})();
`;
