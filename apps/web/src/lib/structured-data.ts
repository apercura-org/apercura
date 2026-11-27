import {
	SI_CHILDREN_DOCTOR,
	SI_DENTIST,
	SI_FAMILY_DOCTOR,
	SI_GYNAECOLOGIST,
} from "@apercura/core/taxonomy";
import type {
	BreadcrumbList,
	CategoryCode,
	Dentist,
	GeoCoordinates,
	Graph,
	Hospital,
	IndividualPhysician,
	ItemList,
	MedicalBusiness,
	MedicalClinic,
	MedicalOrganization,
	MedicalSpecialty,
	OpeningHoursSpecification,
	Organization,
	Person,
	Pharmacy,
	PhysiciansOffice,
	PostalAddress,
	PropertyValue,
	ReserveAction,
	Thing,
	WebPage,
	WebSite,
} from "schema-dts";

/*
 * schema.org structured data of the public pages, as one `@graph` per page
 * whose entities link to each other through stable `@id`s (the canonical URL
 * plus a fragment). Google has no "doctor" rich result, so practitioners and
 * places follow the LocalBusiness requirements (name, address; telephone and
 * geo recommended).
 *
 * Deontology (R.4127-19-1): only registry facts and what the owner states. No
 * `aggregateRating`, `review` or any comparison is ever emitted, and opening
 * hours only come from the owner.
 *
 * Every builder is pure and takes absolute URLs, so it is unit-tested without
 * Next.js.
 */

/** Fragment identifiers of the graph's entities. */
export const ids = {
	website: (origin: string) => `${origin}/#website`,
	organization: (origin: string) => `${origin}/#organization`,
	webPage: (url: string) => `${url}#webpage`,
	breadcrumb: (url: string) => `${url}#breadcrumb`,
	list: (url: string) => `${url}#list`,
	practitioner: (url: string) => `${url}#practitioner`,
	establishment: (url: string) => `${url}#establishment`,
	site: (url: string, siteId: number) => `${url}#site-${siteId}`,
};

const ref = (id: string) => ({ "@id": id });

/** One graph per page; empty values are dropped so the output stays minimal and stable. */
export function graph(nodes: readonly Thing[]): Graph {
	return { "@context": "https://schema.org", "@graph": nodes.map(compact) as Thing[] };
}

/** Removes `undefined`, `null`, empty strings and empty arrays, recursively. */
function compact<T>(value: T): T {
	if (Array.isArray(value)) {
		return value.map(compact).filter((item) => !isEmpty(item)) as T;
	}
	if (value && typeof value === "object") {
		const entries = Object.entries(value)
			.map(([key, item]) => [key, compact(item)] as const)
			.filter(([, item]) => !isEmpty(item));
		return Object.fromEntries(entries) as T;
	}
	return value;
}

function isEmpty(value: unknown): boolean {
	return (
		value === undefined ||
		value === null ||
		value === "" ||
		(Array.isArray(value) && value.length === 0)
	);
}

/** Coordinates with six decimals (about 10 cm), printed as text so no decimal is ever dropped. */
export function geoCoordinates(coordinates: { lat: number; lon: number }): GeoCoordinates {
	return {
		"@type": "GeoCoordinates",
		latitude: coordinates.lat.toFixed(6),
		longitude: coordinates.lon.toFixed(6),
	};
}

export type AddressInput = {
	addressLine: string | null;
	addressComplement: string | null;
	postcode: string | null;
	placeName: string | null;
	/** ISO 3166-1 alpha-2 country of the address (the page's market); France when absent. */
	country?: string;
};

export function postalAddress(address: AddressInput): PostalAddress {
	return {
		"@type": "PostalAddress",
		streetAddress:
			[address.addressLine, address.addressComplement].filter(Boolean).join(", ") || undefined,
		postalCode: address.postcode ?? undefined,
		addressLocality: address.placeName ?? undefined,
		addressCountry: address.country ?? "FR",
	};
}

/** A telephone number only when it is already E.164 (`+33…`). */
function e164(phone: string | null | undefined): string | undefined {
	return phone && /^\+[1-9]\d{6,14}$/.test(phone) ? phone : undefined;
}

/** ISCO-08 unit groups of the professions published as a `Person` with an `Occupation`. */
const ISCO_CATEGORIES: Readonly<Record<string, string>> = {
	"50": "2222",
	"60": "2221",
	"69": "2221",
};

/** The ISCO-08 unit group of a profession as a `CategoryCode` naming its code set. */
function iscoCategory(professionCode: string): CategoryCode | undefined {
	const code = ISCO_CATEGORIES[professionCode];
	return code
		? {
				"@type": "CategoryCode",
				codeValue: code,
				inCodeSet: { "@type": "CategoryCodeSet", name: "ISCO-08" },
			}
		: undefined;
}

