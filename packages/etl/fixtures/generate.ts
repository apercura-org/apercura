/**
 * Generates the SYNTHETIC fixtures in `fixtures/fr/`: files in the exact ANS,
 * FINESS+ and Ameli formats, filled with fictitious people.
 *
 * Every RPPS is Luhn-valid but in the obviously fake 1999999xxxx range, names
 * are made-up words (Exemple, Fictif, Specimen…), phones use the ARCEP range
 * reserved for fiction (01 99 00 xx xx) and streets do not exist. Never commit
 * real registry rows. Run with `bun run --cwd packages/etl fixtures`.
 *
 * The place files (communes, departments…) are a subset of the public
 * geo.api.gouv.fr data and are not generated.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";

/** The 56 columns of `ps-libreacces-personne-activite.txt`, in order. */
export const PERSONNE_ACTIVITE_HEADER = [
	"Type d'identifiant PP",
	"Identifiant PP",
	"Identification nationale PP",
	"Code civilité d'exercice",
	"Libellé civilité d'exercice",
	"Code civilité",
	"Libellé civilité",
	"Nom d'exercice",
	"Prénom d'exercice",
	"Code profession",
	"Libellé profession",
	"Code catégorie professionnelle",
	"Libellé catégorie professionnelle",
	"Code type savoir-faire",
	"Libellé type savoir-faire",
	"Code savoir-faire",
	"Libellé savoir-faire",
	"Code mode exercice",
	"Libellé mode exercice",
	"Numéro SIRET site",
	"Numéro SIREN site",
	"Numéro FINESS site",
	"Numéro FINESS établissement juridique",
	"Identifiant technique de la structure",
	"Raison sociale site",
	"Enseigne commerciale site",
	"Complément destinataire (coord. structure)",
	"Complément point géographique (coord. structure)",
	"Numéro Voie (coord. structure)",
	"Indice répétition voie (coord. structure)",
	"Code type de voie (coord. structure)",
	"Libellé type de voie (coord. structure)",
	"Libellé Voie (coord. structure)",
	"Mention distribution (coord. structure)",
	"Bureau cedex (coord. structure)",
	"Code postal (coord. structure)",
	"Code commune (coord. structure)",
	"Libellé commune (coord. structure)",
	"Code pays (coord. structure)",
	"Libellé pays (coord. structure)",
	"Téléphone (coord. structure)",
	"Téléphone 2 (coord. structure)",
	"Télécopie (coord. structure)",
	"Adresse e-mail (coord. structure)",
	"Code Département (structure)",
	"Libellé Département (structure)",
	"Ancien identifiant de la structure",
	"Autorité d'enregistrement",
	"Code secteur d'activité",
	"Libellé secteur d'activité",
	"Code section tableau pharmaciens",
	"Libellé section tableau pharmaciens",
	"Code rôle",
	"Libellé rôle",
	"Code genre activité",
	"Libellé genre activité",
] as const;

export const SAVOIR_FAIRE_HEADER = [
	"Type d'identifiant PP",
	"Identifiant PP",
	"Identification nationale PP",
	"Nom d'exercice",
	"Prénom d'exercice",
	"Code profession",
	"Libellé profession",
	"Code catégorie professionnelle",
	"Libellé catégorie professionnelle",
	"Code type savoir-faire",
	"Libellé type savoir-faire",
	"Code savoir-faire",
	"Libellé savoir-faire",
] as const;

export const DIPLOMES_HEADER = [
	"Type d'identifiant PP",
	"Identifiant PP",
	"Identification nationale PP",
	"Nom d'exercice",
	"Prénom d'exercice",
	"Code type diplôme obtenu",
	"Libellé type diplôme obtenu",
	"Code diplôme obtenu",
	"Libellé diplôme obtenu",
	"Code type autorisation",
	"Libellé type autorisation",
	"Code discipline autorisation",
	"Libellé discipline autorisation",
] as const;

