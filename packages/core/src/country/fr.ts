import { formatPhoneFr, toE164Fr } from "../normalize";
import { isValidRpps } from "../rpps";
import {
	FR_DEFAULT_PROFESSIONS,
	FR_PROFESSIONS,
	isListingSlug,
	listingSlugFor,
} from "../taxonomy/fr";
import { timeZoneForDepartment } from "../time/departments";
import type { CountryAdapter } from "./types";

const LICENCE_OUVERTE = "Licence Ouverte 2.0 (Etalab)";

/**
 * France, the v1 market. Every member delegates to the code the app already
 * uses (RPPS check, department time zones, phone normalization, the FR
 * taxonomy): the adapter names what is French, it changes nothing.
 */
export const france: CountryAdapter = {
	code: "FR",
	defaultLocale: "fr",
	defaultTimeZone: "Europe/Paris",
	timeZones: [
		"Europe/Paris",
		"America/Guadeloupe",
		"America/Martinique",
		"America/Cayenne",
		"Indian/Reunion",
		"America/Miquelon",
		"Indian/Mayotte",
		"America/St_Barthelemy",
		"America/Marigot",
	],
	timeZoneOf: timeZoneForDepartment,
	registries: [
		{
			id: "annuaire-sante",
			name: "Annuaire Santé (RPPS)",
			publisher: "Agence du Numérique en Santé",
			url: "https://annuaire.sante.fr",
			licence: LICENCE_OUVERTE,
			provides: ["practitioners", "activities"],
		},
		{
			id: "finess",
			name: "FINESS+",
			publisher: "Ministère de la Santé (DREES)",
			url: "https://www.data.gouv.fr/datasets/finess-structures-1/",
			licence: LICENCE_OUVERTE,
			provides: ["establishments"],
		},
		{
			id: "ameli",
			name: "Annuaire santé Ameli",
			publisher: "Caisse nationale de l'Assurance Maladie",
			url: "https://annuairesante.ameli.fr",
			licence: LICENCE_OUVERTE,
			provides: ["billing"],
		},
	],
	practitionerId: {
		id: "RPPS",
		name: "RPPS",
		issuer: "Agence du Numérique en Santé",
		isValid: isValidRpps,
	},
	taxonomy: {
		professions: FR_PROFESSIONS,
		defaultProfessions: FR_DEFAULT_PROFESSIONS,
		listingSlugFor,
		isListingSlug,
	},
	phone: {
		callingCodes: ["33", "262", "590", "594", "596"],
		toE164: toE164Fr,
		format: formatPhoneFr,
	},
	address: {
		postcode: /^\d{5}$/,
		lines: ({ street, postcode, city }) =>
			[street, [postcode, city].filter(Boolean).join(" ")].filter((line): line is string =>
				Boolean(line),
			),
	},
	legalPages: [
		{
			id: "legal-notice",
			pathname: "/mentions-legales",
			basis: "Loi pour la confiance dans l'économie numérique (LCEN)",
		},
		{ id: "privacy", pathname: "/confidentialite", basis: "GDPR, art. 13 and 14" },
		{ id: "terms", pathname: "/conditions", basis: "Contract terms of the service" },
		{
			id: "accessibility",
			pathname: "/accessibilite",
			basis: "Loi du 11 février 2005, art. 47 (RGAA accessibility statement)",
		},
	],
	healthDataHosting: {
		regime: "HDS",
		basis: "Code de la santé publique, art. L1111-8",
		url: "https://esante.gouv.fr/produits-services/hds",
	},
	features: { directory: true, booking: true, eIdentityClaim: true },
};