/** Listing slugs whose meaning matches a schema.org `MedicalSpecialty` exactly. */
const MEDICAL_SPECIALTIES: Record<string, readonly MedicalSpecialty[]> = {
	anatomopathologiste: ["https://schema.org/Pathology"],
	"anesthesiste-reanimateur": ["https://schema.org/Anesthesia"],
	"biologiste-medical": ["https://schema.org/LaboratoryScience"],
	cardiologue: ["https://schema.org/Cardiovascular"],
	"chirurgien-dentiste": ["https://schema.org/Dentistry"],
	"chirurgien-general": ["https://schema.org/Surgical"],
	"chirurgien-maxillo-facial": ["https://schema.org/Surgical"],
	"chirurgien-oral": ["https://schema.org/Dentistry", "https://schema.org/Surgical"],
	"chirurgien-orthopediste": ["https://schema.org/Surgical", "https://schema.org/Musculoskeletal"],
	"chirurgien-pediatrique": ["https://schema.org/Surgical", "https://schema.org/Pediatric"],
	"chirurgien-plasticien": ["https://schema.org/PlasticSurgery"],
	"chirurgien-thoracique-et-cardiovasculaire": [
		"https://schema.org/Surgical",
		"https://schema.org/Cardiovascular",
	],
	"chirurgien-vasculaire": ["https://schema.org/Surgical", "https://schema.org/Cardiovascular"],
	"chirurgien-visceral": ["https://schema.org/Surgical"],
	dermatologue: ["https://schema.org/Dermatology"],
	endocrinologue: ["https://schema.org/Endocrine"],
	"gastro-enterologue": ["https://schema.org/Gastroenterologic"],
	geneticien: ["https://schema.org/Genetic"],
	geriatre: ["https://schema.org/Geriatric"],
	gynecologue: ["https://schema.org/Gynecologic"],
	"gynecologue-obstetricien": ["https://schema.org/Gynecologic", "https://schema.org/Obstetric"],
	hematologue: ["https://schema.org/Hematologic"],
	infirmier: ["https://schema.org/Nursing"],
	"infirmier-anesthesiste": ["https://schema.org/Nursing", "https://schema.org/Anesthesia"],
	"infirmier-de-bloc-operatoire": ["https://schema.org/Nursing", "https://schema.org/Surgical"],
	"infirmier-en-pratique-avancee": ["https://schema.org/Nursing"],
	"infirmier-psychiatrique": ["https://schema.org/Nursing", "https://schema.org/Psychiatric"],
	"infirmier-puericulteur": ["https://schema.org/Nursing", "https://schema.org/Pediatric"],
	infectiologue: ["https://schema.org/Infectious"],
	"medecin-de-sante-publique": ["https://schema.org/PublicHealth"],
	"medecin-generaliste": ["https://schema.org/PrimaryCare"],
	"medecin-vasculaire": ["https://schema.org/Cardiovascular"],
	nephrologue: ["https://schema.org/Renal"],
	neurochirurgien: ["https://schema.org/Surgical", "https://schema.org/Neurologic"],
	neurologue: ["https://schema.org/Neurologic"],
	neuropsychiatre: ["https://schema.org/Neurologic", "https://schema.org/Psychiatric"],
	oncologue: ["https://schema.org/Oncologic"],
	ophtalmologue: ["https://schema.org/Ophthalmology"],
	orl: ["https://schema.org/Otolaryngologic"],
	orthodontiste: ["https://schema.org/Dentistry"],
	pediatre: ["https://schema.org/Pediatric"],
	pedopsychiatre: ["https://schema.org/Pediatric", "https://schema.org/Psychiatric"],
	pneumologue: ["https://schema.org/Pulmonary"],
	psychiatre: ["https://schema.org/Psychiatric"],
	radiologue: ["https://schema.org/Radiography"],
	rhumatologue: ["https://schema.org/Rheumatologic"],
	"sage-femme": ["https://schema.org/Midwifery"],
	"specialiste-medecine-bucco-dentaire": ["https://schema.org/Dentistry"],
	stomatologue: ["https://schema.org/Dentistry"],
	urgentiste: ["https://schema.org/Emergency"],
	urologue: ["https://schema.org/Urologic"],
	// Austria (German listing slugs).
	allgemeinmedizin: ["https://schema.org/PrimaryCare"],
	anaesthesiologie: ["https://schema.org/Anesthesia"],
	augenheilkunde: ["https://schema.org/Ophthalmology"],
	chirurgie: ["https://schema.org/Surgical"],
	dermatologie: ["https://schema.org/Dermatology"],
	endokrinologie: ["https://schema.org/Endocrine"],
	frauenheilkunde: ["https://schema.org/Gynecologic", "https://schema.org/Obstetric"],
	gastroenterologie: ["https://schema.org/Gastroenterologic"],
	gefaesschirurgie: ["https://schema.org/Surgical", "https://schema.org/Cardiovascular"],
	"haematologie-und-onkologie": ["https://schema.org/Hematologic", "https://schema.org/Oncologic"],
	"hals-nasen-ohrenheilkunde": ["https://schema.org/Otolaryngologic"],
	herzchirurgie: ["https://schema.org/Surgical", "https://schema.org/Cardiovascular"],
	infektiologie: ["https://schema.org/Infectious"],
	kardiologie: ["https://schema.org/Cardiovascular"],
	kinderchirurgie: ["https://schema.org/Surgical", "https://schema.org/Pediatric"],
	kinderheilkunde: ["https://schema.org/Pediatric"],
	"kinder-und-jugendpsychiatrie": [
		"https://schema.org/Pediatric",
		"https://schema.org/Psychiatric",
	],
	labordiagnostik: ["https://schema.org/LaboratoryScience"],
	"medizinische-genetik": ["https://schema.org/Genetic"],
	"mund-kiefer-gesichtschirurgie": ["https://schema.org/Surgical"],
	nephrologie: ["https://schema.org/Renal"],
	neurochirurgie: ["https://schema.org/Surgical", "https://schema.org/Neurologic"],
	neurologie: ["https://schema.org/Neurologic"],
	orthopaedie: ["https://schema.org/Musculoskeletal"],
	pathologie: ["https://schema.org/Pathology"],
	"plastische-chirurgie": ["https://schema.org/PlasticSurgery"],
	pneumologie: ["https://schema.org/Pulmonary"],
	psychiatrie: ["https://schema.org/Psychiatric"],
	radiologie: ["https://schema.org/Radiography"],
	rheumatologie: ["https://schema.org/Rheumatologic"],
	thoraxchirurgie: ["https://schema.org/Surgical"],
	unfallchirurgie: ["https://schema.org/Surgical", "https://schema.org/Musculoskeletal"],
	urologie: ["https://schema.org/Urologic"],
	zahnaerzte: ["https://schema.org/Dentistry"],
	// The United Kingdom's practices.
	"gp-practices": ["https://schema.org/PrimaryCare"],
	"dental-practices": ["https://schema.org/Dentistry"],
	// Czechia's facilities (Czech listing slugs).
	"prakticky-lekar": ["https://schema.org/PrimaryCare"],
	"detsky-lekar": ["https://schema.org/Pediatric", "https://schema.org/PrimaryCare"],
	"zubni-lekar": ["https://schema.org/Dentistry"],
	ortodontista: ["https://schema.org/Dentistry"],
	gynekolog: ["https://schema.org/Gynecologic", "https://schema.org/Obstetric"],
	"ocni-lekar": ["https://schema.org/Ophthalmology"],
	psychiatr: ["https://schema.org/Psychiatric"],
	"detsky-psychiatr": ["https://schema.org/Pediatric", "https://schema.org/Psychiatric"],
	ortoped: ["https://schema.org/Musculoskeletal"],
	"plasticky-chirurg": ["https://schema.org/PlasticSurgery"],
	"cevni-chirurg": ["https://schema.org/Surgical", "https://schema.org/Cardiovascular"],
	neurochirurg: ["https://schema.org/Surgical", "https://schema.org/Neurologic"],
	chirurg: ["https://schema.org/Surgical"],
	dermatolog: ["https://schema.org/Dermatology"],
	neurolog: ["https://schema.org/Neurologic"],
	"rehabilitacni-lekar": ["https://schema.org/Physiotherapy"],
	fyzioterapeut: ["https://schema.org/Physiotherapy"],
	endokrinolog: ["https://schema.org/Endocrine"],
	"usni-nosni-krcni": ["https://schema.org/Otolaryngologic"],
	kardiolog: ["https://schema.org/Cardiovascular"],
	urolog: ["https://schema.org/Urologic"],
	pneumolog: ["https://schema.org/Pulmonary"],
	gastroenterolog: ["https://schema.org/Gastroenterologic"],
	revmatolog: ["https://schema.org/Rheumatologic"],
	onkolog: ["https://schema.org/Oncologic"],
	nefrolog: ["https://schema.org/Renal"],
	genetik: ["https://schema.org/Genetic"],
	radiolog: ["https://schema.org/Radiography"],
	anesteziolog: ["https://schema.org/Anesthesia"],
	lekarna: ["https://schema.org/PharmacySpecialty"],
	"porodni-asistentka": ["https://schema.org/Midwifery"],
	psycholog: ["https://schema.org/Psychiatric"],
	logoped: ["https://schema.org/SpeechPathology"],
	"domaci-pece": ["https://schema.org/Nursing"],
	// Spain's centres (Spanish listing slugs).
	"centros-de-salud": ["https://schema.org/PrimaryCare"],
	"medicina-general": ["https://schema.org/PrimaryCare"],
	dentistas: ["https://schema.org/Dentistry"],
	farmacias: ["https://schema.org/PharmacySpecialty"],
	pediatras: ["https://schema.org/Pediatric"],
	ginecologos: ["https://schema.org/Gynecologic", "https://schema.org/Obstetric"],
	oftalmologos: ["https://schema.org/Ophthalmology"],
	dermatologos: ["https://schema.org/Dermatology"],
	traumatologos: ["https://schema.org/Musculoskeletal"],
	otorrinos: ["https://schema.org/Otolaryngologic"],
	cardiologos: ["https://schema.org/Cardiovascular"],
	urologos: ["https://schema.org/Urologic"],
	digestologos: ["https://schema.org/Gastroenterologic"],
	neurocirujanos: ["https://schema.org/Surgical", "https://schema.org/Neurologic"],
	neurologos: ["https://schema.org/Neurologic"],
	endocrinos: ["https://schema.org/Endocrine"],
	neumologos: ["https://schema.org/Pulmonary"],
	reumatologos: ["https://schema.org/Rheumatologic"],
	nefrologos: ["https://schema.org/Renal"],
	oncologos: ["https://schema.org/Oncologic"],
	hematologos: ["https://schema.org/Hematologic"],
	"cirujanos-vasculares": ["https://schema.org/Surgical", "https://schema.org/Cardiovascular"],
	"cirujanos-plasticos": ["https://schema.org/PlasticSurgery"],
	"cirujanos-maxilofaciales": ["https://schema.org/Surgical"],
	geneticistas: ["https://schema.org/Genetic"],
	radiologos: ["https://schema.org/Radiography"],
	geriatras: ["https://schema.org/Geriatric"],
	"medicos-rehabilitadores": ["https://schema.org/Physiotherapy"],
	anestesiologos: ["https://schema.org/Anesthesia"],
	cirujanos: ["https://schema.org/Surgical"],
	psiquiatras: ["https://schema.org/Psychiatric"],
	psicologos: ["https://schema.org/Psychiatric"],
	logopedas: ["https://schema.org/SpeechPathology"],
	matronas: ["https://schema.org/Midwifery"],
	podologos: ["https://schema.org/Podiatric"],
	nutricionistas: ["https://schema.org/DietNutrition"],
	fisioterapeutas: ["https://schema.org/Physiotherapy"],
	enfermeria: ["https://schema.org/Nursing"],
	// Italy's places (Italian listing slugs).
	farmacie: ["https://schema.org/PharmacySpecialty"],
	parafarmacie: ["https://schema.org/PharmacySpecialty"],
	// Germany's facilities (German listing slugs).
	"psychiatrische-kliniken": ["https://schema.org/Psychiatric"],
	kinderkliniken: ["https://schema.org/Pediatric"],
	"reha-kliniken": ["https://schema.org/Physiotherapy"],
	apotheken: ["https://schema.org/PharmacySpecialty"],
	// Switzerland's facilities (Swiss listing slugs).
	apotheke: ["https://schema.org/PharmacySpecialty"],
	"psychiatrische-klinik": ["https://schema.org/Psychiatric"],
	geburtshaus: ["https://schema.org/Obstetric"],
	// Poland's establishments (Polish listing slugs).
	"przychodnie-poz": ["https://schema.org/PrimaryCare"],
	"nocna-pomoc-lekarska": ["https://schema.org/PrimaryCare"],
	stomatologia: ["https://schema.org/Dentistry"],
	rehabilitacja: ["https://schema.org/Physiotherapy"],
	"pielegniarki-i-polozne": ["https://schema.org/Nursing", "https://schema.org/Midwifery"],
	"zaklady-opiekuncze": ["https://schema.org/Nursing"],
	"leczenie-uzaleznien": ["https://schema.org/Psychiatric"],
	"poradnie-ginekologiczne": ["https://schema.org/Gynecologic", "https://schema.org/Obstetric"],
	"poradnie-okulistyczne": ["https://schema.org/Ophthalmology"],
	"poradnie-leczenia-uzaleznien": ["https://schema.org/Psychiatric"],
	"poradnie-zdrowia-psychicznego": ["https://schema.org/Psychiatric"],
	"poradnie-psychologiczne": ["https://schema.org/Psychiatric"],
	"poradnie-logopedyczne": ["https://schema.org/SpeechPathology"],
	"poradnie-ortopedyczne": ["https://schema.org/Musculoskeletal"],
	"poradnie-dermatologiczne": ["https://schema.org/Dermatology"],
	"poradnie-laryngologiczne": ["https://schema.org/Otolaryngologic"],
	"poradnie-kardiologiczne": ["https://schema.org/Cardiovascular"],
	"poradnie-urologiczne": ["https://schema.org/Urologic"],
	"poradnie-diabetologiczne": ["https://schema.org/Endocrine"],
	"poradnie-endokrynologiczne": ["https://schema.org/Endocrine"],
	"poradnie-gastroenterologiczne": ["https://schema.org/Gastroenterologic"],
	"poradnie-chorob-pluc": ["https://schema.org/Pulmonary"],
	"poradnie-reumatologiczne": ["https://schema.org/Rheumatologic"],
	"poradnie-onkologiczne": ["https://schema.org/Oncologic"],
	"poradnie-nefrologiczne": ["https://schema.org/Renal"],
	"poradnie-neurologiczne": ["https://schema.org/Neurologic"],
	"poradnie-chirurgiczne": ["https://schema.org/Surgical"],
	"poradnie-pediatryczne": ["https://schema.org/Pediatric"],
	// Ireland's facilities (Irish listing slugs).
	pharmacy: ["https://schema.org/PharmacySpecialty"],
	"health-centres": ["https://schema.org/PrimaryCare"],
	// Finland's public service locations (Finnish listing slugs).
	paivystys: ["https://schema.org/Emergency"],
	terveysasemat: ["https://schema.org/PrimaryCare"],
	hammashoitolat: ["https://schema.org/Dentistry"],
	neuvolat: ["https://schema.org/Obstetric", "https://schema.org/Pediatric"],
	"mielenterveys-ja-paihdepalvelut": ["https://schema.org/Psychiatric"],
	kuntoutus: ["https://schema.org/Physiotherapy"],
	"laboratoriot-ja-kuvantaminen": [
		"https://schema.org/LaboratoryScience",
		"https://schema.org/Radiography",
	],
	// Lithuania's institutions (Lithuanian listing slugs).
	"seimos-medicina": ["https://schema.org/PrimaryCare"],
	"odontologijos-klinikos": ["https://schema.org/Dentistry"],
	"psichikos-sveikatos-centrai": ["https://schema.org/Psychiatric"],
	reabilitacija: ["https://schema.org/Physiotherapy"],
	slauga: ["https://schema.org/Nursing"],
	laboratorijos: ["https://schema.org/LaboratoryScience"],
	"optometrijos-kabinetai": ["https://schema.org/Optometric"],
	// Slovenia's personal doctors (Slovenian listing slugs).
	"druzinski-zdravnik": ["https://schema.org/PrimaryCare"],
	"otroski-zdravnik": ["https://schema.org/Pediatric"],
	ginekolog: ["https://schema.org/Gynecologic"],
	zobozdravnik: ["https://schema.org/Dentistry"],
};

