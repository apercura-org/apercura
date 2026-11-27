/**
 * Polish taxonomy: the healthcare establishments (zakłady lecznicze) of the healthcare entities
 * (podmioty lecznicze) of RPWDL, the register kept by Centrum e-Zdrowia
 * (docs/adr/0002-multi-country.md, "Poland"), by what patients go there for.
 *
 * A Polish page is an establishment, the register's unit of care at one or more addresses: a
 * hospital, a clinic (przychodnia), a hospice, a care home, a sanatorium. Its kind is its
 * profession code (`PL_HOSPITAL`, `PL_PRIMARY_CARE`…), read from the establishment's kind of
 * activity (rodzaj działalności leczniczej: `1` inpatient and round-the-clock hospital care, `2`
 * the same outside hospitals, `3` outpatient care) and the kinds of its active cells
 * (komórki organizacyjne), coded by part VIII of the ministry's identification codes
 * ("kody resortowe", Rozporządzenie Ministra Zdrowia z 17 maja 2012 r., Dz.U. 2019 poz. 173):
 * `0010` a primary care doctor's clinic, `1100` a cardiology clinic, `4500` a general surgery
 * ward. Codes come in pairs, the odd one for children (`1101`).
 *
 * The individual and group practices of doctors, dentists, nurses and midwives (praktyki
 * zawodowe) are another part of RPWDL and are not imported (ADR 0002, "Poland").
 *
 * A specialist clinic (PL_SPECIALIST) of one or two fields is listed under the most specific of
 * them (`poradnie-kardiologiczne`); a clinic of three fields or more, or of fields without a
 * listing, under the specialist clinics (`przychodnie-specjalistyczne`); every cell is shown on
 * its page. Labels are not stored here: they live in the i18n catalogs under `taxonomy.*`, keyed
 * by listing slug, like the other markets'. Listing slugs are Polish, without diacritics, and
 * never collide with another market's (tested).
 */

/** Hospitals: inpatient and round-the-clock hospital care (rodzaj działalności 1). */
export const PL_HOSPITAL = "PL_HOSPITAL";
/** Inpatient hospices and home hospice teams (cells 2180–2185). */
export const PL_HOSPICE = "PL_HOSPICE";
/** Care and treatment homes, nursing care homes (ZOL, ZPO: cells 5xxx). */
export const PL_LONG_TERM_CARE = "PL_LONG_TERM_CARE";
/** Sanatoria and spa hospitals (cells 6xxx). */
export const PL_SPA = "PL_SPA";
/** Residential addiction treatment centres (cells 2740–2756, 4740–4759). */
export const PL_ADDICTION = "PL_ADDICTION";
/** Other inpatient care outside hospitals (rodzaj 2): residential rehabilitation, psychiatric care. */
export const PL_RESIDENTIAL = "PL_RESIDENTIAL";
/** Primary care clinics with a doctor (POZ, lekarz rodzinny: cells 0010–0015). */
export const PL_PRIMARY_CARE = "PL_PRIMARY_CARE";
/** Night and holiday care (nocna i świąteczna opieka zdrowotna: cells 0016–0017). */
export const PL_OUT_OF_HOURS = "PL_OUT_OF_HOURS";
/** Specialist outpatient clinics (poradnie specjalistyczne). */
export const PL_SPECIALIST = "PL_SPECIALIST";
/** Dental clinics (cells 1800–1841, dental outpatient rooms 3040–3041). */
export const PL_DENTAL = "PL_DENTAL";
/** Rehabilitation and physiotherapy (cells 1300–1331, 2146–2147, 2300–2314). */
export const PL_REHABILITATION = "PL_REHABILITATION";
/** Primary care nurses and midwives, long-term home nursing (cells 0020–0039, 2140–2143). */
export const PL_NURSING = "PL_NURSING";
/** Laboratories, sample collection points and imaging (cells 7xxx). */
export const PL_DIAGNOSTICS = "PL_DIAGNOSTICS";
/** Other outpatient establishments (treatment rooms, day care centres, outpatient rooms). */
export const PL_OTHER = "PL_OTHER";

