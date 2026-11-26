/**
 * Names and addresses of the Spanish register as printed on the pages.
 *
 * REGCESS writes every name and street in capitals, mostly without accents (`CLINICA DENTAL
 * SONRISA`, `CENTRO DE SALUD DE ALBATERA`): `titleCaseEs` gives them the case Spanish writes
 * names in (`Clinica Dental Sonrisa`, `Centro de Salud de Albatera`), with the particles in
 * lowercase (`de`, `del`, `la`, `y`, Catalan `i`, `d'`, `l'`), company forms, initials and
 * Roman numerals in capitals (`S.L.`, `SLU`, `C.S.`, `II`) and the titles cased (`Dr.`,
 * `Dra.`). No accent is added: what the register does not write is not guessed. A name already
 * in mixed case is kept as published.
 *
 * A street is the register's type of way (`CALLE`, `AVDA`, `CTRA`…), name and number, written
 * `Calle Alcala, 10`, `Avenida de America, s/n`.
 */

/** Words printed in lowercase inside a name, except at its start. */
const LOWERCASE = new Set([
	"de",
	"del",
	"la",
	"las",
	"los",
	"el",
	"y",
	"e",
	"en",
	"a",
	"al",
	"i",
	"o",
	"u",
	"con",
	"por",
	"para",
	"sin",
	"sobre",
	"da",
	"das",
	"do",
	"dos",
	"les",
	"els",
	"per",
]);

/** Words kept in capitals: company forms, acronyms of the health services, Roman numerals. */
const UPPERCASE = new Set([
	"SL",
	"SLU",
	"SLL",
	"SLP",
	"SA",
	"SAU",
	"SC",
	"SCP",
	"CB",
	"SCOOP",
	"UTE",
	"AIE",
	"ONG",
	"ONCE",
	"SAS",
	"SERMAS",
	"SESCAM",
	"SACYL",
	"SERGAS",
	"OSAKIDETZA",
	"ICS",
	"IB",
	"CAP",
	"CUAP",
	"CAR",
	"CAD",
	"CEP",
	"CS",
	"CSM",
	"CL",
	"PAC",
	"SUAP",
	"SUE",
	"UVI",
	"UCI",
	"UBS",
	"ORL",
	"ATS",
	"DUE",
	"FIV",
	"TAC",
	"RM",
	"RX",
	"II",
	"III",
	"IV",
	"VI",
	"VII",
	"VIII",
	"IX",
	"XI",
	"XII",
	"XIII",
	"XIV",
	"XV",
	"XX",
	"XXI",
]);

/** Abbreviated titles and their written forms. */
const TITLES: Readonly<Record<string, string>> = {
	"DR.": "Dr.",
	"DRA.": "Dra.",
	DR: "Dr.",
	DRA: "Dra.",
	"DRES.": "Dres.",
	"DRAS.": "Dras.",
	"STA.": "Sta.",
	"STO.": "Sto.",
	SAN: "San",
	"NTRA.": "Ntra.",
	"SRA.": "Sra.",
	"SR.": "Sr.",
};

/** Mojibake of the register's export (`NÃ?Âº`, `NÂº`) for the ordinal sign. */
const MOJIBAKE = /Ã\??Â[º°]|Â[º°]/g;

const capitalise = (word: string) =>
	word.length === 0 ? word : word.charAt(0).toLocaleUpperCase("es") + word.slice(1);