/**
 * The schema.org specialties of a listing slug, or none: `medicalSpecialty`
 * only takes the enumeration, a free-text value is a validator error.
 */
export function medicalSpecialtiesOf(listingSlug: string | null | undefined): MedicalSpecialty[] {
	return listingSlug ? [...(MEDICAL_SPECIALTIES[listingSlug] ?? [])] : [];
}

const one = <T>(values: readonly T[]): T | readonly T[] | undefined =>
	values.length === 0 ? undefined : values.length === 1 ? values[0] : values;

// ---------------------------------------------------------------- site-wide

export type SiteInput = {
	origin: string;
	name: string;
	/** Absolute logo URL (square PNG, at least 112 px). */
	logo: string;
	/** Profiles of Apercura on other sites (its public source repository). */
	sameAs: readonly string[];
};

/**
 * The `WebSite` and its publishing `Organization`, printed on the homes: the international one
 * (`/`, the site's home page, where Google reads the site name) and France's (`/fr`). Both
 * print the same two nodes: an `@id` names one entity, so nothing in them depends on the page's
 * language. No `SearchAction`: Google retired the sitelinks search box in November 2024 and the
 * search pages are disallowed in robots.txt.
 */
export function siteNodes(input: SiteInput): Thing[] {
	const website: WebSite = {
		"@type": "WebSite",
		"@id": ids.website(input.origin),
		url: `${input.origin}/`,
		name: input.name,
		publisher: ref(ids.organization(input.origin)),
	};
	const organization: Organization = {
		"@type": "Organization",
		"@id": ids.organization(input.origin),
		name: input.name,
		url: `${input.origin}/`,
		logo: {
			"@type": "ImageObject",
			"@id": `${input.origin}/#logo`,
			url: input.logo,
			contentUrl: input.logo,
			width: "512",
			height: "512",
		},
		sameAs: [...input.sameAs],
	};
	return [website, organization].map(compact);
}

