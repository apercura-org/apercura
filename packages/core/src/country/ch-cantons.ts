/**
 * The 26 cantons of Switzerland: their official abbreviation (the code the FOPH's figures and
 * the cantons' lists print, `ZH`), their number in the Federal Statistical Office's register
 * (`1`–`26`, the order of the Federal Constitution, art. 1) and their official name as
 * swissBOUNDARIES3D gives it, in the canton's own language or languages. A canton is a region of
 * the directory (`region_code` = the abbreviation); its districts are departments, its communes
 * communes.
 */
export const CH_CANTONS: Readonly<Record<string, { number: number; name: string }>> = {
	ZH: { number: 1, name: "Zürich" },
	BE: { number: 2, name: "Bern / Berne" },
	LU: { number: 3, name: "Luzern" },
	UR: { number: 4, name: "Uri" },
	SZ: { number: 5, name: "Schwyz" },
	OW: { number: 6, name: "Obwalden" },
	NW: { number: 7, name: "Nidwalden" },
	GL: { number: 8, name: "Glarus" },
	ZG: { number: 9, name: "Zug" },
	FR: { number: 10, name: "Fribourg / Freiburg" },
	SO: { number: 11, name: "Solothurn" },
	BS: { number: 12, name: "Basel-Stadt" },
	BL: { number: 13, name: "Basel-Landschaft" },
	SH: { number: 14, name: "Schaffhausen" },
	AR: { number: 15, name: "Appenzell Ausserrhoden" },
	AI: { number: 16, name: "Appenzell Innerrhoden" },
	SG: { number: 17, name: "St. Gallen" },
	GR: { number: 18, name: "Graubünden / Grigioni / Grischun" },
	AG: { number: 19, name: "Aargau" },
	TG: { number: 20, name: "Thurgau" },
	TI: { number: 21, name: "Ticino" },
	VD: { number: 22, name: "Vaud" },
	VS: { number: 23, name: "Valais / Wallis" },
	NE: { number: 24, name: "Neuchâtel" },
	GE: { number: 25, name: "Genève" },
	JU: { number: 26, name: "Jura" },
};

/** The abbreviation of a canton by its BFS number (`1` → `ZH`), or null. */
export function chCantonOfNumber(value: number | string): string | null {
	const number = Number(value);
	for (const [code, canton] of Object.entries(CH_CANTONS)) {
		if (canton.number === number) return code;
	}
	return null;
}
