/**
 * Import guards. Each check says whether it passed and whether an operator may
 * override it with `--approve=<run_id>` (data that is plausible but unusual) or
 * not (data that is broken).
 */
import type { SourceFile } from "./lib/files";

export type GuardCheck = {
	name: string;
	ok: boolean;
	/** Can be overridden with `--approve=<run_id>` after review. */
	approvable: boolean;
	detail: string;
};

export const LIMITS = {
	fileSizeDelta: 0.1,
	quarantineRatio: 0.001,
	stagingRowsDelta: 0.03,
	rppsPerProfessionDelta: 0.02,
	minCommuneRatio: 0.98,
	maxUnpublishedRatio: 0.01,
	maxModifiedRatio: 0.1,
} as const;

const percent = (value: number) => `${(value * 100).toFixed(2)}%`;

const delta = (current: number, previous: number) =>
	previous === 0 ? (current === 0 ? 0 : 1) : Math.abs(current - previous) / previous;

/** Text files: final newline and strict UTF-8; every file: size within ±10% of the last success. */
export function checkFiles(
	files: SourceFile[],
	previous: Record<string, { bytes: number }> | null,
): GuardCheck[] {
	const checks: GuardCheck[] = [];
	for (const file of files) {
		if (file.utf8Valid !== null) {
			checks.push({
				name: `${file.key}.final_newline`,
				ok: file.endsWithNewline,
				approvable: false,
				detail: file.endsWithNewline ? "ends with LF" : "no final newline: file looks truncated",
			});
			checks.push({
				name: `${file.key}.utf8`,
				ok: file.utf8Valid,
				approvable: false,
				detail: file.utf8Valid ? "valid UTF-8" : "invalid UTF-8 byte sequence",
			});
		}
		const before = previous?.[file.key]?.bytes;
		if (before !== undefined) {
			const change = delta(file.bytes, before);
			checks.push({
				name: `${file.key}.size`,
				ok: change <= LIMITS.fileSizeDelta,
				approvable: true,
				detail: `${file.bytes} bytes vs ${before} last time (${percent(change)})`,
			});
		}
	}
	return checks;
}

export function checkQuarantine(
	stats: Record<string, { lines: number; quarantined: number }>,
): GuardCheck[] {
	return Object.entries(stats).map(([key, { lines, quarantined }]) => {
		const ratio = lines === 0 ? 0 : quarantined / lines;
		return {
			name: `${key}.quarantine`,
			ok: lines > 0 && ratio <= LIMITS.quarantineRatio,
			approvable: false,
			detail:
				lines === 0
					? "no data lines"
					: `${quarantined} of ${lines} lines quarantined (${percent(ratio)})`,
		};
	});
}

export type StagingStats = {
	rows: number;
	rppsByProfession: Record<string, number>;
	rowsWithStructure: number;
	rowsWithCommune: number;
	invalidRpps: number;
};

export function checkStaging(current: StagingStats, previous: StagingStats | null): GuardCheck[] {
	const checks: GuardCheck[] = [
		{
			name: "staging.luhn",
			ok: current.invalidRpps === 0,
			approvable: false,
			detail: `${current.invalidRpps} staged RPPS fail the Luhn check`,
		},
	];
	const communeRatio =
		current.rowsWithStructure === 0 ? 1 : current.rowsWithCommune / current.rowsWithStructure;
	checks.push({
		name: "staging.communes",
		ok: communeRatio >= LIMITS.minCommuneRatio,
		approvable: true,
		detail: `${percent(communeRatio)} of rows with a structure resolve to a commune`,
	});
	if (previous) {
		const rowsChange = delta(current.rows, previous.rows);
		checks.push({
			name: "staging.rows",
			ok: rowsChange <= LIMITS.stagingRowsDelta,
			approvable: true,
			detail: `${current.rows} rows vs ${previous.rows} last time (${percent(rowsChange)})`,
		});
		for (const [profession, count] of Object.entries(current.rppsByProfession)) {
			const before = previous.rppsByProfession[profession];
			if (before === undefined) continue;
			const change = delta(count, before);
			checks.push({
				name: `staging.rpps.${profession}`,
				ok: change <= LIMITS.rppsPerProfessionDelta,
				approvable: true,
				detail: `${count} RPPS for profession ${profession} vs ${before} last time (${percent(change)})`,
			});
		}
	}
	return checks;
}

export type PageChanges = {
	previousTotal: number;
	previousIndexable: number;
	updated: number;
	unpublished: number;
};

/** Before COMMIT: block when too many pages would be unpublished or modified. */
export function checkBreakers(pages: PageChanges): GuardCheck[] {
	if (pages.previousTotal === 0) return [];
	const unpublished =
		pages.previousIndexable === 0 ? 0 : pages.unpublished / pages.previousIndexable;
	const modified = pages.updated / pages.previousTotal;
	return [
		{
			name: "breaker.unpublished",
			ok: unpublished <= LIMITS.maxUnpublishedRatio,
			approvable: true,
			detail: `${pages.unpublished} of ${pages.previousIndexable} indexable pages would be unpublished (${percent(unpublished)})`,
		},
		{
			name: "breaker.modified",
			ok: modified <= LIMITS.maxModifiedRatio,
			approvable: true,
			detail: `${pages.updated} of ${pages.previousTotal} pages would change (${percent(modified)})`,
		},
	];
}

/**
 * Before COMMIT: every indexable page must be listed on at least one listing
 * page (its listing slug in the commune of one of its patient-facing places),
 * so crawlers reach it from the place hubs. An orphan means the read models
 * and the indexing rule disagree: blocked for review.
 */
export function checkOrphans(orphans: { count: number; examples: string[] }): GuardCheck[] {
	return [
		{
			name: "integrity.orphans",
			ok: orphans.count === 0,
			approvable: true,
			detail:
				orphans.count === 0
					? "every indexable page is listed on a listing page"
					: `${orphans.count} indexable pages are listed on no listing page (${orphans.examples.join(", ")})`,
		},
	];
}

export type GuardVerdict = {
	ok: boolean;
	/** Failures that block the run (not approved or not approvable). */
	blocking: GuardCheck[];
	/** Failures overridden by `--approve`. */
	approved: GuardCheck[];
	/** True when every blocking failure could be approved. */
	approvable: boolean;
};

export function verdict(checks: GuardCheck[], approved: boolean): GuardVerdict {
	const failed = checks.filter((check) => !check.ok);
	const blocking = failed.filter((check) => !(approved && check.approvable));
	return {
		ok: blocking.length === 0,
		blocking,
		approved: failed.filter((check) => approved && check.approvable),
		approvable: blocking.every((check) => check.approvable),
	};
}

// ---------------------------------------------------------------------------
// Austria (`etl:at`): the same verdicts, per list
// ---------------------------------------------------------------------------

/**
 * Limits of the Austrian lists. They are small (a few thousand rows) and
 * change daily (Vienna), so a size or row change is allowed a little more
 * room than the national French files; a floor of rows per list catches an
 * empty or truncated distribution that would otherwise look like a mass
 * removal.
 */
export const AT_LIMITS = {
	fileSizeDelta: 0.15,
	quarantineRatio: 0.01,
	rowsDelta: 0.05,
	minPlacedRatio: 0.98,
	minRows: { wien: 1_000, stmk: 500, sbg: 300, "sbg-zahn": 50 } as Record<string, number>,
} as const;

export type AtSourceStats = {
	lines: number;
	rows: number;
	people: number;
	quarantined: number;
};

/**
 * Per-list checks before the merge: the file still reads (quarantine within
 * 1%), holds at least its floor of rows (never approvable: a broken
 * distribution), and did not change by more than 5% in rows or 15% in bytes
 * since the last successful run (approvable).
 */
