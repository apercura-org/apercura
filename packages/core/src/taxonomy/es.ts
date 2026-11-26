/**
 * Spanish taxonomy: the kinds of centre of the General Register of health centres, services and
 * establishments (REGCESS, Ministerio de Sanidad; Real Decreto 1277/2003, annex I) that patients
 * visit, and the care units of their "oferta asistencial" (U.1 to U.900, the same annex), mapped
 * to Spanish listing slugs (docs/adr/0002-multi-country.md, "Spain").
 *
 * A Spanish page is a centre, the register's unit: a hospital, a health centre, a practice, a
 * dental clinic, a pharmacy. Its kind is its profession code (`ES_HOSPITAL`, `ES_PHARMACY`…),
 * read from the REGCESS centre type (`C11`, `C231`, `E1`…). A doctor's practice or another
 * health professional's practice is listed under the care unit it is known for (`U.7
 * Cardiología` → `cardiologos`); its other units are shown on its page.
 *
 * Labels are not stored here: they live in the i18n catalogs under `taxonomy.*`, keyed by
 * listing slug, like the other markets'. Listing slugs are Spanish, without diacritics, and never
 * collide with a French, Austrian, UK or Czech one (tested), so a listing slug always names one
 * market.
 */

/** Hospitals (C11 general, C12 specialised, C13 medium and long stay, C14 mental health). */
export const ES_HOSPITAL = "ES_HOSPITAL";
/** Health centres of the public primary care network (C231 Centros de salud). */
export const ES_HEALTH_CENTRE = "ES_HEALTH_CENTRE";
/** Local primary care surgeries of the public network (C232 Consultorios de atención primaria). */
export const ES_LOCAL_CLINIC = "ES_LOCAL_CLINIC";
/** Doctors' practices (C21 Consultas médicas). */
export const ES_MEDICAL_PRACTICE = "ES_MEDICAL_PRACTICE";
/** Practices of the other health professions (C22 Consultas de otros profesionales sanitarios). */
export const ES_OTHER_PRACTICE = "ES_OTHER_PRACTICE";
/** Polyclinics, centres of several specialties (C24 Centros polivalentes). */
export const ES_POLYCLINIC = "ES_POLYCLINIC";
/** Dental clinics (C251 Clínicas dentales). */
export const ES_DENTAL = "ES_DENTAL";
/** Pharmacies (E1 Oficinas de farmacia). */
export const ES_PHARMACY = "ES_PHARMACY";

/**
 * Profession codes of the Spanish centres and the listing they are in when no care unit decides
 * (`slug`). A health centre and a local surgery list together: both are where the public
 * network's family doctor sees patients.
 */
export const ES_PROFESSIONS: Readonly<Record<string, { slug: string; enabled: boolean }>> = {
	[ES_HOSPITAL]: { slug: "hospitales", enabled: true },
	[ES_HEALTH_CENTRE]: { slug: "centros-de-salud", enabled: true },
	[ES_LOCAL_CLINIC]: { slug: "centros-de-salud", enabled: true },
	[ES_MEDICAL_PRACTICE]: { slug: "consultas-medicas", enabled: true },
	[ES_OTHER_PRACTICE]: { slug: "otros-profesionales-sanitarios", enabled: true },
	[ES_POLYCLINIC]: { slug: "policlinicas", enabled: true },
	[ES_DENTAL]: { slug: "dentistas", enabled: true },
	[ES_PHARMACY]: { slug: "farmacias", enabled: true },
};

export const ES_DEFAULT_PROFESSIONS = Object.keys(ES_PROFESSIONS);

/**
 * The kind of a centre in the singular, as its page and cards name it (`taxonomy.profession.*`):
 * a slug of its own per profession code, so a local surgery reads "Consultorio local" in the
 * health centres' listing.
 */
export const ES_KIND_SLUGS: Readonly<Record<string, string>> = {
	[ES_HOSPITAL]: "hospital",
	[ES_HEALTH_CENTRE]: "centro-de-salud",
	[ES_LOCAL_CLINIC]: "consultorio-local",
	[ES_MEDICAL_PRACTICE]: "consulta-medica",
	[ES_OTHER_PRACTICE]: "consulta-sanitaria",
	[ES_POLYCLINIC]: "policlinica",
	[ES_DENTAL]: "clinica-dental",
	[ES_PHARMACY]: "farmacia",
};

