#!/usr/bin/env bun
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	buildAtOptions,
	buildChOptions,
	buildCyOptions,
	buildCzOptions,
	buildDeOptions,
	buildEeOptions,
	buildEsOptions,
	buildFiOptions,
	buildFrOptions,
	buildGbOptions,
	buildIeOptions,
	buildItOptions,
	buildLtOptions,
	buildLvOptions,
	buildNoOptions,
	buildPlOptions,
	buildSiOptions,
	czPlacesUrls,
	esPlacesBase,
	fiPlacesUrls,
	gbPlacesUrls,
	iePlacesUrls,
	itPlacesUrl,
	parseArgs,
	plPlacesUrls,
	resolveDatabaseUrl,
	todayInLjubljana,
	todayInZurich,
} from "./config";
import { COMMANDS, type Command, USAGE } from "./index";
import { connect } from "./lib/db";
import { drainOutbox } from "./outbox";
import { runAt } from "./run-at";
import { runCh } from "./run-ch";
import { runCy } from "./run-cy";
import { runCz } from "./run-cz";
import { runDe } from "./run-de";
import { runEe } from "./run-ee";
import { runEs } from "./run-es";
import { runFi } from "./run-fi";
import { runFr } from "./run-fr";
import { runGb } from "./run-gb";
import { runIe } from "./run-ie";
import { runIt } from "./run-it";
import { runLt } from "./run-lt";
import { runLv } from "./run-lv";
import { runNo } from "./run-no";
import { runPl } from "./run-pl";
import { runSi } from "./run-si";
import {
	DEFAULT_AT_PLACES_URL,
	fetchGemeinden,
	importAtPlaces,
	readGemeinden,
} from "./sources/at/places";
import { fetchChPlaceSources, importChPlaces, readChPlaceSources } from "./sources/ch/places";
import { fetchCyPlaceSources, importCyPlaces, readCyPlaceSources } from "./sources/cy/places";
import { fetchCzPlaceSources, importCzPlaces, readCzPlaceSources } from "./sources/cz/places";
import {
	DEFAULT_DE_PLACES_URL,
	fetchDePlaceSources,
	importDePlaces,
	readDePlaceSources,
} from "./sources/de/places";
import {
	DEFAULT_EE_PLACES_URL,
	fetchEePlaceSources,
	importEePlaces,
	readEePlaceSources,
} from "./sources/ee/places";
import { fetchEsPlaceSources, importEsPlaces, readEsPlaceSources } from "./sources/es/places";
import { fetchFiPlaceSources, importFiPlaces, readFiPlaceSources } from "./sources/fi/places";
import { fetchPlaceSources, importPlaces, readPlaceSources } from "./sources/fr/places";
import { fetchGbPlaceSources, importGbPlaces, readGbPlaceSources } from "./sources/gb/places";
import { fetchIePlaceSources, importIePlaces, readIePlaceSources } from "./sources/ie/places";
import { fetchItPlaceSources, importItPlaces, readItPlaceSources } from "./sources/it/places";
import { PoliteClient } from "./sources/lt/download";
import { fetchLtPlaceSources, importLtPlaces, readLtPlaceSources } from "./sources/lt/places";
import { fetchLvPlaceSources, importLvPlaces, readLvPlaceSources } from "./sources/lv/places";
import { DEFAULT_LV_PORTAL_URL } from "./sources/lv/portal";
import {
	DEFAULT_NO_PLACES_URL,
	fetchNoPlaceSources,
	importNoPlaces,
	readNoPlaceSources,
} from "./sources/no/places";
import { fetchPlPlaceSources, importPlPlaces, readPlPlaceSources } from "./sources/pl/places";
import { fetchSiPlaceSources, importSiPlaces, readSiPlaceSources } from "./sources/si/places";

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

