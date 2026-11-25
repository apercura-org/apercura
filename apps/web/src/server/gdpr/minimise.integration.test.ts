/**
 * Data minimisation of removed practitioners (#116) against a real, migrated database
 * (DATABASE_URL_TEST): once an objection is confirmed only the suppression stays; an owner's
 * removal keeps a bare row for their space and agenda; the storage objects, cache tags and
 * listing counts follow. The imports over it are tested in packages/etl. Synthetic data only;
 * skipped when the variable is unset.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { createDb, type Database } from "@apercura/db";
import { organization, user } from "@apercura/db/schema";
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isolatedDatabase } from "~/test/isolated-database";

const url = process.env.DATABASE_URL_TEST;

// Test-only platform key (32 random bytes per run), read by ~/server/crypto/platform.
process.env.ENCRYPTION_KEYS = `t1:${randomBytes(32).toString("base64")}`;
process.env.ENCRYPTION_ACTIVE_KEY = "t1";

/** A valid RPPS (Luhn) with a random body, so runs never collide. */
function syntheticRpps(): string {
	const body = `1997${String(Math.floor(Math.random() * 1e6)).padStart(6, "0")}`;
	for (let check = 0; check <= 9; check++) {
		const candidate = `${body}${check}`;
		let sum = 0;
		for (let index = 0; index < 11; index++) {
			let digit = Number(candidate[10 - index]);
			if (index % 2 === 1) {
				digit *= 2;
				if (digit > 9) digit -= 9;
			}
			sum += digit;
		}
		if (sum % 10 === 0) return candidate;
	}
	throw new Error("unreachable");
}

