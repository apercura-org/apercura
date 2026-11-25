import {
	Badge,
	buttonStyles,
	CheckIcon,
	EmptyState,
	linkStyles,
	MinusIcon,
	tableStyles,
} from "@apercura/ui";
import type { Metadata } from "next";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { ProShell } from "~/components/pro/pro-shell";
import { ProShellFallback } from "~/components/pro/pro-shell-fallback";
import { ViewsChart } from "~/components/pro/views-chart";
import { Link } from "~/i18n/navigation";
import type { Locale } from "~/i18n/routing";
import { CHECKLIST_TARGET } from "~/lib/completion";
import { NO_INDEX, resolveLocale } from "~/lib/locale";
import { PRO_ROUTES } from "~/lib/pro-routes";
import { requireProAccess } from "~/server/auth/guard";
import { ownedPage } from "~/server/owned-page";
import { PAGE_VIEW_RETENTION, retentionMonths } from "~/server/retention-config";
import { caller } from "~/trpc/server";

export const instant = false;

type Props = PageProps<"/[locale]/pro/statistiques">;

const table = tableStyles();
const sectionHeading = "type-title text-ink";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const locale = resolveLocale((await params).locale);
	const t = await getTranslations({ locale, namespace: "Stats" });
	return { title: t("metaTitle"), robots: NO_INDEX };
}

/** `YYYY-MM-DD` (a calendar day) as a date at noon UTC, so no time zone moves it. */
const dayDate = (day: string) => new Date(`${day}T12:00:00Z`);

