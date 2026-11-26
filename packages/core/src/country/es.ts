import { ES_POSTCODE, formatPhoneEs, toE164Es } from "../phone-es";
import { ES_ID_SCHEME, isValidEsSourceId } from "../slugs";
import {
	ES_DEFAULT_PROFESSIONS,
	ES_PROFESSIONS,
	esListingSlugFor,
	isEsListingSlug,
} from "../taxonomy/es";
import type { CountryAdapter } from "./types";

/**
 * The year of the IGN's administrative units and population entities in use, as the IGN's
 * licence asks for it ("Obra derivada de <producto> <fecha> CC-BY 4.0 ign.es").
 */
const IGN_YEAR = 2025;

/**
 * The seventeen autonomous communities and two autonomous cities, by their INE code: the code
 * REGCESS prints (`Código Comunidad Autónoma`) and the IGN's `nationalcode` carries.
 */
export const ES_COMMUNITIES: Readonly<Record<string, string>> = {
	"01": "Andalucía",
	"02": "Aragón",
	"03": "Principado de Asturias",
	"04": "Illes Balears",
	"05": "Canarias",
	"06": "Cantabria",
	"07": "Castilla y León",
	"08": "Castilla-La Mancha",
	"09": "Cataluña/Catalunya",
	"10": "Comunitat Valenciana",
	"11": "Extremadura",
	"12": "Galicia",
	"13": "Comunidad de Madrid",
	"14": "Región de Murcia",
	"15": "Comunidad Foral de Navarra",
	"16": "País Vasco/Euskadi",
	"17": "La Rioja",
	"18": "Ceuta",
	"19": "Melilla",
};

/**
 * The autonomous community of each of the 52 provinces, by INE province code (the first two
 * digits of a municipality's INE code and of a postcode).
 */
export const ES_PROVINCE_COMMUNITIES: Readonly<Record<string, string>> = {
	"01": "16",
	"02": "08",
	"03": "10",
	"04": "01",
	"05": "07",
	"06": "11",
	"07": "04",
	"08": "09",
	"09": "07",
	"10": "11",
	"11": "01",
	"12": "10",
	"13": "08",
	"14": "01",
	"15": "12",
	"16": "08",
	"17": "09",
	"18": "01",
	"19": "08",
	"20": "16",
	"21": "01",
	"22": "02",
	"23": "01",
	"24": "07",
	"25": "09",
	"26": "17",
	"27": "12",
	"28": "13",
	"29": "01",
	"30": "14",
	"31": "15",
	"32": "12",
	"33": "03",
	"34": "07",
	"35": "05",
	"36": "12",
	"37": "07",
	"38": "05",
	"39": "06",
	"40": "07",
	"41": "01",
	"42": "07",
	"43": "09",
	"44": "02",
	"45": "08",
	"46": "10",
	"47": "07",
	"48": "16",
	"49": "07",
	"50": "02",
	"51": "18",
	"52": "19",
};

/** The Canary Islands' provinces (Las Palmas, Santa Cruz de Tenerife): one hour behind the mainland. */
const CANARY_PROVINCES: ReadonlySet<string> = new Set(["35", "38"]);

/**
 * Spain has two time zones: the Canary Islands (`Atlantic/Canary`) and everywhere else
 * (`Europe/Madrid`). A region code is a province (`35`) or an autonomous community (`C05`);
 * any other one is an error, never a guess.
 */
function timeZoneOfRegion(code: string): string {
	if (/^C\d{2}$/.test(code)) {
		if (!ES_COMMUNITIES[code.slice(1)]) throw new RangeError(`Unknown Spanish region "${code}"`);
		return code === "C05" ? "Atlantic/Canary" : "Europe/Madrid";
	}
	if (!ES_PROVINCE_COMMUNITIES[code]) throw new RangeError(`Unknown Spanish province "${code}"`);
	return CANARY_PROVINCES.has(code) ? "Atlantic/Canary" : "Europe/Madrid";
}

