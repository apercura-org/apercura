/**
 * Lithuania's licence register of health-care institutions (VASPVT, "Sveikatos priežiūros
 * įstaigų licencijų duomenys", data.gov.lt dataset 1623, CC BY 4.0, daily): six models of the
 * dataset read together.
 *
 * - `IstaigosVeiklosAdresas`: every activity address of a licensed institution, with the Address
 *   Register's code of the address and the address as free text: one page per address.
 * - `IstaigosPaslauga`: the services licensed at each address, under each licence;
 *   `PaslauguNustatymas` gives a service's mode, group, level and type, `Paslauga` its name.
 * - `Licencija`: whether a licence is current (no revocation date, not suspended), and the name
 *   it was issued under; `Istaiga`: the institution's registered name and legal form.
 *
 * An address with no service of a current licence is not a place of care today, and one whose
 * services make no kind (`ltKindOfServices`: public health only, ambulances, a pharmacist's
 * practice, tissue banks) is not a page. The legal entity code, the seat addresses and the
 * licence numbers are never asked for (`LT_VASPVT_MODELS`), so they cannot be stored.
 */
import { join } from "node:path";
import { isValidLtSourceId } from "@apercura/core";
import { type LtService, ltKindOfServices } from "@apercura/core/taxonomy";
import type { LtAddressIndex } from "./address";
import { isIndividualEnterprise, ltDisplayName, withoutPremises } from "./names";
import { readModel, readModelRows } from "./tables";
import {
	emptyResult,
	LT_VASPVT_MODELS,
	type LtServiceLabel,
	type LtVaspvtModel,
	type ParseResult,
	quarantine,
	skip,
	vaspvtFile,
} from "./types";

/**
 * Licence states (`Licencija.busena`): the manifest's enum names Sustabdyta, Išduota and
 * Panaikinta; the file writes `2`, `3`, `4`. `4` comes with a revocation date, `3` is the
 * licences in force; `2` (141 licences in November 2026, never with a revocation date) is read
 * as suspended (an assumption the dataset does not state), so not current.
 */
const SUSPENDED = "2";

const lower = (text: string) => text.toLocaleLowerCase("lt");

/** A page's key: the institution's number and the address code, or the address GUID's start. */
export function ltPageKey(institution: string, addressCode: string, guid: string): string | null {
	const code = addressCode.trim();
	const key = /^[1-9]\d{0,9}$/.test(code)
		? `${institution}-${code}`
		: `${institution}-v${guid.replace(/-/g, "").slice(0, 8).toLowerCase()}`;
	return isValidLtSourceId(key) ? key : null;
}

type Licence = {
	institution: string;
	live: boolean;
	suspended: boolean;
	issued: string;
	name: string;
};

type Address = {
	lineNo: number;
	guid: string;
	addressCode: string;
	text: string;
	institution: string;
};

