import { formatPersonName } from "@apercura/core";
import { Badge, FieldList, FieldRow, linkStyles, Notice } from "@apercura/ui";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { z } from "zod";
import { ClaimDecision, PhoneCallback } from "~/components/pro/admin-claim-actions";
import { ProShell } from "~/components/pro/pro-shell";
import { ProShellFallback } from "~/components/pro/pro-shell-fallback";
import { MARKET_LOCALES, marketOf } from "~/i18n/locales";
import { Link } from "~/i18n/navigation";
import type { Locale } from "~/i18n/routing";
import { getTaxonomyLabels } from "~/lib/labels";
import { NO_INDEX, resolveLocale } from "~/lib/locale";
import { practitionerRefOf } from "~/lib/practitioner-ref";
import { PRO_ROUTES } from "~/lib/pro-routes";
import { requirePlatformAdminPage } from "~/server/auth/admin-guard";
import { caller } from "~/trpc/server";

export const instant = false;

type Props = PageProps<"/[locale]/pro/admin/revendications/[id]">;

const sectionHeading = "type-title text-ink";
const METHODS = ["psc", "registry_email", "document", "phone_callback"] as const;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const locale = resolveLocale((await params).locale);
	const t = await getTranslations({ locale, namespace: "Admin" });
	return { title: t("claim.metaTitle"), robots: NO_INDEX };
}