export function checkAtSource(
	source: string,
	current: AtSourceStats & { bytes: number },
	previous: (AtSourceStats & { bytes?: number }) | null,
): GuardCheck[] {
	const ratio = current.lines === 0 ? 1 : current.quarantined / current.lines;
	const floor = AT_LIMITS.minRows[source] ?? 1;
	const checks: GuardCheck[] = [
		{
			name: `${source}.quarantine`,
			ok: current.lines > 0 && ratio <= AT_LIMITS.quarantineRatio,
			approvable: false,
			detail: `${current.quarantined} of ${current.lines} records quarantined (${percent(ratio)})`,
		},
		{
			name: `${source}.rows`,
			ok: current.rows >= floor,
			approvable: false,
			detail: `${current.rows} rows (at least ${floor} expected)`,
		},
	];
	if (previous) {
		const rows = delta(current.people, previous.people);
		checks.push({
			name: `${source}.people`,
			ok: rows <= AT_LIMITS.rowsDelta,
			approvable: true,
			detail: `${current.people} people vs ${previous.people} last time (${percent(rows)})`,
		});
		if (previous.bytes !== undefined) {
			const size = delta(current.bytes, previous.bytes);
			checks.push({
				name: `${source}.size`,
				ok: size <= AT_LIMITS.fileSizeDelta,
				approvable: true,
				detail: `${current.bytes} bytes vs ${previous.bytes} last time (${percent(size)})`,
			});
		}
	}
	return checks;
}

/** After staging: nearly every practice must resolve to a Gemeinde, or listings would lose it. */
export function checkAtPlaces(staged: { sites: number; placed: number }): GuardCheck[] {
	const ratio = staged.sites === 0 ? 1 : staged.placed / staged.sites;
	return [
		{
			name: "at.places",
			ok: ratio >= AT_LIMITS.minPlacedRatio,
			approvable: true,
			detail: `${staged.placed} of ${staged.sites} practices resolve to a Gemeinde (${percent(ratio)})`,
		},
	];
}

// ---------------------------------------------------------------------------
// United Kingdom (`etl:gb`): the same verdicts, per list
// ---------------------------------------------------------------------------

/**
 * Limits of the UK lists. ODS refreshes its reports every night, so a size or row change is
 * allowed the Austrian lists' room. A floor of rows per list (about 5% of the November 2026
 * files) catches an empty or broken report on a first run; afterwards the change since the
 * last successful run (5%, approvable) blocks a truncated one.
 */
export const GB_LIMITS = {
	fileSizeDelta: 0.15,
	quarantineRatio: 0.01,
	rowsDelta: 0.05,
	/** Sites placed in a local authority (a town, else the authority itself). */
	minPlacedRatio: 0.98,
	/** Sites of Great Britain located by their postcode (Northern Ireland is placed by town). */
	minLocatedRatio: 0.97,
	minRows: {
		"ods-gp": 300,
		"ods-branches": 100,
		"ods-dent": 500,
		"ods-pharm": 500,
		"phs-gp": 40,
		"phs-dent": 50,
		"phs-pharm": 60,
		"bso-gp": 15,
		"bso-dent": 15,
	} as Record<string, number>,
} as const;

/**
 * Per-list checks before the merge, as in Austria: quarantine within 1%, a floor of rows
 * (never approvable), and at most 5% more or fewer practices or 15% more or fewer bytes than
 * the last successful run (approvable).
 */
export function checkGbSource(
	source: string,
	current: AtSourceStats & { bytes: number },
	previous: (AtSourceStats & { bytes?: number }) | null,
): GuardCheck[] {
	const ratio = current.lines === 0 ? 1 : current.quarantined / current.lines;
	const floor = GB_LIMITS.minRows[source] ?? 1;
	const checks: GuardCheck[] = [
		{
			name: `${source}.quarantine`,
			ok: current.lines > 0 && ratio <= GB_LIMITS.quarantineRatio,
			approvable: false,
			detail: `${current.quarantined} of ${current.lines} lines quarantined (${percent(ratio)})`,
		},
		{
			name: `${source}.rows`,
			ok: current.rows >= floor,
			approvable: false,
			detail: `${current.rows} rows (at least ${floor} expected)`,
		},
	];
	if (previous) {
		const rows = delta(current.people, previous.people);
		checks.push({
			name: `${source}.practices`,
			ok: rows <= GB_LIMITS.rowsDelta,
			approvable: true,
			detail: `${current.people} practices vs ${previous.people} last time (${percent(rows)})`,
		});
		if (previous.bytes !== undefined) {
			const size = delta(current.bytes, previous.bytes);
			checks.push({
				name: `${source}.size`,
				ok: size <= GB_LIMITS.fileSizeDelta,
				approvable: true,
				detail: `${current.bytes} bytes vs ${previous.bytes} last time (${percent(size)})`,
			});
		}
	}
	return checks;
}

/**
 * After staging: nearly every site must be placed in a local authority, and nearly every site
 * of Great Britain located by its postcode, or the listings and maps would lose it.
 */
export function checkGbPlaces(staged: {
	sites: number;
	placed: number;
	britishSites: number;
	located: number;
}): GuardCheck[] {
	const placed = staged.sites === 0 ? 1 : staged.placed / staged.sites;
	const located = staged.britishSites === 0 ? 1 : staged.located / staged.britishSites;
	return [
		{
			name: "gb.places",
			ok: placed >= GB_LIMITS.minPlacedRatio,
			approvable: true,
			detail: `${staged.placed} of ${staged.sites} sites placed in a local authority (${percent(placed)})`,
		},
		{
			name: "gb.postcodes",
			ok: located >= GB_LIMITS.minLocatedRatio,
			approvable: true,
			detail: `${staged.located} of ${staged.britishSites} sites in Great Britain located by postcode (${percent(located)})`,
		},
	];
}

// ---------------------------------------------------------------------------
// Czechia (`etl:cz`): the same verdicts, on the one list
// ---------------------------------------------------------------------------

/**
 * Limits of the NRPZS export. It is published monthly, so a change since the last success is
 * allowed the Austrian lists' room. Two floors catch an empty or broken file on a first run:
 * its data lines (every kind of facility: about 41,000 in November 2026, at least 1,000) and the
 * facilities imported from them (about 33,000, at least 300); afterwards the change since the last successful run (5%,
 * approvable) blocks a truncated one.
 */
export const CZ_LIMITS = {
	fileSizeDelta: 0.15,
	quarantineRatio: 0.01,
	rowsDelta: 0.05,
	minLines: 1_000,
	minRows: 300,
	/** Sites placed in a municipality or a Prague district (else only in their district). */
	minPlacedRatio: 0.98,
	/** Sites located at the register's own point. */
	minLocatedRatio: 0.97,
} as const;

/**
 * Checks of the list before the merge: quarantine within 1%, floors of lines and facilities
 * (never approvable), and at most 5% more or fewer facilities or 15% more or fewer bytes than
 * the last successful run (approvable).
 */
export function checkCzSource(
	source: string,
	current: AtSourceStats & { bytes: number },
	previous: (AtSourceStats & { bytes?: number }) | null,
): GuardCheck[] {
	const ratio = current.lines === 0 ? 1 : current.quarantined / current.lines;
	const checks: GuardCheck[] = [
		{
			name: `${source}.quarantine`,
			ok: current.lines > 0 && ratio <= CZ_LIMITS.quarantineRatio,
			approvable: false,
			detail: `${current.quarantined} of ${current.lines} lines quarantined (${percent(ratio)})`,
		},
		{
			name: `${source}.lines`,
			ok: current.lines >= CZ_LIMITS.minLines,
			approvable: false,
			detail: `${current.lines} data lines (at least ${CZ_LIMITS.minLines} expected)`,
		},
		{
			name: `${source}.rows`,
			ok: current.rows >= CZ_LIMITS.minRows,
			approvable: false,
			detail: `${current.rows} facilities imported (at least ${CZ_LIMITS.minRows} expected)`,
		},
	];
	if (previous) {
		const rows = delta(current.people, previous.people);
		checks.push({
			name: `${source}.facilities`,
			ok: rows <= CZ_LIMITS.rowsDelta,
			approvable: true,
			detail: `${current.people} facilities vs ${previous.people} last time (${percent(rows)})`,
		});
		if (previous.bytes !== undefined) {
			const size = delta(current.bytes, previous.bytes);
			checks.push({
				name: `${source}.size`,
				ok: size <= CZ_LIMITS.fileSizeDelta,
				approvable: true,
				detail: `${current.bytes} bytes vs ${previous.bytes} last time (${percent(size)})`,
			});
		}
	}
	return checks;
}

