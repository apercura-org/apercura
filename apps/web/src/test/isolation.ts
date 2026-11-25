/**
 * The guard of the shared test database (issue #123), run by `isolation.test.ts`.
 *
 * Every `*.integration.test.ts` file runs in parallel with the others on DATABASE_URL_TEST. The
 * jobs below work on whole tables: called from one file, they purge, expire, count or rebuild
 * the rows of the files running alongside it, which then fail at random. A file may call them
 * only from a database of its own (`isolatedDatabase()`, ./isolated-database.ts), or, for the
 * few that take one, with the scope that limits them to its own rows.
 *
 * A static check, on the source text: it sees the direct calls (`purge(db, now)`,
 * `retention.purgeClosedRequests(db, now)`), not a job reached through a procedure.
 */

/** Jobs that always work on the whole database. */
export const GLOBAL_MAINTENANCE = [
	// ~/server/booking/jobs.ts (`jobs:tick`)
	"runTick",
	"expireLapsed",
	"enqueueReminders",
	"drainOutbox",
	"purge",
	"closuresJob",
	"requestsJob",
	"pageViewsJob",
	"adminAlertsJob",
	"rateLimitsJob",
	"auditLogJob",
	"purgeClaimDocumentsJob",
	"landingCountsJob",
	// What those jobs run.
	"purgeExpiredRateLimits",
	"purgeClosedRequests",
	"purgePageViews",
	"purgeAuditLogs",
	"purgeClaimDocuments",
	"drainStorageDeletions",
	"sendAdminAlert",
	"sendAdminAlerts",
	"alertAdminsQuietly",
	// ~/server/gdpr/minimise.ts: rebuilds every listing count, drains every queued rebuild and
	// storage deletion.
	"refreshLandingCounts",
	"runQueuedLandingRefresh",
	"afterPurge",
	// ~/server/keys/rotation.ts: re-wraps every organization key.
	"rotateKeys",
] as const;

/** Jobs that are global unless given the scope: the position of the argument that limits them. */
export const SCOPABLE_MAINTENANCE = {
	/** `refreshAllNextFree(db, nowMs, practitionerIds)` */
	refreshAllNextFree: { argument: 2 },
	/** `finalizeClosures(db, nowMs, organizationIds)` */
	finalizeClosures: { argument: 2 },
	/** `processOutbox(db, { nowMs, ids })` */
	processOutbox: { option: "ids" },
} as const satisfies Record<string, { argument: number } | { option: string }>;

