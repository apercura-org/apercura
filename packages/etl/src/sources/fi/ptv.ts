/**
 * The Finnish Service Catalogue (Suomi.fi-palvelutietovaranto, PTV), read from its open API
 * (version 11, no key: "Tietoja voi hakea PTV:n OUT-rajapinnan kautta ilman erillistä
 * tunnistautumista tai käyttölupaa"; the data is CC0 1.0 on avoindata.suomi.fi).
 *
 * The catalogue holds every public service of Finland (schools, libraries, parks…): an import
 * takes its health care. The snapshot (`ptv.json`, written by {@link fetchPtvSnapshot}) holds
 * the services of the health care class (`P5`, "Terveydenhuolto, sairaanhoito sekä terveyden ja
 * hyvinvoinnin edistäminen", and its subclasses), the service locations (`ServiceLocation`
 * channels) they are given at, and the organisations that describe those locations, trimmed to
 * the fields the import reads: never a location's e-mail address or its descriptions.
 * {@link parsePtv} then keeps the locations of a public organiser where a health service is
 * given, and tells each one's kind from its services (`fiLocationKind`).
 */
import { writeFile } from "node:fs/promises";
import { fiPtvKey, toE164Fi } from "@apercura/core";
import {
	FI_HEALTH_CLASS,
	FI_PUBLIC_ORGANIZATION_TYPES,
	type FiService,
	fiLocationKind,
} from "@apercura/core/taxonomy";
import { USER_AGENT } from "../../lib/files";
import { inFinland, tm35finToWgs84 } from "./tm35fin";
import {
	emptyResult,
	FI_QUALIFICATION_SOURCES,
	type FiLocation,
	type FiQualification,
	type ParseResult,
	quarantine,
	skip,
} from "./types";

/** The catalogue's open API, version 11 (`ETL_FI_PTV_URL`). Version 11 is switched off in April 2027. */
export const DEFAULT_PTV_API = "https://api.palvelutietovaranto.suomi.fi/api/v11";

/** Requests to the catalogue at a time: polite to a public API, fast enough for a weekly run. */
export const PTV_CONCURRENCY = 4;

/** The format of `ptv.json`, read back by {@link parsePtv}. */
export const PTV_SNAPSHOT_FORMAT = "apercura-ptv-snapshot/1";

/**
 * The health care class of the catalogue's service classification (`ptvserclass2`, `P5`) and
 * its subclasses `P5.1` to `P5.20` (`P5.21`, food safety, is not care). The API's class query
 * answers for one class at a time, so each is asked.
 */
export const PTV_HEALTH_CLASSES: readonly string[] = [
	"P5",
	...Array.from({ length: 20 }, (_, index) => `P5.${index + 1}`),
].map((code) => `http://uri.suomi.fi/codelist/ptv/ptvserclass2/code/${code}`);

/** A request to the catalogue: answers within two minutes (a list of 100 takes about five seconds). */
const REQUEST_TIMEOUT_MS = 120_000;
/** Up to 100 ids per `list` request, the API's limit. */
const BATCH = 100;

type LanguageValue = { language?: string | null; value?: string | null; type?: string | null };

/** A service of the snapshot: its names, its classes and its linked channels. */
export type PtvService = {
	id: string;
	names: LanguageValue[];
	/** Codes of its service classes (`P5.1`, `P5.10`). */
	classes: string[];
	generalDescriptionId: string | null;
	channelIds: string[];
};

/** An organisation of the snapshot: its names and type (`Region`, `Municipality`, `SotePublic`…). */
export type PtvOrganization = {
	id: string;
	names: LanguageValue[];
	type: string | null;
	parentId: string | null;
};

/** A service location as the API gives it, trimmed to the fields the import reads. */
export type PtvChannel = {
	id: string;
	organizationId: string | null;
	names: LanguageValue[];
	addresses: unknown[];
	phoneNumbers: unknown[];
	services: { id: string; name: string | null }[];
	publishingStatus: string | null;
};

