import { formatPhoneFr } from "@apercura/core";
import { Badge, buttonStyles, EmptyState, FieldList, FieldRow, linkStyles } from "@apercura/ui";
import type { Metadata } from "next";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { ProShell } from "~/components/pro/pro-shell";
import { ProShellFallback } from "~/components/pro/pro-shell-fallback";
import { PublishButton } from "~/components/pro/publish-button";
import { Link } from "~/i18n/navigation";
import type { Locale } from "~/i18n/routing";
import { NO_INDEX, resolveLocale } from "~/lib/locale";
import { PRO_ROUTES } from "~/lib/pro-routes";
import { requireProAccess } from "~/server/auth/guard";
import { ownedPage } from "~/server/owned-page";

export const instant = false;

type Props = PageProps<"/[locale]/pro/bienvenue">;

const STEPS = ["check", "booking", "publish"] as const;
type Step = (typeof STEPS)[number];

const sectionHeading = "type-title text-ink";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const locale = resolveLocale((await params).locale);
	const t = await getTranslations({ locale, namespace: "Onboarding" });
	return { title: t("metaTitle"), robots: NO_INDEX };
}

async function Onboarding({ locale, step }: { locale: Locale; step: Step }) {
	const access = await requireProAccess(locale, ["ready"]);
	const t = await getTranslations({ locale, namespace: "Onboarding" });
	const tP = await getTranslations({ locale, namespace: "Practitioner" });
	const format = await getFormatter({ locale });
	const page = await ownedPage(access.session.user.id, locale);
	if (!page) {
		const tEditor = await getTranslations({ locale, namespace: "Editor" });
		return (
			<ProShell locale={locale} current={PRO_ROUTES.onboarding} title={t("title")}>
				<EmptyState
					title={tEditor("empty.title")}
					description={tEditor("empty.body")}
					action={
						<Link href={PRO_ROUTES.claimStart} className={buttonStyles({ intent: "ink" })}>
							{tEditor("empty.action")}
						</Link>
					}
				/>
			</ProShell>
		);
	}
	const { data, identity } = page;
	const index = STEPS.indexOf(step);
	const next = STEPS[index + 1];
	const empty = tP("notProvided");

	return (
		<ProShell
			locale={locale}
			current={PRO_ROUTES.onboarding}
			title={t("title")}
			lead={t("lead", { name: identity.name })}
		>
			<nav aria-label={t("stepsLabel")}>
				<ol className="grid border-y border-ink sm:grid-cols-3">
					{STEPS.map((item, position) => (
						<li
							key={item}
							// The current step sits on the quiet shade, underlined in ink like a selected tab.
							className={`flex items-baseline gap-3 border-b border-rule-soft px-3 py-3 last:border-b-0 sm:border-b-0 sm:border-e sm:last:border-e-0 ${
								item === step ? "bg-paper-shade text-ink" : "text-ink-muted"
							}`}
						>
							<span className="font-body text-title font-medium tabular" aria-hidden="true">
								{position + 1}
							</span>
							<Link
								href={{ pathname: "/pro/bienvenue", query: { etape: String(position + 1) } }}
								aria-current={item === step ? "step" : undefined}
								className={`${linkStyles()} text-body aria-[current=step]:font-semibold aria-[current=step]:decoration-2`}
							>
								<span className="sr-only">
									{t("stepNumber", { n: position + 1, total: STEPS.length })}{" "}
								</span>
								{t(`steps.${item}.label`)}
							</Link>
						</li>
					))}
				</ol>
			</nav>

			{step === "check" ? (
				<section aria-labelledby="step-heading" className="flex flex-col gap-6">
					<h2 id="step-heading" className={sectionHeading}>
						{t("steps.check.title")}
					</h2>
					<p className="max-w-[65ch] text-body text-ink">{t("steps.check.lead")}</p>
					<FieldList>
						<FieldRow label={t("fields.name")} value={identity.name} emptyLabel={empty} />
						<FieldRow
							label={t("fields.profession")}
							value={identity.profession}
							emptyLabel={empty}
						/>
						<FieldRow
							label={tP("rpps")}
							value={<span className="tabular">{identity.rpps}</span>}
							emptyLabel={empty}
						/>
					</FieldList>
					<h3 className="type-subtitle text-ink">{t("steps.check.sites")}</h3>
					<ul className="flex flex-col border-t border-ink">
						{data.sites.map((site) => (
							<li
								key={site.activityId}
								className="flex flex-col gap-0.5 border-b border-rule-soft py-3"
							>
								<span className="font-display text-body font-semibold text-ink">
									{site.name ?? t("steps.check.unnamed")}
									{site.hidden ? (
										<span className="ms-2 align-middle">
											<Badge>{t("steps.check.hidden")}</Badge>
										</span>
									) : null}
								</span>
								<span className="text-meta text-ink">
									{[site.addressLine, [site.postcode, site.placeName].filter(Boolean).join(" ")]
										.filter(Boolean)
										.join(", ")}
								</span>
								<span className="text-meta text-ink-muted tabular">
									{site.phone ? formatPhoneFr(site.phone) : empty}
								</span>
							</li>
						))}
					</ul>
					<p className="max-w-[65ch] text-meta text-ink-muted">{t("steps.check.registryNote")}</p>
				</section>
			) : null}

			{step === "booking" ? (
				<section aria-labelledby="step-heading" className="flex flex-col gap-6">
					<h2 id="step-heading" className={sectionHeading}>
						{t("steps.booking.title")}
					</h2>
					<p className="max-w-[65ch] text-body text-ink">{t("steps.booking.lead")}</p>
					<FieldList>
						<FieldRow
							label={t("steps.booking.fees")}
							value={data.booking.blockers.includes("fees") ? null : t("steps.booking.done")}
							emptyLabel={t("steps.booking.todo")}
						/>
						<FieldRow
							label={t("steps.booking.payments")}
							value={
								data.booking.blockers.includes("paymentMethods") ? null : t("steps.booking.done")
							}
							emptyLabel={t("steps.booking.todo")}
						/>
						<FieldRow
							label={t("steps.booking.waitingPeriod")}
							value={
								data.bookingOpensAt && new Date(data.bookingOpensAt) > new Date()
									? t("steps.booking.waitingEnds", {
											date: format.dateTime(new Date(data.bookingOpensAt), { dateStyle: "long" }),
										})
									: t("steps.booking.noWaiting")
							}
							emptyLabel={empty}
						/>
					</FieldList>
					<p className="max-w-[65ch] text-meta text-ink-muted">{t("steps.booking.deontology")}</p>
					<div>
						{/* Wraps, and takes the full width below 640 px: the label is long. */}
						<Link
							href={PRO_ROUTES.pageEditor}
							className={buttonStyles({
								intent: "ink",
								className: "w-full whitespace-normal py-2 sm:w-auto",
							})}
						>
							{t("steps.booking.editFees")}
						</Link>
					</div>
					<div className="flex flex-col gap-2 border-t border-rule-soft pt-4">
						<p className="max-w-[65ch] text-meta text-ink-muted">
							{t("steps.booking.settingsNote")}
						</p>
						{page.isOwner ? (
							<p>
								<Link href={PRO_ROUTES.agendaSettings} className={linkStyles()}>
									{t("steps.booking.settingsLink")}
								</Link>
							</p>
						) : null}
					</div>
				</section>
			) : null}

			{step === "publish" ? (
				<section aria-labelledby="step-heading" className="flex flex-col gap-6">
					<h2 id="step-heading" className={sectionHeading}>
						{t("steps.publish.title")}
					</h2>
					<p className="max-w-[65ch] text-body text-ink">
						{data.publishedAt ? t("steps.publish.already") : t("steps.publish.lead")}
					</p>
					{data.publishedAt ? (
						<div>
							<Link href={PRO_ROUTES.pageEditor} className={buttonStyles({ intent: "ink" })}>
								{t("steps.publish.edit")}
							</Link>
						</div>
					) : (
						<PublishButton organizationId={page.organizationId} />
					)}
					<div className="flex max-w-[65ch] flex-col gap-2 border-t border-rule-soft pt-4">
						<p className="text-body text-ink">{t("steps.publish.shareLead")}</p>
						<ul className="flex flex-wrap gap-x-6 gap-y-1">
							<li>
								<Link
									href={PRO_ROUTES.share}
									className={`${linkStyles()} inline-flex min-h-11 items-center`}
								>
									{t("steps.publish.shareLink")}
								</Link>
							</li>
							<li>
								<Link
									href={PRO_ROUTES.stats}
									className={`${linkStyles()} inline-flex min-h-11 items-center`}
								>
									{t("steps.publish.statsLink")}
								</Link>
							</li>
						</ul>
					</div>
				</section>
			) : null}

			{next ? (
				<div className="border-t border-rule-soft pt-6">
					<Link
						href={{ pathname: "/pro/bienvenue", query: { etape: String(index + 2) } }}
						className={buttonStyles({ intent: "stamp" })}
					>
						{t("continue")}
					</Link>
				</div>
			) : null}
		</ProShell>
	);
}

export default async function OnboardingPage({ params, searchParams }: Props) {
	const locale = resolveLocale((await params).locale);
	setRequestLocale(locale);
	return (
		<Suspense fallback={<ProShellFallback locale={locale} />}>
			<WithStep locale={locale} searchParams={searchParams} />
		</Suspense>
	);
}

async function WithStep({
	locale,
	searchParams,
}: {
	locale: Locale;
	searchParams: Props["searchParams"];
}) {
	const value = Number((await searchParams).etape ?? "1");
	const step =
		STEPS[Number.isInteger(value) && value >= 1 && value <= 3 ? value - 1 : 0] ?? "check";
	return <Onboarding locale={locale} step={step} />;
}
