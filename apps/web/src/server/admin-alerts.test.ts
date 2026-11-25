import { describe, expect, it } from "vitest";
import { adminAlertRecipient } from "./admin-alerts";

describe("admin alerts", () => {
	it("go to ADMIN_NOTIFY_EMAIL, else LEGAL_CONTACT_EMAIL, else nowhere", () => {
		expect(
			adminAlertRecipient({
				ADMIN_NOTIFY_EMAIL: "admins@apercura.example",
				LEGAL_CONTACT_EMAIL: "contact@apercura.example",
			}),
		).toBe("admins@apercura.example");
		expect(adminAlertRecipient({ LEGAL_CONTACT_EMAIL: " contact@apercura.example " })).toBe(
			"contact@apercura.example",
		);
		expect(adminAlertRecipient({ ADMIN_NOTIFY_EMAIL: " ", LEGAL_CONTACT_EMAIL: "" })).toBeNull();
		expect(adminAlertRecipient({})).toBeNull();
	});
});