/** Appends the Luhn check digit to a 10-digit body. */
export function withLuhn(body: string): string {
	let sum = 0;
	for (let index = 0; index < body.length; index++) {
		let digit = Number(body[body.length - 1 - index]);
		if (index % 2 === 0) {
			digit *= 2;
			if (digit > 9) digit -= 9;
		}
		sum += digit;
	}
	return `${body}${(10 - (sum % 10)) % 10}`;
}

/** Fake RPPS: 1999999 + 3 digits + check digit. */
export const fakeRpps = (n: number) => withLuhn(`1999999${String(n).padStart(3, "0")}`);

const PROFESSIONS: Record<string, string> = {
	"10": "Médecin",
	"40": "Chirurgien-Dentiste",
	"50": "Sage-Femme",
	"60": "Infirmier",
	"99": "Autre",
};

const SPECIALTIES: Record<string, string> = {
	SM53: "Spécialiste en Médecine Générale",
	SM54: "Médecine générale",
	SM04: "Cardiologie et maladies vasculaires",
	SM15: "Dermatologie et vénéréologie",
	SM25: "Médecine du travail",
	SCD01: "Orthopédie dento-faciale",
};

type Structure = {
	id: string;
	name: string;
	siret?: string;
	finess?: string;
	finessEj?: string;
	number?: string;
	repetition?: string;
	typeCode?: string;
	typeLabel?: string;
	street: string;
	postcode: string;
	commune: string;
	communeLabel: string;
	phone?: string;
	email?: string;
};

const S: Record<string, Structure> = {
	cabinet15: {
		id: "R10999999000001",
		name: "CABINET MEDICAL DE L'EXEMPLE",
		number: "12",
		typeCode: "R",
		typeLabel: "Rue",
		street: "DE L'EXEMPLE",
		postcode: "75015",
		commune: "75115",
		communeLabel: "Paris 15e  Arrondissement",
		phone: "0199000101",
	},
	cabinet15b: {
		id: "R10999999000002",
		name: "MAISON DE SANTE FICTIVE",
		number: "3",
		repetition: "B",
		typeCode: "AV",
		typeLabel: "Avenue",
		street: "DU SPECIMEN",
		postcode: "75015",
		commune: "75115",
		communeLabel: "Paris 15e  Arrondissement",
		phone: "0199000102",
		email: "contact@msp-fictive.example.org",
	},
	hopital13: {
		id: "F759999001",
		name: "HOPITAL FICTIF DE TEST",
		siret: "99999999900011",
		finess: "759999001",
		finessEj: "759999000",
		number: "47",
		typeCode: "BD",
		typeLabel: "Boulevard",
		street: "DE LA MAQUETTE",
		postcode: "75013",
		commune: "75113",
		communeLabel: "Paris 13e  Arrondissement",
		phone: "0199000100",
	},
	cabinetParis6: {
		id: "R10999999000003",
		name: "CABINET DU DR SPECIMEN",
		number: "24",
		typeCode: "R",
		typeLabel: "Rue",
		street: "DU PROTOTYPE",
		postcode: "75006",
		commune: "75056",
		communeLabel: "Paris",
		phone: "0199000103",
	},
	cabinetNoCommune: {
		id: "R10999999000004",
		// The registry prints accented letters inside words as capitals (Chloé -> ChloE).
		name: "CABINET DU DR ChloE D'ESSAI",
		number: "5",
		typeCode: "PL",
		typeLabel: "Place",
		street: "DE L'ESSAI",
		postcode: "75012",
		commune: "",
		communeLabel: "",
		phone: "0199000104",
	},
	dentisteLyon3: {
		id: "R10999999000005",
		name: "CENTRE DENTAIRE DE LA MAQUETTE",
		number: "8",
		typeCode: "CRS",
		typeLabel: "Cours",
		street: "DU TEMOIN",
		postcode: "69003",
		commune: "69383",
		communeLabel: "Lyon 3e  Arrondissement",
		phone: "0199000105",
	},
	dentisteLyon: {
		id: "R10999999000006",
		name: "CABINET DENTAIRE FICTIF",
		number: "1",
		typeCode: "QU",
		typeLabel: "Quai",
		street: "DE L'ECHANTILLON",
		postcode: "69002",
		commune: "69123",
		communeLabel: "Lyon",
		phone: "0199000106",
	},
	maternite2A: {
		id: "F2A9999001",
		name: "CENTRE HOSPITALIER FICTIF",
		finess: "2A9999001",
		finessEj: "2A9999000",
		number: "1",
		typeCode: "AV",
		typeLabel: "Avenue",
		street: "DU PLACEBO",
		postcode: "20000",
		commune: "2A004",
		communeLabel: "Ajaccio",
		phone: "0199000107",
	},
	cabinetReunion: {
		id: "R10999999000007",
		name: "CABINET MEDICAL DU MODELE",
		number: "9",
		typeCode: "R",
		typeLabel: "Rue",
		street: "DU MODELE",
		postcode: "97400",
		commune: "97411",
		communeLabel: "Saint-Denis",
		phone: "0199000108",
	},
	entreprise: {
		id: "R10999999000008",
		name: "ENTREPRISE FICTIVE SA",
		siret: "99999999900029",
		number: "100",
		typeCode: "AV",
		typeLabel: "Avenue",
		street: "DE LA DEMO",
		postcode: "75008",
		commune: "75108",
		communeLabel: "Paris 8e  Arrondissement",
	},
};