/** Reads the six models from `dir` (the run's downloads, or `--source-dir`). */
export async function parseVaspvt(dir: string, index: LtAddressIndex): Promise<ParseResult> {
	const path = (model: LtVaspvtModel) => join(dir, vaspvtFile(model));
	const read = (model: LtVaspvtModel) =>
		readModelRows(path(model), vaspvtFile(model), LT_VASPVT_MODELS[model]);

	const result = emptyResult();
	const serviceNames = new Map<string, string>();
	for (const row of await read("Paslauga")) {
		if (row.paslaugos_id) serviceNames.set(row.paslaugos_id, row.pavadinimas ?? "");
	}
	const settings = new Map<string, LtService & { serviceId: string }>();
	for (const row of await read("PaslauguNustatymas")) {
		const id = row.paslaugos_nustatymo_id;
		if (!id || !row.paslaugos_id) continue;
		settings.set(id, {
			mode: row.paslaugos_budas ?? "",
			group: row.paslaugos_grupes_id ?? "",
			level: row.paslaugos_lygio_id ?? "",
			type: row.paslaugos_tipo_id ?? "",
			name: (serviceNames.get(row.paslaugos_id) ?? "").replace(/\s+/g, " ").trim(),
			serviceId: row.paslaugos_id,
		});
	}
	const licences = new Map<string, Licence>();
	for (const row of await read("Licencija")) {
		if (!row.licencijos_id || !row.istaiga) continue;
		const suspended = row.busena === SUSPENDED;
		licences.set(row.licencijos_id, {
			institution: row.istaiga,
			live: !row.panaikinimo_data && !suspended,
			suspended: !row.panaikinimo_data && suspended,
			issued: row.sudarymo_data ?? "",
			name: row.ja_pavadinimas ?? "",
		});
	}
	// The name an institution without an `Istaiga` row goes by: its newest current licence's.
	const licenceNames = new Map<string, { issued: string; name: string }>();
	for (const licence of licences.values()) {
		if (!licence.live || !licence.name) continue;
		const known = licenceNames.get(licence.institution);
		if (!known || licence.issued > known.issued) {
			licenceNames.set(licence.institution, { issued: licence.issued, name: licence.name });
		}
	}
	const institutions = new Map<string, { name: string; legalForm: string | null }>();
	for (const row of await read("Istaiga")) {
		if (row.spi_id && row.ja_pavadinimas) {
			institutions.set(row.spi_id, {
				name: row.ja_pavadinimas,
				legalForm: row.teisine_forma || null,
			});
		}
	}

	const addresses: Address[] = [];
	for await (const { lineNo, row } of readModel(
		path("IstaigosVeiklosAdresas"),
		vaspvtFile("IstaigosVeiklosAdresas"),
		LT_VASPVT_MODELS.IstaigosVeiklosAdresas,
	)) {
		result.lines++;
		addresses.push({
			lineNo,
			guid: row.spi_veiklos_adreso_id ?? "",
			addressCode: row.adreso_id ?? "",
			text: row.adresas ?? "",
			institution: row.istaiga ?? "",
		});
	}

	// The services of current licences at each address (and whether a suspended one has some).
	const live = new Map<string, Set<string>>();
	const suspendedAt = new Set<string>();
	for await (const { row } of readModel(
		path("IstaigosPaslauga"),
		vaspvtFile("IstaigosPaslauga"),
		LT_VASPVT_MODELS.IstaigosPaslauga,
	)) {
		const licence = licences.get(row.licenzija ?? "");
		const address = row.veiklos_adresas ?? "";
		if (!licence || !address || !row.nustatymas) continue;
		if (licence.live) {
			const set = live.get(address) ?? new Set<string>();
			set.add(row.nustatymas);
			live.set(address, set);
		} else if (licence.suspended) suspendedAt.add(address);
	}

	// One page per key: an institution listing one address code twice is one page.
	type Group = { first: Address; settings: Set<string> };
	const groups = new Map<string, Group>();
	for (const address of addresses) {
		const services = live.get(address.guid);
		if (!services || services.size === 0) {
			skip(result, suspendedAt.has(address.guid) ? "licence suspended" : "no current licence");
			continue;
		}
		if (!/^[1-9]\d{0,6}$/.test(address.institution)) {
			quarantine(result, address.lineNo, "institution number", address.guid);
			continue;
		}
		const key = ltPageKey(address.institution, address.addressCode, address.guid);
		if (!key) {
			quarantine(result, address.lineNo, "page key", address.guid);
			continue;
		}
		const group = groups.get(key);
		if (group) {
			result.counters.mergedDuplicates++;
			for (const setting of services) group.settings.add(setting);
		} else groups.set(key, { first: address, settings: new Set(services) });
	}

	for (const [key, group] of groups) {
		const services = [...group.settings]
			.map((id) => settings.get(id))
			.filter((service): service is LtService & { serviceId: string } => Boolean(service));
		const professionCode = ltKindOfServices(services);
		if (!professionCode) {
			skip(result, "not a place of care");
			continue;
		}
		const institution = institutions.get(group.first.institution);
		const registered = institution?.name ?? licenceNames.get(group.first.institution)?.name;
		if (!registered) {
			quarantine(result, group.first.lineNo, "no name", key);
			continue;
		}
		if (!institution) result.counters.namesFromLicence++;
		const placed = index.place(group.first.text);
		if (!placed) {
			quarantine(result, group.first.lineNo, "municipality unknown", key);
			continue;
		}
		const display = ltDisplayName(registered);
		if (display.abbreviated) result.counters.namesAbbreviated++;
		let street = placed.street;
		if (isIndividualEnterprise(institution?.legalForm ?? null, registered)) {
			result.counters.individualEnterprises++;
			const short = street ? withoutPremises(street) : null;
			if (short) {
				street = short;
				result.counters.premisesDropped++;
			}
		}
		if (placed.settlement) result.counters.inSettlement++;
		else result.counters.inMunicipality++;
		const labels = new Map<string, LtServiceLabel>();
		for (const service of services) {
			if (service.name && !labels.has(service.serviceId)) {
				labels.set(service.serviceId, { code: service.serviceId, label: service.name });
			}
		}
		result.rows.push({
			nationalId: key,
			professionCode,
			name: display.name,
			services: [...labels.values()].sort(
				(a, b) =>
					lower(a.label).localeCompare(lower(b.label), "lt") || a.code.localeCompare(b.code),
			),
			street,
			postcode: placed.postcode,
			city: placed.settlement?.name ?? `${placed.municipality.name} savivaldybė`,
			settlementCode: placed.settlement?.code ?? null,
			municipalityCode: placed.municipality.code,
		});
	}
	return result;
}
