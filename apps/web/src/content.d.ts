/**
 * Markdown files are imported as their text (the guides, `content/guides/*.md`): Turbopack's
 * `text` module type (next.config.ts), a Vite plugin in the unit tests (vitest.config.ts) and
 * Bun's `text` loader for the jobs (src/jobs/preload.ts, docker/build-cli.ts).
 */
declare module "*.md" {
	const text: string;
	export default text;
}
