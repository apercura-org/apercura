/**
 * The addresses of medical institutions that the Ministry of the Interior's Information Centre
 * publishes from the single emergency contact centre's geographic information system ("VKCP
 * IĢIS – ārstniecības iestāžu adreses", data.gov.lv, CC0 1.0; maintained by the State Fire and
 * Rescue Service): one CSV line per place, with its name, its address written territory first
 * (`Valmieras nov., Valmiera, Jumaras iela 195`), the address register's codes and names of its
 * municipality, town, parish and village, its point (WGS 84), the medical institution's code and
 * branch code, the institution's legal name and its kind (`Ģimenes ārstu prakse`,
 * `Hospitalizācijas iestāde`, `Ārstniecības iestāde`, or none).
 */

import { clean } from "./names";
import { readVarCsv } from "./places";

export type VkcpKind = "gp" | "hospital" | "institution" | "other";

export type VkcpAddress = {
	lineNo: number;
	/** The list's own id of the line (`ID`): the key of a hospital's page and of every site. */
	id: string;
	/** The medical institution's code (nine digits), when given. */
	code: string | null;
	kind: VkcpKind;
	/** The place's name as the list writes it (`Vidzemes slimnīca, SIA`, `Parauga Ilze ĢĀP`). */
	name: string;
	street: string | null;
	/** The territories after the street, the Latvian way (`Valmiera, Valmieras nov.`). */
	locality: string;
	point: { longitude: number; latitude: number } | null;
};

export type VkcpList = {
	lines: number;
	addresses: VkcpAddress[];
	quarantined: { lineNo: number; reason: string; sample: string }[];
};

const KINDS: Readonly<Record<string, VkcpKind>> = {
	"ģimenes ārstu prakse": "gp",
	"hospitalizācijas iestāde": "hospital",
	"ārstniecības iestāde": "institution",
};

/** The columns read; a missing one fails the file. */
const COLUMNS = [
	"ID",
	"Nosaukums",
	"Adrese",
	"NovadaNosaukums",
	"PilsetasNosaukums",
	"PagastaNosaukums",
	"CiemaNosaukums",
	"lat",
	"long",
	"IestadesKods",
	"IestadesTips",
] as const;

const BOUNDS = { minLat: 55.6, maxLat: 58.1, minLng: 20.9, maxLng: 28.3 };

const point = (lat: string, lng: string) => {
	const latitude = Number(clean(lat));
	const longitude = Number(clean(lng));
	if (!clean(lat) || !clean(lng) || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
		return null;
	}
	if (
		latitude < BOUNDS.minLat ||
		latitude > BOUNDS.maxLat ||
		longitude < BOUNDS.minLng ||
		longitude > BOUNDS.maxLng
	) {
		return null;
	}
	return { longitude, latitude };
};

/**
 * The street of an address written territory first: the parts that name its municipality,
 * town, parish or village are dropped from its start (`Valmieras nov., Valmiera, Jumaras iela
 * 195` → `Jumaras iela 195`), and a village's name before a house's (`Daugmale Salnas` →
 * `Salnas`); a remark in brackets (`(AGRĀK: …)`) is dropped. Null when nothing is left.
 */
export function vkcpStreet(address: string, territories: readonly string[]): string | null {
	const names = territories.map((name) => clean(name).toLocaleLowerCase("lv")).filter(Boolean);
	const parts = clean(address.replace(/\([^)]*\)/g, " "))
		.split(",")
		.map((part) => clean(part))
		.filter(Boolean);
	while (parts.length > 0 && names.includes((parts[0] ?? "").toLocaleLowerCase("lv")))
		parts.shift();
	let street = parts.join(", ");
	for (const name of names) {
		if (street.toLocaleLowerCase("lv").startsWith(`${name} `))
			street = clean(street.slice(name.length));
	}
	return street || null;
}

/** Reads the list. Throws when its header lacks a column (another file, a changed format). */
export function parseVkcp(text: string): VkcpList {
	const records = readVarCsv(text);
	const header = Object.keys(records[0] ?? {});
	const missing = COLUMNS.filter((column) => !header.includes(column));
	if (records.length === 0 || missing.length > 0) {
		throw new Error(
			`not the list of medical institutions' addresses (missing ${missing.join(", ") || "rows"})`,
		);
	}
	const list: VkcpList = { lines: 0, addresses: [], quarantined: [] };
	records.forEach((record, index) => {
		const lineNo = index + 2;
		list.lines++;
		const id = clean(record.ID);
		const address = clean(record.Adrese);
		const name = clean(record.Nosaukums);
		if (!/^\d{1,9}$/.test(id) || !address || !name) {
			list.quarantined.push({ lineNo, reason: "no id, name or address", sample: id });
			return;
		}
		const rawCode = clean(record.IestadesKods).replace(/\s/g, "");
		const village = clean(record.CiemaNosaukums);
		const town = clean(record.PilsetasNosaukums);
		const parish = clean(record.PagastaNosaukums);
		const municipality = clean(record.NovadaNosaukums);
		list.addresses.push({
			lineNo,
			id: String(Number(id)),
			code: /^\d{1,9}$/.test(rawCode) ? rawCode.padStart(9, "0") : null,
			kind: KINDS[clean(record.IestadesTips).toLocaleLowerCase("lv")] ?? "other",
			name,
			street: vkcpStreet(address, [municipality, town, parish, village]),
			locality: [village || town, parish, municipality].filter(Boolean).join(", "),
			point: point(record.lat ?? "", record.long ?? ""),
		});
	});
	return list;
}
