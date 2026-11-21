import type { SiteView } from "./practitioner-view";

/**
 * schema.org structured data of the public pages. Google has no "doctor" rich
 * result, so the shapes follow the LocalBusiness requirements (name, address;
 * telephone and geo recommended).
 */

/** Coordinates with six decimals (about 10 cm), printed as text so no digit is dropped. */
function geo(coordinates: { lat: number; lon: number }) {
	return {
		"@type": "GeoCoordinates",
		latitude: coordinates.lat.toFixed(6),
		longitude: coordinates.lon.toFixed(6),
	};
}

function postalAddress(site: SiteView["site"]) {
	return {
		"@type": "PostalAddress",
		streetAddress:
			[site.addressLine, site.addressComplement].filter(Boolean).join(", ") || undefined,
		postalCode: site.postcode ?? undefined,
		addressLocality: site.placeName ?? undefined,
		addressCountry: "FR",
	};
}

const PLACE_TYPES: Record<string, string> = {
	office: "PhysiciansOffice",
	health_center: "MedicalClinic",
	hospital: "Hospital",
	locum: "MedicalClinic",
};

function placeOf(view: SiteView, establishmentUrl: (slug: string) => string) {
	return {
		"@type": PLACE_TYPES[view.practiceKind] ?? "MedicalClinic",
		name: view.establishment?.name ?? view.name ?? undefined,
		address: postalAddress(view.site),
		geo: view.coordinates ? geo(view.coordinates) : undefined,
		telephone: view.phone?.e164,
		url: view.establishment ? establishmentUrl(view.establishment.slug) : undefined,
	};
}

export type PractitionerStructuredDataInput = {
	url: string;
	professionCode: string;
	rpps: string;
	name: string;
	givenName: string;
	familyName: string;
	honorificPrefix: string | null;
	/** Profession and specialty, in the page language. */
	occupation: string;
	specialty: string | null;
	languages: string[];
	sites: SiteView[];
	establishmentUrl: (slug: string) => string;
	image: string;
};

/**
 * Doctors are `IndividualPhysician` with `practicesAt`; dentists `Dentist`
 * (a local business, so address and geo sit on it); midwives `Person` with
 * `hasOccupation`. Every one carries the RPPS as a `PropertyValue`.
 */
export function practitionerStructuredData(input: PractitionerStructuredDataInput) {
	const primary = input.sites[0];
	const common = {
		"@context": "https://schema.org",
		"@id": `${input.url}#practitioner`,
		url: input.url,
		name: input.name,
		image: input.image,
		identifier: { "@type": "PropertyValue", propertyID: "RPPS", value: input.rpps },
		knowsLanguage: input.languages.length > 0 ? input.languages : undefined,
	};
	const places = input.sites.map((site) => placeOf(site, input.establishmentUrl));

	if (input.professionCode === "40") {
		return {
			...common,
			"@type": "Dentist",
			address: primary ? postalAddress(primary.site) : undefined,
			geo: primary?.coordinates ? geo(primary.coordinates) : undefined,
			telephone: primary?.phone?.e164,
			medicalSpecialty: input.specialty ?? undefined,
		};
	}
	if (input.professionCode === "10") {
		return {
			...common,
			"@type": "IndividualPhysician",
			givenName: input.givenName,
			familyName: input.familyName,
			honorificPrefix: input.honorificPrefix ?? undefined,
			medicalSpecialty: input.specialty ?? undefined,
			address: primary ? postalAddress(primary.site) : undefined,
			geo: primary?.coordinates ? geo(primary.coordinates) : undefined,
			telephone: primary?.phone?.e164,
			practicesAt: places.length > 0 ? places : undefined,
		};
	}
	return {
		...common,
		"@type": "Person",
		givenName: input.givenName,
		familyName: input.familyName,
		honorificPrefix: input.honorificPrefix ?? undefined,
		hasOccupation: { "@type": "Occupation", name: input.occupation },
		address: primary ? postalAddress(primary.site) : undefined,
		telephone: primary?.phone?.e164,
		workLocation: places.length > 0 ? places : undefined,
	};
}
