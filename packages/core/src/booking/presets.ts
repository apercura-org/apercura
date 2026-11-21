import type { Audience } from "./types";

/**
 * A suggested appointment type. `nameKey` is an i18n key (namespace `booking.presets`); once the
 * practitioner saves the type, its translated name becomes their own text.
 */
export interface AppointmentTypePreset {
	nameKey: string;
	durationMin: number;
	beforeMin: number;
	afterMin: number;
	audience: Audience;
}

const preset = (
	name: string,
	durationMin: number,
	audience: Audience = "all",
): AppointmentTypePreset => ({
	nameKey: `booking.presets.${name}`,
	durationMin,
	beforeMin: 0,
	afterMin: 0,
	audience,
});

/** Used for any specialty without its own presets. */
export const GENERIC_PRESETS: readonly AppointmentTypePreset[] = [preset("consultation", 30)];

const PRESETS_BY_SPECIALTY: ReadonlyMap<string, readonly AppointmentTypePreset[]> = new Map([
	["medecin-generaliste", [preset("consultation", 15), preset("firstConsultation", 30, "new")]],
	["chirurgien-dentiste", [preset("checkup", 30), preset("emergency", 20), preset("scaling", 30)]],
	[
		"orthodontiste",
		[preset("firstConsultation", 45, "new"), preset("orthodonticCheckup", 20, "existing")],
	],
	["sage-femme", [preset("pregnancyFollowUp", 30), preset("perinealRehabilitation", 30)]],
]);

/** Default appointment types offered when a practitioner opens a calendar, by specialty slug. */
export function presetsForSpecialty(specialtySlug: string): readonly AppointmentTypePreset[] {
	return PRESETS_BY_SPECIALTY.get(specialtySlug) ?? GENERIC_PRESETS;
}
