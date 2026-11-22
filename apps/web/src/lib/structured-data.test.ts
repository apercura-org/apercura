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
			occupationalCategory: "2222",
		});
		expect(person).not.toHaveProperty("medicalSpecialty");
		expect(person.workLocation).toEqual({ "@id": `${URL_OFFICE}#site-101` });
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
		expect(medicalSpecialtiesOf(null)).toEqual([]);
	});
});

describe("page entities", () => {
	it("links the home page, the website and its search action", () => {
		const nodes = siteNodes({
			origin: ORIGIN,
			name: "Apercura",
			description: "Annuaire ouvert.",
			language: "fr-FR",
			logo: `${ORIGIN}/icon/512`,
			searchUrlTemplate: `${ORIGIN}/recherche?quoi={search_term_string}`,
			sameAs: ["https://github.com/maxgfr/apercura"],
		});
		expect(graph(nodes)).toMatchSnapshot();
		const website = nodeOf(nodes, "WebSite");
		expect(website["@id"]).toBe(ids.website(ORIGIN));
		expect(website.potentialAction).toMatchObject({
			"@type": "SearchAction",
			"query-input": "required name=search_term_string",
		});
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
