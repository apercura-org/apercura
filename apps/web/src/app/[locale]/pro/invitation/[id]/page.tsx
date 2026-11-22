import { buttonStyles, EmptyState } from "@apercura/ui";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { InvitationAnswer } from "~/components/pro/invitation-answer";
import { ProShell } from "~/components/pro/pro-shell";
import { ProShellFallback } from "~/components/pro/pro-shell-fallback";
import { Link } from "~/i18n/navigation";
import type { Locale } from "~/i18n/routing";
import { NO_INDEX, resolveLocale } from "~/lib/locale";
import { PRO_ROUTES } from "~/lib/pro-routes";
import { requireProAccess } from "~/server/auth/guard";
import { caller } from "~/trpc/server";

export const instant = false;

type Props = PageProps<"/[locale]/pro/invitation/[id]">;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const locale = resolveLocale((await params).locale);
	const t = await getTranslations({ locale, namespace: "Invitation" });
	return { title: t("metaTitle"), robots: NO_INDEX };
}

/**
 * Where an invitation email leads. Signed out, the visitor signs in or creates their account
 * first; without a second factor, they set one up; then they come back here and join.
 */
async function Invitation({ locale, id }: { locale: Locale; id: string }) {
	const access = await requireProAccess(locale, ["ready"], {
		pathname: "/pro/invitation/[id]",
		params: { id },
	});
	const t = await getTranslations({ locale, namespace: "Invitation" });
	const tRoles = await getTranslations({ locale, namespace: "auth.roles" });
	const tCommon = await getTranslations({ locale, namespace: "Agenda.common" });
	const format = await getFormatter({ locale });
	const invitation = await caller.team.invitation({ invitationId: id });
	const back = (
		<Link href={PRO_ROUTES.home} className={buttonStyles({ intent: "ink" })}>
			{tCommon("noPractice.action")}
		</Link>
	);
	let body: React.ReactNode;
	switch (invitation.state) {
		case "open":
			body = (
				<div className="flex max-w-[65ch] flex-col gap-4">
					<p className="text-lead text-ink">
						{t("open.lead", {
							inviter: invitation.inviterName,
							practice: invitation.practiceName,
							role: tRoles(invitation.role),
						})}
					</p>
					{invitation.practitioner ? (
						<p className="text-body text-ink">
							{t("open.practitioner", { name: invitation.practitioner })}
						</p>
					) : null}
					<p className="text-meta text-ink-muted">
						{t("open.expires", {
							date: format.dateTime(invitation.expiresAt, {
								dateStyle: "long",
								timeStyle: "short",
							}),
						})}
					</p>
					<InvitationAnswer invitationId={id} />
				</div>
			);
			break;
		case "accepted":
			body = (
				<EmptyState
					title={t("accepted.title")}
					description={t("accepted.body", { practice: invitation.practiceName })}
					action={
						<Link href={PRO_ROUTES.today} className={buttonStyles({ intent: "stamp" })}>
							{t("accepted.action")}
						</Link>
					}
				/>
			);
			break;
		case "other_address":
			body = (
				<EmptyState
					title={t("other_address.title")}
					description={t("other_address.body", { email: access.session.user.email })}
				/>
			);
			break;
		case "expired":
			body = (
				<EmptyState
					title={t("expired.title")}
					description={t("expired.body", { inviter: invitation.inviterName })}
				/>
			);
			break;
		case "closed":
			body = <EmptyState title={t("closed.title")} description={t("closed.body")} action={back} />;
			break;
		default:
			body = <EmptyState title={t("not_found.title")} description={t("not_found.body")} />;
	}
	return (
		<ProShell locale={locale} current={PRO_ROUTES.home} title={t("title")}>
			{body}
		</ProShell>
	);
}

export default async function InvitationPage({ params }: Props) {
	const { locale: raw, id } = await params;
	const locale = resolveLocale(raw);
	setRequestLocale(locale);
	if (!UUID.test(id)) notFound();
	return (
		<Suspense fallback={<ProShellFallback locale={locale} />}>
			<Invitation locale={locale} id={id} />
		</Suspense>
	);
}