/**
 * After staging: nearly every site must be placed in its municipality (or Prague district) and
 * located at the register's point, or the listings and maps would lose it.
 */
export function checkCzPlaces(staged: {
	sites: number;
	located: number;
	inDistrict: number;
	placed: number;
}): GuardCheck[] {
	const local = staged.sites === 0 ? 1 : (staged.placed - staged.inDistrict) / staged.sites;
	const located = staged.sites === 0 ? 1 : staged.located / staged.sites;
	return [
		{
			name: "cz.places",
			ok: local >= CZ_LIMITS.minPlacedRatio,
			approvable: true,
			detail: `${staged.placed - staged.inDistrict} of ${staged.sites} sites placed in a municipality or Prague district (${percent(local)})`,
		},
		{
			name: "cz.points",
			ok: located >= CZ_LIMITS.minLocatedRatio,
			approvable: true,
			detail: `${staged.located} of ${staged.sites} sites located at the register's point (${percent(located)})`,
		},
	];
}

// ---------------------------------------------------------------------------
// Lithuania (`etl:lt`): the same verdicts, on the one register
// ---------------------------------------------------------------------------

/**
 * Limits of VASPVT's licence register. It is published daily, so a change since the last
 * success is allowed the Czech register's room. Two floors catch an empty or broken file on a
 * first run: its activity addresses (every one, current or not: 9,731 in November 2026, at least
 * 1,000) and the pages imported from them (about 6,400, at least 300); afterwards the change
 * since the last successful run (5%, approvable) blocks a truncated one. An address whose
 * municipality cannot be told is quarantined (29 of 9,731, foreign ones among them): at most 2%.
 */
export const LT_LIMITS = {
	fileSizeDelta: 0.15,
	quarantineRatio: 0.02,
	rowsDelta: 0.05,
	minLines: 1_000,
	minRows: 300,
	/** Sites placed in their settlement (else only in their municipality). */
	minPlacedRatio: 0.97,
	/** Sites located at their place's point. */
	minLocatedRatio: 0.97,
} as const;

/**
 * Checks of the register before the merge: quarantine within 2%, floors of addresses and pages
 * (never approvable), and at most 5% more or fewer pages or 15% more or fewer bytes than the
 * last successful run (approvable).
 */
export function checkLtSource(
	source: string,
	current: AtSourceStats & { bytes: number },
	previous: (AtSourceStats & { bytes?: number }) | null,
): GuardCheck[] {
	const ratio = current.lines === 0 ? 1 : current.quarantined / current.lines;
	const checks: GuardCheck[] = [
		{
			name: `${source}.quarantine`,
			ok: current.lines > 0 && ratio <= LT_LIMITS.quarantineRatio,
			approvable: false,
			detail: `${current.quarantined} of ${current.lines} addresses quarantined (${percent(ratio)})`,
		},
		{
			name: `${source}.lines`,
			ok: current.lines >= LT_LIMITS.minLines,
			approvable: false,
			detail: `${current.lines} activity addresses (at least ${LT_LIMITS.minLines} expected)`,
		},
		{
			name: `${source}.rows`,
			ok: current.rows >= LT_LIMITS.minRows,
			approvable: false,
			detail: `${current.rows} pages imported (at least ${LT_LIMITS.minRows} expected)`,
		},
	];
	if (previous) {
		const rows = delta(current.people, previous.people);
		checks.push({
			name: `${source}.pages`,
			ok: rows <= LT_LIMITS.rowsDelta,
			approvable: true,
			detail: `${current.people} pages vs ${previous.people} last time (${percent(rows)})`,
		});
		if (previous.bytes !== undefined) {
			const size = delta(current.bytes, previous.bytes);
			checks.push({
				name: `${source}.size`,
				ok: size <= LT_LIMITS.fileSizeDelta,
				approvable: true,
				detail: `${current.bytes} bytes vs ${previous.bytes} last time (${percent(size)})`,
			});
		}
	}
	return checks;
}

/**
 * After staging: nearly every site must be placed in its settlement and located at its place's
 * point, or the listings would lose it.
 */
export function checkLtPlaces(staged: {
	sites: number;
	located: number;
	inSettlement: number;
}): GuardCheck[] {
	const local = staged.sites === 0 ? 1 : staged.inSettlement / staged.sites;
	const located = staged.sites === 0 ? 1 : staged.located / staged.sites;
	return [
		{
			name: "lt.places",
			ok: local >= LT_LIMITS.minPlacedRatio,
			approvable: true,
			detail: `${staged.inSettlement} of ${staged.sites} sites placed in their settlement (${percent(local)})`,
		},
		{
			name: "lt.points",
			ok: located >= LT_LIMITS.minLocatedRatio,
			approvable: true,
			detail: `${staged.located} of ${staged.sites} sites located at their place's point (${percent(located)})`,
		},
	];
}

// ---------------------------------------------------------------------------
// Spain (`etl:es`): the same verdicts, per extract of the register
// ---------------------------------------------------------------------------

/**
 * Limits of the REGCESS monthly extracts. Each extract has its floors, which catch an empty or
 * broken file on a first run (November 2026: 929 hospital lines and 881 hospitals imported,
 * 119,577 lines of centres without inpatient care and 91,525 imported, 40,541 establishment
 * lines and 22,389 pharmacies); afterwards the change since the last successful run (5% of
 * centres, 15% of bytes, approvable) blocks a truncated one.
 */
export const ES_LIMITS = {
	fileSizeDelta: 0.15,
	quarantineRatio: 0.01,
	rowsDelta: 0.05,
	floors: {
		"regcess-c1": { minLines: 50, minRows: 30 },
		"regcess-c2": { minLines: 1_000, minRows: 100 },
		"regcess-e": { minLines: 300, minRows: 30 },
	} as Readonly<Record<string, { minLines: number; minRows: number }>>,
	/** Sites placed in their municipality (else only in their province). */
	minPlacedRatio: 0.99,
	/** Sites located at their municipality's point. */
	minLocatedRatio: 0.98,
} as const;

/**
 * Checks of one extract before the merge: quarantine within 1%, floors of lines and centres
 * (never approvable), and at most 5% more or fewer centres or 15% more or fewer bytes than the
 * last successful run that read it (approvable).
 */
export function checkEsSource(
	source: string,
	current: AtSourceStats & { bytes: number },
	previous: (AtSourceStats & { bytes?: number }) | null,
): GuardCheck[] {
	const floors = ES_LIMITS.floors[source] ?? { minLines: 1, minRows: 1 };
	const ratio = current.lines === 0 ? 1 : current.quarantined / current.lines;
	const checks: GuardCheck[] = [
		{
			name: `${source}.quarantine`,
			ok: current.lines > 0 && ratio <= ES_LIMITS.quarantineRatio,
			approvable: false,
			detail: `${current.quarantined} of ${current.lines} lines quarantined (${percent(ratio)})`,
		},
		{
			name: `${source}.lines`,
			ok: current.lines >= floors.minLines,
			approvable: false,
			detail: `${current.lines} data lines (at least ${floors.minLines} expected)`,
		},
		{
			name: `${source}.rows`,
			ok: current.rows >= floors.minRows,
			approvable: false,
			detail: `${current.rows} centres imported (at least ${floors.minRows} expected)`,
		},
	];
	if (previous) {
		const rows = delta(current.people, previous.people);
		checks.push({
			name: `${source}.centres`,
			ok: rows <= ES_LIMITS.rowsDelta,
			approvable: true,
			detail: `${current.people} centres vs ${previous.people} last time (${percent(rows)})`,
		});
		if (previous.bytes !== undefined) {
			const size = delta(current.bytes, previous.bytes);
			checks.push({
				name: `${source}.size`,
				ok: size <= ES_LIMITS.fileSizeDelta,
				approvable: true,
				detail: `${current.bytes} bytes vs ${previous.bytes} last time (${percent(size)})`,
			});
		}
	}
	return checks;
}

