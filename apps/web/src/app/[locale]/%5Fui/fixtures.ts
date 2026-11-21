/**
 * Synthetic data for the component gallery. Every name, number and address
 * here is fictitious and chosen to look fictitious ("Exemple", "Fictif",
 * "Démo", "Essai", phone numbers made of zeros). RPPS numbers are Luhn-valid
 * so components behave as with real data, but they identify no one.
 */

export type SampleStatus = "unclaimed" | "claimed" | "verified";
export type SampleProfession = "gp" | "dentist" | "midwife" | "physio";

export interface SamplePractitioner {
	id: string;
	name: string;
	rpps: string;
	profession: SampleProfession;
	town: string;
	status: SampleStatus;
}

export const SAMPLE_PRACTITIONERS: SamplePractitioner[] = [
	{
		id: "p1",
		name: "Dr Exemple Martin",
		rpps: "10000000009",
		profession: "gp",
		town: "Lyon",
		status: "unclaimed",
	},
	{
		id: "p2",
		name: "Dr Fictif Bernard",
		rpps: "12345678903",
		profession: "dentist",
		town: "Rennes",
		status: "verified",
	},
	{
		id: "p3",
		name: "Démo Petit",
		rpps: "99999999990",
		profession: "midwife",
		town: "Lille",
		status: "unclaimed",
	},
	{
		id: "p4",
		name: "Essai Durand",
		rpps: "10101010105",
		profession: "physio",
		town: "Nantes",
		status: "claimed",
	},
];

export const SAMPLE_SITE = {
	name: "Cabinet médical de l’Exemple",
	address: ["12 rue de l’Exemple", "69002 Lyon"],
	coordinates: { lat: 45.7578, lon: 4.832 },
	phone: "+33100000000",
	phoneDisplay: "01 00 00 00 00",
	establishment: "Centre de santé Démo",
	establishmentUrl: "https://example.org/rendez-vous",
} as const;

/** Values a practitioner would type into their page; kept as entered, like any page content. */
export const SAMPLE_DETAILS = {
	hours: "Lun–ven, 08:30–18:00",
	languages: "Français, English",
	convention: "Secteur 1",
} as const;

export const SAMPLE_UPDATED_AT = "2026-11-19";

export const SAMPLE_CITIES = [
	"Lille",
	"Lyon",
	"Marseille",
	"Nantes",
	"Rennes",
	"Strasbourg",
	"Toulouse",
];

/** Fixed "now" for the slot picker, so the gallery renders the same way every time. */
export const SAMPLE_NOW = "2026-11-24T11:10:00+01:00";

const TIMES = [
	"08:30",
	"09:00",
	"09:30",
	"10:00",
	"10:30",
	"11:00",
	"11:30",
	"12:00",
	"14:00",
	"14:30",
	"15:00",
	"15:30",
	"16:00",
	"16:30",
	"17:00",
	"17:30",
];

/** Four days of slots; one day has none. Availability follows a fixed pattern. */
export const SAMPLE_DAYS = ["2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27"].map(
	(date, dayIndex) => ({
		date,
		slots:
			dayIndex === 2
				? []
				: TIMES.filter((_, index) => !(dayIndex === 0 && index >= 8)).map((time, index) => ({
						id: `${date}T${time}`,
						start: `${date}T${time}:00+01:00`,
						time,
						available: (index * 7 + dayIndex * 3) % 5 !== 0,
					})),
	}),
);
