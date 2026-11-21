/**
 * Annuaire santé Ameli (Cnam): `;`-separated CSV, UTF-8 with BOM, quoted
 * fields. It has no RPPS, so rows are matched to practitioners strictly in SQL
 * (normalized names + same commune + compatible specialty, unique 1:1 only).
 */
import { FR_AMELI_SPECIALTY_SLUGS } from "@apercura/core/taxonomy";
import { type CopyValue, openCopy } from "../../lib/copy";
import type { Sql } from "../../lib/db";
import type { Quarantine } from "../../lib/load";
import { mapColumns, nullIfEmpty, readQuotedRecords } from "../../lib/text";

export const AMELI_COLUMNS = {
	lastName: "ps_activite_nom",
	firstName: "ps_activite_prenom",
	carteVitale: "ps_activite_carte_vitale",
	apcv: "ps_activite_apcv",
	specialtyCode: "specialite_code",
	postcode: "coordonnees_code_postal",
	city: "coordonnees_ville",
	optionCode: "option_tarifaire_code",
	billingSector: "secteur_conventionnel_code",
} as const;

export const STG_AMELI_COLUMNS = [
	"line_no",
	"last_name",
	"first_name",
	"specialty_code",
	"postcode",
	"city",
	"carte_vitale",
	"apcv",
	"billing_sector",
	"option_code",
] as const;

type Index = Record<keyof typeof AMELI_COLUMNS, number>;

/** Maps one Ameli record, or null when its specialty is out of scope. */
export function ameliRow(
	fields: string[],
	index: Index,
	lineNo: number,
): CopyValue[] | "invalid" | null {
	const specialtyCode = nullIfEmpty(fields[index.specialtyCode]);
	if (!specialtyCode || !FR_AMELI_SPECIALTY_SLUGS[specialtyCode]) return null;
	const lastName = nullIfEmpty(fields[index.lastName]);
	const firstName = nullIfEmpty(fields[index.firstName]);
	const postcode = nullIfEmpty(fields[index.postcode]);
	if (!lastName || !firstName || !postcode || !/^\d{5}$/.test(postcode)) return "invalid";
	const billingSector = nullIfEmpty(fields[index.billingSector]);
	const optionCode = nullIfEmpty(fields[index.optionCode]);
	return [
		lineNo,
		lastName,
		firstName,
		specialtyCode,
		postcode,
		nullIfEmpty(fields[index.city]),
		nullIfEmpty(fields[index.carteVitale]),
		nullIfEmpty(fields[index.apcv]),
		billingSector && /^[0-3]$/.test(billingSector) ? billingSector : null,
		optionCode && /^[34]$/.test(optionCode) ? optionCode : null,
	];
}

export async function loadAmeli(
	sql: Sql,
	path: string,
	quarantine: Quarantine,
): Promise<{ lines: number; rows: number; invalid: number }> {
	const writer = await openCopy(sql, "directory.stg_ameli", STG_AMELI_COLUMNS);
	let index: Index | null = null;
	let lines = 0;
	let rows = 0;
	let invalid = 0;
	try {
		for await (const { lineNo, fields } of readQuotedRecords(path, ";")) {
			if (index === null) {
				index = mapColumns("ameli", fields, AMELI_COLUMNS);
				continue;
			}
			lines++;
			const row = ameliRow(fields, index, lineNo);
			if (row === null) continue;
			if (row === "invalid") {
				invalid++;
				await quarantine.add("ameli", lineNo, "invalid_ameli_row", fields.join(";"));
				continue;
			}
			await writer.write(row);
			rows++;
		}
	} finally {
		await writer.end();
	}
	return { lines, rows, invalid };
}