/**
 * After staging: nearly every site must be placed in its municipality and located at its point,
 * or the listings and the distances would lose it.
 */
export function checkEsPlaces(staged: {
	sites: number;
	located: number;
	inMunicipality: number;
}): GuardCheck[] {
	const local = staged.sites === 0 ? 1 : staged.inMunicipality / staged.sites;
	const located = staged.sites === 0 ? 1 : staged.located / staged.sites;
	return [
		{
			name: "es.places",
			ok: local >= ES_LIMITS.minPlacedRatio,
			approvable: true,
			detail: `${staged.inMunicipality} of ${staged.sites} sites placed in their municipality (${percent(local)})`,
		},
		{
			name: "es.points",
			ok: located >= ES_LIMITS.minLocatedRatio,
			approvable: true,
			detail: `${staged.located} of ${staged.sites} sites located at their municipality's point (${percent(located)})`,
		},
	];
}

/**
 * Limits of the Ministry of Health's lists. Each list has its floors, which catch an empty or
 * broken file on a first run (26 November 2026: 59,309 pharmacy lines and 20,779 pharmacies
 * open, 13,938 parapharmacy lines and 7,179 open, 1,798 bed-count lines and 1,044 hospitals and
 * clinics); afterwards the change since the last successful run (5% of places, 15% of bytes,
 * approvable) blocks a truncated one.
 */
export const IT_LIMITS = {
	fileSizeDelta: 0.15,
	quarantineRatio: 0.01,
	rowsDelta: 0.05,
	floors: {
		farmacie: { minLines: 100, minRows: 50 },
		parafarmacie: { minLines: 20, minRows: 10 },
		"posti-letto": { minLines: 10, minRows: 5 },
	} as Readonly<Record<string, { minLines: number; minRows: number }>>,
	/** Sites placed in their municipality (by code or name; else only in their province). */
	minPlacedRatio: 0.99,
	/** Sites located (at their municipality's point, or at the register's). */
	minLocatedRatio: 0.98,
} as const;

/**
 * Checks of one list before the merge: quarantine within 1%, floors of lines and places (never
 * approvable), and at most 5% more or fewer places or 15% more or fewer bytes than the last
 * successful run that read it (approvable).
 */
export function checkItSource(
	source: string,
	current: AtSourceStats & { bytes: number },
	previous: (AtSourceStats & { bytes?: number }) | null,
): GuardCheck[] {
	const floors = IT_LIMITS.floors[source] ?? { minLines: 1, minRows: 1 };
	const ratio = current.lines === 0 ? 1 : current.quarantined / current.lines;
	const checks: GuardCheck[] = [
		{
			name: `${source}.quarantine`,
			ok: current.lines > 0 && ratio <= IT_LIMITS.quarantineRatio,
			approvable: false,
			detail: `${current.quarantined} of ${current.lines} lines quarantined (${percent(ratio)})`,
		},
		{
			name: `${source}.lines`,
			ok: current.lines >= floors.minLines,
			approvable: false,
			detail: `${current.lines} data lines (at least ${floors.minLines} expected)`,
		},
		{
			name: `${source}.rows`,
			ok: current.rows >= floors.minRows,
			approvable: false,
			detail: `${current.rows} places imported (at least ${floors.minRows} expected)`,
		},
	];
	if (previous) {
		const rows = delta(current.people, previous.people);
		checks.push({
			name: `${source}.places`,
			ok: rows <= IT_LIMITS.rowsDelta,
			approvable: true,
			detail: `${current.people} places vs ${previous.people} last time (${percent(rows)})`,
		});
		if (previous.bytes !== undefined) {
			const size = delta(current.bytes, previous.bytes);
			checks.push({
				name: `${source}.size`,
				ok: size <= IT_LIMITS.fileSizeDelta,
				approvable: true,
				detail: `${current.bytes} bytes vs ${previous.bytes} last time (${percent(size)})`,
			});
		}
	}
	return checks;
}

/**
 * After staging: nearly every site must be placed in its municipality and located, or the
 * listings and the distances would lose it.
 */
export function checkItPlaces(staged: {
	sites: number;
	located: number;
	inMunicipality: number;
}): GuardCheck[] {
	const local = staged.sites === 0 ? 1 : staged.inMunicipality / staged.sites;
	const located = staged.sites === 0 ? 1 : staged.located / staged.sites;
	return [
		{
			name: "it.places",
			ok: local >= IT_LIMITS.minPlacedRatio,
			approvable: true,
			detail: `${staged.inMunicipality} of ${staged.sites} sites placed in their municipality (${percent(local)})`,
		},
		{
			name: "it.points",
			ok: located >= IT_LIMITS.minLocatedRatio,
			approvable: true,
			detail: `${staged.located} of ${staged.sites} sites located (${percent(located)})`,
		},
	];
}

/**
 * Limits of the German sources. Each has its floors, which catch an empty or broken file on a
 * first run (the 2024 directory: 2,758 hospital sites and 1,066 clinics; Thuringia's list of
 * July 2026: 472 pharmacies; Brandenburg's of October 2026: 531, 13 of them hospitals'
 * pharmacies); afterwards the change since the last successful run that read the source blocks
 * a truncated one (approvable). The directory changes once a year, so its threshold is wider.
 */
export const DE_LIMITS = {
	quarantineRatio: 0.01,
	floors: {
		khv: { minLines: 200, minRows: 150, rowsDelta: 0.1, sizeDelta: 0.3 },
		rhv: { minLines: 100, minRows: 80, rowsDelta: 0.1, sizeDelta: 0.3 },
		"apo-th": { minLines: 50, minRows: 40, rowsDelta: 0.1, sizeDelta: 0.3 },
		"apo-bb": { minLines: 50, minRows: 40, rowsDelta: 0.1, sizeDelta: 0.3 },
	} as Readonly<
		Record<string, { minLines: number; minRows: number; rowsDelta: number; sizeDelta: number }>
	>,
	/** Sites placed in their Gemeinde (else only in their Kreis, or nowhere). */
	minPlacedRatio: 0.99,
	/** Sites located, at their address or their Gemeinde's centre. */
	minLocatedRatio: 0.98,
} as const;

/**
 * Checks of one German source before the merge: quarantine within 1%, floors of lines and
 * facilities (never approvable), an edition of the directory never older than the last one
 * imported (never approvable: the pages would go back a year), and at most 10% more or fewer
 * facilities or 30% more or fewer bytes than the last successful run that read it (approvable).
 */
export function checkDeSource(
	source: string,
	current: AtSourceStats & { bytes: number; edition: number | null },
	previous: (AtSourceStats & { bytes?: number; edition?: number | null }) | null,
): GuardCheck[] {
	const floors = DE_LIMITS.floors[source] ?? {
		minLines: 1,
		minRows: 1,
		rowsDelta: 0.1,
		sizeDelta: 0.3,
	};
	const ratio = current.lines === 0 ? 1 : current.quarantined / current.lines;
	const checks: GuardCheck[] = [
		{
			name: `${source}.quarantine`,
			ok: current.lines > 0 && ratio <= DE_LIMITS.quarantineRatio,
			approvable: false,
			detail: `${current.quarantined} of ${current.lines} lines quarantined (${percent(ratio)})`,
		},
		{
			name: `${source}.lines`,
			ok: current.lines >= floors.minLines,
			approvable: false,
			detail: `${current.lines} data lines (at least ${floors.minLines} expected)`,
		},
		{
			name: `${source}.rows`,
			ok: current.rows >= floors.minRows,
			approvable: false,
			detail: `${current.rows} facilities imported (at least ${floors.minRows} expected)`,
		},
	];
	if (previous) {
		if (current.edition !== null && typeof previous.edition === "number") {
			checks.push({
				name: `${source}.edition`,
				ok: current.edition >= previous.edition,
				approvable: false,
				detail: `edition ${current.edition} vs ${previous.edition} last time`,
			});
		}
		const rows = delta(current.people, previous.people);
		checks.push({
			name: `${source}.facilities`,
			ok: rows <= floors.rowsDelta,
			approvable: true,
			detail: `${current.people} facilities vs ${previous.people} last time (${percent(rows)})`,
		});
		if (previous.bytes !== undefined) {
			const size = delta(current.bytes, previous.bytes);
			checks.push({
				name: `${source}.size`,
				ok: size <= floors.sizeDelta,
				approvable: true,
				detail: `${current.bytes} bytes vs ${previous.bytes} last time (${percent(size)})`,
			});
		}
	}
	return checks;
}

