import "server-only";
import { invitationUrl } from "~/server/booking/format";
import { sendNotice } from "~/server/mail/notices";

/**
 * The invitation email: who invites, to which practice, in which role, and the link. No
 * patient data; the link only works for an account with this address and a second factor.
 */
export async function sendInvitationEmail(options: {
	to: string;
	locale: "fr" | "en";
	invitationId: string;
	practiceName: string;
	inviterName: string;
	roleLabel: string;
}) {
	await sendNotice({
		to: options.to,
		locale: options.locale,
		kind: "teamInvitation",
		values: {
			practice: options.practiceName,
			inviter: options.inviterName,
			role: options.roleLabel,
		},
		actionUrl: invitationUrl(options.locale, options.invitationId),
	});
}
