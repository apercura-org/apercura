import type { Thing } from "schema-dts";
import { describe, expect, it } from "vitest";
import {
	breadcrumbNode,
	establishmentNode,
	FORBIDDEN_KEYS,
	graph,
	ids,
	itemListNode,
	medicalSpecialtiesOf,
	type PracticePlaceInput,
	type PractitionerInput,
	practitionerNodes,
	siteNodes,
	webPageNode,
} from "./structured-data";

/*
 * JSON-LD builders against SYNTHETIC fixtures (fictitious people, RPPS in the
 * 1999999xxxx range). Snapshots pin the exact output; the typed fixtures are
 * checked by `schema-dts` through the builders' signatures.
 */

const ORIGIN = "https://apercura.example";
const URL_OFFICE = `${ORIGIN}/praticien/camille-exemple-19999990013`;

const office: PracticePlaceInput = {
	siteId: 101,
	practiceKind: "office",
	name: "Cabinet de l'Exemple",
	addressLine: "1 Rue de l'Exemple",
	addressComplement: null,
	postcode: "75011",
	placeName: "Paris 11e Arrondissement",
	coordinates: { lat: 48.8592, lon: 2.3801 },
	phone: "+33100000001",
	establishmentUrl: null,
};

const hospital: PracticePlaceInput = {
	siteId: 202,
	practiceKind: "hospital",
	name: "Centre hospitalier fictif",
	addressLine: "2 Avenue Fictive",
	addressComplement: "Bâtiment B",
	postcode: "20000",
	placeName: "Ajaccio",
	coordinates: null,
	phone: "01 00 00 00 02",
	establishmentUrl: `${ORIGIN}/etablissement/centre-hospitalier-fictif-2a9999001`,
};

const doctor: PractitionerInput = {
	url: URL_OFFICE,
	professionCode: "10",
	rpps: "19999990013",
	name: "Dr Camille Exemple",
	givenName: "Camille",
	familyName: "Exemple",
	honorificPrefix: "Dr",
	occupation: "Médecin généraliste",
	listingSlug: "medecin-generaliste",
	languages: [],
	photoUrl: null,
	website: null,
	places: [office, hospital],
	bookingUrl: null,
};

/** Every key of a JSON value, at any depth. */
function keysOf(value: unknown): string[] {
	if (Array.isArray(value)) return value.flatMap(keysOf);
	if (value && typeof value === "object") {
		return Object.entries(value).flatMap(([key, item]) => [key, ...keysOf(item)]);
	}
	return [];
}

const nodeOf = (nodes: Thing[], type: string) =>
	nodes.find((node) => (node as { "@type": string })["@type"] === type) as Record<string, unknown>;

