import "server-only";
import { randomUUID } from "node:crypto";
import {
	type Fees,
	normalizeChPostcode,
	normalizeCyPostcode,
	normalizeCzPostcode,
	normalizeDePostcode,
	normalizeEePostcode,
	normalizeEircode,
	normalizeEsPostcode,
	normalizeFiPostcode,
	normalizeGbPostcode,
	normalizeLtPostcode,
	normalizeLvPostcode,
	normalizeNoPostcode,
	normalizePlPostcode,
	normalizeSePostcode,
	normalizeSiPostcode,
} from "@apercura/core";
import { countryAdapter } from "@apercura/core/country";
import type { Database } from "@apercura/db";
import {
	activities,
	practitionerProfiles,
	practitioners,
	sites,
	suppressions,
} from "@apercura/db/schema";
import { and, eq, sql } from "drizzle-orm";
import type { OwnerSiteData, ProfileData } from "~/lib/profile-schema";
import { agendaRequirements } from "../booking/gate";
import { photoUrl, type StorageDriver } from "../storage";
import { processPhoto } from "./photo";

export class ProfileError extends Error {
	constructor(
		readonly code: "NOT_FOUND" | "LAST_SITE" | "UNKNOWN_PLACE" | "BAD_PHONE" | "NOT_OWNER_SITE",
	) {
		super(code);
		this.name = "ProfileError";
	}
}

/**
 * The practitioner whose page an organization owns (set on claim approval).
 * Every editor procedure resolves it from the organization the membership
 * middleware checked, never from an id sent by the client.
 */
export async function practitionerOfOrganization(db: Database, organizationId: string) {
	const [row] = await db
		.select({ id: practitioners.id, status: practitioners.status })
		.from(practitioners)
		.where(
			and(eq(practitioners.ownerOrgId, organizationId), eq(practitioners.claimStatus, "claimed")),
		)
		.limit(1);
	if (!row) throw new ProfileError("NOT_FOUND");
	return row;
}

export type EditorSite = {
	activityId: number;
	source: string;
	practiceKind: string;
	hidden: boolean;
	siteId: number;
	name: string | null;
	addressLine: string | null;
	postcode: string | null;
	placeName: string | null;
	phone: string | null;
};

/** Everything the onboarding and the editor show, from the tables (not the read model). */
export async function editorData(db: Database, practitionerId: number) {
	const [practitioner] = await db
		.select({
			id: practitioners.id,
			nationalId: practitioners.nationalId,
			slug: practitioners.slug,
			titleCode: practitioners.titleCode,
			civilityCode: practitioners.civilityCode,
			firstName: practitioners.firstName,
			lastName: practitioners.lastName,
			professionCode: practitioners.professionCode,
			listingSlug: practitioners.listingSlug,
			status: practitioners.status,
			billingSector: practitioners.billingSector,
			optam: practitioners.optam,
			carteVitale: practitioners.carteVitale,
			ameliMatchedAt: practitioners.ameliMatchedAt,
		})
		.from(practitioners)
		.where(eq(practitioners.id, practitionerId));
	if (!practitioner) throw new ProfileError("NOT_FOUND");
	const [profile] = await db
		.select()
		.from(practitionerProfiles)
		.where(eq(practitionerProfiles.practitionerId, practitionerId));
	const siteRows = await db.$client<EditorSite[]>`
		SELECT a.id AS "activityId", a.source, a.practice_kind AS "practiceKind", a.hidden,
			s.id AS "siteId", coalesce(s.name, s.finess_name) AS name,
			coalesce(s.geo_address_line, s.address_line) AS "addressLine",
			s.postcode, pl.name AS "placeName", s.phone
		FROM directory.activities a
		JOIN directory.sites s ON s.id = a.site_id AND s.removed_at IS NULL
		LEFT JOIN directory.places pl ON pl.id = s.place_id
		WHERE a.practitioner_id = ${practitionerId} AND a.removed_at IS NULL
			AND a.practice_kind IN ('office', 'health_center', 'hospital')
		ORDER BY a.is_primary DESC, a.id
	`.then((rows) => [...rows]);
	// The same gate the calendar's "open agenda" procedure applies.
	const booking = await agendaRequirements(db, null, practitionerId);
	const [ownerRemoval] = await db
		.select({ id: suppressions.id })
		.from(suppressions)
		.where(
			and(eq(suppressions.nationalId, practitioner.nationalId), eq(suppressions.reason, "owner")),
		)
		.limit(1);
	const fees = (profile?.fees as Fees | null) ?? null;
	const paymentMethods = profile?.paymentMethods ?? [];
	return {
		practitioner,
		profile: {
			headline: profile?.headline ?? null,
			bio: profile?.bio ?? null,
			languages: profile?.languages ?? [],
			// Prefilled from Ameli until the owner states otherwise.
			billingSector: profile ? profile.billingSector : practitioner.billingSector,
			optam: profile ? profile.optam : practitioner.optam,
			carteVitale: profile ? profile.carteVitale : practitioner.carteVitale,
			fees: { items: fees?.items ?? [], note: fees?.note ?? null },
			paymentMethods,
			accessibility: (profile?.accessibility as ProfileData["accessibility"] | null) ?? {
				stepFree: null,
				lift: null,
				parking: null,
				notes: null,
			},
			website: profile?.website ?? null,
			showPhone: profile?.showPhone ?? true,
			hiddenFields: profile?.hiddenFields ?? [],
		},
		photo: profile?.photoKey ? { key: profile.photoKey, url: photoUrl(profile.photoKey) } : null,
		publishedAt: profile?.publishedAt ?? null,
		updatedAt: profile?.updatedAt ?? null,
		sites: siteRows,
		removedByOwner: ownerRemoval !== undefined,
		ameli: practitioner.ameliMatchedAt
			? {
					billingSector: practitioner.billingSector,
					optam: practitioner.optam,
					carteVitale: practitioner.carteVitale,
				}
			: null,
		booking,
		bookingOpensAt: booking.bookingOpensAt,
	};
}

