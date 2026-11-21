/**
 * Owner-completed page content: plain-text rules, the fixed vocabularies the
 * editor offers, and the deontology gate on opening booking. Pure.
 *
 * Every owner text is plain text: no HTML, no Markdown, no links inside the
 * presentation. Pages print it as text, so markup would only show as
 * characters; refusing it keeps pages honest and moderation simple.
 */

/** Payment methods a practice can accept (R.4127-53 II: they must be stated). */
export const PAYMENT_METHODS = ["card", "cash", "cheque", "transfer"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** Languages offered by the editor (ISO 639-1), the ones French practices list most. */
export const PROFILE_LANGUAGES = [
	"fr",
	"en",
	"es",
	"de",
	"it",
	"pt",
	"ar",
	"zh",
	"ru",
	"tr",
	"ro",
	"pl",
	"nl",
	"vi",
	"fa",
	"he",
	"uk",
	"lsf",
] as const;
export type ProfileLanguage = (typeof PROFILE_LANGUAGES)[number];

/** Owner fields that can be hidden from the public page one by one. */
export const HIDEABLE_FIELDS = [
	"photo",
	"headline",
	"bio",
	"languages",
	"accessibility",
	"website",
] as const;
export type HideableField = (typeof HIDEABLE_FIELDS)[number];

/** Agreement sectors (Ameli codes): `0` not contracted, `1`, `2` sector 1 with extra fees, `3` sector 2. */
export const BILLING_SECTORS = ["0", "1", "2", "3"] as const;
export const OPTAM_VALUES = ["optam", "optam_aco"] as const;

export const LIMITS = {
	headline: 120,
	bio: 2000,
	feeLabel: 80,
	feesNote: 300,
	accessibilityNotes: 300,
	website: 200,
	fees: 12,
	siteName: 120,
	addressLine: 160,
} as const;

/** Control characters other than tab and line feed. */
// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping control characters is the point.
const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g;

/**
 * Normalizes an owner text: NFC, no control or bidi-override characters,
 * trimmed lines, at most one blank line in a row. Single-line texts also
 * collapse every run of whitespace.
 */
export function normalizePlainText(value: string, options: { multiline?: boolean } = {}): string {
	const cleaned = value.normalize("NFC").replace(/\r\n?/g, "\n").replace(CONTROL, "");
	if (!options.multiline) return cleaned.replace(/\s+/g, " ").trim();
	return cleaned
		.split("\n")
		.map((line) => line.replace(/[ \t]+/g, " ").trim())
		.join("\n")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

/**
 * True when a text looks like markup: an HTML tag, an HTML entity, or a
 * Markdown link or image. Owner texts are refused, not silently rewritten.
 */
export function hasMarkup(value: string): boolean {
	return (
		hasHtmlTag(value) ||
		/&(?:#\d{1,8}|#x[\da-f]{1,8}|[a-z]{1,32});/i.test(value) ||
		hasMarkdownLink(value)
	);
}

/** `<tag`, `</tag`, `<!…` or `<?…` with optional spaces after `<` — a linear scan, no backtracking. */
function hasHtmlTag(value: string): boolean {
	for (let i = value.indexOf("<"); i !== -1; i = value.indexOf("<", i + 1)) {
		let j = i + 1;
		while (j < value.length && /\s/.test(value.charAt(j))) j++;
		if (value.charAt(j) === "/") {
			j++;
			while (j < value.length && /\s/.test(value.charAt(j))) j++;
		}
		if (/[a-z!?]/i.test(value.charAt(j))) return true;
	}
	return false;
}

/** `[text](target)` or `![alt](src)` — a linear scan, no backtracking. */
function hasMarkdownLink(value: string): boolean {
	const firstOpen = value.indexOf("[");
	const lastClose = value.lastIndexOf(")");
	if (firstOpen === -1 || lastClose === -1) return false;
	let i = value.indexOf("](", firstOpen);
	while (i !== -1) {
		if (lastClose > i + 1) return true;
		i = value.indexOf("](", i + 1);
	}
	return false;
}

/** A website the page may link to: absolute http(s) URL with a host, no credentials. */
export function normalizeWebsite(value: string): string | null {
	const trimmed = value.trim();
	if (!trimmed) return null;
	const candidate = /^[a-z][a-z\d+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
	let url: URL;
	try {
		url = new URL(candidate);
	} catch {
		return null;
	}
	if (url.protocol !== "https:" && url.protocol !== "http:") return null;
	if (url.username || url.password) return null;
	if (!/^[a-z\d-]+(\.[a-z\d-]+)+$/i.test(url.hostname)) return null;
	return url.toString();
}

export interface FeeItem {
	label: string;
	/** Euros. */
	amount: number;
	/** Upper bound in euros, for a range ("from 30 to 50 €"). */
	maxAmount?: number | null;
}

export interface Fees {
	items: FeeItem[];
	note?: string | null;
}

/** Fees are stated when at least one item has a label and an amount. */
export function feesStated(fees: Fees | null | undefined): boolean {
	return Boolean(
		fees?.items?.some((item) => item.label.trim().length > 0 && Number.isFinite(item.amount)),
	);
}

export type BookingBlocker = "fees" | "paymentMethods" | "notVerified" | "waitingPeriod";

/**
 * Whether the agenda may open: the page is verified, its waiting period is
 * over (7 days without Pro Santé Connect), and fees and accepted payment
 * methods are stated (R.4127-53 II of the public health code). The booking
 * module calls this before opening a calendar.
 */
export function bookingReadiness(input: {
	verified: boolean;
	bookingOpensAt: Date | null;
	fees: Fees | null | undefined;
	paymentMethods: readonly string[] | null | undefined;
	now?: Date;
}): { ready: boolean; blockers: BookingBlocker[] } {
	const now = input.now ?? new Date();
	const blockers: BookingBlocker[] = [];
	if (!input.verified) blockers.push("notVerified");
	else if (input.bookingOpensAt && input.bookingOpensAt.getTime() > now.getTime()) {
		blockers.push("waitingPeriod");
	}
	if (!feesStated(input.fees)) blockers.push("fees");
	if (!input.paymentMethods || input.paymentMethods.length === 0) blockers.push("paymentMethods");
	return { ready: blockers.length === 0, blockers };
}