describe("practitionerNodes", () => {
	it("describes a doctor as IndividualPhysician practising at its places", () => {
		const nodes = practitionerNodes(doctor);
		expect(graph(nodes)).toMatchSnapshot();
		const person = nodeOf(nodes, "IndividualPhysician");
		expect(person["@id"]).toBe(`${URL_OFFICE}#practitioner`);
		expect(person.identifier).toEqual({
			"@type": "PropertyValue",
			propertyID: "RPPS",
			value: "19999990013",
		});
		expect(person.medicalSpecialty).toBe("https://schema.org/PrimaryCare");
		// Person properties do not exist on IndividualPhysician (validator warning).
		expect(person).not.toHaveProperty("givenName");
		expect(person.practicesAt).toEqual([
			{ "@id": `${URL_OFFICE}#site-101` },
			{ "@id": `${ORIGIN}/etablissement/centre-hospitalier-fictif-2a9999001#establishment` },
		]);
	});

	it("prints coordinates with six decimals and telephones only in E.164", () => {
		const nodes = practitionerNodes(doctor);
		const place = nodeOf(nodes, "PhysiciansOffice");
		expect(place.geo).toEqual({
			"@type": "GeoCoordinates",
			latitude: "48.859200",
			longitude: "2.380100",
		});
		expect(place.telephone).toBe("+33100000001");
		expect(nodeOf(nodes, "Hospital")).not.toHaveProperty("telephone");
		expect(nodeOf(nodes, "Hospital")).not.toHaveProperty("geo");
	});

	it("describes a dentist as Dentist with its places as locations", () => {
		const nodes = practitionerNodes({
			...doctor,
			professionCode: "40",
			listingSlug: "chirurgien-dentiste",
			places: [office],
		});
		expect(graph(nodes)).toMatchSnapshot();
		const dentist = nodeOf(nodes, "Dentist");
		expect(dentist.medicalSpecialty).toBe("https://schema.org/Dentistry");
		expect(dentist.location).toEqual({ "@id": `${URL_OFFICE}#site-101` });
		expect(dentist).not.toHaveProperty("givenName");
		// A dentist's office is not "a doctor's office".
		expect(nodeOf(nodes, "PhysiciansOffice")).toBeUndefined();
		expect(nodeOf(nodes, "MedicalBusiness")["@id"]).toBe(`${URL_OFFICE}#site-101`);
	});

	it("describes a midwife as Person with an occupation and work locations", () => {
		const nodes = practitionerNodes({
			...doctor,
			professionCode: "50",
			listingSlug: "sage-femme",
			name: "Alix Fictive",
			givenName: "Alix",
			familyName: "Fictive",
			honorificPrefix: null,
			occupation: "Sage-femme",
			places: [office],
		});
		expect(graph(nodes)).toMatchSnapshot();
		const person = nodeOf(nodes, "Person");
		expect(person.hasOccupation).toEqual({
			"@type": "Occupation",
			name: "Sage-femme",
			occupationalCategory: {
				"@type": "CategoryCode",
				codeValue: "2222",
				inCodeSet: { "@type": "CategoryCodeSet", name: "ISCO-08" },
			},
		});
		expect(person).not.toHaveProperty("medicalSpecialty");
		expect(person.workLocation).toEqual({ "@id": `${URL_OFFICE}#site-101` });
	});

	it("describes a nurse as Person with the nursing occupation", () => {
		const nodes = practitionerNodes({
			...doctor,
			professionCode: "60",
			listingSlug: "infirmier",
			name: "Pauline Soignante",
			givenName: "Pauline",
			familyName: "Soignante",
			honorificPrefix: null,
			occupation: "Infirmière",
			places: [office],
		});
		const person = nodeOf(nodes, "Person");
		expect(person.hasOccupation).toEqual({
			"@type": "Occupation",
			name: "Infirmière",
			occupationalCategory: {
				"@type": "CategoryCode",
				codeValue: "2221",
				inCodeSet: { "@type": "CategoryCodeSet", name: "ISCO-08" },
			},
		});
		expect(person).not.toHaveProperty("medicalSpecialty");
		expect(person.workLocation).toEqual({ "@id": `${URL_OFFICE}#site-101` });
		expect(nodeOf(nodes, "MedicalBusiness")["@id"]).toBe(`${URL_OFFICE}#site-101`);
		expect(nodeOf(nodes, "PhysiciansOffice")).toBeUndefined();
	});

	it("adds a ReserveAction only when online booking is open", () => {
		const closed = nodeOf(practitionerNodes(doctor), "IndividualPhysician");
		expect(closed).not.toHaveProperty("potentialAction");
		const open = nodeOf(
			practitionerNodes({ ...doctor, bookingUrl: `${URL_OFFICE}?rdv=1` }),
			"IndividualPhysician",
		);
		expect(open.potentialAction).toMatchObject({
			"@type": "ReserveAction",
			target: { "@type": "EntryPoint", urlTemplate: `${URL_OFFICE}?rdv=1` },
		});
	});

	it("uses only what the owner provides: photo, website, languages, opening hours", () => {
		const bare = nodeOf(practitionerNodes(doctor), "IndividualPhysician");
		for (const key of ["image", "sameAs", "knowsLanguage"]) expect(bare).not.toHaveProperty(key);
		expect(nodeOf(practitionerNodes(doctor), "PhysiciansOffice")).not.toHaveProperty(
			"openingHoursSpecification",
		);

		const completed = practitionerNodes({
			...doctor,
			photoUrl: `${ORIGIN}/media/photos/fictive.webp`,
			website: "https://cabinet-exemple.example",
			languages: ["fr", "en"],
			places: [
				{
					...office,
					openingHours: [{ days: ["Monday", "Tuesday"], opens: "09:00", closes: "18:00" }],
				},
			],
		});
		const person = nodeOf(completed, "IndividualPhysician");
		expect(person.image).toBe(`${ORIGIN}/media/photos/fictive.webp`);
		expect(person.sameAs).toBe("https://cabinet-exemple.example");
		expect(person.knowsLanguage).toEqual(["fr", "en"]);
		expect(nodeOf(completed, "PhysiciansOffice").openingHoursSpecification).toEqual([
			{
				"@type": "OpeningHoursSpecification",
				dayOfWeek: ["https://schema.org/Monday", "https://schema.org/Tuesday"],
				opens: "09:00",
				closes: "18:00",
			},
		]);
	});

	it("never emits ratings or reviews (deontology)", () => {
		const everything = graph([
			...practitionerNodes({ ...doctor, bookingUrl: `${URL_OFFICE}?rdv=1` }),
			establishmentNode({
				url: `${ORIGIN}/etablissement/centre-hospitalier-fictif-2a9999001`,
				kind: "hospital",
				name: "Centre hospitalier fictif",
				finess: "2A9999001",
				addressLine: null,
				addressComplement: null,
				postcode: null,
				placeName: null,
				coordinates: null,
				phone: null,
			}),
		]);
		const keys = keysOf(everything);
		for (const forbidden of FORBIDDEN_KEYS) expect(keys).not.toContain(forbidden);
	});
});