export type WebPageInput = {
	url: string;
	origin: string;
	name: string;
	description?: string;
	language: string;
	/** `CollectionPage` for listings and hubs, `AboutPage` for the about page. */
	type?: "WebPage" | "CollectionPage" | "AboutPage";
	hasBreadcrumb?: boolean;
	/** `@id` of the page's main entity (practitioner, establishment, list). */
	mainEntity?: string;
	/** YYYY-MM-DD of the last change of the facts shown. */
	dateModified?: string;
};

export function webPageNode(input: WebPageInput): WebPage {
	return compact({
		"@type": input.type ?? "WebPage",
		"@id": ids.webPage(input.url),
		url: input.url,
		name: input.name,
		description: input.description,
		inLanguage: input.language,
		isPartOf: ref(ids.website(input.origin)),
		breadcrumb: input.hasBreadcrumb ? ref(ids.breadcrumb(input.url)) : undefined,
		mainEntity: input.mainEntity ? ref(input.mainEntity) : undefined,
		dateModified: input.dateModified,
	} as WebPage);
}

/** The breadcrumb trail, home first and this page last. */
export function breadcrumbNode(
	url: string,
	items: readonly { name: string; url: string }[],
): BreadcrumbList {
	return {
		"@type": "BreadcrumbList",
		"@id": ids.breadcrumb(url),
		itemListElement: items.map((item, index) => ({
			"@type": "ListItem",
			position: index + 1,
			name: item.name,
			item: item.url,
		})),
	};
}

