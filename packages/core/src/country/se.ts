import { formatPhoneSe, SE_POSTCODE, toE164Se } from "../phone-se";
import { isValidSeSourceId, SE_ID_SCHEMES, type SeIdScheme } from "../slugs";
import {
	isSeListingSlug,
	SE_DEFAULT_PROFESSIONS,
	SE_PROFESSIONS,
	seListingSlugFor,
} from "../taxonomy/se";
import type { CountryAdapter, IdentifierScheme } from "./types";

const CC_BY_4 = "Creative Commons Erkännande 4.0 Internationell (CC BY 4.0)";
const CC_BY_4_URL = "https://creativecommons.org/licenses/by/4.0/deed.sv";
const CC0_1 = "Creative Commons Zero 1.0 Universell (CC0 1.0)";
const CC0_1_URL = "https://creativecommons.org/publicdomain/zero/1.0/deed.sv";

/**
 * The 21 counties (län), by their county code, the first two digits of every municipality code
 * in them (Statistics Sweden's regional divisions). Each county is also a region (region), the
 * body that runs its health care; Gotland's municipality is its region.
 */
export const SE_COUNTIES: Readonly<Record<string, string>> = {
	"01": "Stockholms län",
	"03": "Uppsala län",
	"04": "Södermanlands län",
	"05": "Östergötlands län",
	"06": "Jönköpings län",
	"07": "Kronobergs län",
	"08": "Kalmar län",
	"09": "Gotlands län",
	"10": "Blekinge län",
	"12": "Skåne län",
	"13": "Hallands län",
	"14": "Västra Götalands län",
	"17": "Värmlands län",
	"18": "Örebro län",
	"19": "Västmanlands län",
	"20": "Dalarnas län",
	"21": "Gävleborgs län",
	"22": "Västernorrlands län",
	"23": "Jämtlands län",
	"24": "Västerbottens län",
	"25": "Norrbottens län",
};

/** Gotland: a county with one municipality (`0980`), whose page is the county's, like Paris. */
export const GOTLAND_MUNICIPALITY = "0980";

/** The county code of Västra Götaland, the first region whose health centres are open data. */
export const SE_VGR_COUNTY = "14";

/**
 * The county a name of the register's `Län` column names (`Stockholm`, `Västra götaland`,
 * `Skåne län`), without case or the word `län`, or null.
 */
export function seCountyOfName(name: string): string | null {
	const key = (text: string) =>
		text
			.toLocaleLowerCase("sv-SE")
			.replace(/\s+län$/, "")
			.replace(/s$/, "")
			.trim();
	const wanted = key(name);
	if (!wanted) return null;
	for (const [code, county] of Object.entries(SE_COUNTIES)) {
		if (key(county) === wanted) return code;
	}
	return null;
}

/**
 * Sweden has one time zone. A region code is a county code (two digits) or a municipality code
 * (four digits) of a known county; anything else is an error, never a guess.
 */
function timeZoneOfRegion(code: string): string {
	if (!/^\d{2}(?:\d{2})?$/.test(code) || !SE_COUNTIES[code.slice(0, 2)]) {
		throw new RangeError(`Unknown Swedish region "${code}"`);
	}
	return "Europe/Stockholm";
}

const scheme = (id: SeIdScheme, name: string, issuer: string): IdentifierScheme => ({
	id,
	name,
	issuer,
	isValid: (value) => isValidSeSourceId(id, value),
});

/**
 * Sweden, opened from the Swedish Medical Products Agency's register of licensed pharmacies
 * (Läkemedelsverket, "Apotek med tillstånd", CC BY 4.0, updated daily) and the health centres of
 * Västra Götalandsregionen's primary care choice scheme ("Vårdcentraler i Vårdval vårdcentral",
 * CC0 1.0), placed in Statistics Sweden's counties and municipalities (SCB, "Digitala gränser",
 * CC0 1.0). Facilities only, never people: the licence holders are companies, and a holder whose
 * organisation number is a person's identity number is never printed. There is no open national
 * list of hospitals, clinics or health professionals (docs/adr/0002-multi-country.md, "Sweden").
 * Pages are factual, as the Marketing Act (marknadsföringslagen, 2008:486) and the Medicinal
 * Products Act's rules on marketing (läkemedelslagen, 2015:315, ch. 12) ask; no medicine is
 * named. No booking and no e-identity claim: a facility claims its page with documents checked by
 * an administrator.
 */