describe("medicalSpecialtiesOf", () => {
	it("maps listing slugs to the schema.org enumeration, never to free text", () => {
		expect(medicalSpecialtiesOf("cardiologue")).toEqual(["https://schema.org/Cardiovascular"]);
		expect(medicalSpecialtiesOf("gynecologue-obstetricien")).toEqual([
			"https://schema.org/Gynecologic",
			"https://schema.org/Obstetric",
		]);
		expect(medicalSpecialtiesOf("medecin")).toEqual([]);
		expect(medicalSpecialtiesOf("infirmier")).toEqual(["https://schema.org/Nursing"]);
		expect(medicalSpecialtiesOf("infirmier-puericulteur")).toEqual([
			"https://schema.org/Nursing",
			"https://schema.org/Pediatric",
		]);
		expect(medicalSpecialtiesOf(null)).toEqual([]);
	});
});

describe("page entities", () => {
	it("describes the website and its publisher, with a logo and no search action", () => {
		const nodes = siteNodes({
			origin: ORIGIN,
			name: "Apercura",
			logo: `${ORIGIN}/brand/apercura-logo.png`,
			sameAs: ["https://github.com/apercura-org/apercura"],
		});
		expect(graph(nodes)).toMatchSnapshot();
		const website = nodeOf(nodes, "WebSite");
		expect(website).toEqual({
			"@type": "WebSite",
			"@id": ids.website(ORIGIN),
			url: `${ORIGIN}/`,
			name: "Apercura",
			publisher: { "@id": ids.organization(ORIGIN) },
		});
		// Google retired the sitelinks search box; the search pages are disallowed in robots.txt.
		expect(keysOf(nodes)).not.toContain("potentialAction");
		const organization = nodeOf(nodes, "Organization");
		expect(organization["@id"]).toBe(ids.organization(ORIGIN));
		expect(organization.logo).toMatchObject({
			"@type": "ImageObject",
			url: `${ORIGIN}/brand/apercura-logo.png`,
			width: "512",
			height: "512",
		});
		expect(organization.sameAs).toEqual(["https://github.com/apercura-org/apercura"]);
	});

	it("prints nothing language-dependent in the site entities (one @id, one entity)", () => {
		const input = {
			origin: ORIGIN,
			name: "Apercura",
			logo: `${ORIGIN}/brand/apercura-logo.png`,
			sameAs: [],
		};
		const nodes = siteNodes(input);
		expect(keysOf(nodes)).not.toContain("inLanguage");
		expect(keysOf(nodes)).not.toContain("description");
		expect(nodeOf(nodes, "Organization")).not.toHaveProperty("sameAs");
	});

	it("builds a listing page: CollectionPage, breadcrumb and a positioned ItemList", () => {
		const url = `${ORIGIN}/medecin-generaliste/75-paris/2`;
		const data = graph([
			webPageNode({
				url,
				origin: ORIGIN,
				name: "Médecin généraliste à Paris (75)",
				language: "fr-FR",
				type: "CollectionPage",
				hasBreadcrumb: true,
				mainEntity: ids.list(url),
			}),
			breadcrumbNode(url, [
				{ name: "Accueil", url: `${ORIGIN}/` },
				{ name: "Médecin généraliste", url: `${ORIGIN}/medecin-generaliste` },
				{ name: "Paris", url: `${ORIGIN}/medecin-generaliste/75-paris` },
				{ name: "Page 2 sur 3", url },
			]),
			itemListNode({
				url,
				name: "Médecin généraliste à Paris (75)",
				total: 41,
				offset: 20,
				items: [{ url: URL_OFFICE, name: "Dr Camille Exemple" }],
			}),
		]);
		expect(data).toMatchSnapshot();
		const list = data["@graph"][2] as Record<string, unknown>;
		expect(list.numberOfItems).toBe(41);
		expect((list.itemListElement as { position: number }[])[0]?.position).toBe(21);
	});

	it("describes an establishment with its FINESS number", () => {
		const node = establishmentNode({
			url: `${ORIGIN}/etablissement/centre-de-sante-fictif-759999001`,
			kind: "health_center",
			name: "Centre de santé fictif",
			finess: "759999001",
			addressLine: "3 Rue Fictive",
			addressComplement: null,
			postcode: "75012",
			placeName: "Paris 12e Arrondissement",
			coordinates: { lat: 48.84, lon: 2.39 },
			phone: "+33100000003",
		}) as Record<string, unknown>;
		expect(node).toMatchSnapshot();
		expect(node["@type"]).toBe("MedicalClinic");
	});

	it("drops empty values so the output stays minimal", () => {
		const data = graph([
			webPageNode({ url: URL_OFFICE, origin: ORIGIN, name: "Page", language: "fr-FR" }),
		]);
		expect(data["@graph"][0]).toEqual({
			"@type": "WebPage",
			"@id": `${URL_OFFICE}#webpage`,
			url: URL_OFFICE,
			name: "Page",
			inLanguage: "fr-FR",
			isPartOf: { "@id": `${ORIGIN}/#website` },
		});
	});
});

