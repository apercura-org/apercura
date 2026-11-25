import { claimPolicyOf } from "@apercura/core";
import { Button, Input, Label, linkStyles, Notice, PractitionerHeader } from "@apercura/ui";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { ClaimStartButton } from "~/components/pro/claim-start";
import { ProShell } from "~/components/pro/pro-shell";
import { ProShellFallback } from "~/components/pro/pro-shell-fallback";
import { MARKET_LOCALES, marketOf } from "~/i18n/locales";
import { getPathname, Link } from "~/i18n/navigation";
import type { Locale } from "~/i18n/routing";
import { genderOf, getTaxonomyLabels } from "~/lib/labels";
import { NO_INDEX, resolveLocale } from "~/lib/locale";
import { displayId } from "~/lib/practitioner-key";
import { parsePractitionerRef, practitionerRefOf } from "~/lib/practitioner-ref";
import { PRO_ROUTES } from "~/lib/pro-routes";
import { requireProAccess } from "~/server/auth/guard";
import { claimDocumentsEnabled, pscConfigured } from "~/server/features";
import { getProContext } from "~/server/pro-context";
import { caller } from "~/trpc/server";

export const instant = false;

type Props = PageProps<"/[locale]/pro/revendiquer">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const locale = resolveLocale((await params).locale);
	const t = await getTranslations({ locale, namespace: "Claim.metadata" });
	return { title: t("start"), robots: NO_INDEX };
}

const sectionHeading = "type-title text-ink";

