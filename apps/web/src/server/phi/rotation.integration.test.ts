/**
 * Master key rotation against a real, migrated database (DATABASE_URL_TEST),
 * as docs/self-hosting.md describes it: add a new key and make it active, data
 * encrypted under the old one still opens (its data keys unwrap with the old
 * key), `jobs:tick rotate-keys` moves everything to the new key, and then the
 * old key can leave ENCRYPTION_KEYS. Synthetic data only.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { decryptField, fieldAad, tokenKeyVersion } from "@apercura/core/crypto";
import { createDb, type Database } from "@apercura/db";
import { organization, organizationKeys, reports } from "@apercura/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isolatedDatabase } from "~/test/isolated-database";

const url = process.env.DATABASE_URL_TEST;

const oldKey = `old:${randomBytes(32).toString("base64")}`;
const newKey = `new:${randomBytes(32).toString("base64")}`;

function useKeys(keys: string, active: string) {
	process.env.ENCRYPTION_KEYS = keys;
	process.env.ENCRYPTION_ACTIVE_KEY = active;
}

describe.skipIf(!url)("master key rotation (database)", async () => {
	process.env.BLIND_INDEX_KEY ??= randomBytes(32).toString("base64");
	useKeys(oldKey, "old");
	const phi = await import("./index");
	const platform = await import("../crypto/platform");
	const { rotateKeys } = await import("../keys/rotation");
	const { memoryDriver } = await import("../storage");

	let db: Database;
	const run = randomUUID().slice(0, 8);
	const organizationId = `rotation-org-${run}`;
	const appointmentId = randomUUID();
	const reportId = randomUUID();
	const documentId = randomUUID();
	const storage = memoryDriver();

	// A database of its own: a rotation re-wraps every organization key, and the other
	// integration files, running alongside, leave keys wrapped by master keys only their
	// own process knows.
	const isolated = isolatedDatabase("rotation");

	beforeAll(async () => {
		db = createDb({ url: await isolated.create(), max: 2 });
		await db.insert(organization).values({
			id: organizationId,
			name: "Cabinet fictif de rotation",
			slug: organizationId,
		});
	});

	afterAll(async () => {
		if (db) {
			await db.delete(reports).where(eq(reports.id, reportId));
			await db.delete(organizationKeys).where(eq(organizationKeys.organizationId, organizationId));
			await db.delete(organization).where(eq(organization.id, organizationId));
			await db.close();
		}
		await isolated.drop();
	});

	async function openPatientField(token: string, field: "firstName" | "address" = "firstName") {
		const key = await phi.activeDataKey(db, organizationId);
		return decryptField(
			token,
			[key],
			fieldAad("appointments", phi.PATIENT_COLUMNS[field], appointmentId),
		);
	}
	const openPatientName = (token: string) => openPatientField(token);

	it("moves every key and platform ciphertext to the new master key, then works without the old one", async () => {
		// Before: patient data, a report and a claim document under the old key.
		await phi.ensureOrganizationKey(db, organizationId);
		const sealed = await phi.sealAppointment(db, organizationId, appointmentId, {
			firstName: "Camille",
			// A home visit's address is a patient field like the others (issue #75).
			address: "12 rue Fictive",
		});
		const patientToken = sealed.patientFirstNameEnc as string;
		const addressToken = sealed.patientAddressEnc as string;
		await db.insert(reports).values({
			id: reportId,
			kind: "wrong_info",
			contentEnc: platform.sealText(
				JSON.stringify({ message: "Adresse fictive erronée" }),
				"reports",
				"content_enc",
				reportId,
			),
		});
		const storageKey = `claims/${documentId}`;
		await storage.put(
			storageKey,
			platform.sealBytes(new Uint8Array([1, 2, 3]), "claim_documents", "object", documentId),
			"application/octet-stream",
		);

		// A new key becomes active; the old one is still listed, so everything still opens.
		useKeys(`${oldKey},${newKey}`, "new");
		expect(await openPatientName(patientToken)).toBe("Camille");

		const first = await rotateKeys(db, storage);
		expect(first.dataKeys.rewrapped).toBeGreaterThanOrEqual(1);
		expect(first.dataKeys.remaining).toBe(0);
		expect(first.texts).toBeGreaterThanOrEqual(1);
		const [wrapped] = await db
			.select({ wrappedDek: organizationKeys.wrappedDek })
			.from(organizationKeys)
			.where(eq(organizationKeys.organizationId, organizationId));
		expect(tokenKeyVersion(wrapped?.wrappedDek ?? "")).toBe("new");
		const [report] = await db
			.select({ contentEnc: reports.contentEnc })
			.from(reports)
			.where(eq(reports.id, reportId));
		expect(tokenKeyVersion(report?.contentEnc ?? "")).toBe("new");

		// A claim document blob under the old key is re-encrypted the same way.
		const resealed = platform.resealBytes(
			(await storage.get(storageKey))?.body ?? new Uint8Array(),
			"claim_documents",
			"object",
			documentId,
		);
		expect(resealed).not.toBeNull();

		// Idempotent.
		const second = await rotateKeys(db, null);
		expect(second.dataKeys.rewrapped).toBe(0);
		expect(second.texts).toBe(0);

		// The old key is gone: patient data and the report still open.
		useKeys(newKey, "new");
		expect(await openPatientName(patientToken)).toBe("Camille");
		expect(await openPatientField(addressToken, "address")).toBe("12 rue Fictive");
		expect(
			JSON.parse(platform.openText(report?.contentEnc ?? "", "reports", "content_enc", reportId)),
		).toEqual({ message: "Adresse fictive erronée" });
		expect(
			platform.openBytes(resealed as Uint8Array, "claim_documents", "object", documentId),
		).toEqual(Buffer.from([1, 2, 3]));
	});
});
