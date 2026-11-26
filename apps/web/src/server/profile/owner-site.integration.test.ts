/**
 * Places an owner adds to their page, in their market (#107), against a real, migrated
 * database (DATABASE_URL_TEST): Austria finds the Gemeinde by name (its places carry no
 * postcodes) and checks the Austrian postcode and phone formats.
 * Synthetic data only; skipped when the variable is unset.
 */
import { randomUUID } from "node:crypto";
import { createDb, type Database } from "@apercura/db";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.DATABASE_URL_TEST;

describe.skipIf(!url)("owner-added places by market (database)", async () => {
	const { addOwnerSite, ProfileError } = await import("./service");
	let db: Database;
	const run = randomUUID().slice(0, 8);
	const placeIds: number[] = [];
	const practitionerIds: number[] = [];

	/** Integer ids only: safe to inline as an array literal. */
	const idArray = (ids: number[]) =>
		sql.raw(`ARRAY[${ids.map(Number).join(",") || "0"}]::integer[]`);

	const place = async (values: {
		country?: string;
		kind: string;
		code: string;
		name: string;
		slug: string;
		departmentCode: string | null;
	}) => {
		const [row] = await db.execute<{ id: number }>(sql`
			INSERT INTO directory.places (country, kind, code, name, slug, department_code, postcodes, centroid)
			VALUES (${values.country ?? "AT"}, ${values.kind}, ${values.code}, ${values.name}, ${values.slug},
				${values.departmentCode}, '{}'::text[],
				ST_SetSRID(ST_MakePoint(16.37, 48.21), 4326)::geography)
			RETURNING id
		`);
		placeIds.push(row?.id ?? 0);
		return row?.id ?? 0;
	};

	const practitioner = async (country: string, scheme: string) => {
		const nationalId = String(100_000_000 + Math.floor(Math.random() * 800_000_000));
		const [row] = await db.execute<{ id: number }>(sql`
			INSERT INTO directory.practitioners (country, id_scheme, national_id, first_name, last_name,
				first_name_source, last_name_source, profession_code, slug)
			VALUES (${country}, ${scheme}, ${nationalId}, 'Testa', 'Ortfiktiv', 'Testa', 'Ortfiktiv',
				'ARZT', ${`testa-ortfiktiv-${run}-${nationalId}`})
			RETURNING id
		`);
		practitionerIds.push(row?.id ?? 0);
		return row?.id ?? 0;
	};

	const siteOf = async (siteId: number) => {
		const [row] = await db.execute<{
			place_id: number;
			country_code: string;
			phone: string | null;
		}>(sql`
			SELECT place_id, country_code, phone FROM directory.sites WHERE id = ${siteId}
		`);
		return row;
	};

	let gemeinde = 0;
	let municipio = 0;

	beforeAll(async () => {
		db = createDb({ url: url as string, max: 2 });
		// A code and a name no real Gemeinde has, so the test never meets imported places.
		gemeinde = await place({
			kind: "commune",
			code: `x${run}`,
			name: `Fiktivdorf ${run}`,
			slug: `fiktivdorf-${run}`,
			departmentCode: "6",
		});
		// A Spanish municipality no register has, in the province of Madrid (28).
		municipio = await place({
			country: "ES",
			kind: "commune",
			code: `x${run}`,
			name: `Villaficticia ${run}`,
			slug: `villaficticia-${run}`,
			departmentCode: "28",
		});
	});

	afterAll(async () => {
		await db.execute(
			sql`DELETE FROM directory.activities WHERE practitioner_id = ANY (${idArray(practitionerIds)})`,
		);
		await db.execute(sql`DELETE FROM directory.sites WHERE place_id = ANY (${idArray(placeIds)})`);
		await db.execute(
			sql`DELETE FROM directory.practitioners WHERE id = ANY (${idArray(practitionerIds)})`,
		);
		await db.execute(sql`DELETE FROM directory.places WHERE id = ANY (${idArray(placeIds)})`);
		await db.close();
	});

	it("places an Austrian practice in its Gemeinde by name, with an Austrian phone", async () => {
		const id = await practitioner("AT", "AT-STMK");
		const { siteId } = await addOwnerSite(db, id, {
			name: "Ordination",
			addressLine: "Fiktivgasse 1",
			postcode: "8010",
			city: `Fiktivdorf ${run}`,
			phone: "0316 0000123",
		});
		expect(await siteOf(siteId)).toEqual({
			place_id: gemeinde,
			country_code: "AT",
			phone: "+433160000123",
		});
	});

	it("refuses a French postcode or phone for an Austrian page", async () => {
		const id = await practitioner("AT", "AT-WIEN");
		const input = { name: "Ordination", addressLine: "Fiktivgasse 1", city: "Wien", phone: null };
		await expect(addOwnerSite(db, id, { ...input, postcode: "75001" })).rejects.toBeInstanceOf(
			ProfileError,
		);
		await expect(
			addOwnerSite(db, id, { ...input, postcode: "8010", city: `Fiktivdorf ${run}`, phone: "12" }),
		).rejects.toThrow("BAD_PHONE");
	});

	it("places a Spanish centre in its municipality, in the province its postcode names", async () => {
		const id = await practitioner("ES", "ES-REGCESS");
		const input = {
			name: "Consulta",
			addressLine: "Calle Ficticia, 1",
			city: `Villaficticia ${run}`,
			phone: "910 000 123",
		};
		const { siteId } = await addOwnerSite(db, id, { ...input, postcode: "28014" });
		expect(await siteOf(siteId)).toEqual({
			place_id: municipio,
			country_code: "ES",
			phone: "+34910000123",
		});
		// Another province's postcode names another municipality: refused.
		await expect(addOwnerSite(db, id, { ...input, postcode: "08001" })).rejects.toThrow(
			"UNKNOWN_PLACE",
		);
	});
});