export type EditorData = Awaited<ReturnType<typeof editorData>>;

/** Saves the owner's content (validated by `profileInputSchema`). */
export async function saveProfile(db: Database, practitionerId: number, data: ProfileData) {
	const values = {
		headline: data.headline,
		bio: data.bio,
		languages: data.languages,
		billingSector: data.billingSector,
		optam: data.optam,
		carteVitale: data.carteVitale,
		fees: data.fees,
		paymentMethods: data.paymentMethods,
		accessibility: data.accessibility,
		website: data.website,
		showPhone: data.showPhone,
		hiddenFields: data.hiddenFields,
		updatedAt: new Date(),
	};
	await db
		.insert(practitionerProfiles)
		.values({ practitionerId, ...values })
		.onConflictDoUpdate({ target: practitionerProfiles.practitionerId, set: values });
}

/** The last onboarding step: from now on the public page shows the owner's content. */
export async function publishProfile(db: Database, practitionerId: number) {
	await db
		.insert(practitionerProfiles)
		.values({ practitionerId, publishedAt: new Date() })
		.onConflictDoUpdate({
			target: practitionerProfiles.practitionerId,
			set: {
				publishedAt: sql`coalesce(${practitionerProfiles.publishedAt}, now())`,
				updatedAt: new Date(),
			},
		});
}

/**
 * Shows or hides one place on the public page. At least one place stays
 * visible: a page without a place has nothing to show and would answer 404.
 */
export async function setSiteHidden(
	db: Database,
	practitionerId: number,
	activityId: number,
	hidden: boolean,
) {
	await db.transaction(async (tx) => {
		const updated = await tx
			.update(activities)
			.set({ hidden })
			.where(and(eq(activities.id, activityId), eq(activities.practitionerId, practitionerId)))
			.returning({ id: activities.id });
		if (updated.length === 0) throw new ProfileError("NOT_FOUND");
		const [visible] = await tx.execute<{ n: number }>(sql`
			SELECT count(*)::integer AS n FROM directory.activities a
			JOIN directory.sites s ON s.id = a.site_id AND s.removed_at IS NULL
			WHERE a.practitioner_id = ${practitionerId} AND a.removed_at IS NULL AND NOT a.hidden
				AND a.practice_kind IN ('office', 'health_center', 'hospital', 'locum')
		`);
		if ((visible?.n ?? 0) === 0) throw new ProfileError("LAST_SITE");
	});
}

