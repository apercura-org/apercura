import "server-only";
import { serverEnv } from "~/env";

/** Reads a boolean flag defensively: builds that skip env validation keep raw strings. */
function flag(value: unknown, fallback: boolean): boolean {
	if (value === undefined || value === null || value === "") return fallback;
	return value === true || value === "true" || value === "1";
}

/** Pro Santé Connect is offered only when its three variables are set. */
export function pscConfigured(): boolean {
	return Boolean(serverEnv.PSC_ISSUER && serverEnv.PSC_CLIENT_ID && serverEnv.PSC_CLIENT_SECRET);
}

/** Claims by document and registry phone callback (FEATURE_CLAIM_DOCUMENTS, on by default). */
export function claimDocumentsEnabled(): boolean {
	return flag(serverEnv.FEATURE_CLAIM_DOCUMENTS, true);
}