async function Detail({ locale, id }: { locale: Locale; id: string }) {
	await requirePlatformAdminPage(locale);
	if (!z.uuid().safeParse(id).success) notFound();
	const t = await getTranslations({ locale, namespace: "Admin" });
	const tClaim = await getTranslations({ locale, namespace: "Claim" });
	const tP = await getTranslations({ locale, namespace: "Practitioner" });
	const format = await getFormatter({ locale });
	const labels = await getTaxonomyLabels(locale);
	const detail = await caller.admin.claims.detail({ id }).catch(() => null);
	if (!detail) notFound();
	const { claim, practitioner, summary } = detail;
	const name = labels.personName({
		...practitioner,
		lastName: formatPersonName(practitioner.lastName, { familyName: true }),
	});
	const live = claim.status === "open" || claim.status === "in_review";
	const empty = tP("notProvided");
	const date = (value: Date | null) =>
		value ? format.dateTime(new Date(value), { dateStyle: "medium", timeStyle: "short" }) : null;

	return (
		<ProShell locale={locale} current={PRO_ROUTES.adminClaims} title={t("claim.title", { name })}>
			<p>
				<Link href={PRO_ROUTES.adminClaims} className={linkStyles()}>
					{t("claim.back")}
				</Link>
			</p>
			{claim.contest ? (
				<Notice tone="error" title={t("claim.contestTitle")}>
					{detail.incumbent?.viaPsc ? t("claim.contestPsc") : t("claim.contestBody")}
				</Notice>
			) : null}

			<section aria-labelledby="admin-claim-summary" className="flex flex-col gap-4">
				<h2 id="admin-claim-summary" className={sectionHeading}>
					{t("claim.summary")}
				</h2>
				<FieldList>
					<FieldRow
						label={t("claim.fields.status")}
						value={tClaim(`check.claim.${claim.status as "open"}`)}
						emptyLabel={empty}
					/>
					<FieldRow
						label={
							practitioner.idScheme === "RPPS"
								? tP("rpps")
								: tClaim(`identifiers.${practitioner.idScheme as "AT-WIEN"}`)
						}
						value={
							<Link
								href={{ pathname: "/praticien/[slug]", params: { slug: practitioner.slug } }}
								// The page lives in its market's language (`/at/arzt/…` for Austria).
								locale={
									marketOf(locale) === practitioner.country
										? locale
										: MARKET_LOCALES[practitioner.country as keyof typeof MARKET_LOCALES]
								}
								className={`${linkStyles()} tabular`}
							>
								{practitionerRefOf(practitioner)}
							</Link>
						}
						emptyLabel={empty}
					/>
					<FieldRow
						label={t("claim.fields.claimant")}
						value={detail.claimant?.email}
						emptyLabel={empty}
					/>
					<FieldRow
						label={t("claim.fields.accountCreated")}
						value={date(detail.claimant?.createdAt ?? null)}
						emptyLabel={empty}
					/>
					<FieldRow
						label={t("claim.fields.opened")}
						value={date(claim.createdAt)}
						emptyLabel={empty}
					/>
					<FieldRow
						label={t("claim.fields.submitted")}
						value={date(claim.submittedAt)}
						emptyLabel={empty}
					/>
				</FieldList>
			</section>

			<section aria-labelledby="admin-claim-proofs" className="flex flex-col gap-4">
				<h2 id="admin-claim-proofs" className={sectionHeading}>
					{t("claim.proofs")}
				</h2>
				<FieldList>
					{METHODS.filter((method) => detail.methods.includes(method) || summary[method]).map(
						(method) => (
							<FieldRow
								key={method}
								label={tClaim(`methods.${method}.short`)}
								value={
									summary[method] ? (
										<Badge
											tone={
												summary[method] === "passed"
													? "stamp"
													: summary[method] === "failed"
														? "error"
														: "ink"
											}
										>
											{tClaim(`check.${summary[method]}`)}
										</Badge>
									) : null
								}
								emptyLabel={tClaim("check.notStarted")}
							/>
						),
					)}
				</FieldList>
			</section>

			<section aria-labelledby="admin-claim-documents" className="flex flex-col gap-4">
				<h2 id="admin-claim-documents" className={sectionHeading}>
					{t("claim.documents")}
				</h2>
				{detail.documents.length === 0 ? (
					<p className="text-body text-ink-muted">{t("claim.noDocument")}</p>
				) : (
					<ul className="flex flex-col border-t border-rule-soft">
						{detail.documents.map((document) => (
							<li
								key={document.id}
								className="flex flex-wrap items-baseline justify-between gap-3 border-b border-rule-soft py-3"
							>
								<span className="text-body text-ink">
									{tClaim(`documents.kind.${document.kind as "cps_card"}`)}
									<span className="block text-meta text-ink-muted tabular">
										{date(document.createdAt)} · {document.contentType}
									</span>
								</span>
								{document.purgedAt ? (
									<Badge>{t("claim.purged")}</Badge>
								) : (
									<a
										href={`/api/admin/claim-documents/${document.id}`}
										target="_blank"
										rel="noopener noreferrer"
										className={`${linkStyles()} inline-flex min-h-11 items-center font-semibold`}
									>
										{t("claim.openDocument")}
										<span className="sr-only"> ({t("claim.newTab")})</span>
									</a>
								)}
							</li>
						))}
					</ul>
				)}
				<p className="text-meta text-ink-muted">{t("claim.auditNote")}</p>
			</section>

			{live && detail.registryPhones.length > 0 ? (
				<section aria-labelledby="admin-claim-phone" className="grid gap-6 md:grid-cols-12">
					<div className="flex flex-col gap-2 md:col-span-5">
						<h2 id="admin-claim-phone" className={sectionHeading}>
							{t("claim.phoneTitle")}
						</h2>
						<p className="max-w-[60ch] text-body text-ink">{t("claim.phoneLead")}</p>
					</div>
					<div className="flex flex-col gap-4 md:col-span-7">
						{summary.phone_callback === "passed" ? (
							<Notice tone="success" title={t("claim.phoneDone")} role="status" />
						) : summary.phone_callback ? (
							<PhoneCallback
								claimId={claim.id}
								phones={detail.registryPhones.map((item) => ({
									phone: item.phone,
									site: item.site?.siteName ?? null,
								}))}
							/>
						) : (
							<p className="text-body text-ink-muted">{t("claim.noCode")}</p>
						)}
					</div>
				</section>
			) : null}

			{live ? (
				<section aria-labelledby="admin-claim-decision" className="grid gap-6 md:grid-cols-12">
					<div className="flex flex-col gap-2 md:col-span-5">
						<h2 id="admin-claim-decision" className={sectionHeading}>
							{t("claim.decisionTitle")}
						</h2>
						<p className="max-w-[60ch] text-body text-ink">{t("claim.decisionLead")}</p>
					</div>
					<div className="md:col-span-7">
						<ClaimDecision claimId={claim.id} approvable={detail.approvable} />
					</div>
				</section>
			) : (
				<Notice tone="info" title={tClaim(`check.claim.${claim.status as "open"}`)}>
					{claim.decisionReason ?? null}
				</Notice>
			)}
		</ProShell>
	);
}

export default async function AdminClaimPage({ params }: Props) {
	const { locale: requested, id } = await params;
	const locale = resolveLocale(requested);
	setRequestLocale(locale);
	return (
		<Suspense fallback={<ProShellFallback locale={locale} />}>
			<Detail locale={locale} id={id} />
		</Suspense>
	);
}
