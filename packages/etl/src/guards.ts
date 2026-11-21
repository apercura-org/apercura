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
