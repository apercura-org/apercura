/**
 * The shape Lithuania's licence register is parsed into: one row per page, an activity address of
 * a licensed health-care institution (VASPVT, "Sveikatos priežiūros įstaigų licencijų duomenys",
 * CC BY 4.0), ready for the merge (`../../merge-lt.ts`).
 */

/** The one Lithuanian list, as named in `stats.sources` and the guards. */
export const LT_SOURCE_ID = "vaspvt";

/** `directory.sites.source` and `directory.activities.source` of the Lithuanian rows. */
export const LT_SITE_SOURCE = "lt-vaspvt";

/** The `directory.practitioner_qualifications.source` of a page's licensed services. */
export const LT_SERVICE_SOURCE = "paslauga";

/**
 * The models of VASPVT's dataset read, each with the only columns asked for and read: the legal
 * entity code (`ja_kodas`), the seat addresses (`Istaiga.adresas`, `Licencija.ja_buveines_adresas`),
 * the licence numbers and the orders are never requested, so they cannot be stored.
 */
export const LT_VASPVT_MODELS = {
	Istaiga: ["spi_id", "ja_pavadinimas", "teisine_forma"],
	IstaigosVeiklosAdresas: ["spi_veiklos_adreso_id", "adreso_id", "adresas", "istaiga"],
	Licencija: [
		"licencijos_id",
		"istaiga",
		"sudarymo_data",
		"panaikinimo_data",
		"busena",
		"ja_pavadinimas",
	],
	IstaigosPaslauga: ["nustatymas", "licenzija", "veiklos_adresas"],
	PaslauguNustatymas: [
		"paslaugos_nustatymo_id",
		"paslaugos_budas",
		"paslaugos_id",
		"paslaugos_grupes_id",
		"paslaugos_lygio_id",
		"paslaugos_tipo_id",
	],
	Paslauga: ["paslaugos_id", "pavadinimas"],
} as const;

export type LtVaspvtModel = keyof typeof LT_VASPVT_MODELS;

/**
 * The Address Register's text tables the weekly run reads to place an address (municipalities,
 * elderships, settlements, with their names in the genitive the licence register writes), and
 * the counties and settlement boundaries the places import reads too. The value is the model's
 * path under `datasets/gov/rc/ar/` and the columns read (`<ref>._id` is how the store writes a
 * reference).
 */
export const LT_ADDRESS_MODELS = {
	savivaldybe: {
		path: "savivaldybe/Savivaldybe",
		columns: ["_id", "sav_kodas", "pavadinimas", "apskritis._id"],
	},
	seniunija: {
		path: "seniunija/Seniunija",
		columns: ["_id", "sen_kodas", "pavadinimas", "savivaldybe._id", "sen_iki"],
	},
	gyvenamojivietove: {
		path: "gyvenamojivietove/GyvenamojiVietove",
		columns: [
			"gyv_kodas",
			"tipo_santrumpa",
			"pavadinimas_k",
			"pavadinimas",
			"seniunija._id",
			"savivaldybe._id",
			"gyv_iki",
		],
	},
} as const;

export const LT_PLACE_MODELS = {
	apskritis: { path: "apskritis/Apskritis", columns: ["_id", "adm_kodas", "pavadinimas"] },
	gragyvenamojivietove: {
		path: "gragyvenamojivietove/GraGyvenamojiVietove",
		columns: ["gyv_kodas", "gyv_vietoves"],
	},
} as const;

export type LtAddressModel = keyof typeof LT_ADDRESS_MODELS;
export type LtPlaceModel = keyof typeof LT_PLACE_MODELS;

/** File name of a model in `--source-dir` and the work directory. */
export const vaspvtFile = (model: LtVaspvtModel) => `vaspvt_${model}.csv`;
export const addressFile = (model: LtAddressModel | LtPlaceModel) => `ar_${model}.csv`;

/** A licensed service of an address, as its page lists it. */
export type LtServiceLabel = { code: string; label: string };

export type LtFacility = {
	/** `{istaiga}-{adreso_id}` or `{istaiga}-v{guid8}`: the page's and the site's key. */
	nationalId: string;
	professionCode: string;
	/** The institution's registered name, its legal form abbreviated (`UAB „Pavyzdys“`). */
	name: string;
	/** The services licensed at the address, deduplicated, sorted by label. */
	services: LtServiceLabel[];
	/** Street and number (`Pavyzdžio g. 12`), or null for a village address without one. */
	street: string | null;
	/** `LT-01100` when the address gives one (VASPVT rarely does), else null. */
	postcode: string | null;
	/** The settlement in the nominative (`Vilnius`), else the municipality's name. */
	city: string;
	/** Address Register settlement code (`31003`), or null when only the municipality is known. */
	settlementCode: string | null;
	/** Address Register municipality code (`13`). */
	municipalityCode: string;
};

export type QuarantinedLine = { lineNo: number; reason: string; sample: string };

export type ParseResult = {
	source: typeof LT_SOURCE_ID;
	/** Activity addresses of the register (every one, current or not). */
	lines: number;
	rows: LtFacility[];
	quarantined: QuarantinedLine[];
	/** Addresses left out on purpose, by reason (no live licence, not a place of care…). */
	skipped: Record<string, number>;
	/** Minimisation and quality counters (`stats.sources.vaspvt.counters`). */
	counters: {
		/** Pages whose name had its legal form abbreviated. */
		namesAbbreviated: number;
		/** Pages named from the newest live licence (the institution has no `Istaiga` row). */
		namesFromLicence: number;
		/** Pages of an individual enterprise (named after its owner). */
		individualEnterprises: number;
		/** Individual enterprises' addresses whose premises number was left out. */
		premisesDropped: number;
		/** Pages placed in their settlement. */
		inSettlement: number;
		/** Pages placed in their municipality only (the settlement could not be told). */
		inMunicipality: number;
		/** Activity addresses listed twice for one institution with one address code: merged. */
		mergedDuplicates: number;
	};
};

export const emptyResult = (): ParseResult => ({
	source: LT_SOURCE_ID,
	lines: 0,
	rows: [],
	quarantined: [],
	skipped: {},
	counters: {
		namesAbbreviated: 0,
		namesFromLicence: 0,
		individualEnterprises: 0,
		premisesDropped: 0,
		inSettlement: 0,
		inMunicipality: 0,
		mergedDuplicates: 0,
	},
});

export const skip = (result: ParseResult, reason: string) => {
	result.skipped[reason] = (result.skipped[reason] ?? 0) + 1;
};

/**
 * An address that cannot be placed. Its sample keeps the page key only, never a name or an
 * address: an individual enterprise's name and address can point to a person.
 */
export const quarantine = (result: ParseResult, lineNo: number, reason: string, id: string) => {
	result.quarantined.push({ lineNo, reason, sample: id.slice(0, 24) });
};
