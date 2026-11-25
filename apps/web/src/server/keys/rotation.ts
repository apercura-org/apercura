import "server-only";
import type { Database } from "@apercura/db";
import {
	claimDocuments,
	practitionerContactRequests,
	removalRequests,
	reports,
} from "@apercura/db/schema";
import { eq, isNull } from "drizzle-orm";
import { resealBytes, resealText } from "../crypto/platform";
import { rewrapDataKeys } from "../phi";
import type { StorageDriver } from "../storage";

export interface RotationResult {
	/** Organization data keys re-wrapped by the active master key, and those left. */
	dataKeys: { rewrapped: number; remaining: number };
	/** Platform-key texts (reports, removal and contact requests) re-encrypted with the active key. */
	texts: number;
	/** Claim documents re-encrypted in object storage (null: no storage configured). */
	documents: number | null;
}

/**
 * Moves everything encrypted with an older master key to the active one
 * (`jobs:tick rotate-keys`), after ENCRYPTION_ACTIVE_KEY changed:
 *
 * 1. organization data keys are re-wrapped (patient data itself is encrypted
 *    with them and does not change);
 * 2. the platform-key texts of reports, removal requests and contact requests are re-encrypted;
 * 3. claim documents still held in object storage are re-encrypted.
 *
 * Idempotent: a second run finds nothing to do. Once `dataKeys.remaining` is 0
 * and the run touched nothing, the old master key can leave ENCRYPTION_KEYS.
 */
export async function rotateKeys(
	db: Database,
	storage: StorageDriver | null,
): Promise<RotationResult> {
	const dataKeys = await rewrapDataKeys(db);

	let texts = 0;
	for (const row of await db
		.select({ id: reports.id, contentEnc: reports.contentEnc })
		.from(reports)) {
		const content = resealText(row.contentEnc, "reports", "content_enc", row.id);
		if (!content) continue;
		await db.update(reports).set({ contentEnc: content }).where(eq(reports.id, row.id));
		texts += 1;
	}
	for (const row of await db
		.select({
			id: removalRequests.id,
			contactEnc: removalRequests.contactEnc,
			messageEnc: removalRequests.messageEnc,
		})
		.from(removalRequests)) {
		const contact = resealText(row.contactEnc, "removal_requests", "contact_enc", row.id);
		const message = row.messageEnc
			? resealText(row.messageEnc, "removal_requests", "message_enc", row.id)
			: null;
		if (!contact && !message) continue;
		await db
			.update(removalRequests)
			.set({
				...(contact ? { contactEnc: contact } : {}),
				...(message ? { messageEnc: message } : {}),
			})
			.where(eq(removalRequests.id, row.id));
		texts += 1;
	}
	for (const row of await db
		.select({
			id: practitionerContactRequests.id,
			contentEnc: practitionerContactRequests.contentEnc,
		})
		.from(practitionerContactRequests)) {
		const content = resealText(
			row.contentEnc,
			"practitioner_contact_requests",
			"content_enc",
			row.id,
		);
		if (!content) continue;
		// The status clock (`updated_at`, the retention's start) is kept as it was.
		await db
			.update(practitionerContactRequests)
			.set({ contentEnc: content })
			.where(eq(practitionerContactRequests.id, row.id));
		texts += 1;
	}

	let documents: number | null = null;
	if (storage) {
		documents = 0;
		for (const row of await db
			.select({ id: claimDocuments.id, storageKey: claimDocuments.storageKey })
			.from(claimDocuments)
			.where(isNull(claimDocuments.purgedAt))) {
			const object = await storage.get(row.storageKey);
			if (!object) continue;
			const sealed = resealBytes(object.body, "claim_documents", "object", row.id);
			if (!sealed) continue;
			await storage.put(row.storageKey, sealed, "application/octet-stream");
			documents += 1;
		}
	}
	return { dataKeys, texts, documents };
}