/**
 * The REGCESS centre types imported (the code before ` - ` in `Tipo centro`) and the profession
 * they are. Every other type is left out and counted by the import: other inpatient centres,
 * mobile units, diagnostic, dialysis, assisted reproduction, day surgery, abortion, transfusion,
 * tissue bank, mental health, medical examination and other specialised centres, other
 * outpatient providers, services within a centre (C3) and the establishments other than
 * pharmacies (first-aid kits, opticians, orthopaedic and hearing-aid shops).
 */
export const ES_CENTRE_TYPES: Readonly<Record<string, string>> = {
	C11: ES_HOSPITAL,
	C12: ES_HOSPITAL,
	C13: ES_HOSPITAL,
	C14: ES_HOSPITAL,
	C21: ES_MEDICAL_PRACTICE,
	C22: ES_OTHER_PRACTICE,
	C231: ES_HEALTH_CENTRE,
	C232: ES_LOCAL_CLINIC,
	C24: ES_POLYCLINIC,
	C251: ES_DENTAL,
	E1: ES_PHARMACY,
};

/** The code of a REGCESS centre type (`C251 - Clínicas Dentales` → `C251`), or null. */
export function esCentreTypeCode(raw: string | null | undefined): string | null {
	const match = /^\s*([CE]\d{1,4})\b/.exec(raw ?? "");
	return match?.[1] ?? null;
}

/** The profession of a REGCESS centre type (`C21 - Consultas Médicas`, `C21`), or null when left out. */
export function esProfessionOfType(raw: string | null | undefined): string | null {
	const code = esCentreTypeCode(raw);
	return code ? (ES_CENTRE_TYPES[code] ?? null) : null;
}

/**
 * The care units that have a listing, by REGCESS code, in order of precedence: a practice with
 * several units is listed under the first one here that its kind may list under. The medical
 * specialties come first, the most specific before the broad ones (internal medicine, general
 * surgery), then general practice, aesthetic medicine, and the other health professions.
 * Units absent from this table (nursing support, sample collection, medicine stores,
 * non-conventional therapies, "other units") never decide a listing.
 */
export const ES_SPECIALTIES: Readonly<Record<string, { slug: string; medical: boolean }>> = {
	"U.103": { slug: "psiquiatras", medical: true },
	"U.69": { slug: "psiquiatras", medical: true },
	"U.50": { slug: "oftalmologos", medical: true },
	"U.51": { slug: "oftalmologos", medical: true },
	"U.20": { slug: "pediatras", medical: true },
	"U.26": { slug: "ginecologos", medical: true },
	"U.25": { slug: "ginecologos", medical: true },
	"U.27": { slug: "ginecologos", medical: true },
	"U.28": { slug: "ginecologos", medical: true },
	"U.8": { slug: "dermatologos", medical: true },
	"U.55": { slug: "traumatologos", medical: true },
	"U.52": { slug: "otorrinos", medical: true },
	"U.62": { slug: "otorrinos", medical: true },
	"U.7": { slug: "cardiologos", medical: true },
	"U.41": { slug: "cardiologos", medical: true },
	"U.53": { slug: "urologos", medical: true },
	"U.54": { slug: "urologos", medical: true },
	"U.9": { slug: "digestologos", medical: true },
	"U.49": { slug: "neurocirujanos", medical: true },
	"U.17": { slug: "neurologos", medical: true },
	"U.18": { slug: "neurologos", medical: true },
	"U.6": { slug: "alergologos", medical: true },
	"U.10": { slug: "endocrinos", medical: true },
	"U.16": { slug: "neumologos", medical: true },
	"U.24": { slug: "reumatologos", medical: true },
	"U.14": { slug: "nefrologos", medical: true },
	"U.15": { slug: "nefrologos", medical: true },
	"U.19": { slug: "oncologos", medical: true },
	"U.86": { slug: "oncologos", medical: true },
	"U.79": { slug: "hematologos", medical: true },
	"U.39": { slug: "cirujanos-vasculares", medical: true },
	"U.46": { slug: "cirujanos-plasticos", medical: true },
	"U.47": { slug: "cirujanos-plasticos", medical: true },
	"U.45": { slug: "cirujanos-maxilofaciales", medical: true },
	"U.78": { slug: "geneticistas", medical: true },
	"U.88": { slug: "radiologos", medical: true },
	"U.12": { slug: "geriatras", medical: true },
	"U.57": { slug: "medicos-rehabilitadores", medical: true },
	"U.36": { slug: "anestesiologos", medical: true },
	"U.35": { slug: "anestesiologos", medical: true },
	"U.91": { slug: "medicos-deportivos", medical: true },
	"U.99": { slug: "medicos-del-trabajo", medical: true },
	"U.40": { slug: "cirujanos", medical: true },
	"U.42": { slug: "cirujanos", medical: true },
	"U.43": { slug: "cirujanos", medical: true },
	"U.13": { slug: "internistas", medical: true },
	"U.1": { slug: "medicina-general", medical: true },
	"U.48": { slug: "medicina-estetica", medical: true },
	"U.44": { slug: "dentistas", medical: true },
	// The other health professions: a doctor's practice offering them is listed by them only when
	// it offers no medical unit above; another professional's practice only ever by them.
	"U.70": { slug: "psicologos", medical: false },
	"U.61": { slug: "logopedas", medical: false },
	"U.60": { slug: "terapeutas-ocupacionales", medical: false },
	"U.3": { slug: "matronas", medical: false },
	"U.4": { slug: "podologos", medical: false },
	"U.11": { slug: "nutricionistas", medical: false },
	"U.59": { slug: "fisioterapeutas", medical: false },
	"U.2": { slug: "enfermeria", medical: false },
};

