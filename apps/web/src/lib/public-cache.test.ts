import { describe, expect, it } from "vitest";
import {
	PUBLIC_PAGE_CACHE_CONTROL,
	privatePagePattern,
	publicPageCacheControl,
} from "./public-cache";

const page = (pathname: string, method = "GET") => publicPageCacheControl({ method, pathname });

describe("public page Cache-Control", () => {
	it("lets a shared cache keep a page five minutes, then serve it stale for an hour", () => {
		expect(PUBLIC_PAGE_CACHE_CONTROL).toBe(
			"public, max-age=0, s-maxage=300, stale-while-revalidate=3600",
		);
	});

	it("applies to the directory's pages in every locale", () => {
		for (const path of [
			"/",
			"/fr",
			"/fr/praticien/camille-exemple-19999990013",
			"/fr/medecin-generaliste",
			"/fr/medecin-generaliste/75-paris/paris-15e-arrondissement",
			"/fr/annuaire/75-paris",
			"/fr/etablissement/hopital-fictif-de-test-759999001",
			"/fr/a-propos",
			// The practitioners' presentation page, in every locale; not what is below it.
			"/fr/pro",
			"/fr-en/pro",
			"/fr-de/pro",
			"/fr-en/practitioner/camille-exemple-19999990013",
			"/fr-de/verzeichnis",
			// A listing whose slug starts like a private page is still a listing.
			"/fr/proctologue",
			"/fr/rdvx",
		]) {
			expect(page(path), path).toBe(PUBLIC_PAGE_CACHE_CONTROL);
		}
		expect(page("/fr/annuaire", "HEAD")).toBe(PUBLIC_PAGE_CACHE_CONTROL);
	});

	it("never applies to the practitioner space, appointments, search or the forms", () => {
		for (const path of [
			"/fr/pro/connexion",
			"/fr/pro/agenda/reglages",
			"/fr-en/pro/tableau-de-bord",
			"/fr/rdv",
			"/fr-it/rdv",
			"/fr/recherche",
			"/fr-en/search",
			"/fr-de/suche",
			"/fr/praticien/camille-exemple-19999990013/signaler",
			"/fr/praticien/camille-exemple-19999990013/retrait",
			"/fr-en/practitioner/camille-exemple-19999990013/removal",
			"/fr-es/profesional/camille-exemple-19999990013/notificacion",
			"/fr/_ui",
		]) {
			expect(page(path), path).toBeNull();
		}
	});

	it("never applies to writes (forms and server actions)", () => {
		expect(page("/fr/annuaire", "POST")).toBeNull();
		expect(page("/fr/praticien/camille-exemple-19999990013", "PUT")).toBeNull();
	});
});

describe("private page pattern", () => {
	it("matches the pages and everything below them, one segment per parameter", () => {
		const pattern = privatePagePattern(["/fr/pro", "/fr/praticien/[slug]/retrait"]);
		expect(pattern.test("/fr/pro")).toBe(true);
		expect(pattern.test("/fr/pro/")).toBe(true);
		expect(pattern.test("/fr/pro/connexion")).toBe(true);
		expect(pattern.test("/fr/procedure")).toBe(false);
		expect(pattern.test("/fr/praticien/x-1/retrait")).toBe(true);
		expect(pattern.test("/fr/praticien/x-1")).toBe(false);
		expect(pattern.test("/fr/praticien/x/y/retrait")).toBe(false);
	});
});
