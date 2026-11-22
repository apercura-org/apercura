import { createServer, type Server } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { assertSmtpTls } from "./smtp-check";
import { smtpTransportOptions, smtpUrlProblem } from "./smtp-options";

const PROD = { NODE_ENV: "production" } as const;

describe("SMTP transport security", () => {
	it("requires STARTTLS for smtp:// and implicit TLS for smtps:// in production", () => {
		expect(
			smtpTransportOptions({ ...PROD, SMTP_URL: "smtp://user:pass@mail.example:587" }),
		).toEqual({
			url: "smtp://user:pass@mail.example:587",
			secure: false,
			requireTLS: true,
			tls: { rejectUnauthorized: true, minVersion: "TLSv1.2" },
		});
		expect(
			smtpTransportOptions({ ...PROD, SMTP_URL: "smtps://user:pass@mail.example:465" }),
		).toEqual({
			url: "smtps://user:pass@mail.example:465",
			secure: true,
			tls: { rejectUnauthorized: true, minVersion: "TLSv1.2" },
		});
	});

	it("refuses URLs that would weaken TLS in production", () => {
		for (const url of [
			"smtp://mail.example:25?ignoreTLS=true",
			"smtp://mail.example:587?requireTLS=false",
			"smtps://mail.example:465?secure=false",
			"smtp://mail.example:587?tls.rejectUnauthorized=false",
			"smtp://mail.example:587?opportunisticTLS=true",
		]) {
			expect(smtpUrlProblem({ ...PROD, SMTP_URL: url }), url).toMatch(/may not set/);
			expect(() => smtpTransportOptions({ ...PROD, SMTP_URL: url })).toThrow(/may not set/);
		}
		expect(smtpUrlProblem({ ...PROD, SMTP_URL: "direct://mail.example" })).toMatch(
			/smtps:\/\/ or smtp:\/\//,
		);
		expect(() => smtpTransportOptions(PROD)).toThrow("SMTP_URL is not set");
	});

	it("uses the URL as given outside production or with SMTP_ALLOW_INSECURE", () => {
		expect(smtpTransportOptions({ NODE_ENV: "development" })).toEqual({
			url: "smtp://localhost:1025",
		});
		expect(
			smtpTransportOptions({ NODE_ENV: "test", SMTP_URL: "smtp://localhost:1025?ignoreTLS=true" }),
		).toEqual({ url: "smtp://localhost:1025?ignoreTLS=true" });
		for (const flag of ["true", "1", true] as const) {
			expect(
				smtpTransportOptions({
					...PROD,
					SMTP_URL: "smtp://mailpit:1025",
					SMTP_ALLOW_INSECURE: flag,
				}),
			).toEqual({ url: "smtp://mailpit:1025" });
		}
		expect(
			smtpUrlProblem({
				...PROD,
				SMTP_URL: "smtp://m:1025?ignoreTLS=true",
				SMTP_ALLOW_INSECURE: "false",
			}),
		).not.toBeNull();
	});
});

describe("SMTP check at start-up", () => {
	let server: Server | undefined;

	afterEach(async () => {
		await new Promise((resolve) => (server ? server.close(resolve) : resolve(undefined)));
		server = undefined;
	});

	/** A plaintext SMTP server on a random local port that offers no STARTTLS. */
	async function plaintextServer(): Promise<number> {
		server = createServer((socket) => {
			socket.write("220 plaintext.example ESMTP\r\n");
			socket.on("data", (data) => {
				const line = data.toString().trim().toUpperCase();
				if (line.startsWith("EHLO")) socket.write("250-plaintext.example\r\n250 AUTH PLAIN\r\n");
				else if (line.startsWith("STARTTLS")) socket.write("502 5.5.1 Not implemented\r\n");
				else if (line.startsWith("QUIT")) socket.end("221 Bye\r\n");
				else socket.write("250 OK\r\n");
			});
		});
		await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
		const address = server.address();
		return typeof address === "object" && address ? address.port : 0;
	}

	it("refuses to start in production against a server without STARTTLS", async () => {
		const port = await plaintextServer();
		await expect(assertSmtpTls({ ...PROD, SMTP_URL: `smtp://127.0.0.1:${port}` })).rejects.toThrow(
			/cannot do STARTTLS/,
		);
	});

	it("lets a local catcher through with SMTP_ALLOW_INSECURE, and ignores other environments", async () => {
		const port = await plaintextServer();
		const url = `smtp://127.0.0.1:${port}`;
		await expect(
			assertSmtpTls({ ...PROD, SMTP_URL: url, SMTP_ALLOW_INSECURE: "true" }),
		).resolves.toBeUndefined();
		await expect(
			assertSmtpTls({ NODE_ENV: "development", SMTP_URL: url }),
		).resolves.toBeUndefined();
	});

	it("refuses a TLS-weakening URL before connecting", async () => {
		await expect(
			assertSmtpTls({ ...PROD, SMTP_URL: "smtp://127.0.0.1:1?ignoreTLS=true" }),
		).rejects.toThrow(/may not set/);
	});
});
