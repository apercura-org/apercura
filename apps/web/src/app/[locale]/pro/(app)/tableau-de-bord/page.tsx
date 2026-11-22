import { formatPersonName } from "@apercura/core";
import { Badge, buttonStyles, EmptyState, linkStyles, tableStyles } from "@apercura/ui";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { ProShell } from "~/components/pro/pro-shell";
import { ProShellFallback } from "~/components/pro/pro-shell-fallback";
import { Link } from "~/i18n/navigation";
import type { Locale } from "~/i18n/routing";
import { getTaxonomyLabels } from "~/lib/labels";
import { NO_INDEX, resolveLocale } from "~/lib/locale";
import { PRO_ROUTES } from "~/lib/pro-routes";
import { ORGANIZATION_ROLES, type OrganizationRole } from "~/server/auth/access";
import { requireProAccess } from "~/server/auth/guard";
import { caller } from "~/trpc/server";

// Personal, per-request pages: they read the session and may redirect, so they
// are never part of an instant (prefetched) navigation.
export const instant = false;

type Props = PageProps<"/[locale]/pro/tableau-de-bord">;

const table = tableStyles();

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const locale = resolveLocale((await params).locale);
	const t = await getTranslations({ locale, namespace: "auth.metadata" });
	return { title: t("home"), robots: NO_INDEX };
}

const isRole = (value: string): value is OrganizationRole =>
	(ORGANIZATION_ROLES as string[]).includes(value);

async function Home({ locale }: { locale: Locale }) {
	const access = await requireProAccess(locale, ["ready"]);
	const t = await getTranslations({ locale, namespace: "auth.app" });
	const tRoles = await getTranslations({ locale, namespace: "auth.roles" });
	const tClaim = await getTranslations({ locale, namespace: "Claim" });
	const labels = await getTaxonomyLabels(locale);
	const memberships = await caller.account.memberships();
	const invitations = await caller.team.mine();
	const claims = await caller.claims.mine();
	const liveClaims = claims.filter(
		(claim) => claim.status === "open" || claim.status === "in_review",
	);
	const ownedPage = claims.find((claim) => claim.status === "verified" && claim.ownerOrgId);

	return (
		<ProShell
			locale={locale}
			current={PRO_ROUTES.home}
			title={t("title")}
			lead={t("lead", { email: access.session.user.email })}
		>
			<section aria-labelledby="home-practices" className="flex flex-col gap-5">
				<h2
					id="home-practices"
					className="font-display text-title font-bold text-ink font-stretch-semi-expanded"
				>
					{t("practicesHeading")}
				</h2>
				{memberships.length > 0 ? (
					<table className={table.table()} aria-labelledby="home-practices">
						<thead className={table.head()}>
							<tr>
								<th scope="col" className={table.column()}>
									{t("columns.practice")}
								</th>
								<th scope="col" className={table.column()}>
									{t("columns.role")}
								</th>
							</tr>
						</thead>
						<tbody>
							{memberships.map((item) => (
								<tr key={item.organizationId} className={table.row()}>
									<td className={table.cell()}>{item.name}</td>
									<td className={table.cell()}>
										{item.role
											.split(",")
											.map((role) => role.trim())
											.filter(isRole)
											.map((role) => tRoles(role))
											.join(", ")}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				) : (
					<EmptyState
						title={t("emptyTitle")}
						description={t("emptyBody")}
						action={
							<Link href="/pro" className={buttonStyles({ intent: "ink" })}>
								{t("emptyAction")}
							</Link>
						}
					/>
				)}
			</section>
			{ownedPage || liveClaims.length > 0 ? (
				<section aria-labelledby="home-claims" className="flex flex-col gap-5">
					<h2
						id="home-claims"
						className="font-display text-title font-bold text-ink font-stretch-semi-expanded"
					>
						{t("claimsHeading")}
					</h2>
					<table className={table.table()} aria-labelledby="home-claims">
						<thead className={table.head()}>
							<tr>
								<th scope="col" className={table.column()}>
									{t("columns.page")}
								</th>
								<th scope="col" className={table.column()}>
									{t("columns.status")}
								</th>
								<th scope="col" className={table.column()}>
									<span className="sr-only">{t("columns.next")}</span>
								</th>
							</tr>
						</thead>
						<tbody>
							{[...(ownedPage ? [ownedPage] : []), ...liveClaims].map((claim) => (
								<tr key={claim.id} className={table.row()}>
									<td className={table.cell()}>
										{labels.personName({
											...claim,
											lastName: formatPersonName(claim.lastName, { familyName: true }),
										})}
										<span className="block text-meta text-ink-muted tabular">
											{claim.nationalId}
										</span>
									</td>
									<td className={table.cell()}>
										<Badge tone={claim.status === "verified" ? "stamp" : "ink"}>
											{tClaim(`check.claim.${claim.status as "open" | "in_review" | "verified"}`)}
										</Badge>
									</td>
									<td className={table.cell({ className: "text-right" })}>
										{claim.status === "verified" ? (
											<Link href={PRO_ROUTES.pageEditor} className={linkStyles()}>
												{t("editPage")}
											</Link>
										) : (
											<Link
												href={{ pathname: "/pro/revendiquer/[id]", params: { id: claim.id } }}
												className={linkStyles()}
											>
												{t("openClaim")}
											</Link>
										)}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</section>
			) : null}
			{invitations.length > 0 ? (
				<section aria-labelledby="home-invitations" className="flex max-w-[65ch] flex-col gap-3">
					<h2
						id="home-invitations"
						className="font-display text-title font-bold text-ink font-stretch-semi-expanded"
					>
						{t("invitationsHeading")}
					</h2>
					<ul className="flex flex-col gap-2">
						{invitations.map((invitation) => (
							<li key={invitation.id} className="flex flex-col gap-1">
								<span className="text-body text-ink">
									{t("invitationBody", { practice: invitation.practiceName })}
								</span>
								<Link
									href={{ pathname: "/pro/invitation/[id]", params: { id: invitation.id } }}
									className={linkStyles()}
								>
									{t("invitationLink")}
								</Link>
							</li>
						))}
					</ul>
				</section>
			) : null}
			{memberships.length > 0 ? (
				<section aria-labelledby="home-agenda" className="flex max-w-[65ch] flex-col gap-3">
					<h2
						id="home-agenda"
						className="font-display text-title font-bold text-ink font-stretch-semi-expanded"
					>
						{t("agendaHeading")}
					</h2>
					<p className="text-body text-ink">{t("agendaBody")}</p>
					<p>
						<Link href={PRO_ROUTES.today} className={linkStyles()}>
							{t("agendaLink")}
						</Link>
					</p>
				</section>
			) : null}
			<section aria-labelledby="home-security" className="flex max-w-[65ch] flex-col gap-3">
				<h2
					id="home-security"
					className="font-display text-title font-bold text-ink font-stretch-semi-expanded"
				>
					{t("securityHeading")}
				</h2>
				<p className="text-body text-ink">{t("securityBody")}</p>
				<p>
					<Link href={PRO_ROUTES.security} className={linkStyles()}>
						{t("securityLink")}
					</Link>
				</p>
			</section>
		</ProShell>
	);
}

export default async function ProHomePage({ params }: Props) {
	const locale = resolveLocale((await params).locale);
	setRequestLocale(locale);
	return (
		<Suspense fallback={<ProShellFallback locale={locale} />}>
			<Home locale={locale} />
		</Suspense>
	);
}
