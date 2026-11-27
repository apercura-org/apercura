import type { ActivityPayload } from "~/server/queries/types";

/**
 * What a Slovenian doctor's page says about each of their practices, from the insurer's lists
 * (`etl:si`): the ZZZS activity of each row (`sectorCode`) and whether the doctor still takes
 * insured persons on there (`modeCode`: `accepting`, `closed`, or nothing when the list leaves
 * it blank), with the date of the list it comes from. Pure functions, no I/O.
 */

/** The key of a ZZZS activity in `PractitionerPage.slovenia.activity`. */
export const SI_ACTIVITY_KEYS: Readonly<Record<string, string>> = {
	"302001": "general",
	"302068": "trainee",
	"302070": "generalPlus",
	"327009": "children",
	"306007": "women",
	"404101": "dentalAdults",
	"404103": "dentalYouth",
	"404105": "dentalStudents",
};

export type SlovenianActivity = {
	/** `PractitionerPage.slovenia.activity`'s key (`general`, `dentalYouth`…). */
	kind: string;
	acceptance: "accepting" | "closed" | null;
	/** The date of the list's data (`YYYY-MM-DD`), when the last import recorded it. */
	asOf: string | null;
};

/**
 * The activities of one practice of a Slovenian page, in the read model's order, each once:
 * `dates` holds each list's data date by source (`directory.etl_runs.files`).
 */
export function slovenianActivitiesAt(
	activities: readonly (Pick<ActivityPayload, "source" | "modeCode" | "sectorCode"> & {
		site: { id: number } | null;
	})[],
	siteId: number,
	dates: Readonly<Record<string, string>>,
): SlovenianActivity[] {
	const seen = new Set<string>();
	const result: SlovenianActivity[] = [];
	for (const activity of activities) {
		if (activity.site?.id !== siteId) continue;
		const kind = SI_ACTIVITY_KEYS[activity.sectorCode ?? ""] ?? "other";
		const acceptance =
			activity.modeCode === "accepting" || activity.modeCode === "closed"
				? activity.modeCode
				: null;
		const key = `${kind}:${acceptance}`;
		if (seen.has(key)) continue;
		seen.add(key);
		result.push({
			kind,
			acceptance,
			asOf: activity.source ? (dates[activity.source] ?? null) : null,
		});
	}
	return result;
}
