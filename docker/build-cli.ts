/**
 * Bundles the command-line entry points of the image (migrations, scheduled jobs, open data
 * import) into single files run by Bun, the runtime they are developed and tested with, so the
 * image needs neither the sources nor the workspace's node_modules for them:
 *
 *   bun docker/build-cli.ts <outdir>
 *
 * The jobs import the app's server modules, which carry the `server-only` marker; as in
 * `apps/web/src/jobs/preload.ts`, it maps to an empty module outside React Server Components.
 */
import path from "node:path";

const outdir = path.resolve(process.argv[2] ?? "dist/cli");
const root = path.resolve(import.meta.dir, "..");

const entries = {
	migrate: "packages/db/src/migrate.ts",
	jobs: "apps/web/src/jobs/cli.ts",
	etl: "packages/etl/src/cli.ts",
};

for (const [name, entry] of Object.entries(entries)) {
	const result = await Bun.build({
		entrypoints: [path.join(root, entry)],
		outdir,
		naming: `${name}.js`,
		target: "bun",
		// Readable stack traces in the operator's logs matter more than a few hundred KiB.
		minify: false,
		sourcemap: "none",
		define: { "process.env.NODE_ENV": '"production"' },
		plugins: [
			{
				name: "server-only",
				setup(build) {
					build.onResolve({ filter: /^server-only$/ }, () => ({
						path: "server-only",
						namespace: "empty",
					}));
					build.onLoad({ filter: /.*/, namespace: "empty" }, () => ({
						contents: "export {};",
						loader: "js",
					}));
				},
			},
		],
	});
	if (!result.success) {
		for (const log of result.logs) console.error(log);
		process.exit(1);
	}
	const size = result.outputs.reduce((total, output) => total + output.size, 0);
	console.log(`${name}.js ${(size / 1024).toFixed(0)} KiB`);
}