/** Profession codes of the Polish establishments and their URL slugs. */
export const PL_PROFESSIONS: Readonly<Record<string, { slug: string; enabled: boolean }>> = {
	[PL_HOSPITAL]: { slug: "szpitale", enabled: true },
	[PL_HOSPICE]: { slug: "hospicja", enabled: true },
	[PL_LONG_TERM_CARE]: { slug: "zaklady-opiekuncze", enabled: true },
	[PL_SPA]: { slug: "sanatoria", enabled: true },
	[PL_ADDICTION]: { slug: "leczenie-uzaleznien", enabled: true },
	[PL_RESIDENTIAL]: { slug: "opieka-stacjonarna", enabled: true },
	[PL_PRIMARY_CARE]: { slug: "przychodnie-poz", enabled: true },
	[PL_OUT_OF_HOURS]: { slug: "nocna-pomoc-lekarska", enabled: true },
	[PL_SPECIALIST]: { slug: "przychodnie-specjalistyczne", enabled: true },
	[PL_DENTAL]: { slug: "stomatologia", enabled: true },
	[PL_REHABILITATION]: { slug: "rehabilitacja", enabled: true },
	[PL_NURSING]: { slug: "pielegniarki-i-polozne", enabled: true },
	[PL_DIAGNOSTICS]: { slug: "diagnostyka", enabled: true },
	[PL_OTHER]: { slug: "inne-placowki", enabled: true },
};

export const PL_DEFAULT_PROFESSIONS = Object.keys(PL_PROFESSIONS);

/** A range of part VIII codes, both ends included (`1100`–`1105`). */
type CodeRange = readonly [number, number];

const inRanges = (code: number, ranges: readonly CodeRange[]) =>
	ranges.some(([from, to]) => code >= from && code <= to);

/**
 * The fields of the specialist clinics that have a listing, by code, in order of precedence:
 * a clinic of two fields is listed under the first one here, the specific fields before the
 * broad ones (internal medicine, surgery, paediatrics). Each field is the part VIII codes of its
 * clinics (`poradnia kardiologiczna` 1100, for children 1101), and of the day wards and
 * community teams of psychiatry and addiction treatment.
 */
export const PL_SPECIALTIES: Readonly<
	Record<string, { slug: string; codes: readonly CodeRange[] }>
> = {
	ginekologia: {
		slug: "poradnie-ginekologiczne",
		codes: [
			[1450, 1475],
			[1032, 1033],
			[1036, 1037],
		],
	},
	okulistyka: { slug: "poradnie-okulistyczne", codes: [[1600, 1605]] },
	uzaleznienia: {
		slug: "poradnie-leczenia-uzaleznien",
		codes: [
			[1740, 1747],
			[2712, 2715],
		],
	},
	psychiatria: {
		slug: "poradnie-zdrowia-psychicznego",
		codes: [
			[1700, 1711],
			[1750, 1751],
			[2700, 2711],
			[2720, 2735],
		],
	},
	psychologia: { slug: "poradnie-psychologiczne", codes: [[1790, 1791]] },
	logopedia: { slug: "poradnie-logopedyczne", codes: [[1616, 1617]] },
	ortopedia: { slug: "poradnie-ortopedyczne", codes: [[1580, 1589]] },
	dermatologia: { slug: "poradnie-dermatologiczne", codes: [[1200, 1203]] },
	laryngologia: { slug: "poradnie-laryngologiczne", codes: [[1610, 1615]] },
	kardiologia: {
		slug: "poradnie-kardiologiczne",
		codes: [
			[1100, 1105],
			[1562, 1562],
		],
	},
	urologia: { slug: "poradnie-urologiczne", codes: [[1640, 1641]] },
	diabetologia: { slug: "poradnie-diabetologiczne", codes: [[1020, 1027]] },
	endokrynologia: {
		slug: "poradnie-endokrynologiczne",
		codes: [
			[1030, 1031],
			[1034, 1035],
			[1038, 1041],
		],
	},
	alergologia: { slug: "poradnie-alergologiczne", codes: [[1010, 1016]] },
	gastroenterologia: { slug: "poradnie-gastroenterologiczne", codes: [[1050, 1057]] },
	pulmonologia: { slug: "poradnie-chorob-pluc", codes: [[1270, 1277]] },
	reumatologia: { slug: "poradnie-reumatologiczne", codes: [[1280, 1281]] },
	onkologia: { slug: "poradnie-onkologiczne", codes: [[1240, 1250]] },
	nefrologia: {
		slug: "poradnie-nefrologiczne",
		codes: [
			[1130, 1131],
			[1642, 1642],
		],
	},
	neurologia: { slug: "poradnie-neurologiczne", codes: [[1220, 1232]] },
	"medycyna-pracy": { slug: "poradnie-medycyny-pracy", codes: [[1160, 1161]] },
	chirurgia: {
		slug: "poradnie-chirurgiczne",
		codes: [
			[1500, 1571],
			[1630, 1631],
		],
	},
	pediatria: { slug: "poradnie-pediatryczne", codes: [[1401, 1421]] },
	"choroby-wewnetrzne": {
		slug: "poradnie-chorob-wewnetrznych",
		codes: [
			[1000, 1009],
			[1060, 1061],
		],
	},
};