/** Downloads the BFS commune register and swisstopo's postcodes, removed once they are read. */
async function fetchChPlacesOnce() {
	const dir = await mkdtemp(join(tmpdir(), "apercura-etl-ch-places-"));
	try {
		return await fetchChPlaceSources(dir, todayInZurich(), {
			communes: process.env.ETL_CH_COMMUNES_URL || undefined,
			postcodes: process.env.ETL_CH_POSTCODES_URL || undefined,
		});
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

/** Downloads the address register's territories to a temporary directory, removed once read. */
async function fetchLvPlacesOnce() {
	const dir = await mkdtemp(join(tmpdir(), "apercura-etl-lv-places-"));
	try {
		return await fetchLvPlaceSources(process.env.ETL_LV_PORTAL_URL || DEFAULT_LV_PORTAL_URL, dir);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

/** Downloads Tailte Éireann's counties and gazetteer and the CSO's towns, removed once they are read. */
async function fetchIePlacesOnce() {
	const dir = await mkdtemp(join(tmpdir(), "apercura-etl-ie-places-"));
	try {
		return await fetchIePlaceSources(dir, iePlacesUrls(process.env));
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

/** Downloads GV-ISys's municipalities' directory to a temporary directory, removed once it is read. */
async function fetchDePlacesOnce() {
	const dir = await mkdtemp(join(tmpdir(), "apercura-etl-de-places-"));
	try {
		return await fetchDePlaceSources(process.env.ETL_DE_PLACES_URL || DEFAULT_DE_PLACES_URL, dir);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

/** Downloads CYSTAT's census table and Cyprus Post's postcodes to a temporary directory, removed once read. */
async function fetchCyPlacesOnce() {
	const dir = await mkdtemp(join(tmpdir(), "apercura-etl-cy-places-"));
	try {
		return await fetchCyPlaceSources(buildCyOptions(new Map(), process.env).placesUrls, dir);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

/** Downloads Kartverket's counties and municipalities to a temporary directory, removed once read. */
async function fetchNoPlacesOnce() {
	const dir = await mkdtemp(join(tmpdir(), "apercura-etl-no-places-"));
	try {
		return await fetchNoPlaceSources(process.env.ETL_NO_PLACES_URL || DEFAULT_NO_PLACES_URL, dir);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

/** Downloads the Land Board's settlements' shapefile to a temporary directory, removed once it is read. */
async function fetchEePlacesOnce() {
	const dir = await mkdtemp(join(tmpdir(), "apercura-etl-ee-places-"));
	try {
		return await fetchEePlaceSources(process.env.ETL_EE_PLACES_URL || DEFAULT_EE_PLACES_URL, dir);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

/** Downloads TERC and PRG's administrative units to a temporary directory, removed once they are read. */
async function fetchPlPlacesOnce() {
	const dir = await mkdtemp(join(tmpdir(), "apercura-etl-pl-places-"));
	try {
		return await fetchPlPlaceSources(plPlacesUrls(process.env), dir);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

/** Downloads Statistics Finland's municipalities and correspondence tables to a temporary directory, removed once they are read. */
async function fetchFiPlacesOnce() {
	const dir = await mkdtemp(join(tmpdir(), "apercura-etl-fi-places-"));
	try {
		return await fetchFiPlaceSources(fiPlacesUrls(process.env), dir);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

/**
 * Downloads the Address Register's tables (one polite request after another) to a temporary
 * directory, removed once they are read.
 */
async function fetchLtPlacesOnce() {
	const dir = await mkdtemp(join(tmpdir(), "apercura-etl-lt-places-"));
	try {
		const options = buildLtOptions(new Map(), process.env);
		const client = new PoliteClient({
			intervalMs: options.requestIntervalMs,
			attempts: options.requestAttempts,
			log,
		});
		return await fetchLtPlaceSources(client, options.addressBase, dir);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

/** Downloads the register's spatial units (GURS) to a temporary directory, removed once read. */
async function fetchSiPlacesOnce() {
	const dir = await mkdtemp(join(tmpdir(), "apercura-etl-si-places-"));
	try {
		return await fetchSiPlaceSources(
			dir,
			todayInLjubljana(),
			process.env.ETL_SI_PLACES_URL || undefined,
		);
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
		command === "etl:it" ||
		command === "etl:de" ||
		command === "etl:ch" ||
		command === "etl:ee" ||
		command === "etl:pl" ||
		command === "etl:no" ||
		command === "etl:ie" ||
		command === "etl:fi" ||
		command === "etl:lt" ||
		command === "etl:si" ||
		command === "etl:cy" ||
		command === "etl:lv"
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
							: command === "etl:it"
								? await runIt(buildItOptions(flags, process.env), log)
								: command === "etl:de"
									? await runDe(buildDeOptions(flags, process.env), log)
									: command === "etl:ch"
										? await runCh(buildChOptions(flags, process.env), log)
										: command === "etl:ee"
											? await runEe(buildEeOptions(flags, process.env), log)
											: command === "etl:pl"
												? await runPl(buildPlOptions(flags, process.env), log)
												: command === "etl:no"
													? await runNo(buildNoOptions(flags, process.env), log)
													: command === "etl:ie"
														? await runIe(buildIeOptions(flags, process.env), log)
														: command === "etl:fi"
															? await runFi(buildFiOptions(flags, process.env), log)
															: command === "etl:lt"
																? await runLt(buildLtOptions(flags, process.env), log)
																: command === "etl:si"
																	? await runSi(buildSiOptions(flags, process.env), log)
																	: command === "etl:cy"
																		? await runCy(buildCyOptions(flags, process.env), log)
																		: await runLv(buildLvOptions(flags, process.env), log);
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
			if (
				![
					"fr",
					"at",
					"gb",
					"cz",
					"es",
					"it",
					"de",
					"ch",
					"ee",
					"pl",
					"no",
					"ie",
					"fi",
					"lt",
					"si",
					"cy",
					"lv",
				].includes(country)
			)
				throw new Error(`Unknown --country ${country}`);
			const sourceDir = flags.get("source-dir");
			const [run] = await sql<{ id: number }[]>`
				INSERT INTO directory.etl_runs (source, status, scope)
				VALUES (${`${country}-places`}, 'running', '{}'::jsonb) RETURNING id
			`;
			const runId = run?.id ?? 0;
			const stats =
				country === "lv"
					? await importLvPlaces(
							sql,
							typeof sourceDir === "string"
								? await readLvPlaceSources(sourceDir)
								: await fetchLvPlacesOnce(),
							runId,
						)
					: country === "cy"
						? await importCyPlaces(
								sql,
								typeof sourceDir === "string"
									? await readCyPlaceSources(sourceDir)
									: await fetchCyPlacesOnce(),
								runId,
							)
						: country === "si"
							? await importSiPlaces(
									sql,
									typeof sourceDir === "string"
										? await readSiPlaceSources(sourceDir)
										: await fetchSiPlacesOnce(),
									runId,
								)
							: country === "lt"
								? await importLtPlaces(
										sql,
										typeof sourceDir === "string"
											? await readLtPlaceSources(sourceDir)
											: await fetchLtPlacesOnce(),
										runId,
									)
								: country === "fi"
									? await importFiPlaces(
											sql,
											typeof sourceDir === "string"
												? await readFiPlaceSources(sourceDir)
												: await fetchFiPlacesOnce(),
											runId,
											log,
										)
									: country === "no"
										? await importNoPlaces(
												sql,
												typeof sourceDir === "string"
													? await readNoPlaceSources(sourceDir)
													: await fetchNoPlacesOnce(),
												runId,
											)
										: country === "pl"
											? await importPlPlaces(
													sql,
													typeof sourceDir === "string"
														? await readPlPlaceSources(sourceDir)
														: await fetchPlPlacesOnce(),
													runId,
												)
											: country === "ee"
												? await importEePlaces(
														sql,
														typeof sourceDir === "string"
															? await readEePlaceSources(sourceDir)
															: await fetchEePlacesOnce(),
														runId,
														log,
													)
												: country === "ie"
													? await importIePlaces(
															sql,
															typeof sourceDir === "string"
																? await readIePlaceSources(sourceDir)
																: await fetchIePlacesOnce(),
															runId,
														)
													: country === "ch"
														? await importChPlaces(
																sql,
																typeof sourceDir === "string"
																	? await readChPlaceSources(sourceDir)
																	: await fetchChPlacesOnce(),
																runId,
															)
														: country === "de"
															? await importDePlaces(
																	sql,
																	typeof sourceDir === "string"
																		? await readDePlaceSources(sourceDir)
																		: await fetchDePlacesOnce(),
																	runId,
																)
															: country === "it"
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
																									process.env.ETL_AT_PLACES_URL ||
																										DEFAULT_AT_PLACES_URL,
																								),
																						runId,
																					)
																				: await importPlaces(
																						sql,
																						typeof sourceDir === "string"
																							? await readPlaceSources(sourceDir)
																							: await fetchPlaceSources(
																									process.env.ETL_GEO_API_URL ||
																										"https://geo.api.gouv.fr",
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