describe("practitionerNodes for Austria", () => {
	const place: PracticePlaceInput = {
		siteId: 301,
		practiceKind: "office",
		name: "Ordination",
		addressLine: "Fiktivgasse 1/2",
		addressComplement: null,
		postcode: "1090",
		placeName: "Wien",
		coordinates: { lat: 48.2246, lon: 16.3539 },
		phone: "+4310000101",
		establishmentUrl: null,
	};
	const austrian: PractitionerInput = {
		...doctor,
		url: `${ORIGIN}/at/arzt/anna-beispiel-w900001`,
		professionCode: "ARZT",
		rpps: "900001",
		idScheme: "AT-WIEN",
		country: "AT",
		occupation: "Allgemeinmedizin",
		listingSlug: "allgemeinmedizin",
		places: [place],
	};

	it("publishes a doctor as an IndividualPhysician with an Austrian address and list key", () => {
		const nodes = practitionerNodes(austrian);
		const person = nodeOf(nodes, "IndividualPhysician");
		expect(person.identifier).toEqual({
			"@type": "PropertyValue",
			propertyID: "AT-WIEN",
			value: "900001",
		});
		expect(person.address).toMatchObject({ addressCountry: "AT", postalCode: "1090" });
		expect(person.telephone).toBe("+4310000101");
		expect(person.medicalSpecialty).toBe("https://schema.org/PrimaryCare");
		expect(nodeOf(nodes, "PhysiciansOffice").address).toMatchObject({ addressCountry: "AT" });
	});

	it("publishes a dentist as a Dentist", () => {
		const nodes = practitionerNodes({
			...austrian,
			professionCode: "ZAHNARZT",
			listingSlug: "zahnaerzte",
		});
		expect(nodeOf(nodes, "Dentist").medicalSpecialty).toBe("https://schema.org/Dentistry");
	});

	it("keeps French pages on RPPS and France", () => {
		const person = nodeOf(practitionerNodes(doctor), "IndividualPhysician");
		expect((person.identifier as { propertyID: string }).propertyID).toBe("RPPS");
		expect(person.address).toMatchObject({ addressCountry: "FR" });
	});
});

describe("practitionerNodes for the United Kingdom", () => {
	const site = (
		siteId: number,
		overrides: Partial<PracticePlaceInput> = {},
	): PracticePlaceInput => ({
		siteId,
		practiceKind: "office",
		name: null,
		addressLine: "Health Centre, Sample Street",
		addressComplement: null,
		postcode: "TS18 1ZA",
		placeName: "Stockton-on-Tees",
		coordinates: { lat: 54.5661, lon: -1.3172 },
		phone: "+441632960001",
		establishmentUrl: null,
		...overrides,
	});
	const practice: PractitionerInput = {
		...doctor,
		url: `${ORIGIN}/gb/practice/the-example-surgery-a99001`,
		professionCode: "GB_GP",
		rpps: "A99001",
		idScheme: "GB-ODS-GP",
		country: "GB",
		name: "The Example Surgery",
		givenName: "",
		familyName: "The Example Surgery",
		honorificPrefix: null,
		occupation: "GP practice",
		listingSlug: "gp-practices",
		places: [site(1), site(2, { name: "Billingham Branch", postcode: "TS23 1ZZ" })],
	};

	it("publishes a GP practice as a MedicalClinic, its branches as locations, no person", () => {
		const nodes = practitionerNodes(practice);
		const clinic = nodeOf(nodes, "MedicalClinic");
		expect(clinic["@id"]).toBe(`${practice.url}#practitioner`);
		expect(clinic.name).toBe("The Example Surgery");
		expect(clinic.identifier).toEqual({
			"@type": "PropertyValue",
			propertyID: "GB-ODS-GP",
			value: "A99001",
		});
		expect(clinic.address).toMatchObject({
			addressCountry: "GB",
			postalCode: "TS18 1ZA",
			addressLocality: "Stockton-on-Tees",
		});
		expect(clinic.telephone).toBe("+441632960001");
		expect(clinic.medicalSpecialty).toBe("https://schema.org/PrimaryCare");
		expect(clinic.location).toEqual({ "@id": `${practice.url}#site-2` });
		expect(nodes).toHaveLength(2);
		expect(JSON.stringify(nodes)).not.toMatch(/Person|IndividualPhysician|givenName|familyName/);
	});

	it("publishes a dental practice as a Dentist and a pharmacy as a Pharmacy", () => {
		const dental = practitionerNodes({
			...practice,
			professionCode: "GB_DENTAL",
			listingSlug: "dental-practices",
			places: [site(1)],
		});
		expect(nodeOf(dental, "Dentist").medicalSpecialty).toBe("https://schema.org/Dentistry");
		expect(dental).toHaveLength(1);
		const pharmacy = practitionerNodes({
			...practice,
			professionCode: "GB_PHARMACY",
			listingSlug: "pharmacies",
			places: [site(1)],
		});
		expect(nodeOf(pharmacy, "Pharmacy").address).toMatchObject({ addressCountry: "GB" });
	});
});

