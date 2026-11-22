import { mailErrorSummary } from "~/server/mail/error-summary";
import "server-only";
import type { Database } from "@apercura/db";
import { user } from "@apercura/db/schema";
import { eq } from "drizzle-orm";
import { getPathname } from "~/i18n/navigation";
import { siteOrigin } from "~/lib/site-url";
import { emailLocale } from "../mail/auth-emails";
import { sendNotice } from "../mail/notices";
import { type Revalidate, refreshPractitioners } from "../refresh";
import type { ApprovalResult } from "./service";

export async function userContact(db: Database, userId: string) {
	const [row] = await db
		.select({ email: user.email, name: user.name, locale: user.locale })
		.from(user)
		.where(eq(user.id, userId))
		.limit(1);
	return row ?? null;
}

/** Absolute URL of a practitioner-space page in the recipient's locale. */
export function proUrl(href: Parameters<typeof getPathname>[0]["href"], locale: unknown) {
	return `${siteOrigin()}${getPathname({ href, locale: emailLocale(locale) })}`;
}

/** Mail failures never undo a decision: they are logged and the page says what happened. */
async function quietly(task: Promise<unknown>) {
	try {
		await task;
	} catch (error) {
		console.error(`Notice email failed: ${mailErrorSummary(error)}`);
	}
}

/**
 * After a claim is verified: rebuild the page (the verified stamp shows at
 * once), tell the new owner, and tell the account that lost a contest.
 */
export async function afterApproval(db: Database, result: ApprovalResult, revalidate?: Revalidate) {
	await refreshPractitioners(db.$client, [result.practitionerId], revalidate);
	const claimant = await userContact(db, result.claimantUserId);
	if (claimant) {
		await quietly(
			sendNotice({
				to: claimant.email,
				locale: claimant.locale,
				kind: "claimVerified",
				values: { name: claimant.name },
				actionUrl: proUrl("/pro/bienvenue", claimant.locale),
			}),
		);
	}
	if (result.supersededUserId) {
		const loser = await userContact(db, result.supersededUserId);
		if (loser) {
			await quietly(
				sendNotice({
					to: loser.email,
					locale: loser.locale,
					kind: "claimSuperseded",
					values: { name: loser.name },
				}),
			);
		}
	}
}

export async function notifyClaimReceived(db: Database, userId: string) {
	const contact = await userContact(db, userId);
	if (!contact) return;
	await quietly(
		sendNotice({
			to: contact.email,
			locale: contact.locale,
			kind: "claimReceived",
			values: { name: contact.name },
		}),
	);
}

export async function notifyClaimRejected(db: Database, userId: string, reason: string) {
	const contact = await userContact(db, userId);
	if (!contact) return;
	await quietly(
		sendNotice({
			to: contact.email,
			locale: contact.locale,
			kind: "claimRejected",
			values: { name: contact.name, reason },
		}),
	);
}

/** The registry email link: sent to the practice's own address, in the claimant's locale. */
export async function sendRegistryLink(options: {
	to: string[];
	token: string;
	locale: unknown;
	practitionerName: string;
}) {
	// The token travels in the fragment: never sent to a server, never in logs or referrers.
	const url = `${proUrl("/pro/revendication-email", options.locale)}#jeton=${encodeURIComponent(options.token)}`;
	for (const to of options.to) {
		await sendNotice({
			to,
			locale: options.locale,
			kind: "claimRegistryLink",
			values: { practitioner: options.practitionerName },
			actionUrl: url,
		});
	}
}
