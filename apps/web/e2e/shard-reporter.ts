import type { FullConfig, Reporter, Suite, TestCase, TestRun } from "@playwright/test/reporter";

/**
 * Shards the run (`--shard=i/N`, CI's e2e matrix, #191) in place of Playwright's own filter.
 *
 * Playwright splits the run into consecutive runs of test groups, and a file whose tests run in
 * order (`mode: "default"`, as e2e/sitemap.spec.ts) is one group: every part of the sitemap walk
 * would land in the first shard, which would wait on it while the others finish early. Here:
 * - the tests of the `spread` projects are dealt one by one across the shards, so each shard walks
 *   its share of the sitemap (still in order, on one worker, first in its queue);
 * - every other test keeps Playwright's split: its groups (a file or describe that runs in order,
 *   else a single test) in consecutive runs of an equal number of tests.
 */
type Options = { spread?: readonly string[] };

export default class ShardReporter implements Reporter {
	private readonly spread: ReadonlySet<string>;

	constructor(options: Options = {}) {
		this.spread = new Set(options.spread ?? []);
	}

	printsToStdio(): boolean {
		return false;
	}

	async preprocess({
		config,
		suite,
		testRun,
	}: {
		config: FullConfig;
		suite: Suite;
		testRun: TestRun;
	}): Promise<void> {
		const shard = config.shard;
		if (!shard) return;
		testRun.skipSharding();
		const index = shard.current - 1;
		const keep = new Set<TestCase>();

		const groups: TestCase[][] = [];
		for (const project of suite.suites) {
			const tests = project.allTests();
			if (this.spread.has(project.title)) {
				tests.forEach((test, position) => {
					if (position % shard.total === index) keep.add(test);
				});
				continue;
			}
			const byKey = new Map<Suite | TestCase, TestCase[]>();
			for (const test of tests) {
				const key = groupKey(test, testRun);
				const group = byKey.get(key);
				if (group) group.push(test);
				else {
					const created = [test];
					byKey.set(key, created);
					groups.push(created);
				}
			}
		}
		for (const group of consecutiveShare(groups, shard.current, shard.total)) {
			for (const test of group) keep.add(test);
		}

		for (const test of suite.allTests()) {
			if (!keep.has(test)) testRun.exclude(test);
		}
	}
}

/**
 * The group a test runs in: its outermost suite below the project that runs its tests in order
 * (a file or describe in `default` or `serial` mode), else the test alone.
 */
function groupKey(test: TestCase, testRun: TestRun): Suite | TestCase {
	let key: Suite | TestCase = test;
	for (
		let parent: Suite | undefined = test.parent;
		parent && parent.type !== "project";
		parent = parent.parent
	) {
		if (testRun.mode(parent) !== "parallel") key = parent;
	}
	return key;
}

/**
 * Shard `current` of `total` (1-based): consecutive groups holding an equal share of the tests
 * that will run, as Playwright's own filter does (skipped tests do not count unless all are).
 */
function consecutiveShare(groups: TestCase[][], current: number, total: number): TestCase[][] {
	const active = groups.map((group) => group.filter((t) => t.expectedStatus !== "skipped").length);
	const sizes = active.some(Boolean) ? active : groups.map((group) => group.length);
	const all = sizes.reduce((sum, size) => sum + size, 0);
	const shares = Array.from(
		{ length: total },
		(_, i) => Math.floor(((i + 1) * all) / total) - Math.floor((i * all) / total),
	);
	const from = shares.slice(0, current - 1).reduce((sum, share) => sum + share, 0);
	const to = from + (shares[current - 1] ?? 0);
	const mine: TestCase[][] = [];
	let position = 0;
	groups.forEach((group, i) => {
		const size = sizes[i] ?? 0;
		const at = size ? position : Math.max(position - 1, 0);
		if (at >= from && at < to) mine.push(group);
		position += size;
	});
	return mine;
}
