import "server-only";
import { randomUUID } from "node:crypto";
import { type Fees, toE164Fr } from "@apercura/core";
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
			s.id AS "siteId", coalesce(s.name, s.finess_name) AS name, s.address_line AS "addressLine",
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
 * address). Located at the commune's centre: the page shows its address
 * without a map until it is geocoded.
 */
export async function addOwnerSite(db: Database, practitionerId: number, input: OwnerSiteData) {
	const phone = input.phone ? toE164Fr(input.phone) : null;
	if (input.phone && !phone) throw new ProfileError("BAD_PHONE");
	return db.transaction(async (tx) => {
		const [place] = await tx.execute<{ id: number }>(sql`
			SELECT p.id FROM directory.places p
			WHERE p.kind IN ('commune', 'arrondissement') AND p.removed_at IS NULL
				AND ${input.postcode} = ANY (p.postcodes)
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
			SELECT 'owner', ${key}, 'office', ${input.name}, ${input.addressLine}, ${input.postcode},
				${input.city}, 'FR', p.id, p.centroid, CASE WHEN p.centroid IS NULL THEN NULL ELSE 'city' END,
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
			modeCode: "L",
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