/** One word of a name in capitals, cased. */
function caseWord(word: string, first: boolean): string {
	if (word === "") return word;
	const upper = word.toLocaleUpperCase("es");
	const title = TITLES[upper];
	if (title) return title;
	const bare = upper.replace(/[.,;:()"«»]/g, "");
	// Initials and dotted abbreviations (`S.L.`, `C.S.`, `U.B.`): kept.
	if (/^(?:[A-ZÑÇ]\.){1,4}[A-ZÑÇ]?\.?$/.test(upper) && bare.length <= 4) return upper;
	if (UPPERCASE.has(bare)) return upper;
	// Elisions: `D'ALBA` → `d'Alba`, `L'HOSPITALET` → `l'Hospitalet` (`L'` first: `L'Hospitalet`).
	const elision = /^([DLdl])['’](.+)$/.exec(word);
	if (elision) {
		const article = (elision[1] ?? "").toLocaleLowerCase("es");
		const rest = caseWord(elision[2] ?? "", false);
		return `${first ? article.toLocaleUpperCase("es") : article}'${capitalise(rest)}`;
	}
	const lower = word.toLocaleLowerCase("es");
	if (!first && LOWERCASE.has(lower)) return lower;
	// Hyphenated (`ALICANTE-VALENCIA`) and slashed (`PAMPLONA/IRUÑA`) words: each part cased.
	if (/[-/]/.test(word)) {
		return word
			.split(/([-/])/)
			.map((part, index) => (part === "-" || part === "/" ? part : caseWord(part, index === 0)))
			.join("");
	}
	// A word with digits (`2ª`, `12B`, `C.NAL.`) keeps its letters lower after the first.
	return capitalise(lower);
}

/**
 * A name of the register in the case Spanish writes it. Mixed-case input is returned as
 * published (whitespace collapsed).
 */
export function titleCaseEs(value: string): string {
	const text = value.replace(MOJIBAKE, "º").replace(/\s+/g, " ").trim();
	if (!text) return text;
	if (text !== text.toLocaleUpperCase("es")) return text;
	return text
		.split(" ")
		.map((word, index) => caseWord(word, index === 0))
		.join(" ");
}

/** The register's types of way (`Código Tipo Vía`) and how they are written. */
export const ES_WAY_TYPES: Readonly<Record<string, string>> = {
	CALLE: "Calle",
	CL: "Calle",
	C: "Calle",
	AVDA: "Avenida",
	AV: "Avenida",
	PLAZA: "Plaza",
	PZA: "Plaza",
	PASEO: "Paseo",
	CTRA: "Carretera",
	POLIG: "Polígono",
	RONDA: "Ronda",
	LUGAR: "Lugar",
	CMNO: "Camino",
	RBLA: "Rambla",
	BARRO: "Barrio",
	PSAJE: "Pasaje",
	TRVA: "Travesía",
	VIA: "Vía",
	GV: "Gran Vía",
	URB: "Urbanización",
	ALAM: "Alameda",
	PQUE: "Parque",
	GTA: "Glorieta",
	TRVAL: "Transversal",
	PRAJE: "Paraje",
	SECT: "Sector",
	CUSTA: "Cuesta",
	BARDA: "Barriada",
	PRAZA: "Praza",
	GRUPO: "Grupo",
	PTDA: "Partida",
	PBDO: "Poblado",
	BULEV: "Bulevar",
	RBRA: "Ribera",
	BLQUE: "Bloque",
	ARRAL: "Arrabal",
	ALDEA: "Aldea",
	CLLON: "Callejón",
	PROL: "Prolongación",
	PLCET: "Placeta",
	CRRIL: "Carril",
	BJADA: "Bajada",
	CRA: "Carrera",
	JDIN: "Jardín",
	CSRIO: "Caserío",
	CLLJA: "Calleja",
	FINCA: "Finca",
	VREDA: "Vereda",
	PLZLA: "Plazuela",
	TRRNT: "Torrente",
	TRAS: "Trasera",
	CZADA: "Calzada",
	ACCES: "Acceso",
	ESTDA: "Estrada",
	PNTE: "Puente",
	SENDA: "Senda",
	ANDAD: "Andador",
	MUELL: "Muelle",
	BRANC: "Barranco",
	RCDA: "Rinconada",
	SBIDA: "Subida",
	PZTA: "Plazoleta",
};

/**
 * The address line of a centre: the type of way, its name and the number (`Calle Alcala, 10`,
 * `Plaza Mayor, s/n`). An unknown type of way is left out rather than guessed; a name that
 * already starts with its type (`CALLE MAYOR`) is not doubled.
 */
export function esStreet(wayType: string, name: string, number: string): string | null {
	const street = titleCaseEs(name);
	if (!street) return null;
	const type = ES_WAY_TYPES[wayType.trim().toUpperCase()] ?? null;
	const startsWithType = type
		? street.toLocaleLowerCase("es").startsWith(`${type.toLocaleLowerCase("es")} `)
		: false;
	// After its type, a name's leading particle is lowercase (`Avenida de la Prueba`).
	const [head = "", ...rest] = street.split(" ");
	const inner = LOWERCASE.has(head.toLocaleLowerCase("es"))
		? [head.toLocaleLowerCase("es"), ...rest].join(" ")
		: street;
	const line = type && !startsWithType ? `${type} ${inner}` : street;
	const cleaned = number
		.replace(MOJIBAKE, "º")
		.replace(/\s+/g, " ")
		.replace(/^[\s,-]+|[\s,-]+$/g, "")
		.trim();
	if (!cleaned) return line;
	const written = /^S\/?N[º°]?$/i.test(cleaned) ? "s/n" : titleCaseEs(cleaned);
	return `${line}, ${written}`;
}
