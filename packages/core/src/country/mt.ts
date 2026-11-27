import { formatPhoneMt, MT_POSTCODE, toE164Mt } from "../phone-mt";
import { isValidMtSourceId, MT_ID_SCHEMES, type MtIdScheme } from "../slugs";
import {
	isMtListingSlug,
	MT_DEFAULT_PROFESSIONS,
	MT_PROFESSIONS,
	mtListingSlugFor,
} from "../taxonomy/mt";
import type { CountryAdapter } from "./types";

const CC_BY_4 = "Creative Commons Attribution 4.0 International (CC BY 4.0)";
const CC_BY_4_URL = "https://creativecommons.org/licenses/by/4.0/";

/**
 * The two regions of the market, the NUTS 3 regions of Malta in the National Statistics Office's
 * classification of the localities (grouping only: no listing of their own).
 */
export const MT_REGIONS: Readonly<Record<string, string>> = {
	"01": "Malta",
	"02": "Gozo and Comino",
};

/**
 * The six districts of the National Statistics Office's classification (the local
 * administrative units of level 1), the departments of the market, by their three-digit code:
 * the first two digits are the region's.
 */
export const MT_DISTRICTS: Readonly<Record<string, string>> = {
	"011": "Southern Harbour",
	"012": "Northern Harbour",
	"013": "South Eastern",
	"014": "Western",
	"015": "Northern",
	"026": "Gozo and Comino",
};

export type MtLocality = {
	/** The page's name: the locality as the NSO writes it in English, with its Maltese letters. */
	readonly name: string;
	/** The local council's official name in Maltese, as the Office of the Address Registrar lists it. */
	readonly maltese: string;
	/**
	 * Other names people and the register write: English names, the parts of the locality the
	 * Address Registrar lists inside it (`Buġibba`, `Paceville`), other spellings.
	 */
	readonly other?: readonly string[];
};

/**
 * The 68 localities (local councils), the communes of the market, by the five-digit code of the
 * NSO's classification (the local administrative units of level 2): the district's three digits
 * then the council's number (`01101` Valletta, council 1). The Planning Authority's boundaries
 * carry the same code (`MT01101`); the Maltese names are the Address Registrar's list of local
 * councils (CC BY 4.0), the English ones the NSO's.
 */