/**
 * Adds a place the registry does not list (a second practice, a new
 * address), in the practitioner's market. Located at the commune's centre:
 * the page shows its address without a map until it is geocoded. France finds
 * the commune by postcode; Austria, whose places carry no postcodes, by the
 * Vienna district of a 1xx0 postcode, else by the Gemeinde's name; the UK and Czechia by the
 * town's name (a Prague district by its own, `Praha 8`); Spain by the municipality's name within
 * the province its postcode names (`28014` → Madrid's province, `28`); Italy by the comune's name,
 * a homonym in the province of the page's own place first; Germany by the Gemeinde's name, the one
 * whose postcodes hold the postcode first; Switzerland, whose communes carry
 * swisstopo's postcodes, like France: the commune of the postcode, the one named first; Poland
 * by the gmina's name, a homonym in the page's own powiat first; Ireland, like the
 * UK, by the town's name (an Eircode is printed, never used to place), and Finland by the municipality's
 * name, the page's own wellbeing services county first; Lithuania, whose settlements carry no
 * postcodes, by the settlement's name, in the page's municipality first; Slovenia,
 * whose municipalities carry the postcodes of their settlements (GURS), like Switzerland.
 */
export async function addOwnerSite(db: Database, practitionerId: number, input: OwnerSiteData) {
	return db.transaction(async (tx) => {
		const [owner] = await tx.execute<{ country: string }>(sql`
			SELECT country FROM directory.practitioners WHERE id = ${practitionerId}
		`);
		const country = owner?.country ?? "FR";
		const adapter = countryAdapter(country);
		const phone = input.phone ? adapter.phone.toE164(input.phone) : null;
		if (input.phone && !phone) throw new ProfileError("BAD_PHONE");
		// UK, Czech and Lithuanian postcodes are stored in their written form (`TS18 1HU`, `110 00`,
		// `LT-01100`).
		const postcode =
			country === "GB"
				? (normalizeGbPostcode(input.postcode) ?? input.postcode)
				: country === "CZ"
					? (normalizeCzPostcode(input.postcode) ?? input.postcode)
					: country === "ES"
						? (normalizeEsPostcode(input.postcode) ?? input.postcode)
						: country === "DE"
							? (normalizeDePostcode(input.postcode) ?? input.postcode)
							: country === "CH"
								? (normalizeChPostcode(input.postcode) ?? input.postcode)
								: country === "EE"
									? (normalizeEePostcode(input.postcode) ?? input.postcode)
									: country === "PL"
										? (normalizePlPostcode(input.postcode) ?? input.postcode)
										: country === "NO"
											? (normalizeNoPostcode(input.postcode) ?? input.postcode)
											: country === "IE"
												? (normalizeEircode(input.postcode) ?? input.postcode)
												: country === "FI"
													? (normalizeFiPostcode(input.postcode) ?? input.postcode)
													: country === "LT"
														? (normalizeLtPostcode(input.postcode) ?? input.postcode)
														: country === "SI"
															? (normalizeSiPostcode(input.postcode) ?? input.postcode)
															: country === "CY"
																? (normalizeCyPostcode(input.postcode) ?? input.postcode)
																: country === "LV"
																	? (normalizeLvPostcode(input.postcode) ?? input.postcode)
																	: country === "SE"
																		? (normalizeSePostcode(input.postcode) ?? input.postcode)
																		: input.postcode;
		if (!adapter.address.postcode.test(postcode)) throw new ProfileError("UNKNOWN_PLACE");
		const district = country === "AT" ? /^1(\d{2})0$/.exec(postcode)?.[1] : undefined;
		const [place] =
			country === "CY"
				? // Cyprus Post's postcodes name the municipality or community they serve: the
					// commune whose postcodes hold the postcode, else the one of that name.
					await tx.execute<{ id: number }>(sql`
					SELECT p.id FROM directory.places p
					WHERE p.country = 'CY' AND p.kind = 'commune' AND p.removed_at IS NULL
						AND (p.postcodes @> ARRAY[${postcode}]::text[]
							OR similarity(directory.text_norm(p.name), directory.text_norm(${input.city})) > 0.5)
					ORDER BY (p.postcodes @> ARRAY[${postcode}]::text[]) DESC,
						(directory.text_norm(p.name) = directory.text_norm(${input.city})) DESC,
						similarity(directory.text_norm(p.name), directory.text_norm(${input.city})) DESC,
						p.population DESC NULLS LAST, p.id
					LIMIT 1
				`)
				: country === "NO" || country === "SE"
					? // A Norwegian or Swedish address names its post town (`2050 Jessheim`, `417 05
						// Göteborg`), not always its municipality (Ullensaker, Partille), and neither market's
						// municipalities carry postcodes: the municipality the register's facilities of that
						// postcode are in, else by its name.
						await tx.execute<{ id: number }>(sql`
					WITH by_postcode AS (
						SELECT s.place_id FROM directory.sites s
						WHERE s.country_code = ${country} AND s.postcode = ${postcode} AND s.removed_at IS NULL
							AND s.place_id IS NOT NULL
					)
					SELECT p.id FROM directory.places p
					WHERE p.country = ${country} AND p.kind = 'commune' AND p.removed_at IS NULL
						AND (p.id IN (SELECT place_id FROM by_postcode)
							OR similarity(directory.text_norm(p.name), directory.text_norm(${input.city})) > 0.5)
					ORDER BY (SELECT count(*) FROM by_postcode b WHERE b.place_id = p.id) DESC,
						(directory.text_norm(p.name) = directory.text_norm(${input.city})) DESC,
						similarity(directory.text_norm(p.name), directory.text_norm(${input.city})) DESC,
						p.population DESC NULLS LAST, p.id
					LIMIT 1
				`)
					: country === "EE"
						? // Estonia's settlements carry no postcodes and their names their kind ("Tartu linn",
							// "Haabneeme alevik"): the settlement by its name, with or without its kind.
							await tx.execute<{ id: number }>(sql`
					SELECT p.id FROM directory.places p
					WHERE p.country = 'EE' AND p.kind = 'commune' AND p.removed_at IS NULL
						AND (directory.text_norm(p.name) LIKE directory.text_norm(${input.city}) || ' %'
							OR similarity(directory.text_norm(p.name), directory.text_norm(${input.city})) > 0.5)
					ORDER BY (directory.text_norm(p.name) = directory.text_norm(${input.city})) DESC,
						(directory.text_norm(p.name) LIKE directory.text_norm(${input.city}) || ' %') DESC,
						similarity(directory.text_norm(p.name), directory.text_norm(${input.city})) DESC,
						p.population DESC NULLS LAST, p.id
					LIMIT 1
				`)
						: country === "DE"
							? // A German postcode crosses Gemeinde and Land borders: the Gemeinde by its name, the
								// one whose postcodes hold the postcode first.
								await tx.execute<{ id: number }>(sql`
					SELECT p.id FROM directory.places p
					WHERE p.country = 'DE' AND p.kind = 'commune' AND p.removed_at IS NULL
						AND similarity(directory.text_norm(p.name), directory.text_norm(${input.city})) > 0.5
					ORDER BY (directory.text_norm(p.name) = directory.text_norm(${input.city})) DESC,
						(${postcode} = ANY (p.postcodes)) DESC,
						similarity(directory.text_norm(p.name), directory.text_norm(${input.city})) DESC,
						p.population DESC NULLS LAST, p.id
					LIMIT 1
				`)
							: country === "LT"
								? // Lithuania's settlements carry no postcodes: the settlement by its name, in the
									// page's municipality first.
									await tx.execute<{ id: number }>(sql`
					SELECT p.id FROM directory.places p
					WHERE p.country = 'LT' AND p.kind = 'commune' AND p.removed_at IS NULL
						AND similarity(directory.text_norm(p.name), directory.text_norm(${input.city})) > 0.5
					ORDER BY (directory.text_norm(p.name) = directory.text_norm(${input.city})) DESC,
						(p.department_code = (
							SELECT own.department_code FROM directory.practitioners pr
							JOIN directory.places own ON own.id = pr.primary_place_id
							WHERE pr.id = ${practitionerId}
						)) DESC NULLS LAST,
						similarity(directory.text_norm(p.name), directory.text_norm(${input.city})) DESC,
						p.id
					LIMIT 1
				`)
								: country === "IT"
									? // ISTAT's comuni carry no postcodes: the comune by its name, in the page's province first.
										await tx.execute<{ id: number }>(sql`
					SELECT p.id FROM directory.places p
					WHERE p.country = 'IT' AND p.kind = 'commune' AND p.removed_at IS NULL
						AND similarity(directory.text_norm(p.name), directory.text_norm(${input.city})) > 0.5
					ORDER BY (directory.text_norm(p.name) = directory.text_norm(${input.city})) DESC,
						(p.department_code = (
							SELECT own.department_code FROM directory.practitioners pr
							JOIN directory.places own ON own.id = pr.primary_place_id
							WHERE pr.id = ${practitionerId}
						)) DESC NULLS LAST,
						similarity(directory.text_norm(p.name), directory.text_norm(${input.city})) DESC,
						p.id
					LIMIT 1
				`)
									: country === "ES"
										? // Spain's municipalities carry no postcodes: by name, in the postcode's province.
											await tx.execute<{ id: number }>(sql`
					SELECT p.id FROM directory.places p
					WHERE p.country = 'ES' AND p.kind = 'commune' AND p.removed_at IS NULL
						AND p.department_code = ${postcode.slice(0, 2)}
						AND similarity(directory.text_norm(p.name), directory.text_norm(${input.city})) > 0.5
					ORDER BY (directory.text_norm(p.name) = directory.text_norm(${input.city})) DESC,
						similarity(directory.text_norm(p.name), directory.text_norm(${input.city})) DESC,
						p.id
					LIMIT 1
				`)
										: country === "PL" || country === "FI"
											? // Polish gminas and Finnish municipalities carry no postcodes: the commune by its
												// name, the page's powiat or wellbeing services county first.
												await tx.execute<{ id: number }>(sql`
					SELECT p.id FROM directory.places p
					WHERE p.country = ${country} AND p.kind = 'commune' AND p.removed_at IS NULL
						AND similarity(directory.text_norm(p.name), directory.text_norm(${input.city})) > 0.5
					ORDER BY (directory.text_norm(p.name) = directory.text_norm(${input.city})) DESC,
						(p.department_code = (
							SELECT own.department_code FROM directory.practitioners pr
							JOIN directory.places own ON own.id = pr.primary_place_id
							WHERE pr.id = ${practitionerId}
						)) DESC NULLS LAST,
						similarity(directory.text_norm(p.name), directory.text_norm(${input.city})) DESC,
						p.id
					LIMIT 1
				`)
											: country === "CZ"
												? // Czech municipalities carry no postcodes: the municipality or Prague district by name.
													await tx.execute<{ id: number }>(sql`
					SELECT p.id FROM directory.places p
					WHERE p.country = 'CZ' AND p.kind IN ('commune', 'arrondissement') AND p.removed_at IS NULL
						AND similarity(directory.text_norm(p.name), directory.text_norm(${input.city})) > 0.5
					ORDER BY (directory.text_norm(p.name) = directory.text_norm(${input.city})) DESC,
						similarity(directory.text_norm(p.name), directory.text_norm(${input.city})) DESC,
						p.kind = 'arrondissement' DESC, p.id
					LIMIT 1
				`)
												: country === "GB" || country === "IE" || country === "LV"
													? // The UK's and Ireland's towns carry no postcodes either (an Eircode never
														// places anything), nor Latvia's towns and parishes: the place by its name (a
														// parish without its word: `Mores` for `Mores pagasts`).
														await tx.execute<{ id: number }>(sql`
					SELECT p.id FROM directory.places p
					WHERE p.country = ${country} AND p.kind = 'commune' AND p.removed_at IS NULL
						AND similarity(directory.text_norm(regexp_replace(p.name, ' pagasts$', '')),
							directory.text_norm(${input.city})) > 0.5
					ORDER BY (directory.text_norm(p.name) = directory.text_norm(${input.city})) DESC,
						similarity(directory.text_norm(regexp_replace(p.name, ' pagasts$', '')),
							directory.text_norm(${input.city})) DESC,
						p.id
					LIMIT 1
				`)
													: country === "AT"
														? await tx.execute<{ id: number }>(sql`
					SELECT p.id FROM directory.places p
					WHERE p.country = 'AT' AND p.removed_at IS NULL AND (
						(p.kind = 'arrondissement' AND p.code = ${district ? `9${district}01` : ""})
						OR (p.kind = 'commune' AND p.code <> '90001'
							AND similarity(directory.text_norm(p.name), directory.text_norm(${input.city})) > 0.5)
					)
					ORDER BY p.kind = 'arrondissement' DESC,
						(directory.text_norm(p.name) = directory.text_norm(${input.city})) DESC,
						similarity(directory.text_norm(p.name), directory.text_norm(${input.city})) DESC
					LIMIT 1
				`)
														: await tx.execute<{ id: number }>(sql`
					SELECT p.id FROM directory.places p
					WHERE p.country = ${country === "CH" || country === "SI" ? country : "FR"}
						AND p.kind IN ('commune', 'arrondissement') AND p.removed_at IS NULL
						AND ${postcode} = ANY (p.postcodes)
					ORDER BY (directory.text_norm(p.name) = directory.text_norm(${input.city})) DESC,
						similarity(directory.text_norm(p.name), directory.text_norm(${input.city})) DESC,
						p.kind = 'arrondissement' DESC
					LIMIT 1
				`);
		if (!place) throw new ProfileError("UNKNOWN_PLACE");
		const key = randomUUID();
		const [site] = await tx.execute<{ id: number }>(sql`
			INSERT INTO directory.sites (source, source_key, kind, name, address_line, postcode,
				commune_label, country_code, place_id, location, geo_precision, geo_source, phone, phone_kind)
			SELECT 'owner', ${key}, 'office', ${input.name}, ${input.addressLine}, ${postcode},
				${input.city}, ${country}, p.id, p.centroid, CASE WHEN p.centroid IS NULL THEN NULL ELSE 'city' END,
				CASE WHEN p.centroid IS NULL THEN NULL ELSE 'centroid' END, ${phone},
				CASE WHEN ${phone}::text IS NULL THEN NULL ELSE 'direct' END
			FROM directory.places p WHERE p.id = ${place.id}
			RETURNING id
		`);
		if (!site) throw new ProfileError("UNKNOWN_PLACE");
		await tx.insert(activities).values({
			practitionerId,
			siteId: site.id,
			source: "owner",
			sourceKey: key,
			modeCode: country === "FR" ? "L" : null,
			practiceKind: "office",
		});
		return { siteId: site.id };
	});
}

