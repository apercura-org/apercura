/** A `Date` Astryx hands over (local midnight) as an ISO day, `2026-11-27`. */
export function localDay(date: Date): string {
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