const SPECIALTY_ORDER: ReadonlyMap<string, number> = new Map(
	Object.keys(ES_SPECIALTIES).map((code, index) => [code, index]),
);

/** The REGCESS code that stands for a general health psychologist's practice (`U.70`). */
const PSYCHOLOGY_CODE = "U.70";

/**
 * A practice of another health profession whose only unit is "U.900 Otras unidades
 * asistenciales" and whose registered name says psychology: a general health psychologist
 * (Ley 33/2011, disposición adicional séptima), whom the register files under "other units"
 * because the "U.70 Psicología clínica" unit is the clinical psychologists'. Read from the name
 * as the register publishes it, in Spanish, Catalan, Galician or Basque.
 */
const PSYCHOLOGY_NAME = /PSIC[OÓ]LOG|PSIC[OÓ]LOX|PSIKOLOG|PSICOTERAP/i;

/**
 * The care units of a centre (`Oferta Asistencial`: `U.1 Medicina general/de familia,U.2
 * Enfermería,`), as codes and labels, in the register's order, each once. A comma inside a unit's
 * own name (`U.100 Transporte sanitario (carretera, aéreo, marítimo)`) stays in its label.
 */
export function esUnitsOf(raw: string | null | undefined): { code: string; label: string }[] {
	const units: { code: string; label: string }[] = [];
	const seen = new Set<string>();
	const text = (raw ?? "").replace(/\s+/g, " ");
	// Where each unit starts (`U.7 ` at the start or after a comma): one linear scan, then each
	// label runs to the next start.
	const starts = [...text.matchAll(/(?:^|,) ?U\.(\d{1,4}) /g)];
	for (const [index, match] of starts.entries()) {
		const from = (match.index ?? 0) + match[0].length;
		const to = starts[index + 1]?.index ?? text.length;
		let label = text.slice(from, to).trim();
		while (label.endsWith(",")) label = label.slice(0, -1).trimEnd();
		const code = `U.${match[1]}`;
		if (!label || seen.has(code)) continue;
		seen.add(code);
		units.push({ code, label });
	}
	return units;
}

/**
 * The unit a practice is listed under: of its units that have a listing and that its kind may
 * list under, the first in `ES_SPECIALTIES`. A doctor's practice may list under any unit; another
 * health professional's practice under the other professions' only, and as a psychologist's when
 * its only unit is "other units" and its name says psychology (`PSYCHOLOGY_NAME`). Null when none
 * decides, and for every other kind of centre.
 */