type Activity = {
	structure?: Structure;
	mode?: "L" | "S" | "B";
	sector?: string;
	role?: string;
	genre?: string;
	specialty?: string;
};

export type Person = {
	n: number;
	title?: "DR" | "PR";
	civility: "M" | "MME";
	last: string;
	first: string;
	profession: string;
	activities: Activity[];
};

const office = (structure: Structure, specialty?: string): Activity => ({
	structure,
	mode: "L",
	sector: "SA07",
	role: "FON-01",
	genre: "GENR01",
	...(specialty ? { specialty } : {}),
});

/** Hand-written cases, one per rule the import must handle. */
export const CASES: Person[] = [
	{
		n: 1,
		title: "DR",
		civility: "MME",
		last: "EXEMPLE",
		first: "CAMILLE",
		profession: "10",
		activities: [
			office(S.cabinet15 as Structure, "SM53"),
			{
				structure: S.hopital13,
				mode: "S",
				sector: "SA01",
				role: "FON-33",
				genre: "GENR01",
				specialty: "SM53",
			},
		],
	},
	{
		n: 2,
		title: "DR",
		civility: "M",
		last: "FICTIF",
		first: "JEAN-PIERRE",
		profession: "10",
		activities: [office(S.cabinet15 as Structure, "SM53")],
	},
	{
		n: 3,
		title: "DR",
		civility: "MME",
		last: "SPECIMEN",
		first: "ALICE",
		profession: "10",
		activities: [
			{
				structure: S.cabinet15b,
				mode: "L",
				sector: "SA52",
				role: "FON-17",
				genre: "GENR01",
				specialty: "SM54",
			},
		],
	},
	{
		n: 4,
		title: "PR",
		civility: "M",
		last: "DE LA MAQUETTE",
		first: "BRUNO",
		profession: "10",
		activities: [office(S.cabinetParis6 as Structure, "SM04")],
	},
	{
		n: 5,
		title: "DR",
		civility: "MME",
		last: "D'ESSAI",
		first: "CHLOÉ",
		profession: "10",
		activities: [office(S.cabinetNoCommune as Structure, "SM15")],
	},
	{
		n: 6,
		title: "DR",
		civility: "M",
		last: "TEMOIN",
		first: "DAVID",
		profession: "40",
		activities: [{ ...office(S.dentisteLyon3 as Structure, "SCD01"), sector: "SA08" }],
	},
	{
		n: 7,
		civility: "MME",
		last: "ECHANTILLON",
		first: "EMMA",
		profession: "40",
		activities: [office(S.dentisteLyon as Structure)],
	},
	{
		n: 8,
		civility: "MME",
		last: "PLACEBO",
		first: "FANNY",
		profession: "50",
		activities: [
			{ structure: S.maternite2A, mode: "S", sector: "SA01", role: "FON-33", genre: "GENR01" },
		],
	},
	{
		n: 9,
		title: "DR",
		civility: "M",
		last: "REMPLACANT",
		first: "GASPARD",
		profession: "10",
		activities: [{ mode: "L", role: "FON-22", genre: "GENR02", specialty: "SM53" }],
	},
	{
		n: 10,
		title: "DR",
		civility: "MME",
		last: "INSCRITE",
		first: "HELENE",
		profession: "10",
		activities: [{}],
	},
	{
		n: 11,
		title: "DR",
		civility: "M",
		last: "PROTOTYPE",
		first: "IGOR",
		profession: "10",
		activities: [
			{
				structure: S.entreprise,
				mode: "S",
				sector: "SA48",
				role: "FON-29",
				genre: "GENR04",
				specialty: "SM25",
			},
		],
	},
	{
		n: 12,
		title: "DR",
		civility: "MME",
		last: "MODELE",
		first: "JULIE",
		profession: "10",
		activities: [office(S.cabinetReunion as Structure, "SM53")],
	},
	// Homonyms in the same commune with the same specialty: Ameli must not match them.
	{
		n: 13,
		title: "DR",
		civility: "M",
		last: "DOUBLON",
		first: "KEVIN",
		profession: "10",
		activities: [office(S.cabinet15 as Structure, "SM53")],
	},
	{
		n: 14,
		title: "DR",
		civility: "M",
		last: "DOUBLON",
		first: "KEVIN",
		profession: "10",
		activities: [office(S.cabinet15b as Structure, "SM53")],
	},
	{
		n: 15,
		title: "DR",
		civility: "MME",
		last: "MAQUETTE",
		first: "LAURA",
		profession: "10",
		activities: [office(S.cabinet15b as Structure, "SM53")],
	},
	// Out of scope: a nurse and a non-health professional (code 99).
	{
		n: 16,
		civility: "M",
		last: "HORS-CHAMP",
		first: "MARC",
		profession: "60",
		activities: [office(S.cabinet15 as Structure)],
	},
	{ n: 17, civility: "MME", last: "AUTRE", first: "NINA", profession: "99", activities: [{}] },
];