const SPECIALTY_ENTRIES = Object.entries(PL_SPECIALTIES);

/** The field of a cell's part VIII code (`1101` → `kardiologia`), or null when it has no listing. */
export function plSpecialtyOfCell(code: string): string | null {
	const value = Number(code);
	if (!/^\d{4}$/.test(code)) return null;
	return SPECIALTY_ENTRIES.find(([, entry]) => inRanges(value, entry.codes))?.[0] ?? null;
}

/** The cell kinds (part VIII code ranges) that make an establishment what it is. */
const CELLS = {
	primaryDoctor: [[10, 15]],
	outOfHours: [[16, 17]],
	nursing: [
		[20, 39],
		[2140, 2143],
	],
	/** School nurses (gabinet profilaktyki zdrowotnej i pomocy przedlekarskiej): inside schools. */
	school: [[40, 41]],
	specialist: [
		[1000, 1299],
		[1340, 1799],
		[1860, 1871],
		[2700, 2735],
	],
	rehabilitation: [
		[1300, 1331],
		[2146, 2147],
		[2300, 2314],
	],
	dental: [
		[1800, 1841],
		[3040, 3041],
	],
	hospice: [[2180, 2185]],
	ward: [[4000, 4999]],
	longTerm: [[5000, 5999]],
	spa: [
		[1850, 1851],
		[6000, 6999],
	],
	addiction: [
		[2740, 2756],
		[4740, 4759],
	],
	diagnostics: [[7000, 7999]],
	/** Emergency medical teams, sanitary transport, air rescue: nobody visits them. */
	transport: [
		[3100, 3299],
		[9250, 9259],
	],
	/** Blood banks and blood donation centres. */
	blood: [[8000, 8999]],
} as const satisfies Record<string, readonly CodeRange[]>;

type CellKind = keyof typeof CELLS;

/** Cell kinds that never make an establishment worth a page on their own. */
const NOT_VISITED: readonly CellKind[] = ["school", "transport", "blood"];

/** What an establishment is, from its kind of activity and its active cells. */
export type PlClassification =
	| { professionCode: string; specialtyCode: string | null }
	| { professionCode: null; reason: string };

/**
 * The profession and listing field of an establishment, from its kind of activity (`1`, `2`,
 * `3`, as RPWDL's `Rodzaj działalności` prints it; anything else is read from its cells) and
 * the part VIII codes of its active cells:
 * - kind 1 is a hospital (a sanatorium when its only wards are spa wards);
 * - kind 2 a hospice, a care home, a sanatorium, an addiction treatment centre, else other
 *   inpatient care;
 * - kind 3 a hospice, a primary care clinic, night and holiday care, a specialist clinic, a
 *   dental clinic, rehabilitation, nurses and midwives, diagnostics, in that order, else another
 *   outpatient establishment; an establishment whose cells are all school nurses, emergency
 *   teams, sanitary transport or blood banks is left out (`reason`).
 * An establishment without an active cell is read from its kind of activity alone.
 */
export function classifyPlEstablishment(
	activityKind: string | null | undefined,
	cellCodes: readonly string[],
): PlClassification {
	const codes = [
		...new Set(cellCodes.filter((code) => /^\d{4}$/.test(code)).map((code) => Number(code))),
	];
	const has = (kind: CellKind) => codes.some((code) => inRanges(code, CELLS[kind]));
	const only = (kinds: readonly CellKind[]) =>
		codes.length > 0 && codes.every((code) => kinds.some((kind) => inRanges(code, CELLS[kind])));
	const kind = (activityKind ?? "").trim();
	const result = (professionCode: string, specialtyCode: string | null = null) => ({
		professionCode,
		specialtyCode,
	});
	// A kind the register leaves empty or misprints (`NULL`, `HP.3.2`) is read from the cells.
	const known = kind === "1" || kind === "2" || kind === "3";
	if (kind === "1" || (!known && has("ward"))) {
		return has("spa") && !has("ward") ? result(PL_SPA) : result(PL_HOSPITAL);
	}
	const inpatient =
		kind === "2" ||
		(!known && !has("primaryDoctor") && (has("longTerm") || has("spa") || has("addiction")));
	if (inpatient) {
		if (has("hospice")) return result(PL_HOSPICE);
		if (has("longTerm")) return result(PL_LONG_TERM_CARE);
		if (has("spa")) return result(PL_SPA);
		if (has("addiction")) return result(PL_ADDICTION);
		return result(PL_RESIDENTIAL);
	}
	if (codes.length > 0 && only(NOT_VISITED)) {
		const reason = has("school")
			? "school nurses only"
			: has("transport")
				? "emergency or transport teams only"
				: "blood bank only";
		return { professionCode: null, reason };
	}
	if (has("hospice")) return result(PL_HOSPICE);
	if (has("primaryDoctor")) return result(PL_PRIMARY_CARE);
	if (has("outOfHours")) return result(PL_OUT_OF_HOURS);
	if (has("specialist")) return result(PL_SPECIALIST, primaryPlSpecialty(cellCodes));
	if (has("dental")) return result(PL_DENTAL);
	if (has("rehabilitation")) return result(PL_REHABILITATION);
	if (has("nursing")) return result(PL_NURSING);
	if (has("diagnostics")) return result(PL_DIAGNOSTICS);
	if (has("spa")) return result(PL_SPA);
	return result(PL_OTHER);
}