/**
 * The links listed on a listing page or hub, in page order. `offset` keeps
 * positions continuous across the pages of a listing.
 */
export function itemListNode(input: {
	url: string;
	name: string;
	items: readonly { url: string; name?: string }[];
	offset?: number;
	/** Total number of items across every page. */
	total?: number;
}): ItemList {
	return compact({
		"@type": "ItemList",
		"@id": ids.list(input.url),
		name: input.name,
		numberOfItems: input.total ?? input.items.length,
		itemListOrder: "https://schema.org/ItemListOrderAscending",
		itemListElement: input.items.map((item, index) => ({
			"@type": "ListItem",
			position: (input.offset ?? 0) + index + 1,
			url: item.url,
			name: item.name,
		})),
	} as ItemList);
}

// ------------------------------------------------------------- practitioner

export type PracticePlaceInput = AddressInput & {
	siteId: number;
	practiceKind: string;
	name: string | null;
	coordinates: { lat: number; lon: number } | null;
	phone: string | null;
	/** Canonical URL of the establishment page, when the place has one. */
	establishmentUrl: string | null;
	/** Owner-provided opening hours only, never inferred. */
	openingHours?: readonly OpeningHoursInput[];
};

export type OpeningHoursInput = {
	/** schema.org day names: `Monday`…`Sunday`. */
	days: readonly string[];
	opens: string;
	closes: string;
};