describe("practitionerNodes for Czechia", () => {
	const place: PracticePlaceInput = {
		siteId: 1,
		practiceKind: "office",
		name: "MUDr. Jana Ukázková",
		addressLine: "Ukázková 1234/12",
		addressComplement: null,
		postcode: "120 00",
		placeName: "Praha 2",
		coordinates: { lat: 50.0755, lon: 14.4378 },
		phone: "+420222333444",
		establishmentUrl: null,
	};
	const facility: PractitionerInput = {
		...doctor,
		url: `${ORIGIN}/cz/zarizeni/mudr-jana-ukazkova-900001`,
		professionCode: "CZ_GP",
		rpps: "900001",
		idScheme: "CZ-NRPZS",
		country: "CZ",
		name: "MUDr. Jana Ukázková",
		givenName: "",
		familyName: "MUDr. Jana Ukázková",
		honorificPrefix: null,
		occupation: "Praktický lékař",
		listingSlug: "prakticky-lekar",
		places: [place],
	};

	it("publishes a facility as a MedicalClinic with its NRPZS number, never a person", () => {
		const nodes = practitionerNodes(facility);
		const clinic = nodeOf(nodes, "MedicalClinic");
		expect(clinic.identifier).toEqual({
			"@type": "PropertyValue",
			propertyID: "CZ-NRPZS",
			value: "900001",
		});
		expect(clinic.address).toMatchObject({
			addressCountry: "CZ",
			postalCode: "120 00",
			addressLocality: "Praha 2",
		});
		expect(clinic.medicalSpecialty).toBe("https://schema.org/PrimaryCare");
		expect(JSON.stringify(nodes)).not.toMatch(/Person|IndividualPhysician|givenName|familyName/);
	});

	it("publishes a dental practice as a Dentist, a pharmacy as a Pharmacy, a specialist by field", () => {
		const dental = practitionerNodes({
			...facility,
			professionCode: "CZ_DENTIST",
			listingSlug: "zubni-lekar",
		});
		expect(nodeOf(dental, "Dentist").medicalSpecialty).toBe("https://schema.org/Dentistry");
		const pharmacy = practitionerNodes({
			...facility,
			professionCode: "CZ_PHARMACY",
			listingSlug: "lekarna",
		});
		expect(nodeOf(pharmacy, "Pharmacy").address).toMatchObject({ addressCountry: "CZ" });
		const cardiology = practitionerNodes({
			...facility,
			professionCode: "CZ_SPECIALIST",
			listingSlug: "kardiolog",
		});
		expect(nodeOf(cardiology, "MedicalClinic").medicalSpecialty).toBe(
			"https://schema.org/Cardiovascular",
		);
	});
});

