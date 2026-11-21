/**
 * Shapes of the read-model payloads (`directory.practitioner_pages.payload`,
 * `directory.landing_pages.payload`), as written by the SQL functions in
 * `packages/db/drizzle/0003_directory_functions.sql` and later migrations.
 */

export type SitePayload = {
	id: number;
	kind: string;
	name: string | null;
	addressLine: string | null;
	addressComplement: string | null;
	postcode: string | null;
	placeId: number | null;
	placeName: string | null;
	placeSlug: string | null;
	departmentCode: string | null;
	latitude: number | null;
	longitude: number | null;
	geoPrecision: string | null;
	phone: string | null;
	/** `direct`, or `switchboard` for a number shared by many practitioners. */
	phoneKind: string | null;
	finessEt: string | null;
	establishmentName: string | null;
	establishmentSlug: string | null;
};

export type ActivityPayload = {
	id: number;
	practiceKind: string;
	modeCode: string | null;
	roleCode: string | null;
	sectorCode: string | null;
	isPrimary: boolean;
	site: SitePayload | null;
};

export type QualificationPayload = {
	source: string;
	typeCode: string;
	code: string;
	label: string | null;
};

export type AmeliPayload = {
	/** `0` not contracted, `1`, `2` sector 1 with permanent extra fees, `3` sector 2. */
	billingSector: string | null;
	optam: string | null;
	carteVitale: boolean | null;
	apcv: boolean | null;
};

export type ProfilePayload = {
	photoKey: string | null;
	headline: string | null;
	bio: string | null;
	languages: string[];
	billingSector: string | null;
	optam: string | null;
	paymentMethods: string[];
	website: string | null;
	showPhone: boolean;
	expertises: string[];
};

export type PractitionerPayload = {
	id: number;
	country: string;
	idScheme: string;
	nationalId: string;
	slug: string;
	civilityCode: string | null;
	titleCode: string | null;
	firstName: string;
	lastName: string;
	professionCode: string;
	primarySpecialtyCode: string | null;
	listingSlug: string | null;
	primaryPlaceId: number | null;
	claimStatus: string;
	qualifications: QualificationPayload[];
	activities: ActivityPayload[];
	ameli: AmeliPayload | null;
	profile: ProfilePayload | null;
};

export type LandingPayload = {
	listingSlug: string;
	placeId: number | null;
	practitionerCount: number;
	onlineBookingCount: number;
	billingSectors: Record<string, number>;
	/** Added by migration 0006; absent on rows written before it. */
	carteVitale?: { yes: number; no: number; unknown: number };
};

/** A place as the pages link to it. */
export type PlaceRef = {
	id: number;
	kind: "region" | "department" | "commune" | "arrondissement";
	code: string;
	name: string;
	slug: string;
	departmentCode: string | null;
};

/** A practitioner as listed in a table or linked from another page. */
export type PractitionerLink = {
	id: number;
	slug: string;
	titleCode: string | null;
	civilityCode: string | null;
	firstName: string;
	lastName: string;
	listingSlug: string | null;
};