export type PtvSnapshot = {
	format: typeof PTV_SNAPSHOT_FORMAT;
	api: string;
	/** The day the snapshot was taken, in Helsinki (`YYYY-MM-DD`). */
	takenOn: string;
	services: PtvService[];
	organizations: PtvOrganization[];
	channels: PtvChannel[];
};

type Fetcher = (path: string) => Promise<unknown>;

/** A GET of the API with retries (a 503 is a load spike the API documents). */
function fetcher(base: string, counter: { requests: number }): Fetcher {
	return async (path) => {
		let lastError: unknown;
		for (let attempt = 1; attempt <= 5; attempt++) {
			counter.requests++;
			try {
				const response = await fetch(`${base}${path}`, {
					headers: { accept: "application/json", "user-agent": USER_AGENT },
					signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
				});
				if (!response.ok) throw new Error(`GET ${path} answered ${response.status}`);
				return await response.json();
			} catch (error) {
				lastError = error;
				if (attempt < 5) await new Promise((resolve) => setTimeout(resolve, 2_000 * attempt));
			}
		}
		throw new Error(`GET ${base}${path} failed after 5 attempts`, { cause: lastError });
	};
}

/** Runs `work` over `items`, `concurrency` at a time, in order of the results. */
async function pool<T, R>(
	items: readonly T[],
	concurrency: number,
	work: (item: T) => Promise<R>,
): Promise<R[]> {
	const results: R[] = new Array(items.length);
	let next = 0;
	const worker = async () => {
		while (next < items.length) {
			const index = next++;
			results[index] = await work(items[index] as T);
		}
	};
	await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
	return results;
}

const chunks = <T>(items: readonly T[], size: number): T[][] => {
	const out: T[][] = [];
	for (let index = 0; index < items.length; index += size)
		out.push(items.slice(index, index + size));
	return out;
};

const record = (value: unknown): Record<string, unknown> =>
	value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
const array = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const text = (value: unknown): string | null =>
	typeof value === "string" && value.trim() ? value.trim() : null;

/** The code of a service class (`…/ptvserclass2/code/P5.10` → `P5.10`). */
export function serviceClassCode(item: unknown): string | null {
	const entry = record(item);
	const code = text(entry.code);
	if (code) return code;
	const uri = text(entry.uri);
	return uri ? (uri.split("/").at(-1) ?? null) : null;
}

/** True for a code of the health care class (`P5`, `P5.1` … `P5.20`; not `P5.21`, food safety). */
export const isHealthClass = (code: string | null): boolean =>
	code !== null && FI_HEALTH_CLASS.test(code);

const names = (value: unknown): LanguageValue[] =>
	array(value).map((item) => {
		const entry = record(item);
		return { language: text(entry.language), value: text(entry.value), type: text(entry.type) };
	});

/** A service of the API, trimmed. */
function trimService(raw: unknown): PtvService | null {
	const service = record(raw);
	const id = text(service.id);
	if (!id) return null;
	return {
		id,
		names: names(service.serviceNames),
		classes: array(service.serviceClasses)
			.map(serviceClassCode)
			.filter((code): code is string => code !== null),
		generalDescriptionId: text(service.generalDescriptionId),
		channelIds: array(service.serviceChannels)
			.map((link) => text(record(record(link).serviceChannel).id))
			.filter((channel): channel is string => channel !== null),
	};
}

/** A service location of the API, trimmed: no e-mail, no description, no opening hours. */
function trimChannel(raw: unknown): PtvChannel | null {
	const channel = record(raw);
	const id = text(channel.id);
	if (!id || channel.serviceChannelType !== "ServiceLocation") return null;
	return {
		id,
		organizationId: text(channel.organizationId),
		names: names(channel.serviceChannelNames),
		addresses: array(channel.addresses).map((address) => {
			const entry = record(address);
			return {
				type: entry.type ?? null,
				subType: entry.subType ?? null,
				country: entry.country ?? null,
				streetAddress: entry.streetAddress ?? null,
			};
		}),
		phoneNumbers: array(channel.phoneNumbers).map((phone) => {
			const entry = record(phone);
			return {
				type: entry.type ?? null,
				prefixNumber: entry.prefixNumber ?? null,
				number: entry.number ?? null,
				isFinnishServiceNumber: entry.isFinnishServiceNumber ?? null,
				serviceChargeType: entry.serviceChargeType ?? null,
				language: entry.language ?? null,
			};
		}),
		services: array(channel.services)
			.map((link) => record(record(link).service))
			.map((service) => ({ id: text(service.id) ?? "", name: text(service.name) }))
			.filter((service) => service.id),
		publishingStatus: text(channel.publishingStatus),
	};
}

