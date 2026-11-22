import { z } from "zod";

/**
 * Typed environment variables.
 *
 * Server variables are only readable on the server. Client variables must be
 * prefixed with NEXT_PUBLIC_ and referenced literally so Next.js can inline them.
 * Set SKIP_ENV_VALIDATION=1 to skip validation (CI builds, Docker image builds).
 */

const optionalString = z.string().min(1).optional();
const optionalUrl = z.url().optional();

const serverFields = z.object({
	NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

	APP_URL: z.url(),
	DATABASE_URL: z.url(),
	DATABASE_URL_ETL: optionalUrl,
	DATABASE_URL_MIGRATE: optionalUrl,

	BETTER_AUTH_SECRET: optionalString,
	BETTER_AUTH_URL: optionalUrl,
	/**
	 * Pro Santé Connect (OpenID Connect, client_secret_post, scope
	 * `openid scope_all`). The three are needed together; unset, the claim and
	 * sign-in pages do not offer it. PSC_ISSUER is the issuer URL whose
	 * `/.well-known/openid-configuration` is read at start, e.g. the ANS
	 * sandbox realm.
	 */
	PSC_CLIENT_ID: optionalString,
	PSC_CLIENT_SECRET: optionalString,
	PSC_ISSUER: optionalUrl,

	ENCRYPTION_KEYS: optionalString,
	ENCRYPTION_ACTIVE_KEY: optionalString,
	BLIND_INDEX_KEY: optionalString,
	/**
	 * Secret that signs the ALTCHA proof-of-work challenges of the booking form
	 * (self-hosted, no third-party service). Any random string of 32 bytes or more
	 * (`bun run keys:generate`). Optional: when unset each process draws a random
	 * key at start, so a challenge fetched from one instance fails on another.
	 */
	ALTCHA_HMAC_KEY: optionalString,

	SMTP_URL: optionalUrl,
	MAIL_FROM: optionalString,

	S3_ENDPOINT: optionalUrl,
	S3_BUCKET: optionalString,
	S3_ACCESS_KEY_ID: optionalString,
	S3_SECRET_ACCESS_KEY: optionalString,
	/** Base URL photos are served from (a CDN or a public bucket); unset, the app serves them. */
	S3_PUBLIC_URL: optionalUrl,
	/** Signing region of the S3 API (MinIO and most hosts accept the default). */
	S3_REGION: z.string().min(1).default("us-east-1"),

	JOBS_SECRET: optionalString,
	REVALIDATE_SECRET: optionalString,
	TRUSTED_PROXY_COUNT: z.coerce.number().int().min(0).default(0),
	/**
	 * Secret HMAC-SHA256 key that turns client IP addresses into rate-limit keys
	 * (public search suggestions), so `directory.rate_limits` never stores a raw
	 * IP. Any random string of at least 32 bytes, e.g. base64 of 32 random bytes:
	 * `bun run keys:generate` prints one, or `openssl rand -base64 32`. Optional:
	 * when unset each process draws a random key at start, which works but resets
	 * the counters on restart and splits them across instances. Rotating it only
	 * resets the counters.
	 */
	RATE_LIMIT_KEY: optionalString,

	ETL_PROFESSIONS: z
		.string()
		.default("10,40,50")
		.transform((value) =>
			value
				.split(",")
				.map((code) => code.trim())
				.filter(Boolean),
		),
	/**
	 * Name of the HDS-certified host that runs production (e.g. "Clever Cloud").
	 * Set it only where health data really is hosted there: the public pages then
	 * say so, naming the host. Unset (development, demos, forks, directory-only
	 * deployments), they only promise application-level encryption.
	 */
	PUBLIC_HDS_HOST: optionalString,

	/**
	 * The publisher and host named by the legal notice, the privacy policy, the terms and the
	 * accessibility statement (LCEN art. 6 III, GDPR art. 13). Unset, the pages print a visible
	 * placeholder such as `{{PUBLISHER_NAME}}`; production refuses to start or build without the
	 * required ones (LEGAL_REQUIRED_IN_PRODUCTION). Never invent them: they come from the legal
	 * entity's documents and the hosting contract (docs/launch-checklist.md).
	 */
	LEGAL_PUBLISHER_NAME: optionalString,
	LEGAL_PUBLISHER_LEGAL_FORM: optionalString,
	LEGAL_PUBLISHER_ADDRESS: optionalString,
	LEGAL_PUBLISHER_PHONE: optionalString,
	/** Trade register (RCS + SIREN) for a company, RNA number (and SIREN) for an association. */
	LEGAL_PUBLISHER_REGISTRATION: optionalString,
	LEGAL_PUBLICATION_DIRECTOR: optionalString,
	/** Address of every request: legal, privacy rights, accessibility feedback. */
	LEGAL_CONTACT_EMAIL: z.email().optional(),
	/** The data protection officer's contact (email or postal address). */
	LEGAL_DPO_CONTACT: optionalString,
	/** The host of the whole production (falls back to PUBLIC_HDS_HOST). */
	LEGAL_HOST_NAME: optionalString,
	LEGAL_HOST_ADDRESS: optionalString,
	LEGAL_HOST_PHONE: optionalString,
	/** The email provider, listed among the processors on the privacy page. */
	LEGAL_SMTP_PROVIDER: optionalString,
	/** Date the privacy policy and the terms take effect, `YYYY-MM-DD`. */
	LEGAL_EFFECTIVE_DATE: z.iso.date().optional(),

	/**
	 * `/.well-known/security.txt` (RFC 9116): where to report a vulnerability (`mailto:` or
	 * `https:` URI; defaults to `mailto:` LEGAL_CONTACT_EMAIL) and the disclosure policy (defaults
	 * to the repository's security policy).
	 */
	SECURITY_CONTACT: z
		.string()
		.regex(/^(mailto:|https:\/\/)\S+$/, "must be a mailto: or https:// URI")
		.optional(),
	SECURITY_POLICY_URL: optionalUrl,
	/**
	 * Adds `preload` to the production HSTS header. Only once the production domain and all its
	 * subdomains serve HTTPS for good: submitting a domain to the preload list is hard to undo.
	 */
	HSTS_PRELOAD: z
		.enum(["true", "false", "1", "0"])
		.default("false")
		.transform((value) => value === "true" || value === "1"),
	/** Search Console and Bing Webmaster Tools ownership tokens, printed as meta tags when set. */
	GOOGLE_SITE_VERIFICATION: optionalString,
	BING_SITE_VERIFICATION: optionalString,

	FEATURE_BOOKING: z
		.enum(["true", "false", "1", "0"])
		.default("false")
		.transform((value) => value === "true" || value === "1"),
	/**
	 * Claims by documents and registry phone callback (needs S3 storage and the
	 * encryption keys). On by default; `false` leaves Pro Santé Connect and the
	 * registry email only.
	 */
	FEATURE_CLAIM_DOCUMENTS: z
		.enum(["true", "false", "1", "0"])
		.default("true")
		.transform((value) => value === "true" || value === "1"),
});

