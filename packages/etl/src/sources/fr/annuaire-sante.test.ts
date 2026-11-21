import { describe, expect, it } from "vitest";
import { fakeRpps, PERSONNE_ACTIVITE_HEADER } from "../../../fixtures/generate";
import { MissingColumnsError, mapColumns } from "../../lib/text";
import {
	activityKey,
	DIPLOMES_COLUMNS,
	PERSONNE_ACTIVITE_COLUMNS,
	parseDiplomeLine,
	parsePersonneActiviteLine,
	parseSavoirFaireLine,
	SAVOIR_FAIRE_COLUMNS,
	STG_ACTIVITY_COLUMNS,
} from "./annuaire-sante";

const header = [...PERSONNE_ACTIVITE_HEADER];
const index = mapColumns("personneActivite", header, PERSONNE_ACTIVITE_COLUMNS);
const PROFESSIONS = new Set(["10", "40", "50"]);
const RPPS = fakeRpps(1);

function line(
	values: Partial<Record<(typeof PERSONNE_ACTIVITE_HEADER)[number], string>>,
): string[] {
	return header.map((name) => values[name] ?? "");
}

const office = {
	"Type d'identifiant PP": "8",
	"Identifiant PP": RPPS,
	"Identification nationale PP": `8${RPPS}`,
	"Code civilité d'exercice": "DR",
	"Code civilité": "MME",
	"Nom d'exercice": "DE LA FONTAINE",
	"Prénom d'exercice": "MARIE-ODILE",
	"Code profession": "10",
	"Code type savoir-faire": "S",
	"Code savoir-faire": "SM53",
	"Code mode exercice": "L",
	"Identifiant technique de la structure": "R10999999000001",
	"Raison sociale site": "CABINET DU DR DE LA FONTAINE",
	"Numéro Voie (coord. structure)": "24",
	"Indice répétition voie (coord. structure)": "B",
	"Libellé type de voie (coord. structure)": "Rue",
	"Libellé Voie (coord. structure)": "DAUPHINE",
	"Code postal (coord. structure)": "75006",
	"Code commune (coord. structure)": "75056",
	"Téléphone (coord. structure)": "01 99 00 01 01",
	"Adresse e-mail (coord. structure)": "Cabinet@Example.org",
	"Code secteur d'activité": "SA07",
	"Code rôle": "FON-01",
	"Code genre activité": "GENR01",
} as const;

const column = (name: (typeof STG_ACTIVITY_COLUMNS)[number]) => STG_ACTIVITY_COLUMNS.indexOf(name);

