#!/usr/bin/env bun
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	buildAtOptions,
	buildCzOptions,
	buildEsOptions,
	buildFrOptions,
	buildGbOptions,
	buildItOptions,
	czPlacesUrls,
	esPlacesBase,
	gbPlacesUrls,
	itPlacesUrl,
	parseArgs,
	resolveDatabaseUrl,
} from "./config";
import { COMMANDS, type Command, USAGE } from "./index";
import { connect } from "./lib/db";
import { drainOutbox } from "./outbox";
import { runAt } from "./run-at";
import { runCz } from "./run-cz";
import { runEs } from "./run-es";
import { runFr } from "./run-fr";
import { runGb } from "./run-gb";
import { runIt } from "./run-it";
import {
	DEFAULT_AT_PLACES_URL,
	fetchGemeinden,
	importAtPlaces,
	readGemeinden,
} from "./sources/at/places";
import { fetchCzPlaceSources, importCzPlaces, readCzPlaceSources } from "./sources/cz/places";
import { fetchEsPlaceSources, importEsPlaces, readEsPlaceSources } from "./sources/es/places";
import { fetchPlaceSources, importPlaces, readPlaceSources } from "./sources/fr/places";
import { fetchGbPlaceSources, importGbPlaces, readGbPlaceSources } from "./sources/gb/places";
import { fetchItPlaceSources, importItPlaces, readItPlaceSources } from "./sources/it/places";

const isCommand = (value: string | undefined): value is Command =>
	COMMANDS.includes(value as Command);

/** Downloads the UK's place sources to a temporary directory, removed once they are read. */
async function fetchGbPlacesOnce() {
	const dir = await mkdtemp(join(tmpdir(), "apercura-etl-gb-places-"));
	try {
		return await fetchGbPlaceSources(gbPlacesUrls(process.env), dir);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

/** Downloads RÚIAN's state file to a temporary directory, removed once it is read. */
async function fetchCzPlacesOnce() {
	const dir = await mkdtemp(join(tmpdir(), "apercura-etl-cz-places-"));
	try {
		return await fetchCzPlaceSources(czPlacesUrls(process.env), dir);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

/** Downloads ISTAT's boundaries to a temporary directory, removed once they are read. */
async function fetchItPlacesOnce() {
	const dir = await mkdtemp(join(tmpdir(), "apercura-etl-it-places-"));
	try {
		return await fetchItPlaceSources(itPlacesUrl(process.env), dir);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

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

	if (
		command === "etl:at" ||
		command === "etl:gb" ||
		command === "etl:cz" ||
		command === "etl:es" ||
		command === "etl:it"
	) {
		const outcome =
			command === "etl:at"
				? await runAt(buildAtOptions(flags, process.env), log)
				: command === "etl:gb"
					? await runGb(buildGbOptions(flags, process.env), log)
					: command === "etl:cz"
						? await runCz(buildCzOptions(flags, process.env), log)
						: command === "etl:es"
							? await runEs(buildEsOptions(flags, process.env), log)
							: await runIt(buildItOptions(flags, process.env), log);
		log(`Run ${outcome.runId} ${outcome.status}`);
		console.log(
			JSON.stringify(
				{
					runId: outcome.runId,
					status: outcome.status,
					sourceErrors: outcome.sourceErrors,
					totals: outcome.stats.totals,
				},
				null,
				2,
			),
		);
		if (outcome.status === "failed") return 1;
		if (outcome.status === "blocked") return 2;
		// Imported, but a list was left out: the scheduler's alert should fire.
		if (Object.keys(outcome.sourceErrors).length > 0) return 3;
		return 0;
	}

	const sql = connect(resolveDatabaseUrl(process.env));
	try {
		if (command === "etl:places") {
			const country = String(flags.get("country") ?? "fr").toLowerCase();
			if (!["fr", "at", "gb", "cz", "es", "it"].includes(country))
				throw new Error(`Unknown --country ${country}`);
			const sourceDir = flags.get("source-dir");
			const [run] = await sql<{ id: number }[]>`
				INSERT INTO directory.etl_runs (source, status, scope)
				VALUES (${`${country}-places`}, 'running', '{}'::jsonb) RETURNING id
			`;
			const runId = run?.id ?? 0;
			const stats =
				country === "it"
					? await importItPlaces(
							sql,
							typeof sourceDir === "string"
								? await readItPlaceSources(sourceDir)
								: await fetchItPlacesOnce(),
							runId,
						)
					: country === "es"
						? await importEsPlaces(
								sql,
								typeof sourceDir === "string"
									? await readEsPlaceSources(sourceDir)
									: await fetchEsPlaceSources(esPlacesBase(process.env)),
								runId,
							)
						: country === "cz"
							? await importCzPlaces(
									sql,
									typeof sourceDir === "string"
										? await readCzPlaceSources(sourceDir)
										: await fetchCzPlacesOnce(),
									runId,
								)
							: country === "gb"
								? await importGbPlaces(
										sql,
										typeof sourceDir === "string"
											? await readGbPlaceSources(sourceDir)
											: await fetchGbPlacesOnce(),
										runId,
									)
								: country === "at"
									? await importAtPlaces(
											sql,
											typeof sourceDir === "string"
												? await readGemeinden(sourceDir)
												: await fetchGemeinden(
														process.env.ETL_AT_PLACES_URL || DEFAULT_AT_PLACES_URL,
													),
											runId,
										)
									: await importPlaces(
											sql,
											typeof sourceDir === "string"
												? await readPlaceSources(sourceDir)
												: await fetchPlaceSources(
														process.env.ETL_GEO_API_URL || "https://geo.api.gouv.fr",
													),
											runId,
										);
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