/**
 * After staging: nearly every site must be placed in its Gemeinde and located, or the listings
 * and the distances would lose it.
 */
export function checkDePlaces(staged: {
	sites: number;
	located: number;
	inCommune: number;
}): GuardCheck[] {
	const local = staged.sites === 0 ? 1 : staged.inCommune / staged.sites;
	const located = staged.sites === 0 ? 1 : staged.located / staged.sites;
	return [
		{
			name: "de.places",
			ok: local >= DE_LIMITS.minPlacedRatio,
			approvable: true,
			detail: `${staged.inCommune} of ${staged.sites} sites placed in their Gemeinde (${percent(local)})`,
		},
		{
			name: "de.points",
			ok: located >= DE_LIMITS.minLocatedRatio,
			approvable: true,
			detail: `${staged.located} of ${staged.sites} sites located at their address or their Gemeinde's centre (${percent(located)})`,
		},
	];
}

/**
 * Limits of the Swiss import. The lists are small (13 to 600 facilities): a change of a few rows
 * is ordinary, so the change checks allow 10% or 3 facilities, whichever is more, and a list may
 * quarantine one line or 2% of its lines.
 */
export const CH_LIMITS = {
	fileSizeDelta: 0.25,
	quarantineRatio: 0.02,
	quarantineLines: 1,
	rowsDelta: 0.1,
	rowsSlack: 3,
	floors: {
		bag: { minLines: 60, minRows: 60 },
		"be-spitaeler": { minLines: 10, minRows: 10 },
		"be-heime": { minLines: 30, minRows: 30 },
		"ge-hopitaux": { minLines: 5, minRows: 3 },
		"ge-ems": { minLines: 10, minRows: 10 },
		"ge-pharmacies": { minLines: 15, minRows: 15 },
		"bl-apotheken": { minLines: 10, minRows: 10 },
		"bl-heime": { minLines: 5, minRows: 5 },
		"bs-spitaeler": { minLines: 3, minRows: 3 },
		"bs-heime": { minLines: 8, minRows: 8 },
		"zh-heime": { minLines: 30, minRows: 30 },
		"ju-institutions": { minLines: 8, minRows: 4 },
	} as Readonly<Record<string, { minLines: number; minRows: number }>>,
	/** Sites placed in their commune. */
	minPlacedRatio: 0.99,
} as const;

/**
 * Checks of one Swiss list before the merge: quarantine within its limit, floors of lines and
 * facilities (never approvable), and the change of facilities and bytes since the last
 * successful run that read it (approvable). The floors are about a tenth of each list's size in
 * November 2026: they stop a broken distribution (an error page, a truncated file); the change
 * checks stop a list that shrank.
 */
export function checkChSource(
	source: string,
	current: AtSourceStats & { bytes: number },
	previous: (AtSourceStats & { bytes?: number }) | null,
): GuardCheck[] {
	const floors = CH_LIMITS.floors[source] ?? { minLines: 1, minRows: 1 };
	const ratio = current.lines === 0 ? 1 : current.quarantined / current.lines;
	const checks: GuardCheck[] = [
		{
			name: `${source}.quarantine`,
			ok:
				current.lines > 0 &&
				(ratio <= CH_LIMITS.quarantineRatio || current.quarantined <= CH_LIMITS.quarantineLines),
			approvable: false,
			detail: `${current.quarantined} of ${current.lines} lines quarantined (${percent(ratio)})`,
		},
		{
			name: `${source}.lines`,
			ok: current.lines >= floors.minLines,
			approvable: false,
			detail: `${current.lines} data lines (at least ${floors.minLines} expected)`,
		},
		{
			name: `${source}.rows`,
			ok: current.rows >= floors.minRows,
			approvable: false,
			detail: `${current.rows} facilities read (at least ${floors.minRows} expected)`,
		},
	];
	if (previous) {
		const rows = delta(current.people, previous.people);
		checks.push({
			name: `${source}.facilities`,
			ok:
				rows <= CH_LIMITS.rowsDelta ||
				Math.abs(current.people - previous.people) <= CH_LIMITS.rowsSlack,
			approvable: true,
			detail: `${current.people} facilities vs ${previous.people} last time (${percent(rows)})`,
		});
		if (previous.bytes !== undefined) {
			const size = delta(current.bytes, previous.bytes);
			checks.push({
				name: `${source}.size`,
				ok: size <= CH_LIMITS.fileSizeDelta,
				approvable: true,
				detail: `${current.bytes} bytes vs ${previous.bytes} last time (${percent(size)})`,
			});
		}
	}
	return checks;
}

/** After staging: nearly every site must be placed in its commune, or the listings would lose it. */
export function checkChPlaces(staged: { sites: number; placed: number }): GuardCheck[] {
	const placed = staged.sites === 0 ? 1 : staged.placed / staged.sites;
	return [
		{
			name: "ch.places",
			ok: placed >= CH_LIMITS.minPlacedRatio,
			approvable: true,
			detail: `${staged.placed} of ${staged.sites} sites placed in their commune (${percent(placed)})`,
		},
	];
}

/**
 * Limits of the Estonian sources. Floors catch an empty or broken file on a first run (the
 * Health Board's register of 27 November 2026: 1,570 providers; the State Agency of Medicines'
 * export: 495 pharmacies, 469 of them general pharmacies); afterwards the change since the last
 * successful run that read the source blocks a truncated one (approvable). The register's
 * extract date never goes back (never approvable: the pages would go back in time).
 */
export const EE_LIMITS = {
	quarantineRatio: 0.01,
	floors: {
		medre: { minLines: 150, minRows: 100, rowsDelta: 0.1, sizeDelta: 0.3 },
		apteegid: { minLines: 60, minRows: 50, rowsDelta: 0.1, sizeDelta: 0.3 },
	} as Readonly<
		Record<string, { minLines: number; minRows: number; rowsDelta: number; sizeDelta: number }>
	>,
	/** Places placed in their settlement (else left out). */
	minPlacedRatio: 0.95,
	/** Places located at their address (else at their settlement's centre). */
	minAddressRatio: 0.8,
} as const;

/**
 * Checks of one Estonian source before the merge: quarantine within 1%, floors of lines and
 * rows (never approvable), an extract never older than the last one imported (never
 * approvable), and at most 10% more or fewer rows or 30% more or fewer bytes than the last
 * successful run that read it (approvable).
 */
export function checkEeSource(
	source: string,
	current: AtSourceStats & { bytes: number; edition: number | null },
	previous: (AtSourceStats & { bytes?: number; edition?: number | null }) | null,
): GuardCheck[] {
	const floors = EE_LIMITS.floors[source] ?? {
		minLines: 1,
		minRows: 1,
		rowsDelta: 0.1,
		sizeDelta: 0.3,
	};
	const ratio = current.lines === 0 ? 1 : current.quarantined / current.lines;
	const checks: GuardCheck[] = [
		{
			name: `${source}.quarantine`,
			ok: current.lines > 0 && ratio <= EE_LIMITS.quarantineRatio,
			approvable: false,
			detail: `${current.quarantined} of ${current.lines} lines quarantined (${percent(ratio)})`,
		},
		{
			name: `${source}.lines`,
			ok: current.lines >= floors.minLines,
			approvable: false,
			detail: `${current.lines} data lines (at least ${floors.minLines} expected)`,
		},
		{
			name: `${source}.rows`,
			ok: current.rows >= floors.minRows,
			approvable: false,
			detail: `${current.rows} providers read (at least ${floors.minRows} expected)`,
		},
	];
	if (previous) {
		if (current.edition !== null && typeof previous.edition === "number") {
			checks.push({
				name: `${source}.edition`,
				ok: current.edition >= previous.edition,
				approvable: false,
				detail: `extract of ${current.edition} vs ${previous.edition} last time`,
			});
		}
		const rows = delta(current.people, previous.people);
		checks.push({
			name: `${source}.providers`,
			ok: rows <= floors.rowsDelta,
			approvable: true,
			detail: `${current.people} providers vs ${previous.people} last time (${percent(rows)})`,
		});
		if (previous.bytes !== undefined) {
			const size = delta(current.bytes, previous.bytes);
			checks.push({
				name: `${source}.size`,
				ok: size <= floors.sizeDelta,
				approvable: true,
				detail: `${current.bytes} bytes vs ${previous.bytes} last time (${percent(size)})`,
			});
		}
	}
	return checks;
}