/** Secrets that sign or derive keys: guessable values would make them pointless. */
const SECRETS = [
	"BETTER_AUTH_SECRET",
	"ALTCHA_HMAC_KEY",
	"RATE_LIMIT_KEY",
	"REVALIDATE_SECRET",
	"JOBS_SECRET",
] as const;
const MIN_SECRET_LENGTH = 32;

/** What the legal notice and the privacy policy cannot do without (LCEN art. 6 III, GDPR art. 13). */
export const LEGAL_REQUIRED_IN_PRODUCTION = [
	"LEGAL_PUBLISHER_NAME",
	"LEGAL_PUBLISHER_LEGAL_FORM",
	"LEGAL_PUBLISHER_ADDRESS",
	"LEGAL_PUBLISHER_PHONE",
	"LEGAL_PUBLISHER_REGISTRATION",
	"LEGAL_PUBLICATION_DIRECTOR",
	"LEGAL_CONTACT_EMAIL",
	"LEGAL_HOST_ADDRESS",
	"LEGAL_HOST_PHONE",
	"LEGAL_SMTP_PROVIDER",
	"LEGAL_EFFECTIVE_DATE",
] as const;

/**
 * Production refuses to start without the session secret, or with any secret
 * shorter than 32 characters (`bun run keys:generate` prints 44), and without
 * the publisher and host the legal pages must name. `next build` loads this
 * schema too (next.config.ts), so a production build fails the same way unless
 * SKIP_ENV_VALIDATION is set (CI, image builds: the check then runs at start).
 */
