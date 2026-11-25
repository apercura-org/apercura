/**
 * Waits, for a bounded time, until the database accepts connections. The `migrate` step runs
 * at the same time as the database it migrates (docker/compose.app.yml has no dependency on a
 * database service: under Coolify the database is a separate resource, and in
 * docker/compose.selfhost.yml PostgreSQL may still be running its first-start scripts), so it
 * retries while the server is unreachable or starting up, and gives up with a clear message
 * after DATABASE_WAIT_SECONDS (default 120).
 *
 * Only connection failures are retried. Any answer from the server other than "starting up"
 * (a wrong password, a database that does not exist) fails at once: waiting would not fix it.
 * Logs name the host, port and database of the URL, never the user or the password.
 */

export const DEFAULT_WAIT_SECONDS = 120;

/** Network and driver codes of a server that is not there yet (or not listening yet). */
const TRANSIENT_CODES = new Set([
	"ECONNREFUSED",
	"ECONNRESET",
	"ENOTFOUND",
	"EAI_AGAIN",
	"ETIMEDOUT",
	"EHOSTUNREACH",
	"ENETUNREACH",
	"EPIPE",
	// postgres.js
	"CONNECT_TIMEOUT",
	"CONNECTION_CLOSED",
	"CONNECTION_ENDED",
	"CONNECTION_DESTROYED",
]);

/** SQLSTATE cannot_connect_now: the server is starting up, shutting down or in recovery. */
const CANNOT_CONNECT_NOW = "57P03";

function errorCode(error: unknown): string | undefined {
	if (typeof error === "object" && error !== null && "code" in error) {
		return typeof error.code === "string" ? error.code : undefined;
	}
	return undefined;
}

/** True when the error means "not reachable yet" rather than a real refusal. */
export function isTransientConnectionError(error: unknown): boolean {
	const code = errorCode(error);
	if (code === undefined) return false;
	// SQLSTATE class 08: connection exception.
	return TRANSIENT_CODES.has(code) || code === CANNOT_CONNECT_NOW || /^08[0-9A-Z]{3}$/.test(code);
}

/** host:port/database of a connection URL, without its credentials. */
export function describeTarget(url: string): string {
	try {
		const parsed = new URL(url);
		const database = parsed.pathname.replace(/^\//, "");
		return `${parsed.hostname}:${parsed.port || "5432"}${database ? `/${database}` : ""}`;
	} catch {
		return "the database";
	}
}

/** The wait from DATABASE_WAIT_SECONDS: a whole number of seconds, 0 for a single attempt. */
export function waitSeconds(value: string | undefined): number {
	if (value === undefined || value.trim() === "") return DEFAULT_WAIT_SECONDS;
	const seconds = Number(value);
	if (!Number.isInteger(seconds) || seconds < 0) {
		throw new Error(`DATABASE_WAIT_SECONDS must be a whole number of seconds (got ${value})`);
	}
	return seconds;
}

function reason(error: unknown): string {
	const code = errorCode(error);
	const message = error instanceof Error ? error.message : String(error);
	return code && !message.includes(code) ? `${code} ${message}` : message;
}

export type WaitOptions = {
	/** host:port/database, for the logs. */
	target: string;
	timeoutSeconds: number;
	intervalMs?: number;
	log?: Pick<Console, "log">;
	now?: () => number;
	sleep?: (ms: number) => Promise<void>;
};

/**
 * Calls `probe` until it resolves. Retries transient connection errors every `intervalMs` until
 * `timeoutSeconds` have passed, then throws; any other error is rethrown at once.
 */
export async function waitForDatabase(
	probe: () => Promise<unknown>,
	{
		target,
		timeoutSeconds,
		intervalMs = 2000,
		log = console,
		now = Date.now,
		sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
	}: WaitOptions,
): Promise<void> {
	const start = now();
	const deadline = start + timeoutSeconds * 1000;
	let attempt = 0;
	for (;;) {
		attempt += 1;
		try {
			await probe();
			if (attempt > 1) {
				const elapsed = Math.round((now() - start) / 1000);
				log.log(`Database ${target} is ready (after ${elapsed} s)`);
			}
			return;
		} catch (error) {
			if (!isTransientConnectionError(error)) throw error;
			if (now() + intervalMs > deadline) {
				throw new Error(
					`Database ${target} still unreachable after ${timeoutSeconds} s (DATABASE_WAIT_SECONDS): ${reason(error)}`,
				);
			}
			// The first failure, then about every 10 seconds.
			if (attempt === 1 || attempt % Math.max(1, Math.round(10_000 / intervalMs)) === 0) {
				const elapsed = Math.round((now() - start) / 1000);
				log.log(
					`Waiting for the database ${target} (${elapsed}/${timeoutSeconds} s): ${reason(error)}`,
				);
			}
			await sleep(intervalMs);
		}
	}
}