/**
 * After placing: nearly every place of activity must be found in its settlement, and most at
 * their address, or the address data system's file or the places are not the expected ones.
 */
export function checkEePlaces(placement: {
	address: number;
	settlement: number;
	unplaced: number;
}): GuardCheck[] {
	const placed = placement.address + placement.settlement;
	const all = placed + placement.unplaced;
	const local = all === 0 ? 1 : placed / all;
	const atAddress = placed === 0 ? 1 : placement.address / placed;
	return [
		{
			name: "ee.places",
			ok: local >= EE_LIMITS.minPlacedRatio,
			approvable: true,
			detail: `${placed} of ${all} places placed in their settlement (${percent(local)})`,
		},
		{
			name: "ee.points",
			ok: atAddress >= EE_LIMITS.minAddressRatio,
			approvable: true,
			detail: `${placement.address} of ${placed} places located at their address (${percent(atAddress)})`,
		},
	];
}

// ---------------------------------------------------------------------------
// Poland (`etl:pl`): the same verdicts, on the one register
// ---------------------------------------------------------------------------

/**
 * Limits of the RPWDL export. It is published every day and imported every week, so a change
 * since the last success is allowed Czechia's room. Two floors catch an empty or broken file on a
 * first run: the establishments' lines (about 37,900 in November 2026, at least 1,000) and the
 * establishments imported from them (about 34,000, at least 300); afterwards the change since
 * the last successful run (5%, approvable) blocks a truncated one.
 */
export const PL_LIMITS = {
	fileSizeDelta: 0.15,
	quarantineRatio: 0.01,
	rowsDelta: 0.05,
	minLines: 1_000,
	minRows: 300,
	/** Sites placed in their gmina (else only in their powiat, or nowhere). */
	minPlacedRatio: 0.98,
} as const;

/**
 * Checks of the register before the merge: quarantine within 1%, floors of lines and
 * establishments (never approvable), and at most 5% more or fewer establishments or 15% more or
 * fewer bytes than the last successful run (approvable).
 */
export function checkPlSource(
	source: string,
	current: AtSourceStats & { bytes: number },
	previous: (AtSourceStats & { bytes?: number }) | null,
): GuardCheck[] {
	const ratio = current.lines === 0 ? 1 : current.quarantined / current.lines;
	const checks: GuardCheck[] = [
		{
			name: `${source}.quarantine`,
			ok: current.lines > 0 && ratio <= PL_LIMITS.quarantineRatio,
			approvable: false,
			detail: `${current.quarantined} of ${current.lines} lines quarantined (${percent(ratio)})`,
		},
		{
			name: `${source}.lines`,
			ok: current.lines >= PL_LIMITS.minLines,
			approvable: false,
			detail: `${current.lines} establishment lines (at least ${PL_LIMITS.minLines} expected)`,
		},
		{
			name: `${source}.rows`,
			ok: current.rows >= PL_LIMITS.minRows,
			approvable: false,
			detail: `${current.rows} establishments imported (at least ${PL_LIMITS.minRows} expected)`,
		},
	];
	if (previous) {
		const rows = delta(current.people, previous.people);
		checks.push({
			name: `${source}.establishments`,
			ok: rows <= PL_LIMITS.rowsDelta,
			approvable: true,
			detail: `${current.people} establishments vs ${previous.people} last time (${percent(rows)})`,
		});
		if (previous.bytes !== undefined) {
			const size = delta(current.bytes, previous.bytes);
			checks.push({
				name: `${source}.size`,
				ok: size <= PL_LIMITS.fileSizeDelta,
				approvable: true,
				detail: `${current.bytes} bytes vs ${previous.bytes} last time (${percent(size)})`,
			});
		}
	}
	return checks;
}

/** After staging: nearly every site must be placed in its gmina, or the listings would lose it. */
export function checkPlPlaces(staged: {
	sites: number;
	placed: number;
	inDistrict: number;
}): GuardCheck[] {
	const local = staged.sites === 0 ? 1 : (staged.placed - staged.inDistrict) / staged.sites;
	return [
		{
			name: "pl.places",
			ok: local >= PL_LIMITS.minPlacedRatio,
			approvable: true,
			detail: `${staged.placed - staged.inDistrict} of ${staged.sites} sites placed in a gmina (${percent(local)})`,
		},
	];
}
/**
 * Limits of the Norwegian source. Floors catch an empty or broken file on a first run (the
 * register's files of 27 November 2026: 873,697 establishments, about 54,000 under a health or
 * pharmacy code, 6,000 kept); afterwards the change since the last successful run blocks a
 * truncated file or filters gone wrong (approvable).
 */
export const NO_LIMITS = {
	quarantineRatio: 0.01,
	floors: {
		brreg: { minLines: 100, minRows: 100, rowsDelta: 0.1, sizeDelta: 0.3 },
	} as Readonly<
		Record<string, { minLines: number; minRows: number; rowsDelta: number; sizeDelta: number }>
	>,
	/** Establishments placed in their municipality (else left out). */
	minPlacedRatio: 0.98,
	/** Establishments located at their address (else at their postcode's centre). */
	minAddressRatio: 0.75,
} as const;

/**
 * Checks of the Norwegian source before the merge: quarantine within 1% of the establishments
 * under a listed code, floors of records and establishments kept (never approvable), and at most
 * 10% more or fewer establishments kept or 30% more or fewer bytes than the last successful run
 * (approvable).
 */
export function checkNoSource(
	source: string,
	current: AtSourceStats & { bytes: number; candidates: number },
	previous: (AtSourceStats & { bytes?: number }) | null,
): GuardCheck[] {
	const floors = NO_LIMITS.floors[source] ?? {
		minLines: 1,
		minRows: 1,
		rowsDelta: 0.1,
		sizeDelta: 0.3,
	};
	const ratio = current.candidates === 0 ? 1 : current.quarantined / current.candidates;
	const checks: GuardCheck[] = [
		{
			name: `${source}.quarantine`,
			ok: current.candidates > 0 && ratio <= NO_LIMITS.quarantineRatio,
			approvable: false,
			detail: `${current.quarantined} of ${current.candidates} establishments under a listed code quarantined (${percent(ratio)})`,
		},
		{
			name: `${source}.lines`,
			ok: current.lines >= floors.minLines,
			approvable: false,
			detail: `${current.lines} establishments in the file (at least ${floors.minLines} expected)`,
		},
		{
			name: `${source}.rows`,
			ok: current.rows >= floors.minRows,
			approvable: false,
			detail: `${current.rows} establishments kept (at least ${floors.minRows} expected)`,
		},
	];
	if (previous) {
		const rows = delta(current.people, previous.people);
		checks.push({
			name: `${source}.establishments`,
			ok: rows <= floors.rowsDelta,
			approvable: true,
			detail: `${current.people} establishments vs ${previous.people} last time (${percent(rows)})`,
		});
		if (previous.bytes !== undefined) {
			const size = delta(current.bytes, previous.bytes);
			checks.push({
				name: `${source}.size`,
				ok: size <= floors.sizeDelta,
				approvable: true,
				detail: `${current.bytes} bytes vs ${previous.bytes} last time (${percent(size)})`,
			});
		}
	}
	return checks;
}

