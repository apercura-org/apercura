/**
 * Switzerland's coverage query (issue #161) against a real, migrated database of its own
 * (DATABASE_URL_TEST): which lists the published Swiss facilities come from or are credited to.
 * Synthetic rows only; skipped when the variable is unset.
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { shapeSwissCoverage } from "~/lib/swiss-coverage";
import { isolatedDatabase } from "~/test/isolated-database";
import { readSwissCoverageRows } from "./swiss-coverage";

const url = process.env.DATABASE_URL_TEST;

type Facility = {
	key: string;
	country?: string;
	scheme: string;
	profession: string;
	/** The activity's source, or none. */
	source?: string;
	/** The activity was removed by a later run. */
	removed?: boolean;
	/** `quelle` credits: the lists merged into the facility. */
	credits?: string[];
	/** It has a page (the read model). */
	page?: boolean;
	withheld?: boolean;
	status?: string;
};

describe.skipIf(!url)("Switzerland's coverage (database)", () => {
	// A database of its own: the query reads every Swiss page.
	const isolated = isolatedDatabase("swiss_coverage");
	let sql: ReturnType<typeof postgres>;

	const insert = async (facility: Facility) => {
		const country = facility.country ?? "CH";
		const slug = `coverage-${facility.key}`;
		const [row] = await sql<{ id: number }[]>`
			INSERT INTO directory.practitioners (
				country, id_scheme, national_id, first_name, last_name, first_name_source,
				last_name_source, profession_code, slug, status, withheld_at
			) VALUES (
				${country}, ${facility.scheme}, ${facility.key}, '', ${slug}, '', ${slug},
				${facility.profession}, ${slug}, ${facility.status ?? "active"},
				${facility.withheld ? new Date() : null}
			)
			RETURNING id
		`;
		const id = row?.id as number;
		if (facility.source) {
			await sql`
				INSERT INTO directory.activities (practitioner_id, source, source_key, practice_kind, removed_at)
				VALUES (${id}, ${facility.source}, ${facility.key}, 'office',
					${facility.removed ? new Date() : null})
			`;
		}
		for (const code of facility.credits ?? []) {
			await sql`
				INSERT INTO directory.practitioner_qualifications (practitioner_id, source, type_code, code)
				VALUES (${id}, 'quelle', '', ${code})
			`;
		}
		if (facility.page ?? true) {
			await sql`
				INSERT INTO directory.practitioner_pages (practitioner_id, country, slug, payload, indexable, content_hash)
				VALUES (${id}, ${country}, ${slug}, '{}'::jsonb, true, ${slug})
			`;
		}
	};

	beforeAll(async () => {
		sql = postgres(await isolated.create(), { max: 1, onnotice: () => {} });
		for (const facility of [
			// A FOPH site that Geneva's hospital list completed (its point, its phone).
			{
				key: "bag1",
				scheme: "CH-BAG",
				profession: "CH_HOSPITAL",
				source: "ch-bag-kzp",
				credits: ["ch-ge-hopitaux"],
			},
			{ key: "zh1", scheme: "CH-ZH-PH", profession: "CH_NURSING_HOME", source: "ch-zh-heime" },
			// A home of Basel-Stadt that Basel-Landschaft's list also gives: both lists are read.
			{
				key: "bs1",
				scheme: "CH-BS-PH",
				profession: "CH_NURSING_HOME",
				source: "ch-bs-heime",
				credits: ["ch-bl-heime"],
			},
			{ key: "bl1", scheme: "CH-BL-PHARM", profession: "CH_PHARMACY", source: "ch-bl-apotheken" },
			// Not published: no page, a withheld page, a removed facility, a removed activity.
			{
				key: "ge1",
				scheme: "CH-GE-EMS",
				profession: "CH_NURSING_HOME",
				source: "ch-ge-ems",
				page: false,
			},
			{
				key: "ge2",
				scheme: "CH-GE-PHARM",
				profession: "CH_PHARMACY",
				source: "ch-ge-pharmacies",
				withheld: true,
			},
			{
				key: "ge3",
				scheme: "CH-GE-PHARM",
				profession: "CH_PHARMACY",
				source: "ch-ge-pharmacies",
				status: "removed",
			},
			{
				key: "ju1",
				scheme: "CH-JU",
				profession: "CH_NURSING_HOME",
				source: "ch-ju-institutions",
				removed: true,
			},
			// Another market's page never counts, whatever its source.
			{
				key: "fr1",
				country: "FR",
				scheme: "RPPS",
				profession: "10",
				source: "ch-ge-ems",
			},
		] satisfies Facility[]) {
			await insert(facility);
		}
	});

	afterAll(async () => {
		await sql?.end();
		await isolated.drop();
	});

	it("reads the lists of the published Swiss facilities, credits included", async () => {
		expect(await readSwissCoverageRows(sql)).toEqual([
			{ registry: "ch-bag-kzp", professionCode: "CH_HOSPITAL" },
			{ registry: "ch-bl-apotheken", professionCode: "CH_PHARMACY" },
			{ registry: "ch-bl-heime", professionCode: "CH_NURSING_HOME" },
			{ registry: "ch-bs-heime", professionCode: "CH_NURSING_HOME" },
			{ registry: "ch-ge-hopitaux", professionCode: "CH_HOSPITAL" },
			{ registry: "ch-zh-heime", professionCode: "CH_NURSING_HOME" },
		]);
	});

	it("names Geneva for its hospital list only, and no canton whose list is unpublished", async () => {
		expect(shapeSwissCoverage(await readSwissCoverageRows(sql))).toMatchObject({
			hospitalLists: ["GE"],
			nursingHomes: ["ZH", "BS", "BL"],
			pharmacies: ["BL"],
		});
	});
});
