#!/usr/bin/env bun
import { buildFrOptions, parseArgs, resolveDatabaseUrl } from "./config";
import { COMMANDS, type Command, USAGE } from "./index";
import { connect } from "./lib/db";
import { drainOutbox } from "./outbox";
import { runFr } from "./run-fr";
import { fetchPlaceSources, importPlaces, readPlaceSources } from "./sources/fr/places";

const isCommand = (value: string | undefined): value is Command =>
	COMMANDS.includes(value as Command);

const log = (message: string) => console.log(`[${new Date().toISOString()}] ${message}`);

async function main(): Promise<number> {
	const { command, flags } = parseArgs(process.argv.slice(2));
	if (!isCommand(command) || flags.has("help")) {
		console.log(USAGE);
		return command === undefined || flags.has("help") ? 0 : 1;
	}

	if (command === "etl:fr") {
		const outcome = await runFr(buildFrOptions(flags, process.env), log);
		log(`Run ${outcome.runId} ${outcome.status}`);
		console.log(
			JSON.stringify(
				{
					runId: outcome.runId,
					status: outcome.status,
					changes: outcome.stats.changes,
					totals: outcome.stats.totals,
				},
				null,
				2,
			),
		);
		if (outcome.status === "failed") return 1;
		if (outcome.status === "blocked") return 2;
		return 0;
	}

	const sql = connect(resolveDatabaseUrl(process.env));
	try {
		if (command === "etl:places") {
			const sourceDir = flags.get("source-dir");
			const sources =
				typeof sourceDir === "string"
					? await readPlaceSources(sourceDir)
					: await fetchPlaceSources(process.env.ETL_GEO_API_URL || "https://geo.api.gouv.fr");
			const [run] = await sql<{ id: number }[]>`
				INSERT INTO directory.etl_runs (source, status, scope)
				VALUES ('fr-places', 'running', '{}'::jsonb) RETURNING id
			`;
			const runId = run?.id ?? 0;
			const stats = await importPlaces(sql, sources, runId);
			await sql`
				UPDATE directory.etl_runs
				SET status = 'succeeded', stats = ${JSON.stringify(stats)}::text::jsonb, finished_at = now()
				WHERE id = ${runId}
			`;
			log(`Places imported: ${JSON.stringify(stats)}`);
			const outbox = await drainOutbox(sql, {
				appUrl: process.env.APP_URL || null,
				secret: process.env.REVALIDATE_SECRET || null,
				log,
			});
			log(`Revalidation: ${JSON.stringify(outbox)}`);
			return 0;
		}
		const outbox = await drainOutbox(sql, {
			appUrl: process.env.APP_URL || null,
			secret: process.env.REVALIDATE_SECRET || null,
			log,
		});
		log(`Revalidation: ${JSON.stringify(outbox)}`);
		return outbox.status === "done" || outbox.status === "skipped" ? 0 : 1;
	} finally {
		await sql.end();
	}
}

main().then(
	(code) => {
		process.exitCode = code;
	},
	(error: unknown) => {
		console.error(error instanceof Error ? (error.stack ?? error.message) : error);
		process.exitCode = 1;
	},
);
