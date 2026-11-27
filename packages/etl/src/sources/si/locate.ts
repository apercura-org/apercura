/**
 * Places a practice of the insurer's lists with the register's locator (`./places.ts`): its
 * settlement, hence its municipality, and its point, from the address as the list gives it (a
 * street and number, or a village and number, then the postcode and the post office). No
 * geocoder is called: the lists give no coordinates, and the register's streets and settlements
 * place every practice at street or settlement level. Pure functions, no I/O.
 */
import { caseLabel, foldLabel, foldWord, houseNumber, splitStreet } from "./names";
import type { SiLocator, SiLocatorSettlement, SiLocatorStreet } from "./places";

/** How a practice was placed, best first. */
export type SiPlacedBy =
	/** A street of the register in a settlement of the postal area. */
	| "street"
	/** A village without streets, named in the address (`ZADOBROVA 49 B`). */
	| "settlement"
	/** The settlement of the post office (`3212 VOJNIK`). */
	| "postOffice"
	/** The settlement nearest to the postal area's centre. */
	| "postalArea";

export type SiLocation = {
	/** The municipality's code: the practice's place. */
	municipality: string;
	settlement: string;
	longitude: number;
	latitude: number;
	by: SiPlacedBy;
	/** The street line as written (`Celjska cesta 24 b`), from the register's name when it has it. */
	street: string | null;
	/** The post office as written (`Škofja vas`, `Koper - Capodistria`). */
	postOffice: string | null;
};

/** The post office of a postal area as the register writes it, bilingual where it is. */
const postOfficeName = (area: { name: string; nameDj: string | null }) =>
	area.nameDj ? `${area.name} - ${area.nameDj}` : area.name;

const squared = (
	a: { longitude: number; latitude: number },
	b: { longitude: number; latitude: number },
) => {
	const dx = (a.longitude - b.longitude) * Math.cos((a.latitude * Math.PI) / 180);
	const dy = a.latitude - b.latitude;
	return dx * dx + dy * dy;
};

/** The locator, indexed for the run: by postcode, by folded name. */
export class SiLocatorIndex {
	readonly settlements = new Map<string, SiLocatorSettlement>();
	private readonly byPostcode = new Map<string, SiLocatorSettlement[]>();
	private readonly byName = new Map<string, SiLocatorSettlement[]>();
	private readonly streetsByName = new Map<string, SiLocatorStreet[]>();
	private readonly postal = new Map<string, SiLocator["postalAreas"][number]>();
	/** Folded words of the register's names, and their spelling (`skofja` → `Škofja`). */
	readonly proper = new Map<string, string | null>();

	constructor(readonly locator: SiLocator) {
		for (const settlement of locator.settlements) {
			this.settlements.set(settlement.code, settlement);
			for (const postcode of settlement.postcodes) {
				const list = this.byPostcode.get(postcode) ?? [];
				list.push(settlement);
				this.byPostcode.set(postcode, list);
			}
			for (const name of [settlement.name, settlement.nameDj]) {
				if (!name) continue;
				const key = foldLabel(name);
				const list = this.byName.get(key) ?? [];
				list.push(settlement);
				this.byName.set(key, list);
				this.learn(name);
			}
		}
		for (const street of locator.streets) {
			for (const name of [street.name, street.nameDj]) {
				if (!name) continue;
				const key = foldLabel(name);
				const list = this.streetsByName.get(key) ?? [];
				list.push(street);
				this.streetsByName.set(key, list);
			}
		}
		for (const area of locator.postalAreas) {
			this.postal.set(area.code, area);
			this.learn(area.name);
			if (area.nameDj) this.learn(area.nameDj);
		}
	}

	/** Remembers the capitalised words of a name as proper names. */
	learn(name: string) {
		for (const word of name.split(/[\s,]+/)) {
			const bare = word.replace(/[.()]+/g, "");
			if (!bare || bare[0] !== bare[0]?.toLocaleUpperCase("sl") || /^\d/.test(bare)) continue;
			const key = foldWord(bare);
			const known = this.proper.get(key);
			if (known === undefined) this.proper.set(key, bare);
			else if (known !== null && known !== bare) this.proper.set(key, null);
		}
	}

