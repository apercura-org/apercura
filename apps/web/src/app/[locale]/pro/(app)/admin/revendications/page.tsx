import { formatPersonName } from "@apercura/core";
import { Badge, EmptyState, linkStyles, tableStyles } from "@apercura/ui";
import type { Metadata } from "next";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { ProShell } from "~/components/pro/pro-shell";
import { ProShellFallback } from "~/components/pro/pro-shell-fallback";
import { Link } from "~/i18n/navigation";
import type { Locale } from "~/i18n/routing";
import { getTaxonomyLabels } from "~/lib/labels";
import { NO_INDEX, resolveLocale } from "~/lib/locale";
import { PRO_ROUTES } from "~/lib/pro-routes";
import { requirePlatformAdminPage } from "~/server/auth/admin-guard";
import { caller } from "~/trpc/server";

export const instant = false;

type Props = PageProps<"/[locale]/pro/admin/revendications">;

const table = tableStyles();
const METHODS = ["psc", "registry_email", "document", "phone_callback"] as const;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const locale = resolveLocale((await params).locale);
	const t = await getTranslations({ locale, namespace: "Admin" });
	return { title: t("claims.metaTitle"), robots: NO_INDEX };
}

async function Queue({ locale }: { locale: Locale }) {
	await requirePlatformAdminPage(locale);
	const t = await getTranslations({ locale, namespace: "Admin" });
	const tClaim = await getTranslations({ locale, namespace: "Claim" });
	const format = await getFormatter({ locale });
	const labels = await getTaxonomyLabels(locale);
	const queue = await caller.admin.claims.queue();
	return (
		<ProShell
			locale={locale}
			current={PRO_ROUTES.adminClaims}
			title={t("claims.title")}
			lead={t("claims.lead")}
		>
			<section aria-labelledby="admin-queue" className="flex flex-col gap-5">
				<h2
					id="admin-queue"
					className="font-display text-title font-bold text-ink font-stretch-semi-expanded"
				>
					{t("claims.queueHeading", { count: queue.length })}
				</h2>
				{queue.length === 0 ? (
					<EmptyState title={t("claims.emptyTitle")} description={t("claims.emptyBody")} />
				) : (
					<div className="overflow-x-auto">
						<table className={table.table()} aria-labelledby="admin-queue">
							<thead className={table.head()}>
								<tr>
									<th scope="col" className={table.column()}>
										{t("claims.columns.practitioner")}
									</th>
									<th scope="col" className={table.column()}>
										{t("claims.columns.claimant")}
									</th>
									<th scope="col" className={table.column()}>
										{t("claims.columns.proofs")}
									</th>
									<th scope="col" className={table.column()}>
										{t("claims.columns.submitted")}
									</th>
								</tr>
							</thead>
							<tbody>
								{queue.map((claim) => (
									<tr key={claim.id} className={table.row()}>
										<td className={table.cell()}>
											<Link
												href={{
													pathname: "/pro/admin/revendications/[id]",
													params: { id: claim.id },
												}}
												className={`${linkStyles()} font-semibold`}
											>
												{labels.personName({
													...claim,
													lastName: formatPersonName(claim.lastName, { familyName: true }),
												})}
											</Link>
											<span className="block text-meta text-ink-muted tabular">
												{claim.nationalId}
											</span>
											{claim.contest ? (
												<span className="mt-1 block">
													<Badge tone="error">{t("claims.contest")}</Badge>
												</span>
											) : null}
										</td>
										<td className={table.cell({ className: "break-all text-meta" })}>
											{claim.email}
										</td>
										<td className={table.cell()}>
											<ul className="flex flex-col gap-1 text-meta">
												{METHODS.filter((method) => claim.methods?.[method]).map((method) => (
													<li key={method}>
														{t("claims.proofLine", {
															method: tClaim(`methods.${method}.short`),
															status: tClaim(
																`check.${claim.methods?.[method] as "pending" | "passed" | "failed"}`,
															),
														})}
													</li>
												))}
											</ul>
										</td>
										<td className={table.cell({ className: "tabular text-meta" })}>
											{claim.submittedAt
												? format.dateTime(new Date(claim.submittedAt), {
														dateStyle: "medium",
														timeStyle: "short",
													})
												: "—"}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</section>
		</ProShell>
	);
}

export default async function AdminClaimsPage({ params }: Props) {
	const locale = resolveLocale((await params).locale);
	setRequestLocale(locale);
	return (
		<Suspense fallback={<ProShellFallback locale={locale} />}>
			<Queue locale={locale} />
		</Suspense>
	);
}