/** SQL that works on whole tables, in the file's own queries. */
const GLOBAL_SQL: { pattern: RegExp; label: string }[] = [
	// The statement, not the privilege's name in a list.
	{ pattern: /\btruncate\s+(?:table\s+)?(?:only\s+)?[\w"]/gi, label: "TRUNCATE" },
	{ pattern: /\brefresh_landing_pages\s*\(/gi, label: "directory.refresh_landing_pages()" },
	// A call, not the signature `care.purge_audit_events(integer)` a privilege check names.
	{ pattern: /\bpurge_audit_events\s*\((?!\s*integer\s*\))/gi, label: "care.purge_audit_events()" },
	// `DELETE FROM directory.admin_alerts` with nothing after the table name.
	{
		pattern: /\bdelete\s+from\s+[\w."]+\s*(?=[;`'")]|$)/gim,
		label: "DELETE without WHERE",
	},
];

/** Drizzle `db.delete(table)` without `.where(…)`: every row of the table. */
const UNSCOPED_DRIZZLE_DELETE = /\b(?:db|tx)\.delete\(\s*[\w$]+\s*\)(?!\s*\.where)/g;

const ISOLATED = /\bisolatedDatabase\s*\(/;

export interface Violation {
	line: number;
	what: string;
}

/**
 * Two views of `source` with the same length and line breaks: `sql` without the comments, and
 * `code` also without the content of the string literals (the `${…}` of a template stay code).
 */
export function views(source: string): { code: string; sql: string } {
	const code = source.split("");
	const sql = source.split("");
	const blank = (from: number, to: number, both: boolean) => {
		for (let index = from; index < to; index++) {
			if (source[index] === "\n") continue;
			code[index] = " ";
			if (both) sql[index] = " ";
		}
	};
	/** Brace depth of each open `${…}`: back to the template when it closes. */
	const templates: number[] = [];
	let index = 0;
	while (index < source.length) {
		const char = source[index];
		const next = source[index + 1];
		if (char === "/" && next === "/") {
			const end = source.indexOf("\n", index);
			const stop = end === -1 ? source.length : end;
			blank(index, stop, true);
			index = stop;
		} else if (char === "/" && next === "*") {
			const end = source.indexOf("*/", index + 2);
			const stop = end === -1 ? source.length : end + 2;
			blank(index, stop, true);
			index = stop;
		} else if (char === '"' || char === "'") {
			let end = index + 1;
			while (end < source.length && source[end] !== char && source[end] !== "\n") {
				end += source[end] === "\\" ? 2 : 1;
			}
			blank(index + 1, end, false);
			index = end + 1;
		} else if (char === "`" || (char === "}" && templates.at(-1) === 0)) {
			if (char === "}") templates.pop();
			// Inside a template: up to its end or to the next `${`.
			let end = index + 1;
			while (end < source.length && source[end] !== "`") {
				if (source[end] === "\\") {
					end += 2;
					continue;
				}
				if (source[end] === "$" && source[end + 1] === "{") break;
				end += 1;
			}
			blank(index + 1, end, false);
			if (source[end] === "$") {
				templates.push(0);
				index = end + 2;
			} else {
				index = end + 1;
			}
		} else {
			if (templates.length > 0) {
				const depth = templates.length - 1;
				if (char === "{") templates[depth] = (templates[depth] ?? 0) + 1;
				if (char === "}") templates[depth] = (templates[depth] ?? 0) - 1;
			}
			index += 1;
		}
	}
	return { code: code.join(""), sql: sql.join("") };
}

/** The top-level arguments of the call whose `(` is at `open` (empty when unbalanced). */
function argumentsAt(code: string, open: number): string[] {
	const args: string[] = [];
	let depth = 0;
	let start = open + 1;
	for (let index = open; index < code.length; index++) {
		const char = code[index];
		if (char === "(" || char === "[" || char === "{") depth += 1;
		else if (char === ")" || char === "]" || char === "}") {
			depth -= 1;
			if (depth === 0) {
				const last = code.slice(start, index).trim();
				if (last !== "" || args.length > 0) args.push(last);
				return args;
			}
		} else if (char === "," && depth === 1) {
			args.push(code.slice(start, index).trim());
			start = index + 1;
		}
	}
	return [];
}

const lineOf = (source: string, index: number) => source.slice(0, index).split("\n").length;

/** Whether the file opens a database of its own: then any job may run in it. */
export function isIsolated(source: string): boolean {
	return ISOLATED.test(views(source).code);
}

/** What in `source` reaches beyond the file's own rows of the shared database. */
export function unscopedMaintenance(source: string): Violation[] {
	if (isIsolated(source)) return [];
	const { code, sql } = views(source);
	const violations: Violation[] = [];
	const names = [...GLOBAL_MAINTENANCE, ...Object.keys(SCOPABLE_MAINTENANCE)];
	const call = new RegExp(`(?<![\\w$])(?<!function\\s+)(${names.join("|")})\\s*\\(`, "g");
	for (const match of code.matchAll(call)) {
		const name = match[1] as string;
		const open = match.index + match[0].length - 1;
		const scope = SCOPABLE_MAINTENANCE[name as keyof typeof SCOPABLE_MAINTENANCE];
		if (scope) {
			const args = argumentsAt(code, open);
			const scoped =
				"argument" in scope
					? (args[scope.argument] ?? "undefined") !== "undefined"
					: new RegExp(`(^|[{,\\s])${scope.option}\\s*[:,}]`).test(args[1] ?? "");
			if (scoped) continue;
			violations.push({ line: lineOf(source, match.index), what: `${name}() without its scope` });
		} else {
			violations.push({ line: lineOf(source, match.index), what: `${name}()` });
		}
	}
	for (const match of code.matchAll(UNSCOPED_DRIZZLE_DELETE)) {
		violations.push({ line: lineOf(source, match.index), what: `${match[0]} without .where()` });
	}
	for (const { pattern, label } of GLOBAL_SQL) {
		for (const match of sql.matchAll(pattern)) {
			violations.push({ line: lineOf(source, match.index), what: label });
		}
	}
	return violations.sort((a, b) => a.line - b.line);
}
