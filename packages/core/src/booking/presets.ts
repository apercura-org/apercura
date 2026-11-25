import type { Audience, VisitLocation } from "./types";

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
	/** `home`: care at the patient's address (the practitioner then chooses the communes). */
	location: VisitLocation;
	/** Fixed travel time after each home visit, in minutes (0 at the site). */
	travelMin: number;
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
	location: "site",
	travelMin: 0,
});

/** A home visit: no service area yet, so it is created inactive until communes are chosen. */
const homeVisit = (
	name: string,
	durationMin: number,
	travelMin: number,
): AppointmentTypePreset => ({
	...preset(name, durationMin),
	location: "home",
	travelMin,
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
	// Care at the nurse's office, and at the patient's home with a fixed travel time.
	[
		"infirmier",
		[
			preset("bloodTest", 10),
			preset("injection", 10),
			preset("dressing", 15),
			homeVisit("homeCare", 20, 15),
		],
	],
]);

/** Default appointment types offered when a practitioner opens a calendar, by specialty slug. */
export function presetsForSpecialty(specialtySlug: string): readonly AppointmentTypePreset[] {
	return PRESETS_BY_SPECIALTY.get(specialtySlug) ?? GENERIC_PRESETS;
}
