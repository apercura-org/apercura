import { defineConfig } from "drizzle-kit";

const url = process.env.DATABASE_URL_MIGRATE ?? process.env.DATABASE_URL;

export default defineConfig({
	dialect: "postgresql",
	schema: "./src/schema/index.ts",
	out: "./drizzle",
	schemaFilter: ["directory", "care"],
	casing: "snake_case",
	strict: true,
	verbose: true,
	...(url ? { dbCredentials: { url } } : {}),
});