async function Stats({ locale }: { locale: Locale }) {
	const access = await requireProAccess(locale, ["ready"]);
	const t = await getTranslations({ locale, namespace: "Stats" });
	const tEditor = await getTranslations({ locale, namespace: "Editor" });
	const format = await getFormatter({ locale });
	const page = await ownedPage(access.session.user.id, locale);
	if (!page) {
		return (
			<ProShell locale={locale} current={PRO_ROUTES.stats} title={t("title")}>
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
	const stats = await caller.stats.page({ organizationId: page.organizationId });
	const short = (day: string) =>
		format.dateTime(dayDate(day), { day: "numeric", month: "short", timeZone: "UTC" });
	const long = (day: string) =>
		format.dateTime(dayDate(day), { dateStyle: "full", timeZone: "UTC" });
	const busiest = stats.daily.reduce(
		(best, day) => (day.views > best.views ? day : best),
		stats.daily[0] ?? { day: "", views: 0 },
	);
	const first = stats.daily[0]?.day ?? "";
	const last = stats.daily.at(-1)?.day ?? "";
	const months = retentionMonths(PAGE_VIEW_RETENTION);
	const summary = [
		{ label: t("summary.views"), value: format.number(stats.totals.viewsLast30Days) },
		{ label: t("summary.bookings"), value: format.number(stats.totals.bookingsLast12Weeks) },
		{ label: t("summary.completion"), value: t("percent", { score: stats.completion.score }) },
	];

	return (
		<ProShell
			locale={locale}
			current={PRO_ROUTES.stats}
			title={t("title")}
			lead={t("lead", { name: page.identity.name })}
		>
			<section aria-labelledby="stats-summary" className="flex flex-col gap-4">
				<h2 id="stats-summary" className={sectionHeading}>
					{t("summaryHeading")}
				</h2>
				<dl className="grid max-w-3xl border-y border-ink sm:grid-cols-3">
					{summary.map((item) => (
						<div
							key={item.label}
							className="flex flex-col gap-1 border-b border-rule-soft px-3 py-3 last:border-b-0 sm:border-e sm:border-b-0 sm:last:border-e-0"
						>
							<dt className="text-meta text-ink-muted">{item.label}</dt>
							<dd className="text-title font-medium text-ink tabular">{item.value}</dd>
						</div>
					))}
				</dl>
			</section>

			<section aria-labelledby="stats-daily" className="flex flex-col gap-4">
				<h2 id="stats-daily" className={sectionHeading}>
					{t("dailyHeading")}
				</h2>
				{stats.totals.viewsLast30Days === 0 ? (
					<p className="max-w-[65ch] text-body text-ink">{t("noViews")}</p>
				) : (
					<ViewsChart
						days={stats.daily}
						title={t("chartTitle")}
						summary={t("chartSummary", {
							total: stats.totals.viewsLast30Days,
							max: busiest.views,
							day: busiest.day ? long(busiest.day) : "",
						})}
						firstLabel={first ? short(first) : ""}
						lastLabel={last ? short(last) : ""}
						maxLabel={format.number(busiest.views)}
					/>
				)}
				<details className="max-w-3xl">
					<summary className={`${linkStyles()} inline-flex min-h-11 cursor-pointer items-center`}>
						{t("dailyTableToggle")}
					</summary>
					<div className="overflow-x-auto pt-2">
						<table className={table.table()}>
							<caption className="sr-only">{t("dailyCaption")}</caption>
							<thead className={table.head()}>
								<tr>
									<th scope="col" className={table.column()}>
										{t("columns.day")}
									</th>
									<th scope="col" className={table.column({ className: "text-right" })}>
										{t("columns.views")}
									</th>
								</tr>
							</thead>
							<tbody>
								{[...stats.daily].reverse().map((day) => (
									<tr key={day.day} className={table.row()}>
										<th scope="row" className={table.cell({ className: "font-normal" })}>
											{long(day.day)}
										</th>
										<td className={table.cell({ className: "text-right tabular" })}>
											{format.number(day.views)}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</details>
			</section>

			<section aria-labelledby="stats-weekly" className="flex flex-col gap-4">
				<h2 id="stats-weekly" className={sectionHeading}>
					{t("weeklyHeading")}
				</h2>
				<div className="max-w-3xl overflow-x-auto">
					<table className={table.table()}>
						<caption className="sr-only">{t("weeklyCaption")}</caption>
						<thead className={table.head()}>
							<tr>
								<th scope="col" className={table.column()}>
									{t("columns.week")}
								</th>
								<th scope="col" className={table.column({ className: "text-right" })}>
									{t("columns.views")}
								</th>
								<th scope="col" className={table.column({ className: "text-right" })}>
									{t("columns.bookings")}
								</th>
							</tr>
						</thead>
						<tbody>
							{[...stats.weekly].reverse().map((week) => (
								<tr key={week.weekStart} className={table.row()}>
									<th scope="row" className={table.cell({ className: "font-normal" })}>
										{t("weekOf", { date: short(week.weekStart) })}
									</th>
									<td className={table.cell({ className: "text-right tabular" })}>
										{format.number(week.views)}
									</td>
									<td className={table.cell({ className: "text-right tabular" })}>
										{format.number(week.bookings)}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
				<p className="max-w-[65ch] text-meta text-ink-muted">{t("bookingsNote")}</p>
			</section>

			<section aria-labelledby="stats-checklist" className="flex max-w-3xl flex-col gap-4">
				<h2 id="stats-checklist" className={sectionHeading}>
					{t("checklistHeading")}
				</h2>
				<p className="text-body text-ink">
					{t("checklistLead", {
						done: stats.completion.done,
						total: stats.completion.total,
						score: stats.completion.score,
					})}
				</p>
				<ul className="flex flex-col border-y border-ink">
					{stats.completion.items.map((item) => {
						const target = CHECKLIST_TARGET[item.key];
						return (
							<li
								key={item.key}
								className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-rule-soft py-3 last:border-b-0"
							>
								<span className="flex items-baseline gap-2 text-body text-ink">
									{/* A printed mark, not a control: a tick when done, a dash when not. */}
									<span
										aria-hidden="true"
										className="inline-flex size-5 shrink-0 translate-y-1 items-center justify-center"
									>
										{item.done ? (
											<CheckIcon className="size-5" />
										) : (
											<MinusIcon className="size-5 text-ink-muted" />
										)}
									</span>
									<span>{t(`checklist.${item.key}`)}</span>
								</span>
								<span className="flex flex-wrap items-center gap-3">
									<Badge tone="ink">{item.done ? t("done") : t("todo")}</Badge>
									{item.done ? null : target === "editor" ? (
										<Link
											href={PRO_ROUTES.pageEditor}
											className={`${linkStyles()} inline-flex min-h-11 items-center`}
										>
											{t("fix.editor")}
											<span className="sr-only"> ({t(`checklist.${item.key}`)})</span>
										</Link>
									) : page.isOwner ? (
										<Link
											href={PRO_ROUTES.agendaSettings}
											className={`${linkStyles()} inline-flex min-h-11 items-center`}
										>
											{t("fix.agenda")}
											<span className="sr-only"> ({t(`checklist.${item.key}`)})</span>
										</Link>
									) : (
										<span className="text-meta text-ink-muted">{t("fix.askOwner")}</span>
									)}
								</span>
							</li>
						);
					})}
				</ul>
			</section>

			<section aria-labelledby="stats-privacy" className="flex max-w-[65ch] flex-col gap-2">
				<h2 id="stats-privacy" className="type-subtitle text-ink">
					{t("privacyHeading")}
				</h2>
				<p className="text-meta text-ink">{t("privacy.counted")}</p>
				<p className="text-meta text-ink">{t("privacy.excluded")}</p>
				<p className="text-meta text-ink">{t("privacy.kept", { months })}</p>
				<p>
					<Link
						href={PRO_ROUTES.share}
						className={`${linkStyles()} inline-flex min-h-11 items-center`}
					>
						{t("shareLink")}
					</Link>
				</p>
			</section>
		</ProShell>
	);
}

export default async function StatsPage({ params }: Props) {
	const locale = resolveLocale((await params).locale);
	setRequestLocale(locale);
	return (
		<Suspense fallback={<ProShellFallback locale={locale} />}>
			<Stats locale={locale} />
		</Suspense>
	);
}
