const PARIS = "Europe/Paris";

/** IANA time zones of the overseas departments and collectivities that use INSEE codes 971–978. */
const OVERSEAS_TIME_ZONES: ReadonlyMap<string, string> = new Map([
	["971", "America/Guadeloupe"],
	["972", "America/Martinique"],
	["973", "America/Cayenne"],
	["974", "Indian/Reunion"],
	["975", "America/Miquelon"],
	["976", "Indian/Mayotte"],
	["977", "America/St_Barthelemy"],
	["978", "America/Marigot"],
]);

/**
 * Returns the IANA time zone of a French department, from its INSEE code.
 *
 * - Metropolitan departments (`01`–`95`, without `20`) and Corsica (`2A`, `2B`) use `Europe/Paris`.
 * - Overseas codes `971`–`978` map to their own zone (most of them have no daylight saving time).
 *
 * @throws RangeError for any other code, so that a calendar is never created in a guessed zone.
 */
export function timeZoneForDepartment(code: string): string {
	const normalized = code.trim().toUpperCase();
	const overseas = OVERSEAS_TIME_ZONES.get(normalized);
	if (overseas !== undefined) {
		return overseas;
	}
	if (normalized === "2A" || normalized === "2B") {
		return PARIS;
	}
	if (/^\d{2}$/.test(normalized)) {
		const value = Number(normalized);
		if (value >= 1 && value <= 95 && value !== 20) {
			return PARIS;
		}
	}
	throw new RangeError(`Unknown French department code: "${code}"`);
}