const FIRST_NAMES = [
	"ANNE",
	"BENOIT",
	"CLAIRE",
	"DENIS",
	"ELSA",
	"FABIEN",
	"GAELLE",
	"HUGO",
	"INES",
	"JULES",
];

/** Two-letter suffix for generated names: AA, AB, AC… */
const letters = (index: number) =>
	String.fromCharCode(65 + (Math.floor(index / 26) % 26)) + String.fromCharCode(65 + (index % 26));

/**
 * Generated practitioners, each in an office of a Paris arrondissement, so the
 * volume guards (±3% rows, ±2% RPPS per profession) and the circuit breakers
 * behave as on real data when a test changes a handful of rows.
 * `phoneSeries` changes every office phone number (to trip the breaker).
 */
export function fillerPeople(count: number, phoneSeries = 2): Person[] {
	return Array.from({ length: count }, (_, index) => {
		const arrondissement = String((index % 20) + 1).padStart(2, "0");
		const profession = index % 10 === 8 ? "40" : index % 10 === 9 ? "50" : "10";
		const structure: Structure = {
			id: `R1099999901${String(index).padStart(4, "0")}`,
			name: `CABINET FICTIF ${letters(index)}`,
			number: String(index + 1),
			typeCode: "R",
			typeLabel: "Rue",
			street: "DU JEU D'ESSAI",
			postcode: `750${arrondissement}`,
			commune: `751${arrondissement}`,
			communeLabel: `Paris ${Number(arrondissement)}e  Arrondissement`,
			phone: `01990${phoneSeries}${String(index).padStart(4, "0")}`,
		};
		return {
			n: 100 + index,
			title: profession === "50" ? undefined : "DR",
			civility: index % 2 === 0 ? "MME" : "M",
			last: `ESSAI${letters(index)}`,
			first: FIRST_NAMES[index % FIRST_NAMES.length] ?? "ANNE",
			profession,
			activities: [office(structure, profession === "10" ? "SM53" : undefined)],
		} satisfies Person;
	});
}

/** The committed fixture set. */
export const PEOPLE: Person[] = [...CASES, ...fillerPeople(200)];

