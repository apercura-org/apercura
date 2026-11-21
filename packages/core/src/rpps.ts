const RPPS_PATTERN = /^\d{11}$/;

/**
 * Returns true when `value` is a well-formed RPPS number: exactly 11 ASCII
 * digits whose last digit is a valid Luhn check digit.
 */
export function isValidRpps(value: string): boolean {
	if (!RPPS_PATTERN.test(value)) {
		return false;
	}
	return hasValidLuhnChecksum(value);
}

/** Luhn (mod 10) checksum over a string of digits, check digit last. */
function hasValidLuhnChecksum(digits: string): boolean {
	let sum = 0;
	let double = false;
	for (let index = digits.length - 1; index >= 0; index--) {
		let digit = digits.charCodeAt(index) - 48;
		if (double) {
			digit *= 2;
			if (digit > 9) {
				digit -= 9;
			}
		}
		sum += digit;
		double = !double;
	}
	return sum % 10 === 0;
}