/**
 * After placing: nearly every establishment must be found in its municipality, and most at their
 * address, or the address file or the places are not the expected ones.
 */
export function checkNoPlaces(placement: {
	address: number;
	postcode: number;
	municipality: number;
	unplaced: number;
}): GuardCheck[] {
	const placed = placement.address + placement.postcode + placement.municipality;
	const all = placed + placement.unplaced;
	const local = all === 0 ? 1 : placed / all;
	const atAddress = placed === 0 ? 1 : placement.address / placed;
	return [
		{
			name: "no.places",
			ok: local >= NO_LIMITS.minPlacedRatio,
			approvable: true,
			detail: `${placed} of ${all} establishments placed in their municipality (${percent(local)})`,
		},
		{
			name: "no.points",
			ok: atAddress >= NO_LIMITS.minAddressRatio,
			approvable: true,
			detail: `${placement.address} of ${placed} establishments located at their address (${percent(atAddress)})`,
		},
	];
}

/**
 * Limits of the Irish import. The lists are small to middling (132 to 2,003 facilities): the
 * change checks allow 10% or 5 facilities, whichever is more (HIQA's live register moves by a few
 * centres a month), and a list may quarantine two lines or 1% of its lines.
 */
export const IE_LIMITS = {
	fileSizeDelta: 0.25,
	quarantineRatio: 0.01,
	quarantineLines: 2,
	rowsDelta: 0.1,
	rowsSlack: 5,
	floors: {
		psi: { minLines: 200, minRows: 200 },
		hiqa: { minLines: 50, minRows: 50 },
		"hse-hospitals": { minLines: 13, minRows: 13 },
		"hse-health-centres": { minLines: 90, minRows: 90 },
	} as Readonly<Record<string, { minLines: number; minRows: number }>>,
	/** Sites placed in a census town rather than only in their county. */
	minInTownRatio: 0.85,
} as const;

/**
 * Checks of one Irish list before the merge: quarantine within its limit (the lines that cannot
 * be read or placed), floors of lines and facilities (never approvable: about a tenth of each
 * list's size in November 2026, they stop an error page or a truncated file), and the change
 * of facilities and bytes since the last successful run that read it (approvable).
 */
export function checkIeSource(
	source: string,
	current: AtSourceStats & { bytes: number },
	previous: (AtSourceStats & { bytes?: number }) | null,
): GuardCheck[] {
	const floors = IE_LIMITS.floors[source] ?? { minLines: 1, minRows: 1 };
	const ratio = current.lines === 0 ? 1 : current.quarantined / current.lines;
	const checks: GuardCheck[] = [
		{
			name: `${source}.quarantine`,
			ok:
				current.lines > 0 &&
				(ratio <= IE_LIMITS.quarantineRatio || current.quarantined <= IE_LIMITS.quarantineLines),
			approvable: false,
			detail: `${current.quarantined} of ${current.lines} lines quarantined (${percent(ratio)})`,
		},
		{
			name: `${source}.lines`,
			ok: current.lines >= floors.minLines,
			approvable: false,
			detail: `${current.lines} data lines (at least ${floors.minLines} expected)`,
		},
		{
			name: `${source}.rows`,
			ok: current.rows >= floors.minRows,
			approvable: false,
			detail: `${current.rows} facilities read (at least ${floors.minRows} expected)`,
		},
	];
	if (previous) {
		const rows = delta(current.people, previous.people);
		checks.push({
			name: `${source}.facilities`,
			ok:
				rows <= IE_LIMITS.rowsDelta ||
				Math.abs(current.people - previous.people) <= IE_LIMITS.rowsSlack,
			approvable: true,
			detail: `${current.people} facilities vs ${previous.people} last time (${percent(rows)})`,
		});
		if (previous.bytes !== undefined) {
			const size = delta(current.bytes, previous.bytes);
			checks.push({
				name: `${source}.size`,
				ok: size <= IE_LIMITS.fileSizeDelta,
				approvable: true,
				detail: `${current.bytes} bytes vs ${previous.bytes} last time (${percent(size)})`,
			});
		}
	}
	return checks;
}

/**
 * After staging: every site must be placed, and most in a census town, or the places' other
 * names or boundaries are broken (a run of `etl:places --country ie` that went wrong).
 */
export function checkIePlaces(staged: {
	sites: number;
	placed: number;
	inTown: number;
}): GuardCheck[] {
	const placed = staged.sites === 0 ? 1 : staged.placed / staged.sites;
	const inTown = staged.sites === 0 ? 1 : staged.inTown / staged.sites;
	return [
		{
			name: "ie.places",
			ok: placed >= 0.99,
			approvable: true,
			detail: `${staged.placed} of ${staged.sites} sites placed (${percent(placed)})`,
		},
		{
			name: "ie.towns",
			ok: inTown >= IE_LIMITS.minInTownRatio,
			approvable: true,
			detail: `${staged.inTown} of ${staged.sites} sites placed in a census town (${percent(inTown)})`,
		},
	];
}

/**
 * Limits of the Finnish source. Floors catch an empty or broken snapshot on a first run (the
 * Finnish Service Catalogue of 27 November 2026: see `docs/data-import.md`, "Finland");
 * afterwards the change since the last successful run blocks a truncated one (approvable). The
 * snapshot's day never goes back (never approvable).
 */
export const FI_LIMITS = {
	quarantineRatio: 0.01,
	floors: {
		ptv: { minLines: 100, minRows: 100, rowsDelta: 0.15, sizeDelta: 0.4 },
	} as Readonly<
		Record<string, { minLines: number; minRows: number; rowsDelta: number; sizeDelta: number }>
	>,
	/** Locations placed in their municipality (else left out). */
	minPlacedRatio: 0.98,
	/** Locations at the catalogue's own point (else at their municipality's centre). */
	minPointRatio: 0.8,
} as const;

/**
 * Checks of the Finnish source before the merge: quarantine within 1%, floors of locations
 * (never approvable), a snapshot never older than the last one imported (never approvable), and
 * at most 15% more or fewer locations or 40% more or fewer bytes than the last successful run
 * (approvable).
 */
export function checkFiSource(
	source: string,
	current: AtSourceStats & { bytes: number; edition: number | null },
	previous: (AtSourceStats & { bytes?: number; edition?: number | null }) | null,
): GuardCheck[] {
	const floors = FI_LIMITS.floors[source] ?? {
		minLines: 1,
		minRows: 1,
		rowsDelta: 0.15,
		sizeDelta: 0.4,
	};
	const ratio = current.lines === 0 ? 1 : current.quarantined / current.lines;
	const checks: GuardCheck[] = [
		{
			name: `${source}.quarantine`,
			ok: current.lines > 0 && ratio <= FI_LIMITS.quarantineRatio,
			approvable: false,
			detail: `${current.quarantined} of ${current.lines} locations quarantined (${percent(ratio)})`,
		},
		{
			name: `${source}.lines`,
			ok: current.lines >= floors.minLines,
			approvable: false,
			detail: `${current.lines} service locations in the snapshot (at least ${floors.minLines} expected)`,
		},
		{
			name: `${source}.rows`,
			ok: current.rows >= floors.minRows,
			approvable: false,
			detail: `${current.rows} health service locations read (at least ${floors.minRows} expected)`,
		},
	];
	if (previous) {
		if (current.edition !== null && typeof previous.edition === "number") {
			checks.push({
				name: `${source}.edition`,
				ok: current.edition >= previous.edition,
				approvable: false,
				detail: `snapshot of ${current.edition} vs ${previous.edition} last time`,
			});
		}
		const rows = delta(current.people, previous.people);
		checks.push({
			name: `${source}.locations`,
			ok: rows <= floors.rowsDelta,
			approvable: true,
			detail: `${current.people} locations vs ${previous.people} last time (${percent(rows)})`,
		});
		if (previous.bytes !== undefined) {
			const size = delta(current.bytes, previous.bytes);
			checks.push({
				name: `${source}.size`,
				ok: size <= floors.sizeDelta,
				approvable: true,
				detail: `${current.bytes} bytes vs ${previous.bytes} last time (${percent(size)})`,
			});
		}
	}
	return checks;
}

