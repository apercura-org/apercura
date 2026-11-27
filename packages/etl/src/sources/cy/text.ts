/**
 * Reading the Cypriot lists: the CSV files data.gov.cy publishes (UTF-8 with a byte order mark,
 * comma-separated, quoted fields that may hold a line break) and the Greek names they write,
 * compared without case, accents or inflection.
 */
import { parseQuotedRecord } from "../../lib/text";

/** The records of a CSV file, its header first, a record per row (quoted line breaks joined). */
export function csvRecords(data: Buffer): { lineNo: number; fields: string[] }[] {
	const text = new TextDecoder("utf-8", { fatal: true }).decode(data).replace(/^\uFEFF/, "");
	const records: { lineNo: number; fields: string[] }[] = [];
	let pending: string | null = null;
	let start = 0;
	const lines = text.split(/\r?\n/);
	lines.forEach((line, index) => {
		const input: string = pending === null ? line : `${pending}\n${line}`;
		if (pending === null) start = index + 1;
		const fields = parseQuotedRecord(input, ",");
		if (fields === null) {
			pending = input;
			return;
		}
		pending = null;
		if (fields.every((field) => field.trim() === "")) return;
		records.push({ lineNo: start, fields });
	});
	if (pending !== null) throw new Error(`a quoted field opened on line ${start} never closes`);
	return records;
}

/**
 * The index of each column the parser reads, by its header (case and spacing forgiven). Only
 * the columns asked for are mapped: the others are never read. Throws when one is missing.
 */
export function columnsOf<Key extends string>(
	header: readonly string[],
	wanted: Readonly<Record<Key, readonly string[]>>,
	file: string,
): Record<Key, number> {
	const normalized = header.map((name) => name.replace(/\s+/g, " ").trim().toLowerCase());
	const indexes = {} as Record<Key, number>;
	const missing: string[] = [];
	for (const [key, names] of Object.entries(wanted) as [Key, readonly string[]][]) {
		const wishes = new Set(names.map((name) => name.replace(/\s+/g, " ").trim().toLowerCase()));
		const index = normalized.findIndex((name) => wishes.has(name));
		if (index < 0) missing.push(names[0] ?? key);
		else indexes[key] = index;
	}
	if (missing.length > 0) throw new Error(`not the ${file}: no column ${missing.join(", ")}`);
	return indexes;
}

/** Whitespace collapsed and trimmed; `undefined` reads as empty. */
export function clean(value: string | undefined): string {
	return (value ?? "").replace(/\s+/g, " ").trim();
}

/**
 * The key a Greek name is compared by: lowercase, without accents or diaeresis, final sigma as
 * sigma, Latin look-alikes in a Greek word read as Greek (`Χοιροκoιτία` with a Latin o), and
 * anything but letters and digits a single space (`Σούνι-Ζανακιά` → `σουνι ζανακια`).
 */
export function nameKey(value: string): string {
	return value
		.normalize("NFD")
		.replace(/\p{Mark}/gu, "")
		.toLowerCase()
		.replace(/ς/g, "σ")
		.replace(/[a-z]/g, (char) => LOOKALIKES[char] ?? char)
		.replace(/[^\p{L}\p{N}]+/gu, " ")
		.trim();
}

/** Latin letters typed for their Greek twins inside Greek words. */
const LOOKALIKES: Record<string, string> = {
	a: "α",
	e: "ε",
	i: "ι",
	k: "κ",
	o: "ο",
	t: "τ",
	y: "υ",
	x: "χ",
	h: "η",
	n: "ν",
	m: "μ",
	p: "ρ",
	b: "β",
};

/**
 * A Greek word as it sounds, without its ending: the digraphs and letters that read alike
 * written alike (`ει`, `οι`, `η`, `υ` as `ι`; `ω` as `ο`; `αι` as `ε`), then the final vowels,
 * `σ` and a genitive plural's `ων` dropped (`Στροβόλου` and `Στρόβολος` → `στροβολ`,
 * `Λατσιών` and `Λατσιά` → `λατσ`, `Ορμήδειας` and `Ορμίδεια` → `ορμιδ`), so a name in the
 * genitive, as a health centre's name gives its place, meets the place's own name, whatever
 * its spelling. A word of three letters or fewer stays whole.
 */
export function stem(word: string): string {
	const key = nameKey(word);
	if (key.length <= 3) return key;
	let sound = key
		.replace(/ου/g, "0")
		.replace(/ει|οι|υι/g, "ι")
		.replace(/[ηυ]/g, "ι")
		.replace(/ω/g, "ο")
		.replace(/αι/g, "ε");
	for (let ending = /(?:ον|[αειο0σ])$/.exec(sound); ending && sound.length > 3; ) {
		sound = sound.slice(0, -ending[0].length);
		ending = /(?:ον|[αειο0σ])$/.exec(sound);
	}
	return sound;
}

/** The stems of a name's words (`Αγίας Νάπας` → `αγι ναπ`). */
export function stems(value: string): string[] {
	return nameKey(value)
		.split(" ")
		.filter((word) => word && !/^\d+$/.test(word))
		.map(stem);
}

/**
 * A street as a page prints it: whitespace collapsed, and a trailing part that only repeats the
 * town (`Αχυρώνα 2, Αυγόρου` in Αυγόρου → `Αχυρώνα 2`) or a comma dropped.
 */
export function cleanStreet(street: string, towns: readonly string[]): string {
	let parts = clean(street)
		.split(",")
		.map((part) => part.trim())
		.filter(Boolean);
	const keys = new Set(towns.filter(Boolean).map(nameKey));
	while (parts.length > 1 && keys.has(nameKey(parts.at(-1) ?? ""))) parts = parts.slice(0, -1);
	return parts.join(", ");
}
