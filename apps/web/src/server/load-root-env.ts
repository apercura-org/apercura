import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseEnv } from "node:util";

/**
 * Copies the monorepo's root `.env` into `process.env`, without overriding
 * variables that are already set. A missing file (production, where the host
 * sets the variables) is not an error.
 */
export async function loadRootEnv() {
	const file = path.resolve(process.cwd(), "../..", ".env");
	let contents: string;
	try {
		contents = await readFile(file, "utf8");
	} catch {
		return;
	}
	for (const [key, value] of Object.entries(parseEnv(contents))) {
		if (process.env[key] === undefined) {
			process.env[key] = value;
		}
	}
}