/**
 * After placing: nearly every location must be found in its municipality, and most at the
 * catalogue's own point, or the snapshot or the places are not the expected ones.
 */
export function checkFiPlaces(placement: {
	point: number;
	municipality: number;
	unplaced: number;
}): GuardCheck[] {
	const placed = placement.point + placement.municipality;
	const all = placed + placement.unplaced;
	const local = all === 0 ? 1 : placed / all;
	const atPoint = placed === 0 ? 1 : placement.point / placed;
	return [
		{
			name: "fi.places",
			ok: local >= FI_LIMITS.minPlacedRatio,
			approvable: true,
			detail: `${placed} of ${all} locations placed in their municipality (${percent(local)})`,
		},
		{
			name: "fi.points",
			ok: atPoint >= FI_LIMITS.minPointRatio,
			approvable: true,
			detail: `${placement.point} of ${placed} locations at the catalogue's point (${percent(atPoint)})`,
		},
	];
}

// ---------------------------------------------------------------------------
// Slovenia (`etl:si`): the same verdicts, per list
// ---------------------------------------------------------------------------

/**
 * Limits of the insurer's lists. They are published every day and change a little every day (a
 * doctor who retires, a practice that opens), so a run a week apart is allowed the Austrian
 * lists' room. The floors (about a third of each list in November 2026: 1,442 general
 * practitioners and children's doctors, 329 gynaecologists, 1,110 dentists) stop an empty or
 * truncated workbook.
 */
export const SI_LIMITS = {
	fileSizeDelta: 0.15,
	quarantineRatio: 0.01,
	rowsDelta: 0.05,
	/** Practices placed in their municipality. */
	minPlacedRatio: 0.98,
	minRows: { sa: 500, gin: 100, zob: 350 } as Record<string, number>,
} as const;

/**
 * Checks of one list before the merge: quarantine within 1% (never approvable), its floor of rows
 * (never approvable), and the change of doctors and bytes since the last successful run that read
 * it (approvable).
 */
export function checkSiSource(
	source: string,
	current: AtSourceStats & { bytes: number },
	previous: (AtSourceStats & { bytes?: number }) | null,
): GuardCheck[] {
	const ratio = current.lines === 0 ? 1 : current.quarantined / current.lines;
	const floor = SI_LIMITS.minRows[source] ?? 1;
	const checks: GuardCheck[] = [
		{
			name: `${source}.quarantine`,
			ok: current.lines > 0 && ratio <= SI_LIMITS.quarantineRatio,
			approvable: false,
			detail: `${current.quarantined} of ${current.lines} lines quarantined (${percent(ratio)})`,
		},
		{
			name: `${source}.rows`,
			ok: current.rows >= floor,
			approvable: false,
			detail: `${current.rows} rows (at least ${floor} expected)`,
		},
	];
	if (previous) {
		const rows = delta(current.people, previous.people);
		checks.push({
			name: `${source}.people`,
			ok: rows <= SI_LIMITS.rowsDelta,
			approvable: true,
			detail: `${current.people} doctors vs ${previous.people} last time (${percent(rows)})`,
		});
		if (previous.bytes !== undefined) {
			const size = delta(current.bytes, previous.bytes);
			checks.push({
				name: `${source}.size`,
				ok: size <= SI_LIMITS.fileSizeDelta,
				approvable: true,
				detail: `${current.bytes} bytes vs ${previous.bytes} last time (${percent(size)})`,
			});
		}
	}
	return checks;
}

/** After staging: nearly every practice must be placed in its municipality. */
export function checkSiPlaces(staged: { sites: number; placed: number }): GuardCheck[] {
	const ratio = staged.sites === 0 ? 1 : staged.placed / staged.sites;
	return [
		{
			name: "si.places",
			ok: ratio >= SI_LIMITS.minPlacedRatio,
			approvable: true,
			detail: `${staged.placed} of ${staged.sites} practices placed in their municipality (${percent(ratio)})`,
		},
	];
}

// ---------------------------------------------------------------------------
// Cyprus (`etl:cy`): the same verdicts, on each of the three lists
// ---------------------------------------------------------------------------

/**
 * Limits of the Cypriot lists. Floors catch an empty or broken file on a first run (the lists of
 * November 2026: 660 private pharmacies, 8 state hospitals, 35 state health centres);
 * afterwards the change since the last successful run blocks a truncated file (approvable). The
 * pharmacies' list is rebuilt once a year, so a new edition may move more than a weekly
 * register: 20%.
 */
export const CY_LIMITS = {
	quarantineRatio: 0.02,
	floors: {
		farmakeia: { minLines: 60, minRows: 50, rowsDelta: 0.2, sizeDelta: 0.4 },
		nosokomeia: { minLines: 3, minRows: 3, rowsDelta: 0.5, sizeDelta: 0.5 },
		kentra: { minLines: 10, minRows: 10, rowsDelta: 0.3, sizeDelta: 0.5 },
	} as Readonly<
		Record<string, { minLines: number; minRows: number; rowsDelta: number; sizeDelta: number }>
	>,
	/** Facilities placed in their municipality or community (else left out). */
	minPlacedRatio: 0.95,
} as const;

/**
 * Checks of one Cypriot list before the merge: quarantine within 2%, floors of lines and rows
 * (never approvable), and at most the list's share more or fewer rows or bytes than the last
 * successful run that read it (approvable).
 */
export function checkCySource(
	source: string,
	current: AtSourceStats & { bytes: number },
	previous: (AtSourceStats & { bytes?: number }) | null,
): GuardCheck[] {
	const floors = CY_LIMITS.floors[source] ?? {
		minLines: 1,
		minRows: 1,
		rowsDelta: 0.2,
		sizeDelta: 0.4,
	};
	const ratio = current.lines === 0 ? 1 : current.quarantined / current.lines;
	const checks: GuardCheck[] = [
		{
			name: `${source}.quarantine`,
			ok: current.lines > 0 && ratio <= CY_LIMITS.quarantineRatio,
			approvable: false,
			detail: `${current.quarantined} of ${current.lines} lines quarantined (${percent(ratio)})`,
		},
		{
			name: `${source}.lines`,
			ok: current.lines >= floors.minLines,
			approvable: false,
			detail: `${current.lines} data lines (at least ${floors.minLines} expected)`,
		},
		{
			name: `${source}.rows`,
			ok: current.rows >= floors.minRows,
			approvable: false,
			detail: `${current.rows} facilities read (at least ${floors.minRows} expected)`,
		},
	];
	if (previous) {
		const rows = delta(current.rows, previous.rows);
		checks.push({
			name: `${source}.facilities`,
			ok: rows <= floors.rowsDelta,
			approvable: true,
			detail: `${current.rows} facilities vs ${previous.rows} last time (${percent(rows)})`,
		});
		if (previous.bytes !== undefined) {
			const size = delta(current.bytes, previous.bytes);
			checks.push({
				name: `${source}.size`,
				ok: size <= floors.sizeDelta,
				approvable: true,
				detail: `${current.bytes} bytes vs ${previous.bytes} last time (${percent(size)})`,
			});
		}
	}
	return checks;
}

/**
 * After placing: nearly every facility must be placed in its municipality or community, or the
 * places are not the expected ones (a places import missing, a changed postcode table).
 */
export function checkCyPlaces(placement: {
	byPostcode: number;
	byName: number;
	byPoint: number;
	unplaced: number;
}): GuardCheck[] {
	const placed = placement.byPostcode + placement.byName + placement.byPoint;
	const all = placed + placement.unplaced;
	const ratio = all === 0 ? 1 : placed / all;
	return [
		{
			name: "cy.places",
			ok: ratio >= CY_LIMITS.minPlacedRatio,
			approvable: true,
			detail: `${placed} of ${all} facilities placed in their municipality or community (${percent(ratio)})`,
		},
	];
}