export type PractitionerInput = {
	url: string;
	professionCode: string;
	/** The practitioner's identifier in its market's sources (an RPPS in France). */
	rpps: string;
	/** Identifier scheme of `rpps` (`RPPS`, `AT-WIEN`…); RPPS when absent. */
	idScheme?: string;
	/** Market of the practitioner (ISO 3166-1 alpha-2); France when absent. */
	country?: string;
	/** "Dr Marie Dubois". */
	name: string;
	givenName: string;
	familyName: string;
	honorificPrefix: string | null;
	/** Profession and specialty, in the page language ("Médecin généraliste"). */
	occupation: string;
	listingSlug: string | null;
	languages: readonly string[];
	/** Owner-provided photo only: a profession illustration does not depict the person. */
	photoUrl: string | null;
	/** Owner-provided website only. */
	website: string | null;
	places: readonly PracticePlaceInput[];
	/** Online booking is open: a `ReserveAction` on the page's booking panel. */
	bookingUrl: string | null;
};

const PLACE_TYPES = {
	office: "PhysiciansOffice",
	health_center: "MedicalClinic",
	hospital: "Hospital",
} as const;

/**
 * schema.org type of a place of practice. A private office is a `PhysiciansOffice` for a
 * doctor only (it is "a doctor's office"): a dentist's, midwife's or nurse's office is a
 * `MedicalBusiness`, the generic medical local business.
 */
/** Profession codes of doctors: France's `10`, Austria's `ARZT`. */
const DOCTOR_PROFESSIONS = new Set(["10", "ARZT"]);

/**
 * schema.org types of the UK's practices, Czechia's facilities, Spain's centres, Italy's places and
 * Germany's facilities: the practice, facility, centre or place itself is the page's subject (those
 * markets list places of care, not people), and its branch surgeries are places of the same type.
 * A Czech facility or a Spanish centre is a `MedicalClinic` unless it is a dental practice, a
 * pharmacy or (in Spain) a hospital. An Italian hospital or accredited private clinic (both have
 * inpatient beds) is a `Hospital`, a pharmacy a `Pharmacy`, a parapharmacy (a shop allowed to sell
 * non-prescription medicines) a `MedicalBusiness`. A German hospital of any kind is a `Hospital`,
 * a rehabilitation clinic a `MedicalClinic`, a pharmacy a `Pharmacy`. A Swiss hospital or clinic (general, psychiatric,
 * rehabilitation, specialised) is a `Hospital`, a birth centre a `MedicalClinic`, a pharmacy a
 * `Pharmacy`, a nursing home a `MedicalOrganization` (an organisation that provides care, not a
 * place to visit as a patient: no `geo`, which only a place has). A Polish establishment is a
 * `MedicalClinic`, except a hospital or sanatorium (`Hospital`), a dental clinic (`Dentist`), a
 * care home or hospice (`MedicalOrganization`) and nurses and midwives (`MedicalBusiness`). A
 * Finnish service location is a `MedicalClinic`, except a hospital (`Hospital`) and a dental clinic
 * (`Dentist`). A Lithuanian institution is a `MedicalClinic` unless it is a hospital (`Hospital`),
 * a dental clinic (`Dentist`), an optometrist's practice (`MedicalBusiness`) or a nursing service
 * (`MedicalOrganization`: its care is mostly given at the patient's home).
 * Ireland's the same way: a pharmacy is a `Pharmacy`, a hospital a `Hospital`, an HSE health
 * centre a `MedicalClinic`, a nursing home a `MedicalOrganization` (schema.org has no type of its
 * own for one).
 */
type PracticeType =
	| "MedicalClinic"
	| "Dentist"
	| "Pharmacy"
	| "Hospital"
	| "MedicalBusiness"
	| "MedicalOrganization";