describe("practitionerNodes for Spain", () => {
	const place: PracticePlaceInput = {
		siteId: 1,
		practiceKind: "office",
		name: "Clinica Dental Ejemplo Centro",
		addressLine: "Calle Alcala, 10",
		addressComplement: null,
		postcode: "28014",
		placeName: "Madrid",
		// City precision: no coordinates are published for a centre.
		coordinates: null,
		phone: "+34910000001",
		establishmentUrl: null,
	};
	const centre: PractitionerInput = {
		...doctor,
		url: `${ORIGIN}/es/centro/clinica-dental-ejemplo-centro-1328000001`,
		professionCode: "ES_DENTAL",
		rpps: "1328000001",
		idScheme: "ES-REGCESS",
		country: "ES",
		name: "Clinica Dental Ejemplo Centro",
		givenName: "",
		familyName: "Clinica Dental Ejemplo Centro",
		honorificPrefix: null,
		occupation: "Clínica dental",
		listingSlug: "dentistas",
		places: [place],
	};

	it("publishes a dental clinic as a Dentist with its REGCESS code, never a person", () => {
		const nodes = practitionerNodes(centre);
		const dentist = nodeOf(nodes, "Dentist");
		expect(dentist.identifier).toEqual({
			"@type": "PropertyValue",
			propertyID: "ES-REGCESS",
			value: "1328000001",
		});
		expect(dentist.address).toMatchObject({
			addressCountry: "ES",
			postalCode: "28014",
			addressLocality: "Madrid",
		});
		expect(dentist.geo).toBeUndefined();
		expect(JSON.stringify(nodes)).not.toMatch(
			/Person|IndividualPhysician|Physician"|givenName|familyName/,
		);
	});

	it("publishes a hospital as a Hospital, a pharmacy as a Pharmacy, others as a MedicalClinic", () => {
		expect(
			nodeOf(
				practitionerNodes({ ...centre, professionCode: "ES_HOSPITAL", listingSlug: "hospitales" }),
				"Hospital",
			).address,
		).toMatchObject({ addressCountry: "ES" });
		expect(
			nodeOf(
				practitionerNodes({ ...centre, professionCode: "ES_PHARMACY", listingSlug: "farmacias" }),
				"Pharmacy",
			).medicalSpecialty,
		).toBe("https://schema.org/PharmacySpecialty");
		expect(
			nodeOf(
				practitionerNodes({
					...centre,
					professionCode: "ES_MEDICAL_PRACTICE",
					listingSlug: "cardiologos",
				}),
				"MedicalClinic",
			).medicalSpecialty,
		).toBe("https://schema.org/Cardiovascular");
		expect(
			nodeOf(
				practitionerNodes({
					...centre,
					professionCode: "ES_HEALTH_CENTRE",
					listingSlug: "centros-de-salud",
				}),
				"MedicalClinic",
			).medicalSpecialty,
		).toBe("https://schema.org/PrimaryCare");
	});
});

describe("practitionerNodes for Italy", () => {
	const place: PracticePlaceInput = {
		siteId: 1,
		practiceKind: "office",
		name: "Farmacia Esempio",
		addressLine: "Via dell'Esempio, 1",
		addressComplement: null,
		postcode: "00184",
		placeName: "Roma",
		// City precision by default: no coordinates for an Italian place.
		coordinates: null,
		phone: null,
		establishmentUrl: null,
	};
	const pharmacy: PractitionerInput = {
		...doctor,
		url: `${ORIGIN}/it/struttura/farmacia-esempio-f9000001`,
		professionCode: "IT_PHARMACY",
		rpps: "9000001",
		idScheme: "IT-FARM",
		country: "IT",
		name: "Farmacia Esempio",
		givenName: "",
		familyName: "Farmacia Esempio",
		honorificPrefix: null,
		occupation: "Farmacia",
		listingSlug: "farmacie",
		places: [place],
	};

	it("publishes a pharmacy as a Pharmacy with the ministry's code, never a person", () => {
		const nodes = practitionerNodes(pharmacy);
		const node = nodeOf(nodes, "Pharmacy");
		expect(node.identifier).toEqual({
			"@type": "PropertyValue",
			propertyID: "IT-FARM",
			value: "9000001",
		});
		expect(node.address).toMatchObject({
			addressCountry: "IT",
			postalCode: "00184",
			addressLocality: "Roma",
		});
		expect(node.medicalSpecialty).toBe("https://schema.org/PharmacySpecialty");
		expect(node.geo).toBeUndefined();
		expect(JSON.stringify(nodes)).not.toMatch(
			/Person|IndividualPhysician|Physician"|givenName|familyName/,
		);
	});

	it("publishes a hospital or an accredited clinic as a Hospital, a parapharmacy as a MedicalBusiness", () => {
		for (const professionCode of ["IT_HOSPITAL", "IT_CLINIC"]) {
			expect(
				nodeOf(
					practitionerNodes({ ...pharmacy, professionCode, listingSlug: "ospedali" }),
					"Hospital",
				).address,
			).toMatchObject({ addressCountry: "IT" });
		}
		expect(
			nodeOf(
				practitionerNodes({
					...pharmacy,
					professionCode: "IT_PARAPHARMACY",
					listingSlug: "parafarmacie",
				}),
				"MedicalBusiness",
			).address,
		).toMatchObject({ addressCountry: "IT" });
	});
});

