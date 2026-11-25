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