/** An organisation of the API, trimmed to its names and type. */
function trimOrganization(raw: unknown): PtvOrganization | null {
	const organization = record(raw);
	const id = text(organization.id);
	if (!id) return null;
	return {
		id,
		names: names(organization.organizationNames),
		type: text(organization.organizationType),
		parentId: text(organization.parentOrganizationId),
	};
}

export type PtvFetchStats = {
	services: number;
	channels: number;
	organizations: number;
	requests: number;
};

/**
 * Takes the snapshot: the ids of the health care class's services (paged), their details (100
 * a request), the service locations they link (100 a request) and those locations'
 * organisations, written to `path` as one JSON document. Throws when the API cannot be read.
 */
export async function fetchPtvSnapshot(
	base: string,
	path: string,
	{
		concurrency = PTV_CONCURRENCY,
		today,
		log = () => {},
	}: { concurrency?: number; today: string; log?: (message: string) => void },
): Promise<PtvFetchStats> {
	const counter = { requests: 0 };
	const get = fetcher(base.replace(/\/+$/, ""), counter);
	const classPage = async (uri: string, page: number) =>
		record(await get(`/Service/serviceClass?uri=${encodeURIComponent(uri)}&page=${page}`));
	const pages = (
		await pool(PTV_HEALTH_CLASSES, concurrency, async (uri) => {
			const first = await classPage(uri, 1);
			const pageCount = Number(first.pageCount ?? 1);
			if (!Number.isInteger(pageCount) || pageCount < 1 || pageCount > 100) {
				throw new Error(`the class ${uri} has ${String(first.pageCount)} pages`);
			}
			const rest = [];
			for (let page = 2; page <= pageCount; page++) rest.push(await classPage(uri, page));
			return [first, ...rest];
		})
	).flat();
	const serviceIds = [
		...new Set(
			pages.flatMap((page) =>
				array(page.itemList)
					.map((item) => text(record(item).id))
					.filter((id): id is string => id !== null),
			),
		),
	];
	log(`ptv: ${serviceIds.length} services in the health care classes`);
	const serviceLists = await pool(chunks(serviceIds, BATCH), concurrency, async (ids) =>
		array(await get(`/Service/list?guids=${ids.join(",")}`)),
	);
	const services = serviceLists
		.flat()
		.map(trimService)
		.filter((service): service is PtvService => service !== null)
		.filter((service) => service.classes.some(isHealthClass));
	const channelIds = [...new Set(services.flatMap((service) => service.channelIds))];
	log(`ptv: ${services.length} health services link ${channelIds.length} channels`);
	const channelLists = await pool(chunks(channelIds, BATCH), concurrency, async (ids) =>
		array(await get(`/ServiceChannel/list?guids=${ids.join(",")}`)),
	);
	const channels = channelLists
		.flat()
		.map(trimChannel)
		.filter((channel): channel is PtvChannel => channel !== null);
	const organizationIds = [
		...new Set(
			channels.map((channel) => channel.organizationId).filter((id): id is string => id !== null),
		),
	];
	const organizationLists = await pool(chunks(organizationIds, BATCH), concurrency, async (ids) =>
		array(await get(`/Organization/list?guids=${ids.join(",")}`)),
	);
	const organizations = organizationLists
		.flat()
		.map(trimOrganization)
		.filter((organization): organization is PtvOrganization => organization !== null);
	const snapshot: PtvSnapshot = {
		format: PTV_SNAPSHOT_FORMAT,
		api: base,
		takenOn: today,
		services: services.sort((a, b) => a.id.localeCompare(b.id)),
		organizations: organizations.sort((a, b) => a.id.localeCompare(b.id)),
		channels: channels.sort((a, b) => a.id.localeCompare(b.id)),
	};
	await writeFile(path, `${JSON.stringify(snapshot)}\n`);
	return {
		services: services.length,
		channels: channels.length,
		organizations: organizations.length,
		requests: counter.requests,
	};
}

