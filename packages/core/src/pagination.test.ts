import { describe, expect, it } from "vitest";
import { pager, pagerDepthBound, pagerTargets } from "./pagination";

/** The pager's links of every page of a `pages`-page listing (index 0 unused). */
function linksOf(pages: number): number[][] {
	const links: number[][] = [[]];
	for (let page = 1; page <= pages; page++) links.push(pagerTargets(page, pages));
	return links;
}

/** Clicks from `from` to every page, following the pager's links. */
function depths(from: number, pages: number, links = linksOf(pages)): number[] {
	const depth = new Int32Array(pages + 1).fill(-1);
	depth[from] = 0;
	const queue = new Int32Array(pages);
	queue[0] = from;
	for (let head = 0, tail = 1; head < tail; head++) {
		const page = queue[head] as number;
		for (const target of links[page] as number[]) {
			if (depth[target] === -1) {
				depth[target] = (depth[page] as number) + 1;
				queue[tail++] = target;
			}
		}
	}
	return [...depth.slice(1)];
}

const maxDepth = (from: number, pages: number, links?: number[][]) =>
	Math.max(...depths(from, pages, links));
/** Numbered links of one pager: the block of ten, 9 per larger block, first and last. */
const linkCap = (pages: number) => 10 + 9 * (pagerDepthBound(pages) - 1) + 2;

describe("pager", () => {
	it("prints the block of ten and the round pages around the current one", () => {
		expect(pager(187, 219)).toEqual({
			page: 187,
			pages: 219,
			previous: 186,
			next: 188,
			nearby: [180, 181, 182, 183, 184, 185, 186, 187, 188, 189],
			jumps: [1, 100, 110, 120, 130, 140, 150, 160, 170, 190, 200, 219],
		});
		expect(pager(1, 219)).toMatchObject({
			previous: null,
			next: 2,
			nearby: [1, 2, 3, 4, 5, 6, 7, 8, 9],
			jumps: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 200, 219],
		});
		expect(pager(219, 219)).toMatchObject({
			next: null,
			nearby: [210, 211, 212, 213, 214, 215, 216, 217, 218, 219],
			jumps: [1, 100, 200],
		});
	});

	it("needs no jumps when every page fits in one block", () => {
		expect(pager(1, 1)).toMatchObject({ previous: null, next: null, nearby: [1], jumps: [] });
		expect(pager(2, 3)).toMatchObject({ previous: 1, next: 3, nearby: [1, 2, 3], jumps: [] });
		expect(pager(5, 12)).toMatchObject({ nearby: [1, 2, 3, 4, 5, 6, 7, 8, 9], jumps: [10, 12] });
	});

	it("clamps out-of-range input", () => {
		expect(pager(0, 0)).toMatchObject({ page: 1, pages: 1 });
		expect(pager(50, 3).page).toBe(3);
	});

	it("never links to the current page or outside the listing", () => {
		for (const pages of [1, 9, 10, 11, 99, 100, 101, 219, 1000, 4321]) {
			for (let page = 1; page <= pages; page += Math.max(1, Math.floor(pages / 97))) {
				const targets = pagerTargets(page, pages);
				expect(targets).not.toContain(page);
				expect(targets.every((target) => target >= 1 && target <= pages)).toBe(true);
				const { nearby, jumps } = pager(page, pages);
				expect(nearby.length + jumps.length).toBeLessThanOrEqual(linkCap(pages));
			}
		}
	});
});

describe("click depth", () => {
	it("reaches every page from the first one within digits(pages) clicks, for every size up to 1,200 pages", () => {
		for (let pages = 1; pages <= 1200; pages++) {
			const depth = maxDepth(1, pages);
			if (depth > pagerDepthBound(pages)) {
				throw new Error(`${pages} pages: ${depth} clicks from page 1`);
			}
		}
	}, 20_000); // 720,000 pagers: about a second, more on a shared runner

	it("bounds the depth between any two pages too", () => {
		for (const pages of [9, 10, 57, 100, 219, 1000]) {
			const links = linksOf(pages);
			for (let from = 1; from <= pages; from++) {
				const depth = maxDepth(from, pages, links);
				if (depth > pagerDepthBound(pages)) {
					throw new Error(`${pages} pages: ${depth} clicks from page ${from}`);
				}
			}
		}
	});

	it("puts every one of the 219 pages of the Paris generalists within 3 clicks of the first", () => {
		// The last one was 218 clicks away with previous and next links only.
		const paris = depths(1, 219);
		expect(paris[219 - 1]).toBe(1);
		expect(paris[187 - 1]).toBe(3); // 1 → 100 → 180 → 187
		expect(Math.max(...paris)).toBe(3);
		expect(pagerDepthBound(999)).toBe(3);
	});
});