/**
 * Spain, opened from the General Register of health centres, services and establishments
 * (REGCESS) published monthly by the Ministerio de Sanidad (docs/adr/0002-multi-country.md,
 * "Spain"): hospitals, the public network's health centres and local surgeries, doctors'
 * practices by specialty, the other health professions' practices, polyclinics, dental clinics
 * and pharmacies, placed in the IGN's autonomous communities, provinces and municipalities by
 * their INE code and located at their municipality's main population centre (the register
 * publishes no coordinates). The Ministry's legal notice allows reuse, commercial or not, with
 * the source and its date and without distorting the data (Ley 37/2007). A page is a centre,
 * under its registered name (a sole trader's practice or pharmacy carries their name, LOPDGDD
 * art. 19.3, and an objection removes the page); e-mail, fax and the authorisation dates are
 * never stored. No booking and no e-identity claim: a centre claims its page with documents
 * checked by an administrator.
 */
export const spain: CountryAdapter = {
	code: "ES",
	segment: "es",
	defaultLocale: "es",
	defaultTimeZone: "Europe/Madrid",
	timeZones: ["Europe/Madrid", "Atlantic/Canary"],
	timeZoneOf: timeZoneOfRegion,
	registries: [
		{
			id: "es-regcess",
			name: "REGCESS: Registro General de centros, servicios y establecimientos sanitarios",
			publisher: "Ministerio de Sanidad",
			url: "https://regcess.mscbs.es/regcessWeb/",
			licence:
				"Reutilización autorizada (Ley 37/2007 y aviso legal del Ministerio de Sanidad), citando la fuente y la fecha de actualización",
			licenceUrl: "https://www.sanidad.gob.es/avisoLegal/home.htm",
			attribution: "Fuente: Ministerio de Sanidad, REGCESS",
			provides: ["practitioners", "activities"],
		},
		{
			id: "es-ign",
			name: "Unidades administrativas e IGR Poblaciones (API Features del IGN)",
			publisher: "Instituto Geográfico Nacional (IGN), CNIG",
			url: "https://api-features.ign.es/",
			licence: "CC BY 4.0 (Orden FOM/2807/2015)",
			licenceUrl: "https://www.ign.es/resources/licencia/Condiciones_licenciaUso_IGN.pdf",
			attribution: `Obra derivada de Líneas Límite Municipales e IGR Poblaciones ${IGN_YEAR} CC-BY 4.0 ign.es`,
			provides: ["places"],
		},
	],
	practitionerIds: [
		{
			id: ES_ID_SCHEME,
			name: "REGCESS normalised centre code (CCN)",
			issuer: "Ministerio de Sanidad, REGCESS",
			isValid: isValidEsSourceId,
		},
	],
	taxonomy: {
		professions: ES_PROFESSIONS,
		defaultProfessions: ES_DEFAULT_PROFESSIONS,
		listingSlugFor: esListingSlugFor,
		isListingSlug: isEsListingSlug,
	},
	phone: { callingCodes: ["34"], toE164: (raw) => toE164Es(raw), format: formatPhoneEs },
	address: {
		postcode: ES_POSTCODE,
		// A Spanish address: the street and number, then the postcode and the town (`03110 Mutxamel`).
		lines: ({ street, postcode, city }) =>
			[street, [postcode, city].filter(Boolean).join(" ")].filter((line): line is string =>
				Boolean(line),
			),
	},
	legalPages: [
		{
			id: "legal-notice",
			pathname: "/mentions-legales",
			basis:
				"Ley 34/2002, de servicios de la sociedad de la información y de comercio electrónico (LSSI), artículo 10",
		},
		{
			id: "privacy",
			pathname: "/confidentialite",
			basis:
				"GDPR articles 13, 14 and 21; Ley Orgánica 3/2018 de Protección de Datos Personales y garantía de los derechos digitales (LOPDGDD)",
		},
		{ id: "terms", pathname: "/conditions", basis: "Terms of use of the service" },
		{
			id: "accessibility",
			pathname: "/accessibilite",
			basis: "Voluntary statement: Real Decreto 1112/2018 binds public sector bodies",
		},
	],
	healthDataHosting: {
		regime: "GDPR and LOPDGDD",
		basis:
			"No hosting certification: GDPR and Ley Orgánica 3/2018 (LOPDGDD); Ley 41/2002 governs the clinical records providers keep",
		url: "https://www.boe.es/eli/es/lo/2018/12/05/3/con",
	},
	features: { directory: true, booking: false, eIdentityClaim: false },
};
