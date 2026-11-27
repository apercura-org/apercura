/**
 * Claiming a practitioner page: the verification methods and the rules that
 * turn their results into a decision. Pure, so the web app, its tests and
 * future jobs share one definition.
 *
 * - A claim targets one RPPS, never a name (homonyms).
 * - Pro Santé Connect verifies on its own and opens booking at once.
 * - A link sent to the registry email of a practice or health centre verifies
 *   on its own; booking opens 7 days later.
 * - Otherwise two methods are needed (a document reviewed by a person and a
 *   callback to the registry phone), and booking opens 7 days later.
 * - A page that already has a verified owner is a contest: an administrator
 *   decides, and Pro Santé Connect wins against any other method.
 *
 * The rules above are France's. Each market has its own claim policy
 * (`claimPolicyOf`): Austria publishes no registry email and has no
 * e-identity open to Apercura, so a claim there is a document reviewed by an
 * administrator, and nothing else.
 */
import type { PracticeKind } from "./taxonomy/types";

export type VerificationMethodId = "psc" | "registry_email" | "document" | "phone_callback";

export type CheckStatus = "pending" | "passed" | "failed";

/** What a method needs to know about the claimed record. */
export interface ClaimSubject {
	/** Market of the practitioner (ISO 3166-1 alpha-2); France when absent. */
	country?: string;
	/** National identifier of the practitioner (an RPPS in France). */
	rpps: string;
	activities: readonly {
		practiceKind: PracticeKind | string;
		/** Registry email of the site (structure email), if any. */
		email: string | null;
		/** Registry phone of the site (E.164), if any. */
		phone: string | null;
		/** `direct` or `switchboard`. */
		phoneKind: string | null;
	}[];
}

export interface MethodOptions {
	/** Pro Santé Connect is configured (PSC_ISSUER, PSC_CLIENT_ID, PSC_CLIENT_SECRET). */
	pscEnabled: boolean;
	/** Document claims are enabled (FEATURE_CLAIM_DOCUMENTS). */
	documentsEnabled: boolean;
}

/**
 * One way to prove that the account holder is the practitioner. New countries
 * or methods (letter with a code, foreign e-ID) add an entry here.
 */
export interface VerificationMethod {
	id: VerificationMethodId;
	/** Verifies a claim on its own, without an administrator. */
	sufficient: boolean;
	/** Opens booking at once (only an identity provider of the profession does). */
	opensBookingAtOnce: boolean;
	/** Whether the claimant runs it (an administrator runs the phone callback). */
	runBy: "claimant" | "admin";
	isAvailable(subject: ClaimSubject, options: MethodOptions): boolean;
}

/** Kinds of practice whose registry email belongs to the practitioner's own structure. */
const REGISTRY_EMAIL_KINDS: readonly string[] = ["office", "health_center"];

/** `local@domain.tld` without spaces — checked by splitting, in linear time. */
function isPlainEmail(email: string): boolean {
	if (/\s/.test(email)) return false;
	const parts = email.split("@");
	if (parts.length !== 2) return false;
	const [local = "", domain = ""] = parts;
	const dot = domain.lastIndexOf(".");
	return local.length > 0 && dot > 0 && dot < domain.length - 1;
}

/** Registry emails a claim link may be sent to: practices and health centres, never hospitals. */
export function registryEmails(subject: ClaimSubject): string[] {
	const emails = subject.activities
		.filter((activity) => REGISTRY_EMAIL_KINDS.includes(activity.practiceKind) && activity.email)
		.map((activity) => (activity.email as string).trim().toLowerCase())
		.filter(isPlainEmail);
	return [...new Set(emails)];
}

/**
 * Registry phones an administrator may call back: practices and health
 * centres, direct lines first. Never a number the claimant typed.
 */
export function registryPhones(subject: ClaimSubject): string[] {
	const phones = subject.activities
		.filter((activity) => REGISTRY_EMAIL_KINDS.includes(activity.practiceKind) && activity.phone)
		.sort((a, b) => Number(a.phoneKind === "switchboard") - Number(b.phoneKind === "switchboard"))
		.map((activity) => activity.phone as string);
	return [...new Set(phones)];
}

export const VERIFICATION_METHODS: Readonly<Record<VerificationMethodId, VerificationMethod>> = {
	psc: {
		id: "psc",
		sufficient: true,
		opensBookingAtOnce: true,
		runBy: "claimant",
		isAvailable: (_subject, options) => options.pscEnabled,
	},
	registry_email: {
		id: "registry_email",
		sufficient: true,
		opensBookingAtOnce: false,
		runBy: "claimant",
		isAvailable: (subject) => registryEmails(subject).length > 0,
	},
	document: {
		id: "document",
		sufficient: false,
		opensBookingAtOnce: false,
		runBy: "claimant",
		isAvailable: (_subject, options) => options.documentsEnabled,
	},
	phone_callback: {
		id: "phone_callback",
		sufficient: false,
		opensBookingAtOnce: false,
		runBy: "admin",
		isAvailable: (subject, options) =>
			options.documentsEnabled && registryPhones(subject).length > 0,
	},
};

/** How a market's practitioners claim their page. */
export interface ClaimPolicy {
	/** Methods the market offers, in the order the claim page lists them. */
	readonly methods: readonly VerificationMethodId[];
	/**
	 * Proofs an administrator needs to approve a claim without a method that
	 * verifies on its own.
	 */
	readonly reviewRequires: readonly ("document" | "phone_callback")[];
}

/** France: Pro Santé Connect, the registry email, or a document and a callback to the registry phone. */
const FRANCE_POLICY: ClaimPolicy = {
	methods: ["psc", "registry_email", "document", "phone_callback"],
	reviewRequires: ["document", "phone_callback"],
};