export const serverSchema = serverFields.superRefine((env, context) => {
	if (env.NODE_ENV !== "production") return;
	if (!env.BETTER_AUTH_SECRET) {
		context.addIssue({
			code: "custom",
			path: ["BETTER_AUTH_SECRET"],
			message: "BETTER_AUTH_SECRET is required in production (bun run keys:generate)",
		});
	}
	for (const name of LEGAL_REQUIRED_IN_PRODUCTION) {
		if (!env[name]) {
			context.addIssue({
				code: "custom",
				path: [name],
				message: `${name} is required in production (legal pages, docs/launch-checklist.md)`,
			});
		}
	}
	if (!env.LEGAL_HOST_NAME && !env.PUBLIC_HDS_HOST) {
		context.addIssue({
			code: "custom",
			path: ["LEGAL_HOST_NAME"],
			message: "LEGAL_HOST_NAME (or PUBLIC_HDS_HOST) is required in production (legal notice)",
		});
	}
	if (env.FEATURE_BOOKING && !env.LEGAL_DPO_CONTACT) {
		context.addIssue({
			code: "custom",
			path: ["LEGAL_DPO_CONTACT"],
			message:
				"LEGAL_DPO_CONTACT is required in production when FEATURE_BOOKING is on (GDPR art. 37)",
		});
	}
	for (const name of SECRETS) {
		const value = env[name];
		if (value !== undefined && value.length < MIN_SECRET_LENGTH) {
			context.addIssue({
				code: "custom",
				path: [name],
				message: `${name} must be at least ${MIN_SECRET_LENGTH} characters in production`,
			});
		}
	}
});

export const clientSchema = z.object({
	NEXT_PUBLIC_MAP_STYLE_URL: z.url().default("https://tiles.openfreemap.org/styles/positron"),
});

export type ServerEnv = z.infer<typeof serverSchema>;
export type ClientEnv = z.infer<typeof clientSchema>;

const skipValidation =
	process.env.SKIP_ENV_VALIDATION === "1" || process.env.SKIP_ENV_VALIDATION === "true";
const isServer = typeof window === "undefined";

/** Treats empty strings (e.g. `FOO=` copied from .env.example) as unset. */
function withoutEmptyStrings(values: Record<string, string | undefined>) {
	return Object.fromEntries(
		Object.entries(values).map(([key, value]) => [key, value === "" ? undefined : value]),
	);
}

/**
 * One line per invalid variable, each naming it: "JOBS_SECRET must be at least
 * 32 characters in production", "APP_URL: Invalid URL". Messages written for a
 * rule already name their variable; Zod's own ("Invalid URL") get it in front.
 */
export function describeEnvIssues(error: z.ZodError): string[] {
	return error.issues.map((issue) => {
		const name = issue.path.map(String).join(".") || "(environment)";
		return issue.message.startsWith(`${name} `) ? issue.message : `${name}: ${issue.message}`;
	});
}

function parseEnv<Schema extends z.ZodType>(
	schema: Schema,
	values: Record<string, string | undefined>,
	scope: string,
): z.infer<Schema> {
	const result = schema.safeParse(withoutEmptyStrings(values));
	if (result.success) {
		return result.data;
	}
	if (skipValidation) {
		return values as z.infer<Schema>;
	}
	const lines = describeEnvIssues(result.error).map((line) => `  ✖ ${line}`);
	throw new Error(`Invalid ${scope} environment variables:\n${lines.join("\n")}`);
}

export const clientEnv: ClientEnv = parseEnv(
	clientSchema,
	{ NEXT_PUBLIC_MAP_STYLE_URL: process.env.NEXT_PUBLIC_MAP_STYLE_URL },
	"client",
);

export const serverEnv: ServerEnv = isServer
	? parseEnv(serverSchema, process.env, "server")
	: new Proxy({} as ServerEnv, {
			get(_target, key) {
				throw new Error(`Server environment variable ${String(key)} accessed on the client`);
			},
		});
