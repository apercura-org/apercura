/**
 * Home visits: an appointment type whose care happens at the patient's address, inside a service
 * area the practitioner chose (a list of communes, by INSEE code), with a fixed travel time.
 *
 * The area is a list of communes rather than a radius: the patient picks their commune from that
 * list, so the check is exact and needs no geocoding of the patient's address (which would send
 * it to a third party). A radius only helps the practitioner fill the list.
 */

/** INSEE code of a commune or municipal arrondissement: 5 digits, or `2A`/`2B` + 3 in Corsica. */
const INSEE_CODE = /^(?:\d{5}|2[AB]\d{3})$/;

/** Most communes one appointment type may serve. */
export const MAX_SERVICE_AREA = 200;

/** Longest fixed travel time, in minutes (the same bound as the other buffers). */
export const MAX_TRAVEL_MIN = 240;

/** Longest street address a patient may type, in characters (number, street, floor, door code). */
export const MAX_HOME_ADDRESS_LENGTH = 300;

/** Most lines of a street address. */
const MAX_ADDRESS_LINES = 4;

export function isInseeCode(value: string): boolean {
	return INSEE_CODE.test(value);
}

/**
 * The communes of a service area, trimmed, upper-cased (`2a004` → `2A004`), without duplicates,
 * sorted.
 *
 * @throws RangeError on a value that is not an INSEE code, or past {@link MAX_SERVICE_AREA}.
 */
export function normalizeServiceArea(codes: readonly string[]): string[] {
	const unique = new Set<string>();
	for (const raw of codes) {
		const code = raw.trim().toUpperCase();
		if (!isInseeCode(code)) {
			throw new RangeError(`not an INSEE code: ${JSON.stringify(raw)}`);
		}
		unique.add(code);
	}
	if (unique.size > MAX_SERVICE_AREA) {
		throw new RangeError(`a service area holds at most ${MAX_SERVICE_AREA} communes`);
	}
	return [...unique].sort();
}

/** Whether a patient's commune is one of the area's communes (exact INSEE code). */
export function isInServiceArea(area: readonly string[], communeCode: string): boolean {
	const code = communeCode.trim().toUpperCase();
	return isInseeCode(code) && area.includes(code);
}

/**
 * A patient's street address as stored: each line trimmed with its inner spaces collapsed,
 * control characters removed, empty lines dropped. Null when nothing is left, when it has more
 * than 4 lines or more than {@link MAX_HOME_ADDRESS_LENGTH} characters.
 */
export function normalizeHomeAddress(value: string): string | null {
	const lines = value
		.normalize("NFC")
		.split(/\r\n|\r|\n/)
		.map((line) =>
			line
				.replace(/\p{Cc}/gu, " ")
				.replace(/\s+/g, " ")
				.trim(),
		)
		.filter((line) => line !== "");
	if (lines.length === 0 || lines.length > MAX_ADDRESS_LINES) {
		return null;
	}
	const address = lines.join("\n");
	return address.length > MAX_HOME_ADDRESS_LENGTH ? null : address;
}
