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

const serverSchema = z.object({
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

const clientSchema = z.object({
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
	throw new Error(`Invalid ${scope} environment variables:\n${z.prettifyError(result.error)}`);
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