/**
 * A market without an e-identity open to Apercura nor registry contacts to
 * check against (Austria, the United Kingdom, Czechia, Spain, Germany, Estonia, Poland, Norway, Finland, Cyprus, Latvia, and any market not listed): a document reviewed by
 * an administrator, who decides alone.
 */
const DOCUMENT_REVIEW_POLICY: ClaimPolicy = {
	methods: ["document"],
	reviewRequires: ["document"],
};

export const CLAIM_POLICIES: Readonly<Record<string, ClaimPolicy>> = {
	FR: FRANCE_POLICY,
	AT: DOCUMENT_REVIEW_POLICY,
	GB: DOCUMENT_REVIEW_POLICY,
	CZ: DOCUMENT_REVIEW_POLICY,
	ES: DOCUMENT_REVIEW_POLICY,
	DE: DOCUMENT_REVIEW_POLICY,
	EE: DOCUMENT_REVIEW_POLICY,
	PL: DOCUMENT_REVIEW_POLICY,
	NO: DOCUMENT_REVIEW_POLICY,
	FI: DOCUMENT_REVIEW_POLICY,
	CY: DOCUMENT_REVIEW_POLICY,
	LV: DOCUMENT_REVIEW_POLICY,
};

/** The claim policy of a market: France when none is given, document review for an unknown one. */
export function claimPolicyOf(country: string | null | undefined): ClaimPolicy {
	if (!country) return FRANCE_POLICY;
	return CLAIM_POLICIES[country] ?? DOCUMENT_REVIEW_POLICY;
}

/** Methods offered for a record, in the order the claim page lists them. */
export function availableMethods(
	subject: ClaimSubject,
	options: MethodOptions,
): VerificationMethod[] {
	return claimPolicyOf(subject.country)
		.methods.map((id) => VERIFICATION_METHODS[id])
		.filter((method) => method.isAvailable(subject, options));
}

/**
 * The Pro Santé Connect identity of a person is `8` + RPPS, published as
 * `SubjectNameID` and `preferred_username`. `sub` is a technical identifier
 * (a UUID since March 2026) and is never used for matching.
 */
export function pscIdentifierOf(claims: Record<string, unknown>): string | null {
	for (const key of ["SubjectNameID", "preferred_username"] as const) {
		const value = claims[key];
		if (typeof value === "string" && /^8\d{11}$/.test(value.trim())) return value.trim();
	}
	return null;
}

/** Whether a Pro Santé Connect identifier designates this RPPS. */
export function pscMatchesRpps(pscIdentifier: string | null, rpps: string): boolean {
	return pscIdentifier !== null && /^\d{11}$/.test(rpps) && pscIdentifier === `8${rpps}`;
}

export type CheckSummary = Partial<Record<VerificationMethodId, CheckStatus>>;

const passed = (checks: CheckSummary, id: VerificationMethodId) => checks[id] === "passed";

/** Days between a verification without Pro Santé Connect and the opening of booking. */
export const BOOKING_DELAY_DAYS = 7;

/** How a claim's proofs stand. */
export type ClaimAssessment =
	/** Verified automatically, no administrator needed. */
	| { kind: "verified"; via: "psc" | "registry_email" }
	/** Enough proofs for an administrator to approve. */
	| { kind: "reviewable" }
	/** Not enough proofs yet. */
	| { kind: "incomplete"; missing: VerificationMethodId[] };

/**
 * Assesses a claim from its checks. Pro Santé Connect or the registry email
 * verify on their own, except in a contest, which an administrator always
 * decides. Without them a document and the phone callback are both needed.
 */
export function assessClaim(
	checks: CheckSummary,
	contest: boolean,
	country?: string | null,
): ClaimAssessment {
	const policy = claimPolicyOf(country);
	const offers = (id: VerificationMethodId) => policy.methods.includes(id);
	const strong =
		offers("psc") && passed(checks, "psc")
			? "psc"
			: offers("registry_email") && passed(checks, "registry_email")
				? "registry_email"
				: null;
	if (strong && !contest) return { kind: "verified", via: strong };
	if (strong) return { kind: "reviewable" };
	const missing = policy.reviewRequires.filter((id) => !passed(checks, id));
	return missing.length === 0 ? { kind: "reviewable" } : { kind: "incomplete", missing };
}

/**
 * Whether a claim can be sent to an administrator: a document must be
 * uploaded (the phone callback is run by the administrator during the review),
 * or a strong method passed in a contest.
 */
export function canSubmitForReview(checks: CheckSummary, contest: boolean): boolean {
	if (contest && (passed(checks, "psc") || passed(checks, "registry_email"))) return true;
	return passed(checks, "document") || checks.document === "pending";
}

/**
 * Whether an administrator may approve a claim. In a contest, a claimant
 * without Pro Santé Connect can never take a page from an owner verified with it.
 */
export function canApprove(
	checks: CheckSummary,
	contest: { incumbentViaPsc: boolean } | null,
	country?: string | null,
): boolean {
	const assessment = assessClaim(checks, contest !== null, country);
	if (assessment.kind === "incomplete") return false;
	if (contest?.incumbentViaPsc && !passed(checks, "psc")) return false;
	return true;
}

/** When booking may open for a page verified at `verifiedAt`. */
export function bookingOpensAt(verifiedAt: Date, viaPsc: boolean): Date {
	if (viaPsc) return verifiedAt;
	return new Date(verifiedAt.getTime() + BOOKING_DELAY_DAYS * 24 * 60 * 60 * 1000);
}

/** Claim statuses that still count as live (one per account and page). */
export const LIVE_CLAIM_STATUSES = ["open", "in_review"] as const;

export type ClaimStatus =
	| "open"
	| "in_review"
	| "verified"
	| "rejected"
	| "withdrawn"
	| "superseded";
