import { describe, expect, it } from "vitest";
import { GENERIC_PRESETS, presetsForSpecialty } from "./presets";

describe("presetsForSpecialty", () => {
	it("returns the presets of known specialties", () => {
		expect(
			presetsForSpecialty("medecin-generaliste").map((p) => [p.nameKey, p.durationMin]),
		).toEqual([
			["booking.presets.consultation", 15],
			["booking.presets.firstConsultation", 30],
		]);
		expect(presetsForSpecialty("chirurgien-dentiste")).toHaveLength(3);
		expect(presetsForSpecialty("orthodontiste")).toHaveLength(2);
		expect(presetsForSpecialty("sage-femme").map((p) => p.durationMin)).toEqual([30, 30]);
		expect(presetsForSpecialty("infirmier").map((p) => [p.nameKey, p.durationMin])).toEqual([
			["booking.presets.bloodTest", 10],
			["booking.presets.injection", 10],
			["booking.presets.dressing", 15],
		]);
	});

	it("falls back to a generic consultation", () => {
		expect(presetsForSpecialty("psychiatre")).toBe(GENERIC_PRESETS);
	});

	it("uses i18n keys and valid durations only", () => {
		for (const slug of [
			"medecin-generaliste",
			"chirurgien-dentiste",
			"orthodontiste",
			"sage-femme",
			"infirmier",
			"x",
		]) {
			for (const preset of presetsForSpecialty(slug)) {
				expect(preset.nameKey).toMatch(/^booking\.presets\.[a-zA-Z]+$/);
				expect(Number.isInteger(preset.durationMin) && preset.durationMin > 0).toBe(true);
			}
		}
	});
});
