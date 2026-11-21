import path from "node:path";
import { loadEnvConfig } from "@next/env";

/** The monorepo keeps a single `.env` at its root; Next.js only looks in `apps/web`. */
export const monorepoRoot = path.resolve(process.cwd(), "../..");

loadEnvConfig(monorepoRoot);