	/** The postal area of a postcode, or null. */
	postalArea(postcode: string | null) {
		return postcode ? (this.postal.get(postcode) ?? null) : null;
	}

	/**
	 * Locates one practice. The settlement is, in order: the one holding a street of the address's
	 * name in its postal area; a settlement of the postal area named by the address (a village
	 * without streets); the settlement of the post office (in the postal area, else the one of
	 * that name nearest to it, `1231 LJUBLJANA - ČRNUČE` being in Ljubljana); the settlement of the
	 * postal area nearest to its centre. Null when the postcode is unknown and nothing matches.
	 */
	locate(address: {
		street: string | null;
		postcode: string | null;
		postOffice: string | null;
	}): SiLocation | null {
		const area = this.postalArea(address.postcode);
		const inArea = address.postcode ? (this.byPostcode.get(address.postcode) ?? []) : [];
		const { name: streetName, number } = splitStreet(address.street ?? "");
		const streetKey = foldLabel(streetName);
		const officeKeys = this.officeKeys(address.postOffice, area);
		const centre = area && (area.longitude !== 0 || area.latitude !== 0) ? area : null;
		const nearest = <T extends { longitude: number | null; latitude: number | null }>(
			items: T[],
		) =>
			centre && items.length > 1
				? [...items].sort(
						(a, b) =>
							squared({ longitude: a.longitude ?? 0, latitude: a.latitude ?? 0 }, centre) -
							squared({ longitude: b.longitude ?? 0, latitude: b.latitude ?? 0 }, centre),
					)[0]
				: items[0];

		const postOffice = area ? postOfficeName(area) : this.caseText(address.postOffice);
		const written = (name: string) =>
			[name, number ? houseNumber(number) : null].filter(Boolean).join(" ");
		const result = (
			settlement: SiLocatorSettlement,
			by: SiPlacedBy,
			street: string | null,
			point?: { longitude: number | null; latitude: number | null },
		): SiLocation => ({
			municipality: settlement.municipality,
			settlement: settlement.code,
			longitude: point?.longitude ?? settlement.longitude,
			latitude: point?.latitude ?? settlement.latitude,
			by,
			street,
			postOffice,
		});

		if (streetKey) {
			const streets = (this.streetsByName.get(streetKey) ?? []).filter(
				(street) =>
					street.postcode === address.postcode ||
					inArea.some((settlement) => settlement.code === street.settlement),
			);
			const preferred =
				streets.filter((street) => {
					const settlement = this.settlements.get(street.settlement);
					return settlement && officeKeys.includes(foldLabel(settlement.name));
				}) ?? [];
			const street = nearest(preferred.length > 0 ? preferred : streets);
			const settlement = street ? this.settlements.get(street.settlement) : undefined;
			if (street && settlement) return result(settlement, "street", written(street.name), street);
			const village = nearest(inArea.filter((item) => foldLabel(item.name) === streetKey));
			if (village) return result(village, "settlement", written(village.name));
		}
		const street = streetName ? written(this.caseText(streetName) ?? streetName) : null;
		for (const key of officeKeys) {
			const local = nearest(inArea.filter((item) => foldLabel(item.name) === key));
			if (local) return result(local, "postOffice", street);
		}
		for (const key of officeKeys) {
			const named = nearest(this.byName.get(key) ?? []);
			if (named) return result(named, "postOffice", street);
		}
		const fallback = nearest(inArea);
		return fallback ? result(fallback, "postalArea", street) : null;
	}

	/** The folded names a post office may go by (`KOPER - CAPODISTRIA`: `koper capodistria`, `koper`). */
	private officeKeys(
		postOffice: string | null,
		area: { name: string; nameDj: string | null } | null,
	) {
		const keys = new Set<string>();
		for (const name of [postOffice, area?.name, area?.nameDj]) {
			if (!name) continue;
			keys.add(foldLabel(name));
			const head = name.split(/\s+-\s+/)[0];
			if (head) keys.add(foldLabel(head));
		}
		return [...keys].filter(Boolean);
	}

	/** A text in capitals written with the register's proper names (`caseLabel`). */
	caseText(value: string | null): string | null {
		return value ? caseLabel(value, this.proper) : null;
	}
}
