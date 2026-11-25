import { describe, expect, it } from "vitest";
import {
	DEFAULT_WAIT_SECONDS,
	describeTarget,
	isTransientConnectionError,
	waitForDatabase,
	waitSeconds,
} from "./wait";

function codeError(code: string, message = `failed with ${code}`) {
	return Object.assign(new Error(message), { code });
}

/** A clock that only moves when the wait sleeps. */
function fakeClock() {
	let time = 0;
	const lines: string[] = [];
	return {
		now: () => time,
		sleep: async (ms: number) => {
			time += ms;
		},
		log: { log: (line: string) => lines.push(line) },
		lines,
	};
}

describe("isTransientConnectionError", () => {
	it.each(["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "CONNECT_TIMEOUT", "57P03", "08006"])(
		"retries %s",
		(code) => {
			expect(isTransientConnectionError(codeError(code))).toBe(true);
		},
	);

	it.each(["28P01", "3D000", "42501"])("fails at once on %s", (code) => {
		expect(isTransientConnectionError(codeError(code))).toBe(false);
	});

	it("fails at once on an error without a code", () => {
		expect(isTransientConnectionError(new Error("boom"))).toBe(false);
		expect(isTransientConnectionError("boom")).toBe(false);
	});
});

describe("describeTarget", () => {
	it("keeps host, port and database, never the credentials", () => {
		const target = describeTarget("postgres://postgres:s3cret@db.internal:6543/apercura");
		expect(target).toBe("db.internal:6543/apercura");
		expect(target).not.toContain("s3cret");
		expect(describeTarget("postgres://u:p@postgres/apercura")).toBe("postgres:5432/apercura");
	});

	it("does not echo an invalid URL", () => {
		expect(describeTarget("not a url with p4ss")).toBe("the database");
	});
});

describe("waitSeconds", () => {
	it("defaults, accepts whole seconds and refuses the rest", () => {
		expect(waitSeconds(undefined)).toBe(DEFAULT_WAIT_SECONDS);
		expect(waitSeconds("")).toBe(DEFAULT_WAIT_SECONDS);
		expect(waitSeconds("0")).toBe(0);
		expect(waitSeconds("300")).toBe(300);
		expect(() => waitSeconds("1.5")).toThrow(/whole number/);
		expect(() => waitSeconds("-1")).toThrow(/whole number/);
	});
});

describe("waitForDatabase", () => {
	it("returns at once when the database answers, without a log", async () => {
		const clock = fakeClock();
		await waitForDatabase(async () => 1, { target: "db:5432/x", timeoutSeconds: 10, ...clock });
		expect(clock.lines).toEqual([]);
	});

	it("retries connection errors until the database answers", async () => {
		const clock = fakeClock();
		let calls = 0;
		await waitForDatabase(
			async () => {
				calls += 1;
				if (calls < 4) throw codeError(calls === 1 ? "ENOTFOUND" : "57P03");
			},
			{ target: "db:5432/x", timeoutSeconds: 120, intervalMs: 2000, ...clock },
		);
		expect(calls).toBe(4);
		expect(clock.lines[0]).toMatch(
			/^Waiting for the database db:5432\/x \(0\/120 s\): .*ENOTFOUND/,
		);
		expect(clock.lines.at(-1)).toBe("Database db:5432/x is ready (after 6 s)");
	});

	it("gives up after the timeout with the last error", async () => {
		const clock = fakeClock();
		let calls = 0;
		await expect(
			waitForDatabase(
				async () => {
					calls += 1;
					throw codeError("ECONNREFUSED", "connect ECONNREFUSED 172.18.0.2:5432");
				},
				{ target: "db:5432/x", timeoutSeconds: 10, intervalMs: 2000, ...clock },
			),
		).rejects.toThrow(
			"Database db:5432/x still unreachable after 10 s (DATABASE_WAIT_SECONDS): connect ECONNREFUSED 172.18.0.2:5432",
		);
		expect(calls).toBe(6);
		expect(clock.now()).toBe(10_000);
	});

	it("does not retry a real refusal", async () => {
		const clock = fakeClock();
		let calls = 0;
		const refusal = codeError("28P01", 'password authentication failed for user "postgres"');
		await expect(
			waitForDatabase(
				async () => {
					calls += 1;
					throw refusal;
				},
				{ target: "db:5432/x", timeoutSeconds: 120, ...clock },
			),
		).rejects.toBe(refusal);
		expect(calls).toBe(1);
	});

	it("tries once with a timeout of 0", async () => {
		const clock = fakeClock();
		await expect(
			waitForDatabase(
				async () => {
					throw codeError("ECONNREFUSED");
				},
				{ target: "db:5432/x", timeoutSeconds: 0, ...clock },
			),
		).rejects.toThrow(/still unreachable after 0 s/);
	});
});
