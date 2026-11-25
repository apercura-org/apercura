/**
 * GDPR objections in the import (#116). The national ids of `directory.suppressions` are read
 * before the source files, and their lines are dropped while parsing: nothing about a removed
 * practitioner reaches staging (or the quarantine), so their data is never stored again. Keyed
 * by country and identifier scheme, like the suppressions themselves.
 */
import type { Sql } from "./lib/db";

export type SuppressionScope = { country: string; idScheme: string };

export type SuppressedLinesSummary = Record<
	string,
	{ idScheme: string; ids: number; lines: number; byFile: Record<string, number> }
>;

/** The suppressed national ids of one country and scheme, and the lines dropped for them. */
export class SuppressedLines {
	private readonly byFile = new Map<string, number>();
	/** Dropped rows that would have been staged, and their distinct ids, per group (profession). */
	private readonly groups = new Map<string, { rows: number; ids: Set<string> }>();

	constructor(
		readonly scope: SuppressionScope,
		private readonly ids: ReadonlySet<string>,
	) {}

	static async load(sql: Sql, scope: SuppressionScope): Promise<SuppressedLines> {
		const rows = await sql<{ national_id: string }[]>`
			SELECT national_id FROM directory.suppressions
			WHERE country = ${scope.country} AND id_scheme = ${scope.idScheme}
		`;
		return new SuppressedLines(scope, new Set(rows.map((row) => row.national_id)));
	}

	/**
	 * True, and counted, when a line belongs to a suppressed national id: its id field, or any
	 * field of a line whose field count is off (it would be quarantined with a sample of the line).
	 * `group` (the profession of a line that would have been staged) feeds {@link droppedRows}.
	 */
	skip(
		fileKey: string,
		fields: readonly string[],
		idIndex: number,
		expectedFieldCount: number,
		group?: string,
	): boolean {
		if (this.ids.size === 0) return false;
		const id = fields[idIndex] ?? "";
		const suppressed =
			this.ids.has(id) ||
			(fields.length !== expectedFieldCount && fields.some((field) => this.ids.has(field.trim())));
		if (!suppressed) return false;
		this.byFile.set(fileKey, (this.byFile.get(fileKey) ?? 0) + 1);
		if (group !== undefined) {
			const counts = this.groups.get(group) ?? { rows: 0, ids: new Set<string>() };
			counts.rows++;
			counts.ids.add(id);
			this.groups.set(group, counts);
		}
		return true;
	}

	/**
	 * The rows dropped instead of staged, and their distinct ids per group: the staging volume
	 * checks compare what the source holds, so a suppression never looks like a shrinking file.
	 */
	droppedRows(): { rows: number; idsByGroup: Record<string, number> } {
		let rows = 0;
		const idsByGroup: Record<string, number> = {};
		for (const [group, counts] of this.groups) {
			rows += counts.rows;
			idsByGroup[group] = counts.ids.size;
		}
		return { rows, idsByGroup };
	}

	/** Lines dropped, per country (`etl_runs.stats.suppressedLines`). */
	summary(): SuppressedLinesSummary {
		const byFile = Object.fromEntries(this.byFile);
		return {
			[this.scope.country]: {
				idScheme: this.scope.idScheme,
				ids: this.ids.size,
				lines: Object.values(byFile).reduce((sum, count) => sum + count, 0),
				byFile,
			},
		};
	}
}