export const sweden: CountryAdapter = {
	code: "SE",
	segment: "se",
	defaultLocale: "sv",
	defaultTimeZone: "Europe/Stockholm",
	timeZones: ["Europe/Stockholm"],
	timeZoneOf: timeZoneOfRegion,
	registries: [
		{
			id: "se-apotek",
			name: "Apotek med tillstånd",
			publisher: "Läkemedelsverket",
			url: "https://www.lakemedelsverket.se/sv/handel-med-lakemedel/apotek/sok-apotek-som-har-tillstand",
			licence: CC_BY_4,
			licenceUrl: CC_BY_4_URL,
			attribution: "Apotek med tillstånd: © Läkemedelsverket, CC BY 4.0; bearbetat av Apercura",
			provides: ["practitioners", "activities"],
		},
		{
			id: "se-vgr-vardcentraler",
			name: "Vårdcentraler i Vårdval vårdcentral",
			publisher: "Västra Götalandsregionen",
			url: "https://vgregion.entryscape.net/store/7/resource/46",
			licence: CC0_1,
			licenceUrl: CC0_1_URL,
			attribution: "Vårdcentraler: Västra Götalandsregionen, CC0 1.0",
			provides: ["practitioners", "activities"],
		},
		{
			id: "se-scb-granser",
			name: "Digitala gränser: län och kommuner",
			publisher: "Statistiska centralbyrån (SCB)",
			url: "https://www.scb.se/hitta-statistik/regional-statistik-och-kartor/regionala-indelningar/digitala-granser/",
			licence: CC0_1,
			licenceUrl: CC0_1_URL,
			attribution: "Län och kommuner: Källa: SCB, CC0 1.0",
			provides: ["places"],
		},
	],
	practitionerIds: [
		scheme(
			"SE-GLN",
			"Global Location Number (GLN) of the pharmacy",
			"Läkemedelsverket (GS1 Sweden)",
		),
		scheme(
			"SE-HSA",
			"HSA-id of the care unit",
			"Inera (HSA, the national directory of health care)",
		),
	],
	taxonomy: {
		professions: SE_PROFESSIONS,
		defaultProfessions: SE_DEFAULT_PROFESSIONS,
		listingSlugFor: seListingSlugFor,
		isListingSlug: isSeListingSlug,
	},
	phone: { callingCodes: ["46"], toE164: (raw) => toE164Se(raw), format: formatPhoneSe },
	address: {
		postcode: SE_POSTCODE,
		// A Swedish address: the street and number, then the postcode and the post town
		// (`111 22 Stockholm`).
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
				"Lag (2002:562) om elektronisk handel och andra informationssamhällets tjänster, 8 §: the service provider's name, address in its state of establishment, e-mail address and, where they apply, its registration number and VAT number (a provider established in another EEA state follows its own state's rules)",
		},
		{
			id: "privacy",
			pathname: "/confidentialite",
			basis:
				"GDPR articles 13, 14 and 21, lag (2018:218) med kompletterande bestämmelser till EU:s dataskyddsförordning; supervisory authority: Integritetsskyddsmyndigheten (IMY)",
		},
		{ id: "terms", pathname: "/conditions", basis: "Användarvillkor för tjänsten" },
		{
			id: "accessibility",
			pathname: "/accessibilite",
			basis:
				"Voluntary statement: lag (2018:1937) om tillgänglighet till digital offentlig service, 4 § and 13 §, asks public bodies and publicly financed private ones for an accessibility statement; a private directory without public funding is neither. Supervisory authority: Myndigheten för digital förvaltning (DIGG)",
		},
	],
	healthDataHosting: {
		regime: "GDPR and dataskyddslagen",
		basis:
			"No hosting certification for a directory: the GDPR and the Data Protection Act (lag 2018:218); the Patient Data Act (patientdatalagen, 2008:355) binds care providers' records, which a directory without booking does not keep",
		url: "https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/lag-2018218-med-kompletterande-bestammelser_sfs-2018-218/",
	},
	features: { directory: true, booking: false, eIdentityClaim: false },
};

/** The identifier schemes of the Swedish market, as stored in `directory.practitioners.id_scheme`. */
export const SE_SCHEME_IDS = Object.keys(SE_ID_SCHEMES) as SeIdScheme[];