// ---------------------------------------------------------------------------
// Reading the snapshot
// ---------------------------------------------------------------------------

/** A value in the language asked for, else Finnish, Swedish, then any (`type` filters names). */
function inLanguage(values: readonly LanguageValue[], type: string | null = null): string | null {
	const usable = values.filter((item) => item.value && (type === null || item.type === type));
	for (const language of ["fi", "sv", "en"]) {
		const found = usable.find((item) => item.language === language);
		if (found?.value) return clean(found.value);
	}
	return usable[0]?.value ? clean(usable[0].value) : null;
}

/** Collapses whitespace and trims. */
export const clean = (value: string | null | undefined) =>
	(value ?? "").replace(/\s+/g, " ").trim();

/** True when the text has letters and none of them is lower-case. */
const allCapitals = (value: string) => /\p{Lu}/u.test(value) && !/\p{Ll}/u.test(value);

/** A post office in capitals re-cased (`LAPUA` → `Lapua`, `ETELÄ-POHJANMAA` → `Etelä-Pohjanmaa`). */
export function postOfficeName(raw: string | null): string | null {
	const value = clean(raw);
	if (!value) return null;
	if (!allCapitals(value)) return value;
	return value
		.split(" ")
		.map((word) =>
			word
				.split("-")
				.map((part) => (part ? `${part.charAt(0)}${part.slice(1).toLocaleLowerCase("fi")}` : part))
				.join("-"),
		)
		.join(" ");
}

/** The street address of a location: its `Location` address in Finland (`Visiting` too), first. */
function visitingAddress(addresses: readonly unknown[]): Record<string, unknown> | null {
	const entries = addresses.map(record);
	const location =
		entries.find((entry) => entry.type === "Location" && record(entry.streetAddress).street) ??
		entries.find((entry) => record(entry.streetAddress).street) ??
		null;
	return location;
}

/** The phone numbers of a location that a patient may call: no fax, no premium service number. */
function phoneOf(phones: readonly unknown[]): { e164: string | null; invalid: boolean } {
	let invalid = false;
	for (const raw of phones.map(record)) {
		if (raw.type && raw.type !== "Phone") continue;
		// A premium-rate service number ("Chargeable" with its own tariff) is shown neither.
		if (raw.serviceChargeType === "Other") continue;
		const number = text(raw.number);
		if (!number) continue;
		const prefix = text(raw.prefixNumber);
		const e164 = toE164Fi(
			prefix && !number.startsWith("+") ? `${prefix}${number.replace(/^0/, "")}` : number,
		);
		if (e164) return { e164, invalid: false };
		invalid = true;
	}
	return { e164: null, invalid };
}

/**
 * Reads a snapshot (`ptv.json`): one row per service location of a public organiser where at
 * least one health service is given and whose kind its name or services tell (`fiLocationKind`),
 * in Finland, published, with a name and a municipality. Throws when the file is not a snapshot.
 */
