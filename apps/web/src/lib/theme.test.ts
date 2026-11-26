import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { THEME_SCRIPT, THEME_STORAGE_KEY } from "./theme";

type Listener = (event: { target?: unknown; key?: string | null }) => void;

/** Just enough of a browser for /theme.js: <html>, radios, listeners, a storage. */
function fakeBrowser(storage: unknown, readyState = "loading") {
	const attributes = new Map<string, string>();
	const listeners = new Map<string, Listener[]>();
	const on = (type: string, listener: Listener) =>
		listeners.set(type, [...(listeners.get(type) ?? []), listener]);
	const radios = ["light", "dark", "system"].map((value) => ({
		name: THEME_STORAGE_KEY,
		value,
		checked: value === "system",
	}));
	const document = {
		documentElement: {
			setAttribute: (name: string, value: string) => attributes.set(name, value),
			removeAttribute: (name: string) => attributes.delete(name),
		},
		body: {},
		querySelectorAll: () => radios,
		addEventListener: on,
		readyState,
	};
	class MutationObserver {
		observe() {}
	}
	runInNewContext(THEME_SCRIPT, {
		document,
		localStorage: storage,
		window: { addEventListener: on },
		MutationObserver,
	});
	const fire = (type: string, event: Parameters<Listener>[0] = {}) => {
		for (const listener of listeners.get(type) ?? []) listener(event);
	};
	fire("DOMContentLoaded");
	const checked = () => radios.find((radio) => radio.checked)?.value;
	return { attributes, radios, fire, checked };
}

function fakeStorage(initial: Record<string, string> = {}) {
	const values = new Map(Object.entries(initial));
	return {
		values,
		getItem: (key: string) => values.get(key) ?? null,
		setItem: (key: string, value: string) => values.set(key, value),
		removeItem: (key: string) => values.delete(key),
	};
}

describe("/theme.js", () => {
	it("applies a stored light or dark choice, checks it, and marks the document as scripted", () => {
		const dark = fakeBrowser(fakeStorage({ [THEME_STORAGE_KEY]: "dark" }));
		expect(dark.attributes.get("data-theme")).toBe("dark");
		expect(dark.checked()).toBe("dark");
		expect(fakeBrowser(fakeStorage({ [THEME_STORAGE_KEY]: "light" })).checked()).toBe("light");
		expect(fakeBrowser(fakeStorage()).attributes.has("data-js")).toBe(true);
	});

	it("checks the stored choice at once when it loads after the document", () => {
		const late = fakeBrowser(fakeStorage({ [THEME_STORAGE_KEY]: "dark" }), "complete");
		expect(late.attributes.get("data-theme")).toBe("dark");
		expect(late.checked()).toBe("dark");
	});

	it("leaves the theme to the system when nothing valid is stored", () => {
		const none = fakeBrowser(fakeStorage());
		expect(none.attributes.has("data-theme")).toBe(false);
		expect(none.checked()).toBe("system");
		expect(
			fakeBrowser(fakeStorage({ [THEME_STORAGE_KEY]: "sepia" })).attributes.has("data-theme"),
		).toBe(false);
	});

	it("stores and applies a new choice from the control, and forgets it for system", () => {
		const storage = fakeStorage();
		const browser = fakeBrowser(storage);
		const [light, dark, system] = browser.radios;
		browser.fire("change", { target: dark });
		expect(storage.values.get(THEME_STORAGE_KEY)).toBe("dark");
		expect(browser.attributes.get("data-theme")).toBe("dark");
		expect(browser.checked()).toBe("dark");
		browser.fire("change", { target: light });
		expect(browser.attributes.get("data-theme")).toBe("light");
		browser.fire("change", { target: system });
		expect(storage.values.has(THEME_STORAGE_KEY)).toBe(false);
		expect(browser.attributes.has("data-theme")).toBe(false);
		// Other inputs are none of its business.
		browser.fire("change", { target: { name: "other", value: "dark" } });
		expect(browser.attributes.has("data-theme")).toBe(false);
	});

	it("follows a choice made in another tab", () => {
		const storage = fakeStorage();
		const browser = fakeBrowser(storage);
		storage.values.set(THEME_STORAGE_KEY, "dark");
		browser.fire("storage", { key: THEME_STORAGE_KEY });
		expect(browser.attributes.get("data-theme")).toBe("dark");
		expect(browser.checked()).toBe("dark");
	});

	it("survives a storage that throws (private mode, disabled storage)", () => {
		const blocked = {
			getItem: () => {
				throw new Error("SecurityError");
			},
			setItem: () => {
				throw new Error("SecurityError");
			},
		};
		const browser = fakeBrowser(blocked);
		expect(browser.attributes.has("data-theme")).toBe(false);
		expect(browser.attributes.has("data-js")).toBe(true);
		browser.fire("change", { target: browser.radios[1] });
		// Not remembered, but applied to this page.
		expect(browser.attributes.get("data-theme")).toBe("dark");
	});
});