async function Start({ locale, rpps }: { locale: Locale; rpps: string | null }) {
	// Outside the `(app)` group on purpose: a visitor coming from "Claim this
	// page" signs in (or up) and comes back here for the same page. `rpps` is the
	// practitioner reference: an RPPS in France, `w7983` in Austria, `gb:a81001` or an ODS code
	// typed on a UK page (lib/practitioner-ref).
	const parsed = parsePractitionerRef(rpps, marketOf(locale));
	const valid = parsed !== null;
	const ref = parsed ? practitionerRefOf(parsed) : null;
	const access = await requireProAccess(
		locale,
		["ready"],
		ref ? { pathname: "/pro/revendiquer", query: { rpps: ref } } : null,
	);
	const t = await getTranslations({ locale, namespace: "Claim" });
	const tP = await getTranslations({ locale, namespace: "Practitioner" });
	const labels = await getTaxonomyLabels(locale);
	const practitioner = ref ? await caller.claims.preview({ ref }).catch(() => null) : null;
	// The practitioner's page lives in their market's own language (`/at/arzt/…` for Austria).
	const pageLocale = practitioner
		? marketOf(locale) === practitioner.country
			? locale
			: MARKET_LOCALES[practitioner.country as keyof typeof MARKET_LOCALES]
		: locale;
	// The methods of the practitioner's market, else of the page's.
	const policy = claimPolicyOf(practitioner?.country ?? marketOf(locale));
	// The owner of this page removes it from their editor; anyone else objects through the form.
	const ownsPage = practitioner
		? (await getProContext(access.session.user.id)).pages.some(
				(page) => page.practitionerId === practitioner.id,
			)
		: false;
	const methods = (["psc", "registry_email", "document"] as const).filter(
		(method) =>
			policy.methods.includes(method) &&
			(method !== "psc" || pscConfigured()) &&
			(method !== "document" || claimDocumentsEnabled()),
	);

	return (
		<ProShell
			locale={locale}
			current={PRO_ROUTES.claimStart}
			title={t("start.title")}
			lead={t("start.lead")}
		>
			{practitioner ? (
				<section aria-labelledby="claim-record" className="flex flex-col gap-6">
					<h2 id="claim-record" className={sectionHeading}>
						{t("start.recordHeading")}
					</h2>
					<PractitionerHeader
						headingLevel={3}
						name={labels.personName(practitioner)}
						profession={
							labels.occupation(practitioner.listingSlug, genderOf(practitioner.civilityCode)) ??
							t("start.unknownProfession")
						}
						rpps={displayId(practitioner)}
						rppsLabel={practitioner.country === "FR" ? tP("rpps") : t("start.identifierLabel")}
						status={practitioner.claimStatus === "claimed" ? "verified" : "unclaimed"}
						statusLabel={tP(
							`status.${practitioner.claimStatus === "claimed" ? "verified" : "unclaimed"}`,
						)}
					/>
					<p className="max-w-[65ch] text-body text-ink">
						<Link
							href={{ pathname: "/praticien/[slug]", params: { slug: practitioner.slug } }}
							locale={pageLocale}
							className={linkStyles()}
						>
							{t("start.viewPage")}
						</Link>
					</p>
					{practitioner.claimStatus === "claimed" ? (
						<Notice tone="info" title={t("start.contestTitle")} role="none">
							{t("start.contestBody")}
						</Notice>
					) : null}
					<ClaimStartButton reference={practitionerRefOf(practitioner)} />
					<div className="flex max-w-[65ch] flex-col gap-1 border-t border-rule-soft pt-4">
						{practitioner.claimStatus === "claimed" ? null : (
							<Link
								href={{
									pathname: "/praticien/[slug]/c-est-moi",
									params: { slug: practitioner.slug },
								}}
								locale={pageLocale}
								className={`${linkStyles()} inline-flex min-h-11 items-center text-body`}
							>
								{t("start.contactLink")}
							</Link>
						)}
						<Link
							href={
								ownsPage
									? { pathname: "/pro/page", hash: "editor-remove" }
									: {
											pathname: "/praticien/[slug]/retrait",
											params: { slug: practitioner.slug },
										}
							}
							locale={ownsPage ? locale : pageLocale}
							className={`${linkStyles({ tone: "muted" })} inline-flex min-h-11 items-center text-meta`}
						>
							{t("start.optOutLink")}
						</Link>
					</div>
				</section>
			) : (
				<section aria-labelledby="claim-find" className="flex max-w-2xl flex-col gap-5">
					<h2 id="claim-find" className={sectionHeading}>
						{t("start.findHeading")}
					</h2>
					{rpps !== null ? (
						<Notice tone="error" title={valid ? t("start.notFound") : t("errors.INVALID_RPPS")} />
					) : null}
					<form
						method="get"
						action={getPathname({ href: PRO_ROUTES.claimStart, locale })}
						className="flex flex-col gap-4"
					>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="claim-rpps">{t("start.rppsLabel")}</Label>
							<div className="flex min-h-12 w-full max-w-sm items-center rounded-field border border-field-edge bg-paper hover:border-ink has-[input:focus-visible]:outline-3 has-[input:focus-visible]:outline-solid has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-(--focus-ring)">
								<Input
									id="claim-rpps"
									name="rpps"
									inputMode={marketOf(locale) === "FR" ? "numeric" : "text"}
									autoComplete="off"
									pattern={marketOf(locale) === "FR" ? "\\d{11}" : undefined}
									maxLength={300}
									required
									defaultValue={rpps ?? ""}
									aria-describedby="claim-rpps-hint"
									className="tabular"
								/>
							</div>
							<p id="claim-rpps-hint" className="text-meta text-ink-muted">
								{t("start.rppsHint")}
							</p>
						</div>
						<div>
							<Button intent="stamp" type="submit">
								{t("start.find")}
							</Button>
						</div>
					</form>
					<p className="text-body text-ink">
						{t("start.searchHint")}{" "}
						<Link href="/pro" className={linkStyles()}>
							{t("start.searchLink")}
						</Link>
					</p>
				</section>
			)}

			<section aria-labelledby="claim-how" className="flex max-w-[65ch] flex-col gap-4">
				<h2 id="claim-how" className={sectionHeading}>
					{t("start.howHeading")}
				</h2>
				<ul className="flex flex-col gap-3 border-t border-rule-soft pt-4">
					{methods.map((method) => (
						<li key={method} className="flex flex-col gap-1 border-b border-rule-soft pb-3">
							<p className="type-subtitle text-ink">{t(`methods.${method}.title`)}</p>
							<p className="text-body text-ink">{t(`methods.${method}.summary`)}</p>
						</li>
					))}
				</ul>
				<p className="text-meta text-ink-muted">{t("start.factorNote")}</p>
			</section>
		</ProShell>
	);
}

export default async function ClaimStartPage({ params, searchParams }: Props) {
	const locale = resolveLocale((await params).locale);
	setRequestLocale(locale);
	return (
		<Suspense fallback={<ProShellFallback locale={locale} />}>
			<StartWithParams locale={locale} searchParams={searchParams} />
		</Suspense>
	);
}

async function StartWithParams({
	locale,
	searchParams,
}: {
	locale: Locale;
	searchParams: Props["searchParams"];
}) {
	// The page reference: an RPPS in France, a list key (`w7983`) in Austria, an ODS code or
	// `gb:` key in the UK.
	const value = (await searchParams).rpps;
	const rpps = typeof value === "string" ? value.trim() : null;
	return <Start locale={locale} rpps={rpps || null} />;
}