export function parsePtv(data: Buffer): ParseResult {
	const snapshot = JSON.parse(data.toString("utf8")) as Partial<PtvSnapshot>;
	if (snapshot.format !== PTV_SNAPSHOT_FORMAT || !Array.isArray(snapshot.channels)) {
		throw new Error(`not a ${PTV_SNAPSHOT_FORMAT} file`);
	}
	const result = emptyResult("ptv");
	const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(snapshot.takenOn ?? "");
	result.edition = day ? Number(`${day[1]}${day[2]}${day[3]}`) : null;
	const services = new Map((snapshot.services ?? []).map((service) => [service.id, service]));
	const organizations = new Map(
		(snapshot.organizations ?? []).map((organization) => [organization.id, organization]),
	);
	const rows: FiLocation[] = [];
	const seen = new Set<string>();
	snapshot.channels.forEach((channel, index) => {
		const lineNo = index + 1;
		result.lines++;
		const key = fiPtvKey(channel.id ?? "");
		if (!key) {
			quarantine(result, lineNo, "id", String(channel.id ?? ""));
			return;
		}
		if (seen.has(key)) {
			skip(result, "duplicate");
			return;
		}
		seen.add(key);
		if (channel.publishingStatus && channel.publishingStatus !== "Published") {
			skip(result, "unpublished");
			return;
		}
		const organization = channel.organizationId ? organizations.get(channel.organizationId) : null;
		if (!organization?.type || !FI_PUBLIC_ORGANIZATION_TYPES.has(organization.type)) {
			skip(
				result,
				organization?.type ? `organisation:${organization.type}` : "organisation:unknown",
			);
			return;
		}
		const linked = channel.services
			.map((link) => services.get(link.id))
			.filter((service): service is PtvService => service !== undefined);
		const name = inLanguage(channel.names, "Name") ?? inLanguage(channel.names);
		if (!name) {
			quarantine(result, lineNo, "name", key);
			return;
		}
		const kindServices: FiService[] = linked.map((service) => ({
			classes: service.classes,
			name: inLanguage(service.names, "Name") ?? inLanguage(service.names),
		}));
		// Its names in Finnish and Swedish: a bilingual organiser may name a location in one only.
		const allNames = channel.names
			.filter((item) => item.value && (item.type === "Name" || !item.type))
			.map((item) => clean(item.value));
		const kind = fiLocationKind(allNames.length > 0 ? allNames : [name], kindServices);
		if (!kind) {
			skip(result, linked.length === 0 ? "no health service" : "no kind");
			return;
		}
		const address = visitingAddress(channel.addresses);
		const street = record(address?.streetAddress);
		if (!address) {
			skip(result, "no address");
			return;
		}
		if (address.country && address.country !== "FI") {
			skip(result, "abroad");
			return;
		}
		const municipality = text(record(street.municipality).code);
		if (!municipality || !/^\d{3}$/.test(municipality)) {
			quarantine(result, lineNo, "municipality", key);
			return;
		}
		const streetName = inLanguage(names(street.street));
		const number = text(street.streetNumber);
		const postcode = text(street.postalCode);
		const postOffice = postOfficeName(inLanguage(names(street.postOffice)));
		let point = null as { longitude: number; latitude: number } | null;
		if (street.coordinateState === "Ok" || street.coordinateState === "EnteredByUser") {
			const converted = tm35finToWgs84(Number(street.latitude), Number(street.longitude));
			point = converted && inFinland(converted) ? converted : null;
		}
		if (!point) result.counters.withoutPoint++;
		const phone = phoneOf(channel.phoneNumbers);
		if (phone.invalid) result.counters.invalidPhones++;
		const qualifications: FiQualification[] = [];
		const seenServices = new Set<string>();
		for (const service of linked) {
			if (!service.classes.some(isHealthClass)) continue;
			const label = inLanguage(service.names, "Name") ?? inLanguage(service.names);
			if (!label || seenServices.has(label.toLocaleLowerCase("fi"))) continue;
			seenServices.add(label.toLocaleLowerCase("fi"));
			qualifications.push({
				source: FI_QUALIFICATION_SOURCES.service,
				code: fiPtvKey(service.id) ?? service.id,
				label,
			});
		}
		const organiser = inLanguage(organization.names, "Name") ?? inLanguage(organization.names);
		if (organiser) {
			qualifications.push({
				source: FI_QUALIFICATION_SOURCES.organiser,
				code: fiPtvKey(organization.id) ?? organization.id,
				label: organiser,
			});
		}
		rows.push({
			source: "ptv",
			lineNo,
			nationalId: key,
			professionCode: kind,
			name,
			street: streetName ? [streetName, number].filter(Boolean).join(" ") : null,
			postcode: postcode && /^\d{5}$/.test(postcode) ? postcode : null,
			city: postOffice,
			municipality,
			longitude: point ? Math.round(point.longitude * 1e6) / 1e6 : null,
			latitude: point ? Math.round(point.latitude * 1e6) / 1e6 : null,
			phone: phone.e164,
			qualifications,
		});
	});
	result.rows = rows;
	return result;
}
