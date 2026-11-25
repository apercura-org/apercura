import "server-only";
import { practitioners } from "@apercura/db/schema";
import { and, eq, type SQL } from "drizzle-orm";
import { z } from "zod";
import { type PractitionerRef, parsePractitionerRef } from "~/lib/practitioner-ref";

/**
 * The condition selecting the practitioner a reference designates (`19999990013`, `w7983`, or
 * an already parsed key), or null when it is not a valid reference: callers answer `NOT_FOUND`
 * without touching the database.
 */
export function practitionerWhere(ref: string | PractitionerRef): SQL | null {
	const key = typeof ref === "string" ? parsePractitionerRef(ref) : ref;
	if (!key) return null;
	return (
		and(
			eq(practitioners.country, key.country),
			eq(practitioners.idScheme, key.idScheme),
			eq(practitioners.nationalId, key.nationalId),
		) ?? null
	);
}

/**
 * A practitioner reference in a public form or a claim request: an RPPS in France, the list
 * letters and number in Austria, or a page address ending with one (`lib/practitioner-ref`).
 * Only bounded here: the services read it and answer their own codes (`INVALID_RPPS`,
 * `NOT_FOUND`) for one that designates no page.
 */
export const practitionerRefInput = z.string().trim().min(1).max(300);