/** A specialist clinic with this many fields that have a listing, or more, lists as a specialist clinic. */
export const PL_MULTI_SPECIALTY_FIELDS = 3;

const SPECIALTY_ORDER: ReadonlyMap<string, number> = new Map(
	Object.keys(PL_SPECIALTIES).map((code, index) => [code, index]),
);

/**
 * The field a specialist clinic is listed under: of the fields of its cells that have a listing,
 * the first in `PL_SPECIALTIES`; null when it has none, or `PL_MULTI_SPECIALTY_FIELDS` or more
 * (a clinic of many fields lists as a specialist clinic, not under one of them).
 */
export function primaryPlSpecialty(cellCodes: readonly string[]): string | null {
	const fields = new Set<string>();
	for (const code of cellCodes) {
		const field = plSpecialtyOfCell(code);
		if (field) fields.add(field);
	}
	if (fields.size === 0 || fields.size >= PL_MULTI_SPECIALTY_FIELDS) return null;
	return [...fields].sort(
		(a, b) => (SPECIALTY_ORDER.get(a) ?? 0) - (SPECIALTY_ORDER.get(b) ?? 0),
	)[0] as string;
}

/**
 * Listing slug of a Polish establishment: a specialist clinic under its field (else
 * `przychodnie-specjalistyczne`), any other establishment under its kind's (`szpitale`).
 */
export function plListingSlugFor(
	professionCode: string,
	specialtyCode: string | null | undefined,
): string | null {
	const profession = PL_PROFESSIONS[professionCode];
	if (!profession) return null;
	if (professionCode === PL_SPECIALIST && specialtyCode) {
		const specialty = PL_SPECIALTIES[specialtyCode];
		if (specialty) return specialty.slug;
	}
	return profession.slug;
}

/** Every Polish listing slug. */
export function allPlListingSlugs(): Set<string> {
	const slugs = new Set<string>();
	for (const profession of Object.values(PL_PROFESSIONS)) slugs.add(profession.slug);
	for (const specialty of Object.values(PL_SPECIALTIES)) slugs.add(specialty.slug);
	return slugs;
}

const PL_LISTING_SLUGS: ReadonlySet<string> = allPlListingSlugs();

/**
 * First URL segments of the Polish pages that can never be a listing slug: the Polish route
 * segments of the app (`/pl/placowka/…`, `/pl/katalog`) and the technical ones.
 */
export const PL_RESERVED_SEGMENTS = [
	"placowka",
	"organizacja",
	"katalog",
	"szukaj",
	"pro",
	"rdv",
	"api",
	"o-projekcie",
	"open-source",
	"dane",
	"dostepnosc",
	"prywatnosc",
	"nota-prawna",
	"regulamin",
	"guides",
	"og",
	"sitemaps",
	"_ui",
] as const;

/** True when `slug` can be served as a Polish listing page. */
export function isPlListingSlug(slug: string): boolean {
	return !(PL_RESERVED_SEGMENTS as readonly string[]).includes(slug) && PL_LISTING_SLUGS.has(slug);
}

/** The profession code whose own listing a slug is (`szpitale` -> `PL_HOSPITAL`), if any. */
export function plProfessionOfListingSlug(slug: string): string | undefined {
	return Object.entries(PL_PROFESSIONS).find(([, profession]) => profession.slug === slug)?.[0];
}