const line = (values: string[]) => values.join("|");

function personneActiviteRows(people: Person[]): string[] {
	const rows: string[] = [];
	for (const person of people) {
		const rpps = fakeRpps(person.n);
		for (const activity of person.activities) {
			const s = activity.structure;
			const values: Record<string, string> = {
				"Type d'identifiant PP": "8",
				"Identifiant PP": rpps,
				"Identification nationale PP": `8${rpps}`,
				"Code civilité d'exercice": person.title ?? "",
				"Libellé civilité d'exercice":
					person.title === "DR" ? "Docteur" : person.title === "PR" ? "Professeur" : "",
				"Code civilité": person.civility,
				"Libellé civilité": person.civility === "M" ? "Monsieur" : "Madame",
				"Nom d'exercice": person.last,
				"Prénom d'exercice": person.first,
				"Code profession": person.profession,
				"Libellé profession": PROFESSIONS[person.profession] ?? "",
				"Code catégorie professionnelle": "C",
				"Libellé catégorie professionnelle": "Civil",
				"Code type savoir-faire": activity.specialty ? "S" : "",
				"Libellé type savoir-faire": activity.specialty ? "Spécialité ordinale" : "",
				"Code savoir-faire": activity.specialty ?? "",
				"Libellé savoir-faire": activity.specialty ? (SPECIALTIES[activity.specialty] ?? "") : "",
				"Code mode exercice": activity.mode ?? "",
				"Libellé mode exercice":
					activity.mode === "L" ? "Lib,indép,artis,com" : activity.mode === "S" ? "Salarié" : "",
				"Numéro SIRET site": s?.siret ?? "",
				"Numéro FINESS site": s?.finess ?? "",
				"Numéro FINESS établissement juridique": s?.finessEj ?? "",
				"Identifiant technique de la structure": s?.id ?? "",
				"Raison sociale site": s?.name ?? "",
				"Numéro Voie (coord. structure)": s?.number ?? "",
				"Indice répétition voie (coord. structure)": s?.repetition ?? "",
				"Code type de voie (coord. structure)": s?.typeCode ?? "",
				"Libellé type de voie (coord. structure)": s?.typeLabel ?? "",
				"Libellé Voie (coord. structure)": s?.street ?? "",
				"Bureau cedex (coord. structure)": s ? `${s.postcode} ${s.communeLabel.toUpperCase()}` : "",
				"Code postal (coord. structure)": s?.postcode ?? "",
				"Code commune (coord. structure)": s?.commune ?? "",
				"Libellé commune (coord. structure)": s?.communeLabel ?? "",
				"Code pays (coord. structure)": s ? "99000" : "",
				"Libellé pays (coord. structure)": s ? "France" : "",
				"Téléphone (coord. structure)": s?.phone ?? "",
				"Adresse e-mail (coord. structure)": s?.email ?? "",
				"Autorité d'enregistrement":
					person.profession === "40"
						? "ONCD/ONCD/ONCD"
						: person.profession === "50"
							? "CNOSF//"
							: "CNOM/CNOM/CNOM",
				"Code secteur d'activité": activity.sector ?? "",
				"Code rôle": activity.role ?? "",
				"Code genre activité": activity.genre ?? "",
			};
			rows.push(line(PERSONNE_ACTIVITE_HEADER.map((name) => values[name] ?? "")));
		}
	}
	return rows;
}

function savoirFaireRows(people: Person[]): string[] {
	const extra: Record<number, [string, string, string, string][]> = {
		1: [["C", "Compétence", "CM01", "Médecine du sport (synthetic)"]],
		4: [
			["S", "Spécialité ordinale", "SM04", "Cardiologie et maladies vasculaires"],
			["CAPA", "Capacité", "CAPA01", "Angiologie (synthetic)"],
		],
		6: [["S", "Spécialité ordinale", "SCD01", "Orthopédie dento-faciale"]],
	};
	const rows: string[] = [];
	for (const person of people) {
		for (const [typeCode, typeLabel, code, label] of extra[person.n] ?? []) {
			const rpps = fakeRpps(person.n);
			rows.push(
				line([
					"8",
					rpps,
					`8${rpps}`,
					person.last,
					person.first,
					person.profession,
					PROFESSIONS[person.profession] ?? "",
					"C",
					"Civil",
					typeCode,
					typeLabel,
					code,
					label,
				]),
			);
		}
	}
	return rows;
}