/** Removes a place the owner added (registry places can only be hidden). */
export async function removeOwnerSite(db: Database, practitionerId: number, activityId: number) {
	await db.transaction(async (tx) => {
		const [activity] = await tx
			.select({ siteId: activities.siteId, source: activities.source })
			.from(activities)
			.where(and(eq(activities.id, activityId), eq(activities.practitionerId, practitionerId)));
		if (!activity) throw new ProfileError("NOT_FOUND");
		if (activity.source !== "owner") throw new ProfileError("NOT_OWNER_SITE");
		await tx.delete(activities).where(eq(activities.id, activityId));
		if (activity.siteId) {
			await tx.delete(sites).where(and(eq(sites.id, activity.siteId), eq(sites.source, "owner")));
		}
	});
}

/** Replaces the photo: re-encoded, stored under a fresh random key, the old object deleted. */
export async function setPhoto(
	db: Database,
	storage: StorageDriver,
	practitionerId: number,
	bytes: Uint8Array,
) {
	const photo = await processPhoto(bytes);
	await storage.put(photo.key, photo.body, photo.contentType);
	const [previous] = await db
		.select({ key: practitionerProfiles.photoKey })
		.from(practitionerProfiles)
		.where(eq(practitionerProfiles.practitionerId, practitionerId));
	await db
		.insert(practitionerProfiles)
		.values({ practitionerId, photoKey: photo.key })
		.onConflictDoUpdate({
			target: practitionerProfiles.practitionerId,
			set: { photoKey: photo.key, updatedAt: new Date() },
		});
	if (previous?.key) await storage.delete(previous.key).catch(() => undefined);
	return { key: photo.key, url: photoUrl(photo.key) };
}

export async function removePhoto(db: Database, storage: StorageDriver, practitionerId: number) {
	const [previous] = await db
		.select({ key: practitionerProfiles.photoKey })
		.from(practitionerProfiles)
		.where(eq(practitionerProfiles.practitionerId, practitionerId));
	await db
		.update(practitionerProfiles)
		.set({ photoKey: null, updatedAt: new Date() })
		.where(eq(practitionerProfiles.practitionerId, practitionerId));
	if (previous?.key) await storage.delete(previous.key).catch(() => undefined);
}
