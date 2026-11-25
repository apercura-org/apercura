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
};

export function postalAddress(address: AddressInput): PostalAddress {
	return {
		"@type": "PostalAddress",
		streetAddress:
			[address.addressLine, address.addressComplement].filter(Boolean).join(", ") || undefined,
		postalCode: address.postcode ?? undefined,
		addressLocality: address.placeName ?? undefined,
		addressCountry: "FR",
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
	rpps: string;
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
function placeTypeOf(practiceKind: string, professionCode: string) {
	if (practiceKind === "office" && professionCode !== "10") return "MedicalBusiness";
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
	return node as PhysiciansOffice | MedicalBusiness | MedicalClinic | Hospital;
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
 * Every one carries the RPPS as a `PropertyValue`.
 */
export function practitionerNodes(input: PractitionerInput): Thing[] {
	const primary = input.places[0];
	const places = input.places.map((place) => placeNode(input.url, input.professionCode, place));
	const placeRefs = places.map((place) => ref((place as { "@id": string })["@id"]));
	const identifier: PropertyValue = {
		"@type": "PropertyValue",
		propertyID: "RPPS",
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
		address: primary ? postalAddress(primary) : undefined,
		geo: primary?.coordinates ? geoCoordinates(primary.coordinates) : undefined,
		telephone: e164(primary?.phone),
	};
	const specialty = one(medicalSpecialtiesOf(input.listingSlug));

	let person: Thing;
	if (input.professionCode === "10") {
		person = {
			"@type": "IndividualPhysician",
			...common,
			...localBusiness,
			medicalSpecialty: specialty,
			practicesAt: one(placeRefs),
		} as IndividualPhysician;
	} else if (input.professionCode === "40") {
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