function diplomeRows(people: Person[]): string[] {
	const diploma: Record<string, [string, string]> = {
		"10": ["DE05", "Diplôme d'État français de docteur en médecine"],
		"40": ["DE01", "Diplôme d'État français de docteur en chirurgie dentaire"],
		"50": ["DE06", "Diplôme d'Etat français de sage-femme "],
	};
	const rows: string[] = [];
	for (const person of people) {
		const entry = diploma[person.profession];
		if (!entry) continue;
		const rpps = fakeRpps(person.n);
		rows.push(
			line([
				"8",
				rpps,
				`8${rpps}`,
				person.last,
				person.first,
				"DE",
				"Diplôme d'Etat français ",
				entry[0],
				entry[1],
				"",
				"",
				"",
				"",
			]),
		);
	}
	return rows;
}

function finessDocument() {
	const establishment = (
		finess: string,
		name: string,
		commune: string,
		postcode: string,
		lat: string,
		lon: string,
		open: boolean,
	) => ({
		informationsGeneralesEGE: {
			egeId: finess,
			dateFermeture: open ? null : "2020-01-01",
			nomEgeCourt: name.slice(0, 20),
			nomEgeLong: `${name}            `,
			numFinessEge: finess,
		},
		categorieentiteGeographiqueExercice: "355",
		adresse: [
			{
				usageAdresse: "03",
				cogCommune: commune,
				codePostal: postcode,
				coordonneesGeographique: {
					directionLatitude: lat,
					directionLongitude: lon,
					scoreBAN: "0.95",
				},
			},
		],
		contact: [
			{
				typeContact: { roleContact: "01" },
				telecom: { telephone: "0199000100", telecopie: null, courriel: null },
			},
		],
		etatObjet: open ? "A" : "I",
	});
	return {
		schemaVersion: "v1.0.0",
		generatedAt: "2026-11-21T03:00:00Z",
		gco: [],
		gcc: [],
		pmej: [
			{
				informationsGeneralesPMEJ: { pmSmsseId: "1", numFinessPm: "759999000" },
				ege: [
					establishment(
						"759999001",
						"HOPITAL FICTIF DE TEST",
						"75113",
						"75013",
						"48.835000",
						"2.360000",
						true,
					),
					establishment(
						"759999002",
						"CLINIQUE FERMEE FICTIVE",
						"75113",
						"75013",
						"48.836000",
						"2.361000",
						false,
					),
				],
				etatObjet: "A",
			},
			{
				informationsGeneralesPMEJ: { pmSmsseId: "2", numFinessPm: "2A9999000" },
				ege: [
					establishment(
						"2A9999001",
						"CENTRE HOSPITALIER FICTIF",
						"2A004",
						"20000",
						"41.930000",
						"8.740000",
						true,
					),
				],
				etatObjet: "A",
			},
		],
	};
}

const AMELI_HEADER = [
	"ps_activite_nom",
	"ps_activite_prenom",
	"ps_activite_civilite",
	"ps_activite_raison_sociale",
	"ps_activite_carte_vitale",
	"ps_activite_apcv",
	"specialite_code",
	"specialite_libelle",
	"activite_particuliere_code",
	"activite_particuliere_libelle",
	"type_ps_code",
	"type_ps_libelle",
	"coordonnees_num_tel",
	"coordonnees_voie",
	"coordonnees_complement",
	"coordonnees_lieu_dit",
	"coordonnees_code_postal",
	"coordonnees_ville",
	"option_tarifaire_code",
	"option_tarifaire_libelle",
	"secteur_conventionnel_code",
	"secteur_conventionnel_libelle",
	"nature_exercice_code",
	"nature_exercice_libelle",
];