describe("Personne_activite lines", () => {
	it("maps a line by header name and normalizes it", () => {
		const parsed = parsePersonneActiviteLine(line(office), header.length, index, PROFESSIONS, 2);
		expect(parsed.kind).toBe("row");
		if (parsed.kind !== "row") return;
		const values = parsed.row.values;
		expect(values).toHaveLength(STG_ACTIVITY_COLUMNS.length);
		expect(values[column("rpps")]).toBe(RPPS);
		expect(values[column("last_name")]).toBe("de La Fontaine");
		expect(values[column("first_name")]).toBe("Marie-Odile");
		expect(values[column("last_name_source")]).toBe("DE LA FONTAINE");
		expect(values[column("slug")]).toBe(`marie-odile-de-la-fontaine-${RPPS}`);
		expect(values[column("address_line")]).toBe("24 bis Rue Dauphine");
		expect(values[column("site_name")]).toBe("Cabinet du Dr de la Fontaine");
		expect(values[column("site_kind")]).toBe("office");
		expect(values[column("phone")]).toBe("+33199000101");
		expect(values[column("email")]).toBe("cabinet@example.org");
		expect(values[column("practice_kind")]).toBe("office");
		expect(values[column("activity_key")]).toBe(
			activityKey([RPPS, "R10999999000001", "L", "FON-01", "SA07", "GENR01"]),
		);
		expect(parsed.row.unknownCodes).toEqual([]);
	});

	it("keeps a registration without activity, with no activity key", () => {
		const parsed = parsePersonneActiviteLine(
			line({
				"Type d'identifiant PP": "8",
				"Identifiant PP": RPPS,
				"Nom d'exercice": "FICTIF",
				"Code profession": "50",
			}),
			header.length,
			index,
			PROFESSIONS,
			3,
		);
		expect(parsed.kind).toBe("row");
		if (parsed.kind === "row") {
			expect(parsed.row.values[column("activity_key")]).toBeNull();
			expect(parsed.row.values[column("practice_kind")]).toBeNull();
		}
	});

	it("reports unknown taxonomy codes", () => {
		const parsed = parsePersonneActiviteLine(
			line({ ...office, "Code secteur d'activité": "SA99" }),
			header.length,
			index,
			PROFESSIONS,
			4,
		);
		expect(parsed.kind === "row" && parsed.row.unknownCodes).toEqual(["SA99"]);
	});

	it("skips professions out of scope, including 99", () => {
		for (const code of ["60", "99"]) {
			expect(
				parsePersonneActiviteLine(
					line({ ...office, "Code profession": code }),
					header.length,
					index,
					PROFESSIONS,
					5,
				),
			).toEqual({ kind: "skip" });
		}
	});

	it.each([
		["field_count", line(office).slice(0, 40)],
		["invalid_rpps", line({ ...office, "Identifiant PP": "10000000000" })],
		["invalid_rpps", line({ ...office, "Identifiant PP": "1000000000" })],
		["invalid_idType", line({ ...office, "Type d'identifiant PP": "0" })],
		["invalid_lastName", line({ ...office, "Nom d'exercice": "  " })],
	])("quarantines a line with %s", (reason, fields) => {
		expect(parsePersonneActiviteLine(fields, header.length, index, PROFESSIONS, 6)).toEqual({
			kind: "quarantine",
			reason,
		});
	});

	it("tolerates a literal double quote in a value (no CSV quoting)", () => {
		const parsed = parsePersonneActiviteLine(
			line({ ...office, "Raison sociale site": 'CABINET "LES TILLEULS' }),
			header.length,
			index,
			PROFESSIONS,
			7,
		);
		expect(parsed.kind === "row" && parsed.row.values[column("legal_name")]).toBe(
			'CABINET "LES TILLEULS',
		);
	});
});

describe("header mapping", () => {
	it("accepts extra columns and any order", () => {
		const shuffled = ["Nouvelle colonne", ...[...header].reverse()];
		const mapped = mapColumns("personneActivite", shuffled, PERSONNE_ACTIVITE_COLUMNS);
		expect(shuffled[mapped.rpps]).toBe("Identifiant PP");
	});

	it("fails when an expected column is missing", () => {
		const missing = header.filter((name) => name !== "Code rôle");
		expect(() => mapColumns("personneActivite", missing, PERSONNE_ACTIVITE_COLUMNS)).toThrow(
			MissingColumnsError,
		);
	});
});

describe("qualification files", () => {
	const scope = new Set([RPPS]);
	const sfHeader = Object.values(SAVOIR_FAIRE_COLUMNS);
	const sfIndex = mapColumns("savoirFaire", sfHeader, SAVOIR_FAIRE_COLUMNS);
	const dipHeader = Object.values(DIPLOMES_COLUMNS);
	const dipIndex = mapColumns("diplomes", dipHeader, DIPLOMES_COLUMNS);

	it("keeps skills of practitioners in scope only", () => {
		const fields = ["8", RPPS, "10", "C", "CM01", "Compétence"];
		expect(parseSavoirFaireLine(fields, fields.length, sfIndex, scope)).toEqual({
			kind: "row",
			row: { rpps: RPPS, values: [[RPPS, "savoir_faire", "C", "CM01", "Compétence"]] },
		});
		const other = ["8", fakeRpps(2), "10", "C", "CM01", "Compétence"];
		expect(parseSavoirFaireLine(other, other.length, sfIndex, scope)).toEqual({ kind: "skip" });
	});

	it("splits a diploma line into diploma and authorization", () => {
		const fields = [
			"8",
			RPPS,
			"DE",
			"DE05",
			"Docteur en médecine",
			"AE",
			"SM53",
			"Médecine générale",
		];
		const parsed = parseDiplomeLine(fields, fields.length, dipIndex, scope);
		expect(parsed.kind === "row" && parsed.row.values).toEqual([
			[RPPS, "diploma", "DE", "DE05", "Docteur en médecine"],
			[RPPS, "authorization", "AE", "SM53", "Médecine générale"],
		]);
	});
});