describe.skipIf(!url)("minimisation of removed practitioners (database)", async () => {
	const gdpr = await import("./service");
	const minimise = await import("./minimise");
	const { editorData } = await import("../profile/service");
	const { memoryDriver } = await import("../storage");

	let db: Database;
	// A database of its own: `refreshLandingCounts` rebuilds every listing count and `afterPurge`
	// drains every queued storage deletion, those of the files running alongside included.
	const isolated = isolatedDatabase("minimise");
	const run = randomUUID().slice(0, 8);
	const ids = (name: string) => `${name}-${run}`;
	const users = { admin: ids("admin"), owner: ids("owner"), claimant: ids("claimant") };
	const orgId = ids("org");
	/** A listing slug of this run only: the listing counts it gets are this file's alone. */
	const listing = `test-listing-${run}`;
	const created = { practitioners: [] as number[], places: [] as number[], sites: [] as number[] };
	const rppsOf = new Map<number, string>();

	const count = async (query: string) => {
		const [row] = await db.$client.unsafe<{ n: number }[]>(
			`SELECT count(*)::integer AS n FROM ${query}`,
		);
		return row?.n ?? 0;
	};

	/**
	 * A synthetic practitioner with everything the directory and the app can store about one:
	 * an office, a qualification, Ameli fields, the page and search entry, a former slug.
	 */
	async function practitioner() {
		const rpps = syntheticRpps();
		const sql = db.$client;
		const [place] = await sql<{ id: number }[]>`
			INSERT INTO directory.places (kind, code, name, slug, department_code, postcodes, centroid)
			VALUES ('commune', ${`M${run}${created.places.length}`}, 'Exempleville',
				${`exempleville-m-${run}-${created.places.length}`}, '99', '{99999}', 'SRID=4326;POINT(2.35 48.85)')
			RETURNING id
		`;
		const [person] = await sql<{ id: number }[]>`
			INSERT INTO directory.practitioners (national_id, national_pp_id, first_name, last_name,
				first_name_source, last_name_source, profession_code, listing_slug, slug, primary_place_id,
				indexable, billing_sector, carte_vitale, ameli_matched_at, source_hash, qualifications_hash)
			VALUES (${rpps}, ${`8${rpps}`}, 'Exemple', 'Martin', 'EXEMPLE', 'MARTIN', '10', ${listing},
				${`exemple-martin-${rpps}`}, ${place?.id ?? null}, true, '1', true, now(), 'h', 'q')
			RETURNING id
		`;
		const id = person?.id ?? 0;
		const [site] = await sql<{ id: number }[]>`
			INSERT INTO directory.sites (source, source_key, kind, name, address_line, postcode, place_id,
				location, geo_precision, phone, phone_kind, email)
			VALUES ('ans', ${`min-${rpps}`}, 'office', 'Cabinet du Dr Martin', '1 rue de l’Exemple', '99999',
				${place?.id ?? null}, 'SRID=4326;POINT(2.35 48.85)', 'address', '+33199000998', 'direct',
				'cabinet@exemple.test')
			RETURNING id
		`;
		await sql`
			INSERT INTO directory.activities (practitioner_id, site_id, source, source_key, practice_kind, is_primary)
			VALUES (${id}, ${site?.id ?? 0}, 'ans', ${`min-${rpps}`}, 'office', true)
		`;
		await sql`
			INSERT INTO directory.practitioner_qualifications (practitioner_id, source, type_code, code, label)
			VALUES (${id}, 'savoir_faire', 'S', 'SM54', 'Médecine générale')
		`;
		await sql`
			INSERT INTO directory.practitioner_slug_aliases (practitioner_id, slug)
			VALUES (${id}, ${`ancien-nom-${rpps}`})
		`;
		await sql`SELECT directory.refresh_practitioner(${[id]}::integer[])`;
		created.practitioners.push(id);
		created.places.push(place?.id ?? 0);
		created.sites.push(site?.id ?? 0);
		rppsOf.set(id, rpps);
		return { id, rpps, siteId: site?.id ?? 0, placeId: place?.id ?? 0 };
	}

	/** What is left about a practitioner, table by table. */
	async function leftOf(id: number) {
		const tables = [
			"activities",
			"practitioner_qualifications",
			"practitioner_profiles",
			"practitioner_slug_aliases",
			"practitioner_pages",
			"search_docs",
			"page_view_days",
			"practitioner_contact_requests",
			"reports",
			"removal_requests",
			"claims",
		];
		const left: Record<string, number> = {};
		for (const table of tables) {
			left[table] = await count(`directory.${table} WHERE practitioner_id = ${id}`);
		}
		return left;
	}
	const nothingLeft = {
		activities: 0,
		practitioner_qualifications: 0,
		practitioner_profiles: 0,
		practitioner_slug_aliases: 0,
		practitioner_pages: 0,
		search_docs: 0,
		page_view_days: 0,
		practitioner_contact_requests: 0,
		reports: 0,
		removal_requests: 0,
		claims: 0,
	};

	beforeAll(async () => {
		db = createDb({ url: await isolated.create(), max: 2 });
		await db.insert(user).values(
			Object.values(users).map((id) => ({
				id,
				name: id,
				email: `${id}@example.test`,
				emailVerified: true,
				twoFactorEnabled: true,
				isPlatformAdmin: id === users.admin,
			})),
		);
		await db.insert(organization).values({ id: orgId, name: "Cabinet Exemple", slug: orgId });
	});

	afterAll(async () => {
		if (!db) return isolated.drop();
		const sql = db.$client;
		await sql`DELETE FROM care.calendars WHERE organization_id = ${orgId}`;
		await sql`DELETE FROM directory.suppressions WHERE national_id = ANY (${[...rppsOf.values()]}::text[])`;
		await sql`DELETE FROM directory.activities WHERE practitioner_id = ANY (${created.practitioners}::integer[])`;
		await sql`DELETE FROM directory.practitioners WHERE id = ANY (${created.practitioners}::integer[])`;
		await sql`DELETE FROM directory.sites WHERE id = ANY (${created.sites}::integer[])`;
		await sql`DELETE FROM directory.places WHERE id = ANY (${created.places}::integer[])`;
		await sql`DELETE FROM directory.landing_pages WHERE listing_slug = ${listing}`;
		await db.delete(organization).where(inArray(organization.id, [orgId]));
		await db.delete(user).where(inArray(user.id, Object.values(users)));
		await db.close();
		await isolated.drop();
	});

	it("keeps only the suppression once an objection is confirmed", async () => {
		const page = await practitioner();
		const sql = db.$client;
		const storage = memoryDriver();
		const photo = `photos/min-${run}.webp`;
		const document = `claims/min-${run}`;
		await storage.put(photo, new Uint8Array([1]), "image/webp");
		await storage.put(document, new Uint8Array([2]), "application/octet-stream");
		// What the app may hold about an unclaimed page: an abandoned profile, a claim in progress
		// with its proof, page views, an "I am this practitioner" request (closed, so the admin
		// alerts suite running alongside never counts it), an error report.
		await sql`
			INSERT INTO directory.practitioner_profiles (practitioner_id, headline, photo_key)
			VALUES (${page.id}, 'Présentation', ${photo})
		`;
		const claimId = ids("claim");
		await sql`
			INSERT INTO directory.claims (id, practitioner_id, user_id, status)
			VALUES (${claimId}, ${page.id}, ${users.claimant}, 'in_review')
		`;
		await sql`
			INSERT INTO directory.claim_documents (id, claim_id, kind, storage_key, content_type, byte_size)
			VALUES (${ids("document")}, ${claimId}, 'cps_card', ${document}, 'application/pdf', 1)
		`;
		await sql`INSERT INTO directory.page_view_days (practitioner_id, day, views) VALUES (${page.id}, current_date, 3)`;
		await sql`
			INSERT INTO directory.practitioner_contact_requests (id, practitioner_id, status, content_enc)
			VALUES (${ids("contact")}, ${page.id}, 'closed', 'enc:v1:synthetic')
		`;
		await sql`
			INSERT INTO directory.reports (id, practitioner_id, kind, content_enc)
			VALUES (${ids("report")}, ${page.id}, 'wrong_info', 'enc:v1:synthetic')
		`;
		// The listing counts it before the objection.
		expect(await minimise.refreshLandingCounts(db, [])).toBe(true);
		const key = `${listing}:${page.placeId}`;
		expect(await count(`directory.landing_pages WHERE key = '${key}'`)).toBe(1);

		const request = await gdpr.requestRemoval(db, {
			ref: page.rpps,
			contact: "objection@example.test",
			message: "Je ne souhaite pas apparaître.",
			locale: "fr",
		});
		const second = await gdpr.requestRemoval(db, {
			ref: page.rpps,
			contact: "again@example.test",
			message: null,
			locale: "fr",
		});
		const decided = await gdpr.decideRemoval(db, {
			id: request.id,
			adminId: users.admin,
			confirm: true,
			reason: null,
		});
		expect(decided.contact).toBe("objection@example.test");
		const purge = decided.purge;
		expect(purge).toMatchObject({ deleted: 1, kept: 0, sites: 1, objects: 2 });
		expect(purge?.tags).toEqual(
			expect.arrayContaining([
				`practitioner:${page.id}`,
				`listing:${listing}:${page.placeId}`,
				`listing:${listing}:fr`,
				`site:${page.siteId}`,
			]),
		);

		// Only the suppression is left: no row, nothing hanging off it, no site, both requests gone.
		expect(await count(`directory.practitioners WHERE id = ${page.id}`)).toBe(0);
		expect(await leftOf(page.id)).toEqual(nothingLeft);
		expect(await count(`directory.sites WHERE id = ${page.siteId}`)).toBe(0);
		expect(await count(`directory.removal_requests WHERE id = '${second.id}'`)).toBe(0);
		const suppressions = await sql<
			{ country: string; id_scheme: string; reason: string; created_by: string; dated: boolean }[]
		>`
			SELECT country, id_scheme, reason, created_by, created_at IS NOT NULL AS dated
			FROM directory.suppressions WHERE national_id = ${page.rpps}
		`;
		expect(suppressions).toEqual([
			{
				country: "FR",
				id_scheme: "RPPS",
				reason: "objection",
				created_by: users.admin,
				dated: true,
			},
		]);
		expect(
			await count(`directory.storage_deletions WHERE key IN ('${photo}', '${document}')`),
		).toBe(2);

		// After the commit: tags expired, listing counts rebuilt, objects deleted.
		const expired: string[] = [];
		await minimise.afterPurge(
			db,
			purge ?? { deleted: 0, kept: 0, sites: 0, objects: 0, tags: [] },
			{
				storage,
				revalidate: (tag) => {
					expired.push(tag);
				},
			},
		);
		expect(expired).toEqual(expect.arrayContaining([...(purge?.tags ?? []), "sitemap"]));
		expect(await count(`directory.landing_pages WHERE key = '${key}'`)).toBe(0);
		expect(storage.objects.has(photo)).toBe(false);
		expect(storage.objects.has(document)).toBe(false);
		expect(
			await count(`directory.storage_deletions WHERE key IN ('${photo}', '${document}')`),
		).toBe(0);
		// A second purge finds nothing left to do.
		expect(await minimise.purgeSuppressed(db, [page.id])).toMatchObject({ deleted: 0, kept: 0 });
	});

	it("keeps a bare row for an owner who removes their page, and the place their agenda uses", async () => {
		const page = await practitioner();
		const sql = db.$client;
		await sql`
			UPDATE directory.practitioners SET claim_status = 'claimed', owner_org_id = ${orgId}
			WHERE id = ${page.id}
		`;
		await sql`
			INSERT INTO directory.practitioner_profiles (practitioner_id, headline, published_at)
			VALUES (${page.id}, 'Présentation', now())
		`;
		// A second place, added by the owner, without an agenda: it goes with the page.
		const [own] = await sql<{ id: number }[]>`
			INSERT INTO directory.sites (source, source_key, kind, name, address_line, postcode, place_id)
			VALUES ('owner', ${ids("own-site")}, 'office', 'Second cabinet', '2 rue de l’Exemple', '99999',
				${page.placeId})
			RETURNING id
		`;
		created.sites.push(own?.id ?? 0);
		await sql`
			INSERT INTO directory.activities (practitioner_id, site_id, source, source_key, practice_kind)
			VALUES (${page.id}, ${own?.id ?? 0}, 'owner', ${ids("own-activity")}, 'office')
		`;
		await sql`
			INSERT INTO care.calendars (organization_id, practitioner_id, site_id, time_zone)
			VALUES (${orgId}, ${page.id}, ${page.siteId}, 'Europe/Paris')
		`;

		const purge = await gdpr.setOwnerRemoval(db, {
			practitionerId: page.id,
			userId: users.owner,
			removed: true,
		});
		expect(purge).toMatchObject({ deleted: 0, kept: 1, sites: 1 });
		expect(purge?.tags).toContain(`practitioner:${page.id}`);
		const [row] = await sql<
			{
				status: string;
				indexable: boolean;
				claim_status: string;
				last_name: string;
				ameli: boolean;
				source_hash: string | null;
			}[]
		>`
			SELECT status, indexable, claim_status, last_name, ameli_matched_at IS NOT NULL AS ameli,
				source_hash
			FROM directory.practitioners WHERE id = ${page.id}
		`;
		// Never published, nothing from the registry's enrichments, what the owner's space shows.
		expect(row).toEqual({
			status: "suppressed",
			indexable: false,
			claim_status: "claimed",
			last_name: "Martin",
			ameli: false,
			source_hash: null,
		});
		expect(await leftOf(page.id)).toEqual({ ...nothingLeft, activities: 1 });
		// The agenda's place stays linked; the owner's other place is deleted.
		expect(
			await count(
				`directory.activities WHERE practitioner_id = ${page.id} AND site_id = ${page.siteId}`,
			),
		).toBe(1);
		expect(await count(`directory.sites WHERE id = ${own?.id ?? 0}`)).toBe(0);
		const editor = await editorData(db, page.id);
		expect(editor.removedByOwner).toBe(true);
		// Idempotent: nothing more to purge, no tag to expire again.
		expect(await minimise.purgeSuppressed(db, [page.id])).toMatchObject({ kept: 1, tags: [] });

		// Restored from their space: the suppression goes, the next import refills the page.
		expect(
			await gdpr.setOwnerRemoval(db, {
				practitionerId: page.id,
				userId: users.owner,
				removed: false,
			}),
		).toBeNull();
		expect(await count(`directory.suppressions WHERE national_id = '${page.rpps}'`)).toBe(0);
		expect(await count(`directory.practitioners WHERE id = ${page.id} AND status = 'active'`)).toBe(
			1,
		);

		// Removed again, then the account goes (no claim, no agenda): only the suppression stays.
		await gdpr.setOwnerRemoval(db, { practitionerId: page.id, userId: users.owner, removed: true });
		await sql`DELETE FROM care.calendars WHERE practitioner_id = ${page.id}`;
		await sql`
			UPDATE directory.practitioners SET claim_status = 'unclaimed', owner_org_id = NULL
			WHERE id = ${page.id}
		`;
		expect(await minimise.purgeSuppressed(db, [page.id])).toMatchObject({ deleted: 1, kept: 0 });
		expect(await count(`directory.practitioners WHERE id = ${page.id}`)).toBe(0);
		expect(await count(`directory.sites WHERE id = ${page.siteId}`)).toBe(0);
		expect(
			await count(`directory.suppressions WHERE national_id = '${page.rpps}' AND reason = 'owner'`),
		).toBe(1);
	});

	it("leaves practitioners without a suppression untouched", async () => {
		const page = await practitioner();
		expect(await minimise.purgeSuppressed(db, [page.id])).toMatchObject({ deleted: 0, kept: 0 });
		expect(await leftOf(page.id)).toMatchObject({
			activities: 1,
			practitioner_qualifications: 1,
			practitioner_pages: 1,
			search_docs: 1,
		});
	});
});