describe("practitionerNodes for Germany", () => {
	const place: PracticePlaceInput = {
		siteId: 1,
		practiceKind: "office",
		name: "Klinikum Beispiel",
		addressLine: "Musterstraße 1",
		addressComplement: null,
		postcode: "10117",
		placeName: "Berlin",
		// City precision: the hospital directory publishes no coordinates.
		coordinates: null,
		phone: "+493099990000",
		establishmentUrl: null,
	};
	const facility: PractitionerInput = {
		...doctor,
		url: `${ORIGIN}/de/einrichtung/klinikum-beispiel-k0a1b2c3d4e`,
		professionCode: "DE_HOSPITAL",
		rpps: "0a1b2c3d4e",
		idScheme: "DE-KHV",
		country: "DE",
		name: "Klinikum Beispiel",
		givenName: "",
		familyName: "Klinikum Beispiel",
		honorificPrefix: null,
		occupation: "Krankenhaus",
		listingSlug: "krankenhaeuser",
		places: [place],
	};

	it("publishes a hospital site as a Hospital with its key, never a person", () => {
		const nodes = practitionerNodes(facility);
		const hospital = nodeOf(nodes, "Hospital");
		expect(hospital.identifier).toEqual({
			"@type": "PropertyValue",
			propertyID: "DE-KHV",
			value: "0a1b2c3d4e",
		});
		expect(hospital.address).toMatchObject({
			addressCountry: "DE",
			postalCode: "10117",
			addressLocality: "Berlin",
		});
		expect(hospital.geo).toBeUndefined();
		expect(JSON.stringify(nodes)).not.toMatch(
			/Person|IndividualPhysician|Physician"|givenName|familyName/,
		);
	});

	it("publishes every hospital kind as a Hospital, a clinic as a MedicalClinic, a pharmacy as a Pharmacy", () => {
		expect(
			nodeOf(
				practitionerNodes({
					...facility,
					professionCode: "DE_PSYCHIATRIC_HOSPITAL",
					listingSlug: "psychiatrische-kliniken",
				}),
				"Hospital",
			).medicalSpecialty,
		).toBe("https://schema.org/Psychiatric");
		expect(
			nodeOf(
				practitionerNodes({
					...facility,
					professionCode: "DE_CHILDRENS_HOSPITAL",
					listingSlug: "kinderkliniken",
				}),
				"Hospital",
			).medicalSpecialty,
		).toBe("https://schema.org/Pediatric");
		expect(
			nodeOf(
				practitionerNodes({
					...facility,
					professionCode: "DE_REHAB_CLINIC",
					idScheme: "DE-RHV",
					listingSlug: "reha-kliniken",
				}),
				"MedicalClinic",
			).address,
		).toMatchObject({ addressCountry: "DE" });
		expect(
			nodeOf(
				practitionerNodes({
					...facility,
					professionCode: "DE_PHARMACY",
					idScheme: "DE-APO-TH",
					rpps: "9001",
					listingSlug: "apotheken",
				}),
				"Pharmacy",
			).medicalSpecialty,
		).toBe("https://schema.org/PharmacySpecialty");
	});
});
describe("practitionerNodes for Switzerland", () => {
	const site: PracticePlaceInput = {
		siteId: 1,
		practiceKind: "hospital",
		name: "Kantonsspital Beispiel",
		addressLine: "Spitalstrasse 1",
		addressComplement: null,
		postcode: "8001",
		placeName: "Zürich",
		coordinates: { lat: 47.37, lon: 8.54 },
		phone: "+41442683111",
		establishmentUrl: null,
	};
	const hospital: PractitionerInput = {
		...doctor,
		url: `${ORIGIN}/ch/einrichtung/kantonsspital-beispiel-h123456789`,
		professionCode: "CH_HOSPITAL",
		rpps: "123456789",
		idScheme: "CH-BAG",
		country: "CH",
		name: "Kantonsspital Beispiel",
		givenName: "",
		familyName: "Kantonsspital Beispiel",
		honorificPrefix: null,
		occupation: "Spital",
		listingSlug: "spital",
		places: [site],
	};

	it("publishes a hospital or clinic as a Hospital with its list key, never a person", () => {
		for (const professionCode of [
			"CH_HOSPITAL",
			"CH_PSYCHIATRIC_CLINIC",
			"CH_REHAB_CLINIC",
			"CH_SPECIALTY_CLINIC",
		]) {
			const nodes = practitionerNodes({ ...hospital, professionCode });
			const node = nodeOf(nodes, "Hospital");
			expect(node.identifier).toEqual({
				"@type": "PropertyValue",
				propertyID: "CH-BAG",
				value: "123456789",
			});
			expect(node.address).toMatchObject({
				addressCountry: "CH",
				postalCode: "8001",
				addressLocality: "Zürich",
			});
			expect(node.telephone).toBe("+41442683111");
			expect(JSON.stringify(nodes)).not.toMatch(
				/Person|IndividualPhysician|Physician"|givenName|familyName/,
			);
		}
	});

	it("publishes a birth centre as a MedicalClinic, a pharmacy as a Pharmacy, a nursing home as a MedicalOrganization", () => {
		expect(
			nodeOf(
				practitionerNodes({
					...hospital,
					professionCode: "CH_BIRTH_CENTRE",
					listingSlug: "geburtshaus",
				}),
				"MedicalClinic",
			).medicalSpecialty,
		).toBe("https://schema.org/Obstetric");
		expect(
			nodeOf(
				practitionerNodes({ ...hospital, professionCode: "CH_PHARMACY", listingSlug: "apotheke" }),
				"Pharmacy",
			).medicalSpecialty,
		).toBe("https://schema.org/PharmacySpecialty");
		const home = practitionerNodes({
			...hospital,
			professionCode: "CH_NURSING_HOME",
			listingSlug: "pflegeheim",
		});
		const node = nodeOf(home, "MedicalOrganization");
		expect(node.address).toMatchObject({ addressCountry: "CH" });
		// An organisation is no place: no coordinates on it.
		expect(node.geo).toBeUndefined();
		expect(JSON.stringify(home)).not.toMatch(/Person|Physician"/);
	});
});

describe("practitionerNodes for Ireland", () => {
	const site: PracticePlaceInput = {
		siteId: 1,
		practiceKind: "office",
		name: "Example Pharmacy",
		addressLine: "1 Sample Street",
		addressComplement: null,
		postcode: null,
		placeName: "Cork",
		coordinates: { lat: 51.9, lon: -8.47 },
		phone: "+35321000000",
		establishmentUrl: null,
	};
	const pharmacy: PractitionerInput = {
		...doctor,
		url: `${ORIGIN}/ie/facility/example-pharmacy-p1234`,
		professionCode: "IE_PHARMACY",
		rpps: "1234",
		idScheme: "IE-PSI",
		country: "IE",
		name: "Example Pharmacy",
		givenName: "",
		familyName: "Example Pharmacy",
		honorificPrefix: null,
		occupation: "Pharmacy",
		listingSlug: "pharmacy",
		places: [site],
	};

	it("publishes a pharmacy as a Pharmacy with its PSI key, never a person", () => {
		const nodes = practitionerNodes(pharmacy);
		const node = nodeOf(nodes, "Pharmacy");
		expect(node.identifier).toEqual({
			"@type": "PropertyValue",
			propertyID: "IE-PSI",
			value: "1234",
		});
		expect(node.address).toMatchObject({ addressCountry: "IE", addressLocality: "Cork" });
		expect(node.medicalSpecialty).toBe("https://schema.org/PharmacySpecialty");
		expect(JSON.stringify(nodes)).not.toMatch(
			/Person|IndividualPhysician|Physician"|givenName|familyName/,
		);
	});

	it("publishes a hospital as a Hospital, a health centre as a MedicalClinic, a nursing home as a MedicalOrganization", () => {
		expect(
			nodeOf(
				practitionerNodes({
					...pharmacy,
					professionCode: "IE_HOSPITAL",
					idScheme: "IE-HSE-HOSP",
					listingSlug: "hospitals",
				}),
				"Hospital",
			).identifier,
		).toMatchObject({ propertyID: "IE-HSE-HOSP" });
		expect(
			nodeOf(
				practitionerNodes({
					...pharmacy,
					professionCode: "IE_HEALTH_CENTRE",
					idScheme: "IE-HSE-HC",
					listingSlug: "health-centres",
				}),
				"MedicalClinic",
			).medicalSpecialty,
		).toBe("https://schema.org/PrimaryCare");
		const home = practitionerNodes({
			...pharmacy,
			professionCode: "IE_NURSING_HOME",
			idScheme: "IE-HIQA",
			listingSlug: "nursing-homes",
		});
		const node = nodeOf(home, "MedicalOrganization");
		expect(node.address).toMatchObject({ addressCountry: "IE" });
		expect(node.geo).toBeUndefined();
		expect(JSON.stringify(home)).not.toMatch(/Person|Physician"/);
	});
});