export const MT_LOCALITIES: Readonly<Record<string, MtLocality>> = {
	"01101": { name: "Valletta", maltese: "Il-Belt Valletta", other: ["Città Umilissima"] },
	"01103": { name: "Birgu", maltese: "Il-Birgu", other: ["Vittoriosa", "Città Vittoriosa"] },
	"01104": { name: "Isla", maltese: "L-Isla", other: ["Senglea", "Città Invicta"] },
	"01105": { name: "Bormla", maltese: "Bormla", other: ["Cospicua", "Città Cospicua"] },
	"01108": { name: "Żabbar", maltese: "Ħaż-Żabbar", other: ["St Peter's", "Città Hompesch"] },
	"01117": { name: "Fgura", maltese: "Il-Fgura" },
	"01118": { name: "Floriana", maltese: "Floriana", other: ["Il-Furjana"] },
	"01129": { name: "Kalkara", maltese: "Il-Kalkara", other: ["Smart City"] },
	"01133": { name: "Luqa", maltese: "Ħal Luqa", other: ["Ħal Farruġ"] },
	"01134": { name: "Marsa", maltese: "Il-Marsa" },
	"01145": { name: "Paola", maltese: "Paola", other: ["Raħal Ġdid"] },
	"01157": { name: "Santa Luċija", maltese: "Santa Luċija", other: ["Santa Lucia"] },
	"01162": { name: "Tarxien", maltese: "Ħal Tarxien" },
	"01165": { name: "Xgħajra", maltese: "Ix-Xgħajra" },
	"01206": { name: "Qormi", maltese: "Ħal Qormi", other: ["Città Pinto"] },
	"01214": { name: "Birkirkara", maltese: "Birkirkara", other: ["Fleur-de-Lys"] },
	"01221": { name: "Gżira", maltese: "Il-Gżira" },
	"01227": { name: "Ħamrun", maltese: "Il-Ħamrun" },
	"01241": { name: "Msida", maltese: "L-Imsida", other: ["Swatar"] },
	"01246": { name: "Pembroke", maltese: "Pembroke" },
	"01247": { name: "Pietà", maltese: "Tal-Pietà", other: ["Gwardamanġa", "G'Mangia"] },
	"01252": { name: "San Ġiljan", maltese: "San Ġiljan", other: ["St Julian's", "Paceville"] },
	"01253": { name: "San Ġwann", maltese: "San Ġwann", other: ["Kappara"] },
	"01258": { name: "Santa Venera", maltese: "Santa Venera", other: ["St Venera"] },
	"01259": { name: "Sliema", maltese: "Tas-Sliema" },
	"01260": {
		name: "Swieqi",
		maltese: "Is-Swieqi",
		other: ["Madliena", "St Andrew's", "St Andrews"],
	},
	"01261": { name: "Ta' Xbiex", maltese: "Ta' Xbiex" },
	"01310": { name: "Żejtun", maltese: "Iż-Żejtun", other: ["Bulebel", "Città Beland"] },
	"01315": { name: "Birżebbuġa", maltese: "Birżebbuġa" },
	"01320": { name: "Gudja", maltese: "Il-Gudja" },
	"01326": { name: "Għaxaq", maltese: "Ħal Għaxaq" },
	"01331": { name: "Kirkop", maltese: "Ħal Kirkop" },
	"01335": { name: "Marsaskala", maltese: "Marsaskala", other: ["Marsascala"] },
	"01336": { name: "Marsaxlokk", maltese: "Marsaxlokk" },
	"01340": { name: "Mqabba", maltese: "L-Imqabba" },
	"01349": { name: "Qrendi", maltese: "Il-Qrendi" },
	"01351": { name: "Safi", maltese: "Ħal Safi" },
	"01367": { name: "Żurrieq", maltese: "Iż-Żurrieq", other: ["Bubaqra"] },
	"01402": { name: "Mdina", maltese: "L-Imdina", other: ["Città Notabile"] },
	"01407": { name: "Żebbuġ (Malta)", maltese: "Ħaż-Żebbuġ (Malta)", other: ["Città Rohan"] },
	"01409": { name: "Siġġiewi", maltese: "Is-Siġġiewi", other: ["Città Ferdinand"] },
	"01412": { name: "Attard", maltese: "Ħ'Attard", other: ["Ta' Qali"] },
	"01413": { name: "Balzan", maltese: "Ħal Balzan" },
	"01416": { name: "Dingli", maltese: "Ħad-Dingli" },
	"01428": { name: "Iklin", maltese: "L-Iklin" },
	"01432": { name: "Lija", maltese: "Ħal Lija" },
	"01450": { name: "Rabat (Malta)", maltese: "Ir-Rabat (Malta)", other: ["Baħrija", "Tal-Virtù"] },
	"01468": { name: "Mtarfa", maltese: "L-Imtarfa" },
	"01524": { name: "Għargħur", maltese: "Ħal Għargħur" },
	"01537": { name: "Mellieħa", maltese: "Il-Mellieħa" },
	"01538": { name: "Mġarr", maltese: "L-Imġarr" },
	"01539": { name: "Mosta", maltese: "Il-Mosta" },
	"01544": { name: "Naxxar", maltese: "In-Naxxar", other: ["Baħar iċ-Ċagħaq"] },
	"01555": {
		name: "San Pawl il-Baħar",
		maltese: "San Pawl il-Baħar",
		other: ["St Paul's Bay", "Buġibba", "Qawra", "Burmarrad", "Xemxija"],
	},
	"02611": { name: "Rabat (Gozo)", maltese: "Ir-Rabat (Għawdex)", other: ["Victoria"] },
	"02619": { name: "Fontana", maltese: "Il-Fontana" },
	"02622": {
		name: "Għajnsielem",
		maltese: "Għajnsielem",
		other: ["Comino", "Kemmuna", "Mġarr (Gozo)"],
	},
	"02623": { name: "Għarb", maltese: "L-Għarb" },
	"02625": { name: "Għasri", maltese: "L-Għasri" },
	"02630": { name: "Kerċem", maltese: "Ta' Kerċem" },
	"02642": { name: "Munxar", maltese: "Il-Munxar", other: ["Xlendi"] },
	"02643": { name: "Nadur", maltese: "In-Nadur" },
	"02648": { name: "Qala", maltese: "Il-Qala" },
	"02654": { name: "San Lawrenz", maltese: "San Lawrenz" },
	"02656": { name: "Sannat", maltese: "Ta' Sannat" },
	"02663": { name: "Xagħra", maltese: "Ix-Xagħra" },
	"02664": { name: "Xewkija", maltese: "Ix-Xewkija" },
	"02666": { name: "Żebbuġ (Gozo)", maltese: "Iż-Żebbuġ (Għawdex)", other: ["Marsalforn"] },
};