const PRACTICE_TYPES: Readonly<Record<string, PracticeType>> = {
	GB_GP: "MedicalClinic",
	GB_DENTAL: "Dentist",
	GB_PHARMACY: "Pharmacy",
	CZ_DENTIST: "Dentist",
	CZ_PHARMACY: "Pharmacy",
	ES_HOSPITAL: "Hospital",
	ES_DENTAL: "Dentist",
	ES_PHARMACY: "Pharmacy",
	IT_PHARMACY: "Pharmacy",
	IT_PARAPHARMACY: "MedicalBusiness",
	IT_HOSPITAL: "Hospital",
	IT_CLINIC: "Hospital",
	DE_HOSPITAL: "Hospital",
	DE_PSYCHIATRIC_HOSPITAL: "Hospital",
	DE_CHILDRENS_HOSPITAL: "Hospital",
	DE_REHAB_CLINIC: "MedicalClinic",
	DE_PHARMACY: "Pharmacy",
	CH_HOSPITAL: "Hospital",
	CH_PSYCHIATRIC_CLINIC: "Hospital",
	CH_REHAB_CLINIC: "Hospital",
	CH_SPECIALTY_CLINIC: "Hospital",
	CH_BIRTH_CENTRE: "MedicalClinic",
	CH_PHARMACY: "Pharmacy",
	CH_NURSING_HOME: "MedicalOrganization",
	EE_HOSPITAL: "Hospital",
	EE_FAMILY_PRACTICE: "MedicalClinic",
	EE_DENTAL: "Dentist",
	EE_SPECIALIST: "MedicalClinic",
	EE_NURSING: "MedicalOrganization",
	EE_MIDWIFERY: "MedicalClinic",
	EE_PHYSIOTHERAPY: "MedicalClinic",
	EE_PSYCHOLOGY: "MedicalClinic",
	EE_SPEECH_THERAPY: "MedicalClinic",
	EE_PHARMACY: "Pharmacy",
	PL_HOSPITAL: "Hospital",
	PL_SPA: "Hospital",
	PL_DENTAL: "Dentist",
	PL_LONG_TERM_CARE: "MedicalOrganization",
	PL_HOSPICE: "MedicalOrganization",
	PL_NURSING: "MedicalBusiness",
	NO_HOSPITAL: "Hospital",
	NO_MENTAL_HEALTH: "Hospital",
	NO_GP: "MedicalClinic",
	NO_EMERGENCY: "MedicalClinic",
	NO_SPECIALIST: "MedicalClinic",
	NO_DENTAL: "Dentist",
	NO_NURSING_HOME: "MedicalOrganization",
	NO_PHARMACY: "Pharmacy",
	IE_PHARMACY: "Pharmacy",
	IE_HOSPITAL: "Hospital",
	IE_HEALTH_CENTRE: "MedicalClinic",
	IE_NURSING_HOME: "MedicalOrganization",
	FI_HOSPITAL: "Hospital",
	FI_DENTAL: "Dentist",
	LT_HOSPITAL: "Hospital",
	LT_DENTAL: "Dentist",
	LT_OPTOMETRY: "MedicalBusiness",
	LT_NURSING: "MedicalOrganization",
};

/** The schema.org type of a market of practices' page subject (`PRACTICE_TYPES`), if any. */
function practiceTypeOf(professionCode: string): PracticeType | null {
	return (
		PRACTICE_TYPES[professionCode] ??
		(professionCode.startsWith("CZ_") ||
		professionCode.startsWith("ES_") ||
		professionCode.startsWith("PL_") ||
		professionCode.startsWith("FI_") ||
		professionCode.startsWith("LT_")
			? "MedicalClinic"
			: null)
	);
}

function placeTypeOf(practiceKind: string, professionCode: string) {
	const practice = practiceTypeOf(professionCode);
	if (practice) return practice;
	if (practiceKind === "office" && !DOCTOR_PROFESSIONS.has(professionCode))
		return "MedicalBusiness";
	return PLACE_TYPES[practiceKind as keyof typeof PLACE_TYPES] ?? "MedicalClinic";
}

function openingHoursOf(
	hours: readonly OpeningHoursInput[] | undefined,
): OpeningHoursSpecification[] {
	return (hours ?? []).map((item) => ({
		"@type": "OpeningHoursSpecification",
		dayOfWeek: item.days.map((day) => `https://schema.org/${day}`) as never,
		opens: item.opens,
		closes: item.closes,
	}));
}

/**
 * A place of practice. An establishment (hospital, health center with a FINESS
 * page) is identified by its own page's `@id`, so both pages describe the same
 * entity; a private office by a fragment of the practitioner's page.
 */
function placeNode(practitionerUrl: string, professionCode: string, place: PracticePlaceInput) {
	const type = placeTypeOf(place.practiceKind, professionCode);
	const node = {
		"@type": type,
		"@id": place.establishmentUrl
			? ids.establishment(place.establishmentUrl)
			: ids.site(practitionerUrl, place.siteId),
		name: place.name ?? undefined,
		url: place.establishmentUrl ?? undefined,
		address: postalAddress(place),
		geo: place.coordinates ? geoCoordinates(place.coordinates) : undefined,
		telephone: e164(place.phone),
		openingHoursSpecification: openingHoursOf(place.openingHours),
	};
	return node as PhysiciansOffice | MedicalBusiness | MedicalClinic | Hospital | Dentist | Pharmacy;
}

function reserveAction(bookingUrl: string): ReserveAction {
	return {
		"@type": "ReserveAction",
		target: {
			"@type": "EntryPoint",
			urlTemplate: bookingUrl,
			actionPlatform: [
				"https://schema.org/DesktopWebPlatform",
				"https://schema.org/MobileWebPlatform",
			],
		},
	} as ReserveAction;
}

/**
 * The practitioner and their places of practice. Doctors are
 * `IndividualPhysician` with `practicesAt`; dentists `Dentist` (a local
 * business: address, geo and phone sit on it, the other places are
 * `location`s); midwives `Person` with `hasOccupation` and `workLocation`.
 * Every one carries the RPPS as a `PropertyValue`. A UK practice is itself the
 * organisation (`MedicalClinic`, `Dentist`, `Pharmacy`), its ODS or list code its
 * identifier, its branch surgeries further `location`s.
 */
