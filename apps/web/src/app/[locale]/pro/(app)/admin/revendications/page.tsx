import { formatPersonName } from "@apercura/core";
import { Badge, EmptyState, FieldList, FieldRow, linkStyles, tableStyles } from "@apercura/ui";
import type { Metadata } from "next";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { ProShell } from "~/components/pro/pro-shell";
import { ProShellFallback } from "~/components/pro/pro-shell-fallback";
import { Link } from "~/i18n/navigation";
import type { Locale } from "~/i18n/routing";
import { getTaxonomyLabels } from "~/lib/labels";
import { NO_INDEX, resolveLocale } from "~/lib/locale";
import { displayId } from "~/lib/practitioner-key";
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
	const tP = await getTranslations({ locale, namespace: "Practitioner" });
	const empty = tP("notProvided");
	const queue = await caller.admin.claims.queue();
	const rows = queue.map((claim) => ({
		id: claim.id,
		href: { pathname: "/pro/admin/revendications/[id]", params: { id: claim.id } } as const,
		name: labels.personName({
			...claim,
			lastName: formatPersonName(claim.lastName, { familyName: true }),
		}),
		// An RPPS in France; the list and its key elsewhere (`Vienna list w7983`).
		rpps:
			claim.idScheme === "RPPS"
				? claim.nationalId
				: `${tClaim(`identifiers.${claim.idScheme as "AT-WIEN"}`)} ${displayId(claim)}`,
		email: claim.email,
		contest: claim.contest,
		proofs: METHODS.filter((method) => claim.methods?.[method]).map((method) =>
			t("claims.proofLine", {
				method: tClaim(`methods.${method}.short`),
				status: tClaim(`check.${claim.methods?.[method] as "pending" | "passed" | "failed"}`),
			}),
		),
		submitted: claim.submittedAt
			? format.dateTime(new Date(claim.submittedAt), { dateStyle: "medium", timeStyle: "short" })
			: null,
	}));
	return (
		<ProShell
			locale={locale}
			current={PRO_ROUTES.adminClaims}
			title={t("claims.title")}
			lead={t("claims.lead")}
		>
			<section aria-labelledby="admin-queue" className="flex flex-col gap-5">
				<h2 id="admin-queue" className="type-title text-ink">
					{queue.length > 0
						? t("claims.queueHeading", { count: queue.length })
						: t("claims.queueEmpty")}
				</h2>
				{queue.length === 0 ? (
					<EmptyState title={t("claims.emptyTitle")} description={t("claims.emptyBody")} />
				) : (
					<>
						{/* Below 768 px each claim is a short form of field rows. */}
						<ul className="flex flex-col gap-8 md:hidden">
							{rows.map((row) => (
								<li key={row.id} className="flex flex-col gap-2">
									<p className="flex flex-wrap items-center gap-x-3 gap-y-1">
										<Link href={row.href} className={`${linkStyles()} type-subtitle`}>
											{row.name}
										</Link>
										{row.contest ? <Badge tone="error">{t("claims.contest")}</Badge> : null}
									</p>
									<FieldList>
										<FieldRow
											label={t("claims.identifier")}
											value={<span className="tabular">{row.rpps}</span>}
											emptyLabel={empty}
										/>
										<FieldRow
											label={t("claims.columns.claimant")}
											value={<BreakableEmail email={row.email} />}
											emptyLabel={empty}
										/>
										<FieldRow
											label={t("claims.columns.proofs")}
											value={
												row.proofs.length > 0 ? (
													<span className="flex flex-col gap-0.5 @md:items-end">
														{row.proofs.map((proof) => (
															<span key={proof}>{proof}</span>
														))}
													</span>
												) : null
											}
											emptyLabel={empty}
										/>
										<FieldRow
											label={t("claims.columns.submitted")}
											value={
												row.submitted ? <span className="tabular">{row.submitted}</span> : null
											}
											emptyLabel={empty}
										/>
									</FieldList>
								</li>
							))}
						</ul>
						<div className="hidden md:block">
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
									{rows.map((row) => (
										<tr key={row.id} className={table.row()}>
											<td className={table.cell()}>
												<Link href={row.href} className={`${linkStyles()} font-semibold`}>
													{row.name}
												</Link>
												<span className="block text-meta text-ink-muted tabular">{row.rpps}</span>
												{row.contest ? (
													<span className="mt-1 block">
														<Badge tone="error">{t("claims.contest")}</Badge>
													</span>
												) : null}
											</td>
											<td className={table.cell({ className: "text-meta" })}>
												<BreakableEmail email={row.email} />
											</td>
											<td className={table.cell()}>
												<ul className="flex flex-col gap-1 text-meta">
													{row.proofs.map((proof) => (
														<li key={proof}>{proof}</li>
													))}
												</ul>
											</td>
											<td className={table.cell({ className: "tabular text-meta" })}>
												{row.submitted ?? "—"}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</>
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

/** An email address that wraps only after its "@" and its dots, never inside a word. */
function BreakableEmail({ email }: { email: string }) {
	const parts = email.split(/(?<=[@.])/);
	return (
		<span>
			{parts.map((part, index) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: fixed split of one string
				<span key={index}>
					{part}
					{index < parts.length - 1 ? <wbr /> : null}
				</span>
			))}
		</span>
	);
}
