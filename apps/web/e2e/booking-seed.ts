import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import type postgres from "postgres";

/**
 * Open agendas for four fictitious practitioners of the synthetic fixtures (RPPS 1999999xxxx,
 * never real people), written straight into the `care` schema the way the agenda settings would.
 * Every run starts from a clean slate: earlier e2e appointments, codes and mails are deleted, and a
 * page an earlier run claimed for one of these practices (the screen-reader spec signs its owner
 * in) is unclaimed again.
 */
export const BOOKING_PRACTITIONERS = {
	/** Confirms at once, two reasons (the reason step shows). */
	direct: { rpps: "19999991003", slug: "anne-essaiaa-19999991003", name: "Anne Essaiaa" },
	/** Manual validation: requests wait for the practice. */
	pending: { rpps: "19999991011", slug: "benoit-essaiab-19999991011", name: "Benoit Essaiab" },
	/** Manage page: cancel and move from the email link. */
	manage: { rpps: "19999991029", slug: "claire-essaiac-19999991029", name: "Claire Essaiac" },
	/** Two browsers race for the same time. */
	race: { rpps: "19999991037", slug: "denis-essaiad-19999991037", name: "Denis Essaiad" },
	/** Screen-reader flows (`screen-reader.spec.ts`): booking, /rdv and the owner's agenda. */
	screenReader: { rpps: "19999991045", slug: "elsa-essaiae-19999991045", name: "Elsa Essaiae" },
} as const;

type Key = keyof typeof BOOKING_PRACTITIONERS;

const SETTINGS: Record<
	Key,
	{ manualValidation: boolean; types: { name: string; minutes: number; audience: string }[] }
> = {
	direct: {
		manualValidation: false,
		types: [
			{ name: "Consultation", minutes: 15, audience: "all" },
			{ name: "Première consultation", minutes: 30, audience: "new" },
		],
	},
	pending: {
		manualValidation: true,
		types: [{ name: "Consultation", minutes: 15, audience: "all" }],
	},
	manage: {
		manualValidation: false,
		types: [{ name: "Consultation", minutes: 15, audience: "all" }],
	},
	race: {
		manualValidation: false,
		types: [{ name: "Consultation", minutes: 15, audience: "all" }],
	},
	screenReader: {
		manualValidation: false,
		types: [
			{ name: "Consultation", minutes: 15, audience: "all" },
			{ name: "Première consultation", minutes: 30, audience: "new" },
		],
	},
};

const CARE_TABLES = [
	"outbox",
	"otp_challenges",
	"appointment_events",
	"appointments",
	"availability_exceptions",
	"availability_rules",
	"appointment_types",
	"calendars",
	"organization_keys",
	"audit_events",
];

const orgOf = (key: Key) => `e2e-booking-${key}`;

export async function seedBookingAgendas(sql: postgres.Sql) {
	const orgs = (Object.keys(BOOKING_PRACTITIONERS) as Key[]).map(orgOf);
	for (const table of CARE_TABLES) {
		await sql.unsafe(`delete from care.${table} where organization_id = any($1::text[])`, [orgs]);
	}
	const unclaimed = await sql<{ id: number }[]>`
		update directory.practitioners set claim_status = 'unclaimed', owner_org_id = null
		where owner_org_id = any(${orgs}::text[])
		returning id
	`;
	if (unclaimed.length > 0) {
		await sql`delete from directory.claims where practitioner_id = any(${unclaimed.map((row) => row.id)}::integer[])`;
		await sql`select directory.refresh_practitioner(${unclaimed.map((row) => row.id)}::integer[])`;
	}
	await sql`delete from directory.organization where id = any(${orgs}::text[])`;
	// Booking counters of earlier runs (holds, codes, manage calls, proof-of-work replays).
	await sql`delete from directory.rate_limits where key like 'booking%' or key like 'altcha:%'`;

	for (const key of Object.keys(BOOKING_PRACTITIONERS) as Key[]) {
		const { rpps } = BOOKING_PRACTITIONERS[key];
		const [practitioner] = await sql<{ id: number; siteId: number }[]>`
			select p.id, a.site_id as "siteId"
			from directory.practitioners p
			join directory.activities a on a.practitioner_id = p.id and a.is_primary and a.removed_at is null
			where p.national_id = ${rpps}
			limit 1
		`;
		if (!practitioner) {
			throw new Error(
				`Fixture practitioner ${rpps} is missing: import packages/etl/fixtures/fr first.`,
			);
		}
		const org = orgOf(key);
		await sql`
			insert into directory.organization (id, name, slug)
			values (${org}, ${`Cabinet fictif ${BOOKING_PRACTITIONERS[key].name}`}, ${org})
		`;
		await sql`update directory.practitioners set next_free_at = null where id = ${practitioner.id}`;
		const [calendar] = await sql<{ id: string }[]>`
			insert into care.calendars (
				organization_id, practitioner_id, site_id, time_zone, status, opened_at,
				min_notice_min, horizon_days, step_min, manual_validation, cancellation_cutoff_min,
				require_phone, ask_first_visit
			) values (
				${org}, ${practitioner.id}, ${practitioner.siteId}, 'Europe/Paris', 'open', now(),
				60, 60, 15, ${SETTINGS[key].manualValidation}, 1440, true, true
			)
			returning id
		`;
		if (!calendar) {
			throw new Error("Calendar insert failed");
		}
		for (const [position, type] of SETTINGS[key].types.entries()) {
			await sql`
				insert into care.appointment_types
					(organization_id, calendar_id, name, duration_min, audience, position)
				values (${org}, ${calendar.id}, ${type.name}, ${type.minutes}, ${type.audience}, ${position})
			`;
		}
		for (let weekday = 1; weekday <= 7; weekday += 1) {
			await sql`
				insert into care.availability_rules (organization_id, calendar_id, weekday, start_time, end_time)
				values (${org}, ${calendar.id}, ${weekday}, '08:00', '19:00')
			`;
		}
	}
}

/**
 * The denormalized "next free time" of the seeded practitioners, computed by the real job
 * (`bun run jobs:tick next-free`), which also asks a running test server to refresh their pages.
 */
export function refreshNextFree(env: Record<string, string | undefined>) {
	const web = fileURLToPath(new URL("..", import.meta.url));
	execFileSync("bun", ["run", "jobs:tick", "next-free"], {
		cwd: web,
		env: { ...process.env, ...env, SKIP_ENV_VALIDATION: "1" },
		stdio: "inherit",
	});
}