export function practitionerNodes(input: PractitionerInput): Thing[] {
	const primary = input.places[0];
	const places = input.places.map((place) =>
		placeNode(input.url, input.professionCode, {
			...place,
			country: place.country ?? input.country,
		}),
	);
	const placeRefs = places.map((place) => ref((place as { "@id": string })["@id"]));
	const identifier: PropertyValue = {
		"@type": "PropertyValue",
		propertyID: input.idScheme ?? "RPPS",
		value: input.rpps,
	};
	const common = {
		"@id": ids.practitioner(input.url),
		url: input.url,
		name: input.name,
		image: input.photoUrl ?? undefined,
		identifier,
		knowsLanguage: [...input.languages],
		sameAs: input.website ?? undefined,
		mainEntityOfPage: ref(ids.webPage(input.url)),
		potentialAction: input.bookingUrl ? reserveAction(input.bookingUrl) : undefined,
	};
	const localBusiness = {
		address: primary
			? postalAddress({ ...primary, country: primary.country ?? input.country })
			: undefined,
		geo: primary?.coordinates ? geoCoordinates(primary.coordinates) : undefined,
		telephone: e164(primary?.phone),
	};
	const specialty = one(medicalSpecialtiesOf(input.listingSlug));

	let person: Thing;
	const practiceType = practiceTypeOf(input.professionCode);
	// A UK practice: an organisation (a local business), its own address first, its branch
	// surgeries as further `location`s.
	if (practiceType) {
		const practice = {
			"@type": practiceType,
			...common,
			...localBusiness,
			// An organisation that is not a place (a Swiss or Irish nursing home) has no coordinates.
			geo: practiceType === "MedicalOrganization" ? undefined : localBusiness.geo,
			medicalSpecialty: specialty,
			location: one(placeRefs.slice(1)),
		};
		return [
			practice as
				| MedicalClinic
				| Dentist
				| Pharmacy
				| Hospital
				| MedicalBusiness
				| MedicalOrganization,
			...places.slice(1),
		].map(compact);
	}
	// Physicians: French profession 10, Austrian ARZT, Slovenia's family, children's and school
	// doctors and gynaecologists. Dentists: 40, ZAHNARZT, SI_DENTIST.
	if (
		input.professionCode === "10" ||
		input.professionCode === "ARZT" ||
		input.professionCode === SI_FAMILY_DOCTOR ||
		input.professionCode === SI_CHILDREN_DOCTOR ||
		input.professionCode === SI_GYNAECOLOGIST
	) {
		person = {
			"@type": "IndividualPhysician",
			...common,
			...localBusiness,
			medicalSpecialty: specialty,
			practicesAt: one(placeRefs),
		} as IndividualPhysician;
	} else if (
		input.professionCode === "40" ||
		input.professionCode === "ZAHNARZT" ||
		input.professionCode === SI_DENTIST
	) {
		person = {
			"@type": "Dentist",
			...common,
			...localBusiness,
			medicalSpecialty: specialty,
			location: one(placeRefs),
		} as Dentist;
	} else {
		person = {
			"@type": "Person",
			...common,
			givenName: input.givenName,
			familyName: input.familyName,
			honorificPrefix: input.honorificPrefix ?? undefined,
			jobTitle: input.occupation,
			hasOccupation: {
				"@type": "Occupation",
				name: input.occupation,
				// ISCO-08 2222: midwifery professionals; 2221: nursing professionals.
				occupationalCategory: iscoCategory(input.professionCode),
			},
			address: localBusiness.address,
			telephone: localBusiness.telephone,
			workLocation: one(placeRefs),
		} as Person;
	}
	return [person, ...places].map(compact);
}

// ------------------------------------------------------------ establishment

export type EstablishmentInput = AddressInput & {
	url: string;
	kind: string;
	name: string;
	finess: string;
	coordinates: { lat: number; lon: number } | null;
	phone: string | null;
};

const ESTABLISHMENT_TYPES = { hospital: "Hospital", health_center: "MedicalClinic" } as const;

/** A hospital or health center, with its FINESS number. */
export function establishmentNode(input: EstablishmentInput): Thing {
	return compact({
		"@type": ESTABLISHMENT_TYPES[input.kind as keyof typeof ESTABLISHMENT_TYPES] ?? "MedicalClinic",
		"@id": ids.establishment(input.url),
		url: input.url,
		name: input.name,
		identifier: { "@type": "PropertyValue", propertyID: "FINESS", value: input.finess },
		address: postalAddress(input),
		geo: input.coordinates ? geoCoordinates(input.coordinates) : undefined,
		telephone: e164(input.phone),
		mainEntityOfPage: ref(ids.webPage(input.url)),
	} as Hospital | MedicalClinic | MedicalOrganization);
}

/** Keys that must never appear in Apercura's structured data (deontology, R.4127-19-1). */
export const FORBIDDEN_KEYS = ["aggregateRating", "review", "reviews", "ratingValue"] as const;