function ameliRows(): string[] {
	const q = (values: string[]) => values.map((value) => `"${value.replace(/"/g, '""')}"`).join(";");
	const row = (
		last: string,
		first: string,
		specialty: [string, string],
		type: string,
		postcode: string,
		city: string,
		sector: string,
		option = "",
		cv = "true",
		apcv = "false",
		company = "",
	) =>
		q([
			last,
			first,
			"F",
			company,
			cv,
			apcv,
			specialty[0],
			specialty[1],
			"",
			"",
			type,
			type === "5"
				? "Chirurgiens-dentistes"
				: type === "2"
					? "Auxiliaires médicaux"
					: "Médecins généralistes et spécialistes",
			"0199000101",
			"12 RUE DE L EXEMPLE",
			"",
			"",
			postcode,
			city,
			option,
			option === "3" ? "OPTAM" : option === "4" ? "OPTAM-ACO" : "",
			sector,
			sector === "1" ? "Secteur 1 ou conventionné" : sector === "3" ? "Secteur 2" : "",
			"01",
			"Libéral intégral",
		]);
	const gp: [string, string] = ["01", "Médecin généraliste"];
	return [
		q(AMELI_HEADER),
		// Unique match (Camille Exemple, Paris 15e, GP).
		row("EXEMPLE", "CAMILLE", gp, "1", "75015", "PARIS", "1"),
		// Unique match with OPTAM (Bruno de La Maquette, cardiologist, Paris 6e).
		row(
			"DE LA MAQUETTE",
			"BRUNO",
			["03", "Cardiologue"],
			"1",
			"75006",
			"PARIS",
			"3",
			"3",
			"true",
			"false",
			"SELARL FICTIVE; CARDIOLOGIE",
		),
		// Hyphenated first name written with a space (Jean-Pierre Fictif).
		row("FICTIF", "JEAN PIERRE", gp, "1", "75015", "PARIS", "1"),
		// Homonyms: two RPPS practitioners match, so nothing is stored.
		row("DOUBLON", "KEVIN", gp, "1", "75015", "PARIS", "1"),
		// Same name, incompatible specialty: no match.
		row("SPECIMEN", "ALICE", ["15", "Ophtalmologiste"], "1", "75015", "PARIS", "1"),
		// Dentist, orthodontist (David Temoin, Lyon 3e).
		row(
			"TEMOIN",
			"DAVID",
			["36", "Chirurgien-dentiste spécialiste en orthopédie dento-faciale (Orthodontiste)"],
			"5",
			"69003",
			"LYON",
			"1",
		),
		// Two rows for one person that disagree: ambiguous, nothing is stored.
		row("MAQUETTE", "LAURA", gp, "1", "75015", "PARIS", "1"),
		row("MAQUETTE", "LAURA", gp, "1", "75015", "PARIS", "3", "3"),
		// Nurse: out of scope.
		row("HORS-CHAMP", "MARC", ["24", "Infirmier"], "2", "75015", "PARIS", "1"),
		// CEDEX postcode: commune not resolvable, no match.
		row("MODELE", "JULIE", gp, "1", "97489", "SAINT DENIS CEDEX", "1"),
	];
}

function write(out: string, name: string, lines: string[], bom = false) {
	writeFileSync(join(out, name), `${bom ? "\uFEFF" : ""}${lines.join("\n")}\n`, "utf8");
}

/** Writes every synthetic source file into `out`. */
export function writeFixtures(out: string, people: Person[] = PEOPLE) {
	write(out, "personne-activite.txt", [
		line([...PERSONNE_ACTIVITE_HEADER]),
		...personneActiviteRows(people),
	]);
	write(out, "savoir-faire.txt", [line([...SAVOIR_FAIRE_HEADER]), ...savoirFaireRows(people)]);
	write(out, "dipl-autexerc.txt", [line([...DIPLOMES_HEADER]), ...diplomeRows(people)]);
	writeFileSync(join(out, "finess.json"), `${JSON.stringify(finessDocument(), null, 2)}\n`);
	write(out, "ameli.csv", ameliRows(), true);
}

if (import.meta.main) {
	const out = join(import.meta.dirname, "fr");
	writeFixtures(out);
	console.log(`Synthetic fixtures written to ${out}`);
}