/** The district of a locality code (`01101` → `011`), the region of a district (`011` → `01`). */
export const mtDistrictOf = (locality: string) => locality.slice(0, 3);
export const mtRegionOf = (code: string) => code.slice(0, 2);

/** A name folded for matching: lowercase, without marks or punctuation (`Ħ'Attard` → `h attard`). */
function nameKey(text: string): string {
	return text
		.replace(/[ħĦ]/g, "h")
		.normalize("NFKD")
		.replace(/\p{Mark}/gu, "")
		.toLowerCase()
		.replace(/\bst\b\.?/g, "st")
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}

/** The Maltese definite article before a name (`Il-`, `Ħal `, `Ħ'`, `Tas-`), folded. */
const ARTICLE = /^(?:il|l|ir|is|iz|ix|in|it|id|ic|hal|haz|had|h|tal|tas|taz) /;

/** `Ir-Rabat, Għawdex` → `rabat gozo`; `L-Imġarr, Malta` → `mgarr malta`: island words kept as they read. */
function localityKeys(raw: string): string[] {
	const key = nameKey(raw).replace(/\bghawdex\b/g, "gozo");
	const keys = new Set<string>([key]);
	const bare = key.replace(ARTICLE, "");
	keys.add(bare);
	// `L-Imsida`, `L-Imqabba`: the `i` before two consonants is the article's.
	if (/^im[^aeiou]/.test(bare)) keys.add(bare.slice(1));
	keys.delete("");
	return [...keys];
}

let localityIndex: Map<string, string> | undefined;

function index(): Map<string, string> {
	if (localityIndex) return localityIndex;
	const map = new Map<string, string>();
	const ambiguous = new Set<string>();
	const add = (name: string, code: string) => {
		for (const key of localityKeys(name)) {
			const known = map.get(key);
			if (known && known !== code) ambiguous.add(key);
			else map.set(key, code);
		}
	};
	for (const [code, locality] of Object.entries(MT_LOCALITIES)) {
		for (const name of [locality.name, locality.maltese, ...(locality.other ?? [])]) {
			add(name, code);
		}
	}
	// `Rabat`, `Żebbuġ` alone name two localities: never guessed.
	for (const key of ambiguous) map.delete(key);
	localityIndex = map;
	return map;
}

/** The island words a register's place may end with, lower case. */
const ISLAND_WORDS: Readonly<Record<string, "Gozo" | "Malta">> = {
	għawdex: "Gozo",
	ghawdex: "Gozo",
	gozo: "Gozo",
	malta: "Malta",
};

/**
 * `Ir-Rabat, Għawdex` → `{ name: "Ir-Rabat", which: "Gozo" }`: the last word when it names an
 * island and a space or comma comes before it, read without a backtracking pattern (a run of
 * blanks costs one pass).
 */
function islandSuffix(text: string): { name: string; which: "Gozo" | "Malta" } | null {
	let end = text.length;
	let start = end;
	while (start > 0 && !/[\s,]/.test(text.charAt(start - 1))) start -= 1;
	const which = ISLAND_WORDS[text.slice(start, end).toLowerCase()];
	if (!which || start === 0) return null;
	end = start;
	while (end > 0 && /[\s,]/.test(text.charAt(end - 1))) end -= 1;
	const name = text.slice(0, end);
	return name ? { name, which } : null;
}

