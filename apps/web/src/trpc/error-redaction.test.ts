import { TRPCError } from "@trpc/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { describeError, logProcedureError, redactErrorShape } from "./error-redaction";

const shape = (message: string) => ({
	message,
	code: -32603,
	data: {
		code: "INTERNAL_SERVER_ERROR",
		httpStatus: 500,
		stack: "Error: at x",
		path: "agenda.list",
	},
});

afterEach(() => {
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
});

describe("error redaction", () => {
	const leaky = new Error(
		"duplicate key value violates unique constraint, Key (email)=(a.patient@example.test)",
	);

	it("hides the message and stack of an unexpected error outside development", () => {
		vi.stubEnv("NODE_ENV", "production");
		const error = new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: leaky.message,
			cause: leaky,
		});
		const redacted = redactErrorShape(shape(leaky.message), error);
		expect(redacted.message).toBe("INTERNAL_SERVER_ERROR");
		expect(JSON.stringify(redacted)).not.toContain("example.test");
		expect(redacted.data).not.toHaveProperty("stack");
	});

	it("keeps business error codes, which the pages translate", () => {
		vi.stubEnv("NODE_ENV", "production");
		const error = new TRPCError({ code: "CONFLICT", message: "SLOT_TAKEN" });
		expect(redactErrorShape(shape("SLOT_TAKEN"), error).message).toBe("SLOT_TAKEN");
	});

	it("logs the kind of an unexpected error, never its message", () => {
		vi.stubEnv("NODE_ENV", "production");
		const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
		const cause = Object.assign(leaky, { code: "23505" });
		logProcedureError({
			path: "agenda.create",
			error: new TRPCError({ code: "INTERNAL_SERVER_ERROR", cause }),
		});
		const line = String(log.mock.calls[0]?.[0]);
		expect(line).toContain("agenda.create");
		expect(line).toContain("(23505)");
		expect(line).not.toContain("example.test");
		expect(describeError("a.patient@example.test")).toBe("string");
	});
});