export function primaryEsSpecialty(
	professionCode: string,
	codes: readonly string[],
	name = "",
): string | null {
	if (professionCode !== ES_MEDICAL_PRACTICE && professionCode !== ES_OTHER_PRACTICE) return null;
	const medical = professionCode === ES_MEDICAL_PRACTICE;
	let best: string | null = null;
	let rank = Number.POSITIVE_INFINITY;
	for (const code of codes) {
		const specialty = ES_SPECIALTIES[code];
		const order = SPECIALTY_ORDER.get(code);
		if (!specialty || order === undefined || (!medical && specialty.medical)) continue;
		if (order < rank) {
			best = code;
			rank = order;
		}
	}
	if (
		best === null &&
		!medical &&
		codes.length > 0 &&
		codes.every((code) => code === "U.900") &&
		PSYCHOLOGY_NAME.test(name)
	) {
		return PSYCHOLOGY_CODE;
	}
	return best;
}

/**
 * Listing slug of a Spanish centre: a practice under its primary care unit (else its kind's
 * listing), any other centre under its kind's (`farmacias`, `centros-de-salud`).
 */
export function esListingSlugFor(
	professionCode: string,
	specialtyCode: string | null | undefined,
): string | null {
	const profession = ES_PROFESSIONS[professionCode];
	if (!profession) return null;
	if (
		specialtyCode &&
		(professionCode === ES_MEDICAL_PRACTICE || professionCode === ES_OTHER_PRACTICE)
	) {
		const specialty = ES_SPECIALTIES[specialtyCode];
		if (specialty && (professionCode === ES_MEDICAL_PRACTICE || !specialty.medical)) {
			return specialty.slug;
		}
	}
	return profession.slug;
}

/** Every Spanish listing slug. */
export function allEsListingSlugs(): Set<string> {
	const slugs = new Set<string>();
	for (const profession of Object.values(ES_PROFESSIONS)) slugs.add(profession.slug);
	for (const specialty of Object.values(ES_SPECIALTIES)) slugs.add(specialty.slug);
	return slugs;
}

/** Every slug of the Spanish labels (`taxonomy.listing.*`, `taxonomy.profession.*`): listings and kinds. */
export function allEsTaxonomySlugs(): Set<string> {
	return new Set([...allEsListingSlugs(), ...Object.values(ES_KIND_SLUGS)]);
}

const ES_LISTING_SLUGS: ReadonlySet<string> = allEsListingSlugs();

/**
 * First URL segments of the Spanish pages that can never be a listing slug: the Spanish route
 * segments of the market (`/es/centro/…`, `/es/directorio`) and the technical ones.
 */
export const ES_RESERVED_SEGMENTS = [
	"centro",
	"organizacion",
	"directorio",
	"buscar",
	"pro",
	"rdv",
	"api",
	"acerca-de",
	"open-source",
	"datos",
	"accesibilidad",
	"privacidad",
	"aviso-legal",
	"condiciones",
	"guides",
	"og",
	"sitemaps",
	"_ui",
] as const;

/** True when `slug` can be served as a Spanish listing page. */
export function isEsListingSlug(slug: string): boolean {
	return !(ES_RESERVED_SEGMENTS as readonly string[]).includes(slug) && ES_LISTING_SLUGS.has(slug);
}

/**
 * The profession code whose own listing a slug is (`farmacias` → `ES_PHARMACY`), if any: the
 * first profession of `ES_PROFESSIONS` with that slug (`centros-de-salud` → `ES_HEALTH_CENTRE`).
 */
export function esProfessionOfListingSlug(slug: string): string | undefined {
	return Object.entries(ES_PROFESSIONS).find(([, profession]) => profession.slug === slug)?.[0];
}

/** The kind slug of a Spanish centre's profession (`ES_LOCAL_CLINIC` → `consultorio-local`), if any. */
export function esKindSlugOf(professionCode: string | null | undefined): string | null {
	return professionCode ? (ES_KIND_SLUGS[professionCode] ?? null) : null;
}