/** `St. Andrews (Swieqi)` → `{ name: "St. Andrews", inner: "Swieqi" }`, or null. */
function bracketedLocality(text: string): { name: string; inner: string } | null {
	if (!text.endsWith(")")) return null;
	const open = text.lastIndexOf("(");
	if (open < 0) return null;
	const inner = text.slice(open + 1, -1);
	if (!inner || inner.includes(")")) return null;
	return { name: text.slice(0, open).trimEnd(), inner };
}

/**
 * The locality code of a place as the register writes it (`Ħal Luqa`, `Ir-Rabat, Għawdex`,
 * `Pembroke, St. Andrews`, `Bulebel, Iż-Żejtun`, `St. Paul’s Bay`), or null. The whole name is
 * tried, then `X, Għawdex` as `X (Gozo)`, a name in brackets, and each comma-separated part,
 * the first one first; an ambiguous name (`Rabat` alone) is never guessed.
 */
export function mtLocalityOfName(raw: string | null | undefined): string | null {
	const text = (raw ?? "").replace(/[’`]/g, "'").trim();
	if (!text) return null;
	const map = index();
	const tryKeys = (value: string) => {
		for (const key of localityKeys(value)) {
			const code = map.get(key);
			if (code) return code;
		}
		return null;
	};
	const whole = tryKeys(text);
	if (whole) return whole;
	// `Ir-Rabat, Għawdex`, `L-Għarb Għawdex`, `L-Imġarr, Malta`: the island in brackets.
	const island = islandSuffix(text);
	if (island) {
		const { name, which } = island;
		const code = tryKeys(`${name} (${which})`) ?? tryKeys(name);
		if (code) return code;
	}
	// `St. Andrews (Swieqi)`, `L-Imsida (Tal-Pietà)`: the locality in brackets, then the name.
	const bracketed = bracketedLocality(text);
	if (bracketed) {
		const code = tryKeys(bracketed.inner) ?? tryKeys(bracketed.name);
		if (code) return code;
	}
	// `Pembroke, St. Andrews`, `Bulebel, Iż-Żejtun`: each part, the first one first.
	for (const part of text.split(",")) {
		const code = part.trim() ? tryKeys(part.trim()) : null;
		if (code) return code;
	}
	return null;
}

/**
 * Malta has one time zone. A region code is a region's two digits (`01`), a district's three
 * (`011`) or a locality's five (`01101`) of the NSO's classification; anything else is an error,
 * never a guess.
 */
function timeZoneOfRegion(code: string): string {
	if (!MT_REGIONS[code] && !MT_DISTRICTS[code] && !MT_LOCALITIES[code]) {
		throw new RangeError(`Unknown Maltese region "${code}"`);
	}
	return "Europe/Malta";
}

/**
 * Malta, opened from the Medicines Authority's register of licensed pharmacies in Malta and Gozo
 * (published on the national open data portal, data.gov.mt, under CC BY 4.0, with each
 * pharmacy's point): its community pharmacies, placed in the 68 localities (local councils) by
 * the Planning Authority's boundaries (CC BY 4.0), grouped in the NSO's six districts and two
 * regions. A page is a pharmacy, never a person: the register names no pharmacist, and the
 * Medical Council's registers of doctors and dentists are not republished without its written
 * confirmation (docs/adr/0002-multi-country.md, "Malta"). No booking and no e-identity claim: a
 * pharmacy claims its page with documents checked by an administrator.
 */
export const malta: CountryAdapter = {
	code: "MT",
	segment: "mt",
	defaultLocale: "en",
	defaultTimeZone: "Europe/Malta",
	timeZones: ["Europe/Malta"],
	timeZoneOf: timeZoneOfRegion,
	registries: [
		{
			id: "mt-pharmacies",
			name: "Licensed Pharmacies in Malta and Gozo",
			publisher: "Medicines Authority (Malta), published on data.gov.mt",
			url: "https://data.europa.eu/data/datasets/0dfe65b7-626f-49ef-ab09-6a6ab8a4db72",
			licence: CC_BY_4,
			licenceUrl: CC_BY_4_URL,
			attribution:
				"Source: Medicines Authority, Licensed Pharmacies in Malta and Gozo (data.gov.mt), CC BY 4.0.",
			provides: ["practitioners", "activities"],
		},
		{
			id: "mt-local-councils",
			name: "Local Councils Units and Boundaries",
			publisher: "Planning Authority (Malta)",
			url: "https://data.europa.eu/data/datasets/f47bf292-c4d4-4a39-b2ff-86bc3f9d7e31",
			licence: CC_BY_4,
			licenceUrl: CC_BY_4_URL,
			attribution:
				"Source: Planning Authority, Local Councils Units and Boundaries, CC BY 4.0 (localities' points computed by Apercura).",
			provides: ["places"],
		},
		{
			id: "mt-localities",
			name: "Local administrative units (districts and localities) and the list of local councils",
			publisher: "National Statistics Office (NSO) and the Office of the Address Registrar",
			url: "https://data.europa.eu/data/datasets/532756e1-10fc-4d4c-99f6-569ba15bcddc",
			licence: CC_BY_4,
			licenceUrl: CC_BY_4_URL,
			attribution:
				"Source: National Statistics Office, districts and localities; Office of the Address Registrar, Local Councils of Malta; CC BY 4.0.",
			provides: ["places"],
		},
	],
	practitionerIds: (Object.keys(MT_ID_SCHEMES) as MtIdScheme[]).map((id) => ({
		id,
		name: "Pharmacy licence number (DL)",
		issuer: "Medicines Authority, register of licensed pharmacies",
		isValid: (value) => isValidMtSourceId(id, value),
	})),
	taxonomy: {
		professions: MT_PROFESSIONS,
		defaultProfessions: MT_DEFAULT_PROFESSIONS,
		listingSlugFor: mtListingSlugFor,
		isListingSlug: isMtListingSlug,
	},
	phone: { callingCodes: ["356"], toE164: (raw) => toE164Mt(raw), format: formatPhoneMt },
	address: {
		postcode: MT_POSTCODE,
		// A Maltese address: the street, then the locality and the postcode (MaltaPost's form,
		// `Birżebbuġa BBG 2412`).
		lines: ({ street, postcode, city }) =>
			[street, [city, postcode].filter(Boolean).join(" ")].filter((line): line is string =>
				Boolean(line),
			),
	},
	legalPages: [
		{
			id: "legal-notice",
			pathname: "/mentions-legales",
			basis:
				"Directive 2000/31/EC, article 5, as Malta transposed it: Electronic Commerce Act (Cap. 426), article 8C (general information to be provided); French law applies as the country of origin (article 8A)",
		},
		{
			id: "privacy",
			pathname: "/confidentialite",
			basis:
				"GDPR articles 13, 14, 21 and 77; Data Protection Act (Cap. 586); the Information and Data Protection Commissioner (IDPC) for a complaint from Malta",
		},
		{ id: "terms", pathname: "/conditions", basis: "Terms of use of the service" },
		{
			id: "accessibility",
			pathname: "/accessibilite",
			basis:
				"Voluntary statement: the Accessibility of the Websites and Mobile Applications of Public Sector Bodies Regulations (S.L. 418.03) bind public sector bodies; the Accessibility Measures (European Accessibility Act) Regulations (S.L. 627.03) bind the services they list, which a free directory is not",
		},
	],
	healthDataHosting: {
		regime: "GDPR and the Data Protection Act (Cap. 586)",
		basis:
			"No hosting certification: GDPR and the Data Protection Act (Cap. 586); a directory without booking processes no health data (GDPR article 9)",
		url: "https://idpc.org.mt/",
	},
	features: { directory: true, booking: false, eIdentityClaim: false },
};

/** The identifier schemes of the Maltese market, as stored in `directory.practitioners.id_scheme`. */
export const MT_SCHEME_IDS = Object.keys(MT_ID_SCHEMES) as MtIdScheme[];
