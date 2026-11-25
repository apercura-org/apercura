import { isValidRpps } from "@apercura/core";
import { Button, Input, Label, linkStyles, Notice, PractitionerHeader } from "@apercura/ui";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { ClaimStartButton } from "~/components/pro/claim-start";
import { ProShell } from "~/components/pro/pro-shell";
import { ProShellFallback } from "~/components/pro/pro-shell-fallback";
import { getPathname, Link } from "~/i18n/navigation";
import type { Locale } from "~/i18n/routing";
import { genderOf, getTaxonomyLabels } from "~/lib/labels";
import { NO_INDEX, resolveLocale } from "~/lib/locale";
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
	// page" signs in (or up) and comes back here for the same RPPS.
	const valid = rpps !== null && isValidRpps(rpps);
	const access = await requireProAccess(
		locale,
		["ready"],
		valid ? { pathname: "/pro/revendiquer", query: { rpps } } : null,
	);
	const t = await getTranslations({ locale, namespace: "Claim" });
	const tP = await getTranslations({ locale, namespace: "Practitioner" });
	const labels = await getTaxonomyLabels(locale);
	const practitioner = valid ? await caller.claims.preview({ rpps }).catch(() => null) : null;
	// The owner of this page removes it from their editor; anyone else objects through the form.
	const ownsPage = practitioner
		? (await getProContext(access.session.user.id)).pages.some(
				(page) => page.practitionerId === practitioner.id,
			)
		: false;
	const methods = [
		...(pscConfigured() ? (["psc"] as const) : []),
		"registry_email" as const,
		...(claimDocumentsEnabled() ? (["document"] as const) : []),
	];

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
							labels.listing(practitioner.listingSlug, genderOf(practitioner.civilityCode)) ??
							t("start.unknownProfession")
						}
						rpps={practitioner.nationalId}
						rppsLabel={tP("rpps")}
						status={practitioner.claimStatus === "claimed" ? "verified" : "unclaimed"}
						statusLabel={tP(
							`status.${practitioner.claimStatus === "claimed" ? "verified" : "unclaimed"}`,
						)}
					/>
					<p className="max-w-[65ch] text-body text-ink">
						<Link
							href={{ pathname: "/praticien/[slug]", params: { slug: practitioner.slug } }}
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
					<ClaimStartButton rpps={practitioner.nationalId} />
					<div className="flex max-w-[65ch] flex-col gap-1 border-t border-rule-soft pt-4">
						{practitioner.claimStatus === "claimed" ? null : (
							<Link
								href={{
									pathname: "/praticien/[slug]/c-est-moi",
									params: { slug: practitioner.slug },
								}}
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
									inputMode="numeric"
									autoComplete="off"
									pattern="\d{11}"
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
	const value = (await searchParams).rpps;
	const rpps = typeof value === "string" ? value.replace(/\s+/g, "") : null;
	return <Start locale={locale} rpps={rpps || null} />;
}
