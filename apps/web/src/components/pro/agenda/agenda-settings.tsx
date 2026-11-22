"use client";

import {
	Badge,
	Button,
	buttonStyles,
	DatePicker,
	EmptyState,
	Form,
	ListBoxItem,
	linkStyles,
	Notice,
	Radio,
	RadioGroup,
	Select,
	SkeletonText,
	Switch,
	TextAreaField,
	TextField,
	TimeField,
} from "@apercura/ui";
import { type CalendarDate, parseTime, type Time, today as todayIn } from "@internationalized/date";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { type FormEvent, type ReactNode, useMemo, useRef, useState } from "react";
import { Link } from "~/i18n/navigation";
import { hhmm, minutesOf, noonOf, parseIsoDate } from "~/lib/agenda-time";
import { PRO_ROUTES } from "~/lib/pro-routes";
import { useTRPC } from "~/trpc/client";
import type { AppRouter } from "~/trpc/routers/_app";
import { ActionStatus, errorCode, sectionHeading } from "./agenda-shared";

type Overview = inferRouterOutputs<AppRouter>["calendar"]["overview"];
type Calendar = Overview["calendars"][number];
type AppointmentType = Calendar["types"][number];

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;
/** Long labels wrap on phones: give the stamp's lines room inside its inner frame. */
const GATE_BUTTON = "h-auto py-3 text-start leading-snug whitespace-normal";
const WORKDAYS = [1, 2, 3, 4, 5] as const;

function Section({
	id,
	title,
	lead,
	children,
}: {
	id: string;
	title: string;
	lead?: ReactNode;
	children: ReactNode;
}) {
	return (
		<section aria-labelledby={id} className="flex flex-col gap-5 border-t border-ink pt-6">
			<div className="flex flex-col gap-1">
				<h2 id={id} className={sectionHeading}>
					{title}
				</h2>
				{lead ? <p className="max-w-[65ch] text-meta text-ink-muted">{lead}</p> : null}
			</div>
			{children}
		</section>
	);
}

const int = (value: string) => {
	const parsed = Number(value.trim());
	return value.trim() !== "" && Number.isInteger(parsed) ? parsed : Number.NaN;
};

/**
 * The booking settings (owners): places with their time zone, appointment types from the
 * specialty's presets, weekly hours, closures and extra openings, the booking rules, the
 * private calendar feed, and the single "open online booking" action with what it still needs.
 */
export function AgendaSettings({ organizationId }: { organizationId: string }) {
	const t = useTranslations("Agenda.settings");
	const tCommon = useTranslations("Agenda.common");
	const locale = useLocale() === "en" ? "en" : "fr";
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const overview = useQuery(trpc.calendar.overview.queryOptions({ organizationId, locale }));
	const [selected, setSelected] = useState<string | null>(null);
	const create = useMutation(trpc.calendar.create.mutationOptions());
	const [problem, setProblem] = useState<string | null>(null);

	const refresh = () =>
		Promise.all([
			queryClient.invalidateQueries({ queryKey: trpc.calendar.pathKey() }),
			queryClient.invalidateQueries({ queryKey: trpc.agenda.pathKey() }),
		]);

	if (overview.isPending) {
		return <SkeletonText lines={6} label={t("title")} />;
	}
	if (overview.isError) {
		return (
			<Notice tone="error">
				{tCommon("loadFailed")}{" "}
				<Button intent="quiet" onPress={() => void overview.refetch()}>
					{tCommon("retry")}
				</Button>
			</Notice>
		);
	}
	const data = overview.data;
	const calendar = data.calendars.find((item) => item.id === selected) ?? data.calendars[0] ?? null;
	const siteOf = (siteId: number) => data.sites.find((site) => site.siteId === siteId);

	const index = [
		["settings-places", t("places.heading")],
		...(calendar
			? [
					["settings-gate", t("gate.heading")],
					["settings-types", t("types.heading")],
					["settings-rules", t("rules.heading")],
					["settings-exceptions", t("exceptions.heading")],
					["settings-booking", t("booking.heading")],
					["settings-feed", t("feed.heading")],
				]
			: []),
	] as const;

	return (
		<div className="grid gap-8 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-12">
			<nav
				aria-labelledby="settings-index"
				className="border-t border-ink pt-6 lg:sticky lg:top-6 lg:self-start"
			>
				<h2 id="settings-index" className="caps pb-2 text-ink">
					{t("index")}
				</h2>
				<ul className="flex flex-col border-t border-ink">
					{index.map(([id, label]) => (
						<li key={id} className="border-b border-rule-soft">
							<a href={`#${id}`} className={`${linkStyles()} flex min-h-11 items-center text-meta`}>
								{label}
							</a>
						</li>
					))}
				</ul>
			</nav>
			<div className="flex min-w-0 flex-col gap-12">
				<Section id="settings-places" title={t("places.heading")} lead={t("places.lead")}>
					{data.sites.length === 0 ? (
						<EmptyState
							title={t("places.heading")}
							description={t("places.none")}
							headingLevel={3}
							action={
								<Link href={PRO_ROUTES.pageEditor} className={buttonStyles({ intent: "ink" })}>
									{t("places.addPlace")}
								</Link>
							}
						/>
					) : (
						<ul className="flex flex-col border-t border-ink">
							{data.sites.map((site) => {
								const existing = data.calendars.find((item) => item.siteId === site.siteId);
								const isCurrent = existing !== undefined && existing.id === calendar?.id;
								return (
									<li
										key={site.siteId}
										className="flex flex-wrap items-center justify-between gap-4 border-b border-rule-soft py-3"
									>
										<span className="flex flex-col gap-0.5">
											<span className="font-display text-body font-semibold text-ink">
												{site.name ?? site.addressLine ?? tCommon("placeLabel")}
											</span>
											<span className="text-meta text-ink">
												{[
													site.addressLine,
													[site.postcode, site.placeName].filter(Boolean).join(" "),
												]
													.filter(Boolean)
													.join(", ")}
											</span>
											<span className="text-meta text-ink-muted">
												{site.timeZone
													? t("places.timeZone", { zone: site.timeZone })
													: t("places.noZone")}
											</span>
										</span>
										{existing ? (
											<span className="flex flex-wrap items-center gap-3">
												<Badge>
													{t(`gate.status.${existing.status as "draft" | "open" | "paused"}`)}
												</Badge>
												{data.calendars.length > 1 ? (
													<Button
														intent="quiet"
														aria-pressed={isCurrent}
														onPress={() => setSelected(existing.id)}
													>
														{t("places.choose")}
													</Button>
												) : null}
											</span>
										) : site.timeZone ? (
											<span className="flex max-w-md flex-col items-start gap-2">
												<Button
													intent="ink"
													isPending={create.isPending && create.variables?.siteId === site.siteId}
													onPress={() => {
														setProblem(null);
														create.mutate(
															{
																organizationId,
																practitionerId: data.practitionerId,
																siteId: site.siteId,
																withPresets: true,
																locale,
															},
															{
																onSuccess: (created) => {
																	setSelected(created.id);
																	void refresh();
																},
																onError: () => setProblem(tCommon("failed")),
															},
														);
													}}
												>
													{t("places.create")}
												</Button>
												{data.presets.length > 0 ? (
													<span className="text-meta text-ink-muted">
														{t("places.presetsNote", {
															names: data.presets
																.map((preset) => `${preset.name} (${preset.durationMin} min)`)
																.join(", "),
														})}
													</span>
												) : null}
											</span>
										) : null}
									</li>
								);
							})}
						</ul>
					)}
					{problem ? <Notice tone="error">{problem}</Notice> : null}
				</Section>

				{calendar ? (
					<CalendarSettings
						key={calendar.id}
						organizationId={organizationId}
						calendar={calendar}
						placeLabel={siteOf(calendar.siteId)?.name ?? tCommon("placeLabel")}
						requirements={data.requirements}
						onChanged={refresh}
					/>
				) : null}
			</div>
		</div>
	);
}

function CalendarSettings({
	organizationId,
	calendar,
	placeLabel,
	requirements,
	onChanged,
}: {
	organizationId: string;
	calendar: Calendar;
	placeLabel: string;
	requirements: Overview["requirements"];
	onChanged: () => Promise<unknown>;
}) {
	const t = useTranslations("Agenda.settings");
	return (
		<div className="flex flex-col gap-12">
			<p className="type-subtitle text-ink">
				{placeLabel} · <span className="font-normal tabular">{calendar.timeZone}</span>
			</p>
			<Gate
				organizationId={organizationId}
				calendar={calendar}
				requirements={requirements}
				onChanged={onChanged}
			/>
			<Section id="settings-types" title={t("types.heading")} lead={t("types.lead")}>
				<TypesEditor organizationId={organizationId} calendar={calendar} onChanged={onChanged} />
			</Section>
			<Section id="settings-rules" title={t("rules.heading")} lead={t("rules.lead")}>
				<RulesEditor organizationId={organizationId} calendar={calendar} onChanged={onChanged} />
			</Section>
			<Section id="settings-exceptions" title={t("exceptions.heading")} lead={t("exceptions.lead")}>
				<ExceptionsEditor
					organizationId={organizationId}
					calendar={calendar}
					onChanged={onChanged}
				/>
			</Section>
			<Section id="settings-booking" title={t("booking.heading")}>
				<BookingRules organizationId={organizationId} calendar={calendar} onChanged={onChanged} />
			</Section>
			<Section id="settings-feed" title={t("feed.heading")} lead={t("feed.lead")}>
				<FeedSettings organizationId={organizationId} calendar={calendar} onChanged={onChanged} />
			</Section>
			<p>
				<Link href={PRO_ROUTES.accessLog} className={linkStyles()}>
					{t("logLink")}
				</Link>
			</p>
		</div>
	);
}

/** The one action that opens online booking, with honest reasons when it cannot yet. */
function Gate({
	organizationId,
	calendar,
	requirements,
	onChanged,
}: {
	organizationId: string;
	calendar: Calendar;
	requirements: Overview["requirements"];
	onChanged: () => Promise<unknown>;
}) {
	const t = useTranslations("Agenda.settings.gate");
	const tCommon = useTranslations("Agenda.common");
	const format = useFormatter();
	const trpc = useTRPC();
	const setStatus = useMutation(trpc.calendar.setStatus.mutationOptions());
	const [result, setResult] = useState<{ tone: "success" | "error"; text: string } | null>(null);
	const hasType = calendar.types.some((type) => type.active);
	const hasHours =
		calendar.rules.length > 0 || calendar.exceptions.some((item) => item.kind === "open");
	const missing: ReactNode[] = [];
	for (const blocker of requirements.blockers) {
		if (blocker === "waitingPeriod" && requirements.bookingOpensAt) {
			missing.push(
				t("waitingPeriod", {
					date: format.dateTime(new Date(requirements.bookingOpensAt), { dateStyle: "long" }),
				}),
			);
		} else if (blocker !== "waitingPeriod") {
			missing.push(t(blocker));
		}
	}
	if (!hasType) missing.push(t("noType"));
	if (!hasHours) missing.push(t("noHours"));
	const pageBlockers = requirements.blockers.some(
		(blocker) => blocker === "fees" || blocker === "paymentMethods",
	);
	const status = calendar.status as "draft" | "open" | "paused";

	const change = (next: "open" | "paused") => {
		setResult(null);
		setStatus.mutate(
			{ organizationId, calendarId: calendar.id, status: next },
			{
				onSuccess: () => {
					setResult({ tone: "success", text: next === "open" ? t("opened") : t("paused") });
					void onChanged();
				},
				onError: (error) =>
					setResult({
						tone: "error",
						text: errorCode(error) === "AGENDA_NOT_READY" ? t("missing") : tCommon("failed"),
					}),
			},
		);
	};

	return (
		<section aria-labelledby="settings-gate" className="flex flex-col gap-4 border border-ink p-5">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<h2 id="settings-gate" className={sectionHeading}>
					{t("heading")}
				</h2>
				<p className="flex items-center gap-2 text-meta text-ink">
					<span>{t("statusLabel")}</span>
					<Badge>{t(`status.${status}`)}</Badge>
				</p>
			</div>
			{missing.length > 0 ? (
				<>
					<p className="text-body text-ink">{t("missing")}</p>
					<ul className="flex list-disc flex-col gap-1 ps-6 text-body text-ink">
						{missing.map((item, index) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: a short, static list
							<li key={index}>{item}</li>
						))}
					</ul>
					{pageBlockers ? (
						<>
							<p className="max-w-[65ch] text-meta text-ink-muted">{t("deontology")}</p>
							<p>
								<Link href={PRO_ROUTES.pageEditor} className={buttonStyles({ intent: "ink" })}>
									{t("editPage")}
								</Link>
							</p>
						</>
					) : null}
				</>
			) : status !== "open" ? (
				<p className="text-body text-ink">{t("ready")}</p>
			) : null}
			<div className="flex flex-wrap gap-3">
				{status === "open" ? (
					<Button
						intent="ink"
						isPending={setStatus.isPending}
						onPress={() => change("paused")}
						className={GATE_BUTTON}
					>
						{t("pause")}
					</Button>
				) : (
					<Button
						intent="stamp"
						isDisabled={missing.length > 0}
						isPending={setStatus.isPending}
						onPress={() => change("open")}
						className={GATE_BUTTON}
					>
						{t("open")}
					</Button>
				)}
			</div>
			{/* Space only while a message shows: nothing below it can jump. */}
			<ActionStatus result={result} className="min-h-0" />
		</section>
	);
}

function TypesEditor({
	organizationId,
	calendar,
	onChanged,
}: {
	organizationId: string;
	calendar: Calendar;
	onChanged: () => Promise<unknown>;
}) {
	const t = useTranslations("Agenda.settings.types");
	const [adding, setAdding] = useState(false);
	return (
		<div className="flex flex-col gap-6">
			<ul className="flex flex-col gap-6">
				{calendar.types.map((type) => (
					<li key={type.id}>
						<TypeForm
							organizationId={organizationId}
							calendarId={calendar.id}
							type={type}
							onSaved={onChanged}
						/>
					</li>
				))}
				{adding ? (
					<li>
						<TypeForm
							organizationId={organizationId}
							calendarId={calendar.id}
							type={null}
							onSaved={async () => {
								setAdding(false);
								await onChanged();
							}}
						/>
					</li>
				) : null}
			</ul>
			{adding ? null : (
				<div>
					<Button intent="ink" onPress={() => setAdding(true)}>
						{t("add")}
					</Button>
				</div>
			)}
		</div>
	);
}

function TypeForm({
	organizationId,
	calendarId,
	type,
	onSaved,
}: {
	organizationId: string;
	calendarId: string;
	type: AppointmentType | null;
	onSaved: () => Promise<unknown>;
}) {
	const t = useTranslations("Agenda.settings.types");
	const tCommon = useTranslations("Agenda.common");
	const trpc = useTRPC();
	const save = useMutation(trpc.calendar.saveType.mutationOptions());
	const [name, setName] = useState(type?.name ?? t("newName"));
	const [duration, setDuration] = useState(String(type?.durationMin ?? 30));
	const [before, setBefore] = useState(String(type?.beforeMin ?? 0));
	const [after, setAfter] = useState(String(type?.afterMin ?? 0));
	const [audience, setAudience] = useState<"all" | "new" | "existing">(
		(type?.audience as "all" | "new" | "existing" | undefined) ?? "all",
	);
	const [active, setActive] = useState(type?.active ?? true);
	const [result, setResult] = useState<{ tone: "success" | "error"; text: string } | null>(null);
	const durationValue = int(duration);
	const beforeValue = int(before);
	const afterValue = int(after);
	const invalid = {
		name: name.trim() === "",
		duration: !(durationValue >= 5 && durationValue <= 480),
		before: !(beforeValue >= 0 && beforeValue <= 240),
		after: !(afterValue >= 0 && afterValue <= 240),
	};
	const headingId = `type-${type?.id ?? "new"}`;

	const onSubmit = (event: FormEvent) => {
		event.preventDefault();
		setResult(null);
		if (Object.values(invalid).some(Boolean)) return;
		save.mutate(
			{
				organizationId,
				calendarId,
				...(type ? { typeId: type.id } : {}),
				name: name.trim(),
				durationMin: durationValue,
				beforeMin: beforeValue,
				afterMin: afterValue,
				audience,
				active,
			},
			{
				onSuccess: () => {
					setResult({ tone: "success", text: t("saved") });
					void onSaved();
				},
				onError: () => setResult({ tone: "error", text: tCommon("failed") }),
			},
		);
	};

	return (
		<Form
			onSubmit={onSubmit}
			aria-labelledby={headingId}
			className="flex flex-col gap-4 border-t border-rule-soft pt-4"
			validationBehavior="aria"
		>
			<h3 id={headingId} className="type-subtitle text-ink">
				{type ? type.name : t("add")}
				<span className="ms-3 text-meta font-normal text-ink-muted tabular">
					{t("summary", { duration: type?.durationMin ?? durationValue })}
					{type && !type.active ? ` · ${t("inactive")}` : ""}
				</span>
			</h3>
			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
				<TextField
					label={t("name")}
					value={name}
					onChange={setName}
					maxLength={80}
					isRequired
					isInvalid={invalid.name}
					className="sm:col-span-2"
				/>
				<TextField
					label={t("duration")}
					value={duration}
					onChange={setDuration}
					inputMode="numeric"
					isRequired
					isInvalid={invalid.duration}
				/>
				<Select
					label={t("audience")}
					selectedKey={audience}
					onSelectionChange={(key) => key !== null && setAudience(key as typeof audience)}
				>
					<ListBoxItem id="all">{t("audienceAll")}</ListBoxItem>
					<ListBoxItem id="new">{t("audienceNew")}</ListBoxItem>
					<ListBoxItem id="existing">{t("audienceExisting")}</ListBoxItem>
				</Select>
				<TextField
					label={t("before")}
					value={before}
					onChange={setBefore}
					inputMode="numeric"
					isInvalid={invalid.before}
				/>
				<TextField
					label={t("after")}
					value={after}
					onChange={setAfter}
					inputMode="numeric"
					isInvalid={invalid.after}
				/>
				<div className="flex items-end sm:col-span-2">
					<Switch isSelected={active} onChange={setActive}>
						{t("active")}
					</Switch>
				</div>
			</div>
			<div>
				<Button type="submit" intent="ink" isPending={save.isPending}>
					{t("save")}
				</Button>
			</div>
			<ActionStatus result={result} />
		</Form>
	);
}

interface Range {
	key: number;
	from: Time | null;
	to: Time | null;
	typeIds: string[];
	validFrom: string | null;
	validUntil: string | null;
}

const timeOf = (value: string) => {
	const minutes = minutesOf(value);
	return minutes === null ? null : parseTime(hhmm(Math.min(minutes, 23 * 60 + 59)));
};
const textOf = (time: Time | null) => (time ? hhmm(time.hour * 60 + time.minute) : null);
const minutesOfTime = (time: Time | null) => (time ? time.hour * 60 + time.minute : null);

function RulesEditor({
	organizationId,
	calendar,
	onChanged,
}: {
	organizationId: string;
	calendar: Calendar;
	onChanged: () => Promise<unknown>;
}) {
	const t = useTranslations("Agenda.settings.rules");
	const tCommon = useTranslations("Agenda.common");
	const trpc = useTRPC();
	const save = useMutation(trpc.calendar.replaceRules.mutationOptions());
	const keys = useRef(0);
	const nextKey = () => {
		keys.current += 1;
		return keys.current;
	};
	const [days, setDays] = useState<Record<number, Range[]>>(() => {
		const initial: Record<number, Range[]> = {};
		for (const weekday of WEEKDAYS) initial[weekday] = [];
		for (const rule of [...calendar.rules].sort((a, b) => a.startTime.localeCompare(b.startTime))) {
			initial[rule.weekday]?.push({
				key: nextKey(),
				from: timeOf(rule.startTime),
				to: timeOf(rule.endTime),
				typeIds: rule.typeIds,
				validFrom: rule.validFrom,
				validUntil: rule.validUntil,
			});
		}
		return initial;
	});
	const [result, setResult] = useState<{ tone: "success" | "error"; text: string } | null>(null);
	const locale = useLocale();
	const dayName = (weekday: number) => t(`days.${weekday}` as "days.1");
	// Weekdays take a capital in English only, in the middle of a sentence.
	const dayInText = (weekday: number) =>
		locale === "en" ? dayName(weekday) : dayName(weekday).toLocaleLowerCase(locale);

	const invalidDay = (weekday: number) => {
		const ranges = (days[weekday] ?? [])
			.map((range) => [minutesOfTime(range.from), minutesOfTime(range.to)] as const)
			.sort((a, b) => (a[0] ?? 0) - (b[0] ?? 0));
		return ranges.some(([from, to], index) => {
			if (from === null || to === null || to <= from) return true;
			const previous = ranges[index - 1];
			return previous ? (previous[1] ?? 0) > from : false;
		});
	};

	const setRange = (weekday: number, key: number, patch: Partial<Range>) =>
		setDays((current) => ({
			...current,
			[weekday]: (current[weekday] ?? []).map((range) =>
				range.key === key ? { ...range, ...patch } : range,
			),
		}));

	const template = (ranges: [string, string][]) => {
		setResult(null);
		setDays(() => {
			const next: Record<number, Range[]> = {};
			for (const weekday of WEEKDAYS) {
				next[weekday] = (WORKDAYS as readonly number[]).includes(weekday)
					? ranges.map(([from, to]) => ({
							key: nextKey(),
							from: timeOf(from),
							to: timeOf(to),
							typeIds: [],
							validFrom: null,
							validUntil: null,
						}))
					: [];
			}
			return next;
		});
	};

	const copyToWorkdays = (source: number) => {
		setDays((current) => {
			const next = { ...current };
			for (const weekday of WORKDAYS) {
				if (weekday === source) continue;
				next[weekday] = (current[source] ?? []).map((range) => ({ ...range, key: nextKey() }));
			}
			return next;
		});
		setResult({ tone: "success", text: t("copied", { day: dayName(source) }) });
	};

	const onSave = () => {
		setResult(null);
		const bad = WEEKDAYS.find(invalidDay);
		if (bad) {
			setResult({ tone: "error", text: t("invalid", { day: dayInText(bad) }) });
			return;
		}
		save.mutate(
			{
				organizationId,
				calendarId: calendar.id,
				rules: WEEKDAYS.flatMap((weekday) =>
					(days[weekday] ?? []).map((range) => ({
						weekday,
						startTime: textOf(range.from) ?? "00:00",
						endTime: textOf(range.to) ?? "00:00",
						typeIds: range.typeIds,
						validFrom: range.validFrom,
						validUntil: range.validUntil,
					})),
				),
			},
			{
				onSuccess: () => {
					setResult({ tone: "success", text: t("saved") });
					void onChanged();
				},
				onError: () => setResult({ tone: "error", text: tCommon("failed") }),
			},
		);
	};

	return (
		<div className="flex flex-col gap-5">
			<div className="flex flex-wrap items-center gap-3">
				<span className="font-display text-meta font-semibold text-ink font-stretch-semi-condensed">
					{t("template")}
				</span>
				<Button intent="ink" onPress={() => template([["08:30", "12:30"]])}>
					{t("templateMornings")}
				</Button>
				<Button
					intent="ink"
					onPress={() =>
						template([
							["09:00", "12:30"],
							["14:00", "18:30"],
						])
					}
				>
					{t("templateDays")}
				</Button>
			</div>
			<div>
				<table className="block w-full border-collapse border-y border-ink text-left text-body sm:table">
					<thead className="hidden border-b border-ink sm:table-header-group">
						<tr>
							<th scope="col" className="caps py-2.5 pe-3 text-left text-ink">
								{t("columns.day")}
							</th>
							<th scope="col" className="caps w-40 px-3 py-2.5 text-left text-ink">
								{t("from")}
							</th>
							<th scope="col" className="caps w-40 px-3 py-2.5 text-left text-ink">
								{t("to")}
							</th>
							<th scope="col" className="w-28 py-2.5 ps-3">
								<span className="sr-only">{t("columns.actions")}</span>
							</th>
						</tr>
					</thead>
					{WEEKDAYS.map((weekday) => {
						const ranges = days[weekday] ?? [];
						const day = dayName(weekday);
						const inText = dayInText(weekday);
						const invalid = invalidDay(weekday);
						// Below 640 px each day stacks: its name, its ranges, then these actions on a row.
						const actions = (
							<>
								<Button
									intent="quiet"
									className="-ms-2 whitespace-nowrap"
									aria-label={t("addFor", { day: inText })}
									onPress={() =>
										setDays((current) => {
											const existing = current[weekday] ?? [];
											const lastEnd = minutesOfTime(existing.at(-1)?.to ?? null);
											const from = lastEnd !== null ? Math.min(lastEnd + 60, 22 * 60) : 9 * 60;
											return {
												...current,
												[weekday]: [
													...existing,
													{
														key: nextKey(),
														from: parseTime(hhmm(from)),
														to: parseTime(hhmm(Math.min(from + 180, 23 * 60 + 30))),
														typeIds: [],
														validFrom: null,
														validUntil: null,
													},
												],
											};
										})
									}
								>
									{t("add")}
								</Button>
								{(WORKDAYS as readonly number[]).includes(weekday) && ranges.length > 0 ? (
									<Button
										intent="quiet"
										className="-ms-2 whitespace-nowrap text-start"
										aria-label={t("copyFor", { day: inText })}
										onPress={() => copyToWorkdays(weekday)}
									>
										{t("copy")}
									</Button>
								) : null}
							</>
						);
						const dayHeader = (
							<th
								scope="rowgroup"
								rowSpan={Math.max(ranges.length, 1)}
								className="block w-full pt-3 pe-3 text-left align-top font-normal sm:table-cell sm:w-auto sm:py-3"
							>
								<span className="flex flex-col items-start gap-1">
									<span className="font-display text-body font-semibold whitespace-nowrap text-ink">
										{day}
									</span>
									<span className="hidden flex-col items-start gap-1 sm:flex">{actions}</span>
								</span>
							</th>
						);
						const timeLabel = (index: number, edge: string) => (
							<span className="sm:sr-only">
								<span className="sr-only">{t("rangeLabel", { day, n: index + 1 })}, </span>
								{edge}
							</span>
						);
						return (
							<tbody
								key={weekday}
								className="block border-b border-rule-soft pb-2 last:border-b-0 sm:table-row-group sm:pb-0"
							>
								{ranges.length === 0 ? (
									<tr className="flex flex-wrap items-end gap-x-3 sm:table-row">
										{dayHeader}
										<td
											colSpan={2}
											className="block py-1 text-meta text-ink-muted sm:table-cell sm:px-3 sm:py-3 sm:align-top"
										>
											{t("closed")}
										</td>
										<td className="hidden sm:table-cell" />
									</tr>
								) : (
									ranges.map((range, index) => (
										<tr key={range.key} className="flex flex-wrap items-end gap-x-3 sm:table-row">
											{index === 0 ? dayHeader : null}
											<td className="block py-1 sm:table-cell sm:px-3 sm:py-2 sm:align-top">
												<TimeField
													label={timeLabel(index, t("from"))}
													value={range.from}
													onChange={(value) => setRange(weekday, range.key, { from: value })}
													hourCycle={24}
													isInvalid={invalid}
													className="w-32 sm:w-36"
												/>
											</td>
											<td className="block py-1 sm:table-cell sm:px-3 sm:py-2 sm:align-top">
												<TimeField
													label={timeLabel(index, t("to"))}
													value={range.to}
													onChange={(value) => setRange(weekday, range.key, { to: value })}
													hourCycle={24}
													isInvalid={invalid}
													className="w-32 sm:w-36"
												/>
											</td>
											<td className="block py-1 sm:table-cell sm:py-2 sm:ps-3 sm:align-top">
												<Button
													intent="quiet"
													aria-label={t("removeRange", {
														day: inText,
														from: textOf(range.from) ?? "",
														to: textOf(range.to) ?? "",
													})}
													onPress={() =>
														setDays((current) => ({
															...current,
															[weekday]: (current[weekday] ?? []).filter(
																(item) => item.key !== range.key,
															),
														}))
													}
												>
													{t("remove")}
												</Button>
											</td>
										</tr>
									))
								)}
								<tr className="flex flex-wrap gap-x-3 sm:hidden">
									<td className="flex flex-wrap gap-x-3">{actions}</td>
								</tr>
							</tbody>
						);
					})}
				</table>
			</div>
			<div>
				<Button isPending={save.isPending} onPress={onSave} intent="ink">
					{t("save")}
				</Button>
			</div>
			<ActionStatus result={result} />
		</div>
	);
}

function ExceptionsEditor({
	organizationId,
	calendar,
	onChanged,
}: {
	organizationId: string;
	calendar: Calendar;
	onChanged: () => Promise<unknown>;
}) {
	const t = useTranslations("Agenda.settings.exceptions");
	const tCommon = useTranslations("Agenda.common");
	const format = useFormatter();
	const trpc = useTRPC();
	const add = useMutation(trpc.calendar.addException.mutationOptions());
	const remove = useMutation(trpc.calendar.removeException.mutationOptions());
	const start = useMemo(() => todayIn(calendar.timeZone), [calendar.timeZone]);
	const [kind, setKind] = useState<"closed" | "open">("closed");
	const [span, setSpan] = useState<"days" | "time">("days");
	const [from, setFrom] = useState<CalendarDate | null>(start);
	const [until, setUntil] = useState<CalendarDate | null>(start);
	const [fromTime, setFromTime] = useState<Time | null>(parseTime("09:00"));
	const [untilTime, setUntilTime] = useState<Time | null>(parseTime("12:00"));
	const [result, setResult] = useState<{ tone: "success" | "error"; text: string } | null>(null);

	const day = (iso: string | null) => {
		const date = parseIsoDate(iso);
		return date
			? format.dateTime(noonOf(date), {
					timeZone: "UTC",
					day: "numeric",
					month: "long",
					year: "numeric",
				})
			: "";
	};
	const labelOf = (item: Calendar["exceptions"][number]) => {
		const open = item.kind === "open";
		if (item.span === "days") {
			if (item.fromDate === item.untilDate) {
				return t(open ? "openDay" : "closedDay", { date: day(item.fromDate) });
			}
			return t(open ? "openDays" : "closedDays", {
				from: day(item.fromDate),
				until: day(item.untilDate),
			});
		}
		const [fromDate, fromClock] = (item.fromLocal ?? "").split("T");
		const [, untilClock] = (item.untilLocal ?? "").split("T");
		return t(open ? "openTime" : "closedTime", {
			date: day(fromDate ?? null),
			from: fromClock ?? "",
			to: untilClock ?? "",
		});
	};

	const invalid =
		span === "days"
			? !from || !until || until.compare(from) < 0
			: !from ||
				(minutesOfTime(untilTime) ?? 0) <= (minutesOfTime(fromTime) ?? 0) ||
				!fromTime ||
				!untilTime;

	const onSubmit = (event: FormEvent) => {
		event.preventDefault();
		setResult(null);
		if (invalid || !from) {
			setResult({ tone: "error", text: t("invalid") });
			return;
		}
		const exception =
			span === "days"
				? {
						kind,
						span: "days" as const,
						fromDate: from.toString(),
						untilDate: (until ?? from).toString(),
					}
				: {
						kind,
						span: "time" as const,
						from: `${from.toString()}T${textOf(fromTime)}`,
						until: `${from.toString()}T${textOf(untilTime)}`,
					};
		add.mutate(
			{ organizationId, calendarId: calendar.id, exception },
			{
				onSuccess: () => {
					setResult({ tone: "success", text: t("added") });
					void onChanged();
				},
				onError: () => setResult({ tone: "error", text: tCommon("failed") }),
			},
		);
	};

	const sorted = [...calendar.exceptions].sort((a, b) =>
		(a.fromDate ?? a.fromLocal ?? "").localeCompare(b.fromDate ?? b.fromLocal ?? ""),
	);

	return (
		<div className="flex flex-col gap-6">
			{sorted.length === 0 ? (
				<p className="text-body text-ink">{t("empty")}</p>
			) : (
				<ul className="flex flex-col border-t border-ink">
					{sorted.map((item) => {
						const label = labelOf(item);
						return (
							<li
								key={item.id}
								className="flex flex-wrap items-center justify-between gap-3 border-b border-rule-soft py-2.5"
							>
								<span className="text-body text-ink">{label}</span>
								<Button
									intent="quiet"
									aria-label={t("removeLabel", { label })}
									isPending={remove.isPending && remove.variables?.exceptionId === item.id}
									onPress={() =>
										remove.mutate(
											{ organizationId, exceptionId: item.id },
											{ onSuccess: () => void onChanged() },
										)
									}
								>
									{t("remove")}
								</Button>
							</li>
						);
					})}
				</ul>
			)}
			<Form onSubmit={onSubmit} className="flex flex-col gap-4" validationBehavior="aria">
				<div className="grid gap-4 sm:grid-cols-2">
					<RadioGroup
						label={t("kind")}
						value={kind}
						onChange={(value) => setKind(value as "closed" | "open")}
					>
						<Radio value="closed">{t("kindClosed")}</Radio>
						<Radio value="open">{t("kindOpen")}</Radio>
					</RadioGroup>
					<RadioGroup
						label={t("span")}
						value={span}
						onChange={(value) => setSpan(value as "days" | "time")}
					>
						<Radio value="days">{t("spanDays")}</Radio>
						<Radio value="time">{t("spanTime")}</Radio>
					</RadioGroup>
				</div>
				{span === "days" ? (
					<div className="flex flex-wrap gap-4">
						<DatePicker label={t("from")} value={from} onChange={setFrom} isRequired />
						<DatePicker
							label={t("until")}
							value={until}
							onChange={setUntil}
							isRequired
							minValue={from ?? undefined}
							isInvalid={invalid}
							errorMessage={t("invalid")}
						/>
					</div>
				) : (
					<div className="flex flex-wrap gap-4">
						<DatePicker label={t("date")} value={from} onChange={setFrom} isRequired />
						<TimeField
							label={t("start")}
							value={fromTime}
							onChange={setFromTime}
							hourCycle={24}
							isRequired
						/>
						<TimeField
							label={t("end")}
							value={untilTime}
							onChange={setUntilTime}
							hourCycle={24}
							isRequired
							isInvalid={invalid}
							errorMessage={t("invalid")}
						/>
					</div>
				)}
				<div>
					<Button type="submit" intent="ink" isPending={add.isPending}>
						{t("add")}
					</Button>
				</div>
				<ActionStatus result={result} />
			</Form>
		</div>
	);
}

function BookingRules({
	organizationId,
	calendar,
	onChanged,
}: {
	organizationId: string;
	calendar: Calendar;
	onChanged: () => Promise<unknown>;
}) {
	const t = useTranslations("Agenda.settings.booking");
	const tCommon = useTranslations("Agenda.common");
	const trpc = useTRPC();
	const update = useMutation(trpc.calendar.update.mutationOptions());
	const [minNotice, setMinNotice] = useState(String(Math.round(calendar.minNoticeMin / 60)));
	const [horizon, setHorizon] = useState(String(calendar.horizonDays));
	const [step, setStep] = useState(String(calendar.stepMin));
	const [cutoff, setCutoff] = useState(String(Math.round(calendar.cancellationCutoffMin / 60)));
	const [retention, setRetention] = useState(String(calendar.retentionDays));
	const [manual, setManual] = useState(calendar.manualValidation);
	const [newPatients, setNewPatients] = useState(calendar.acceptsNewPatients);
	const [requirePhone, setRequirePhone] = useState(calendar.requirePhone);
	const [askFirstVisit, setAskFirstVisit] = useState(calendar.askFirstVisit);
	const [instructions, setInstructions] = useState(calendar.publicInstructions ?? "");
	const [result, setResult] = useState<{ tone: "success" | "error"; text: string } | null>(null);
	const values = {
		minNotice: int(minNotice),
		horizon: int(horizon),
		step: int(step),
		cutoff: int(cutoff),
		retention: int(retention),
	};
	const invalid = {
		minNotice: !(values.minNotice >= 0 && values.minNotice <= 720),
		horizon: !(values.horizon >= 1 && values.horizon <= 365),
		step: !(values.step >= 5 && values.step <= 240),
		cutoff: !(values.cutoff >= 0 && values.cutoff <= 336),
		retention: !(values.retention >= 30 && values.retention <= 365),
	};

	const onSubmit = (event: FormEvent) => {
		event.preventDefault();
		setResult(null);
		if (Object.values(invalid).some(Boolean)) {
			setResult({ tone: "error", text: t("invalid") });
			return;
		}
		update.mutate(
			{
				organizationId,
				calendarId: calendar.id,
				settings: {
					minNoticeMin: values.minNotice * 60,
					horizonDays: values.horizon,
					stepMin: values.step,
					cancellationCutoffMin: values.cutoff * 60,
					retentionDays: values.retention,
					manualValidation: manual,
					acceptsNewPatients: newPatients,
					requirePhone,
					askFirstVisit,
					publicInstructions: instructions.trim() || null,
				},
			},
			{
				onSuccess: () => {
					setResult({ tone: "success", text: t("saved") });
					void onChanged();
				},
				onError: () => setResult({ tone: "error", text: tCommon("failed") }),
			},
		);
	};

	return (
		<Form onSubmit={onSubmit} className="flex flex-col gap-5" validationBehavior="aria">
			<div className="grid gap-4 sm:grid-cols-2">
				<TextField
					label={t("minNotice")}
					description={t("minNoticeHint")}
					value={minNotice}
					onChange={setMinNotice}
					inputMode="numeric"
					isInvalid={invalid.minNotice}
				/>
				<TextField
					label={t("horizon")}
					description={t("horizonHint")}
					value={horizon}
					onChange={setHorizon}
					inputMode="numeric"
					isInvalid={invalid.horizon}
				/>
				<TextField
					label={t("step")}
					value={step}
					onChange={setStep}
					inputMode="numeric"
					isInvalid={invalid.step}
				/>
				<TextField
					label={t("cutoff")}
					value={cutoff}
					onChange={setCutoff}
					inputMode="numeric"
					isInvalid={invalid.cutoff}
				/>
				<TextField
					label={t("retention")}
					description={t("retentionHint")}
					value={retention}
					onChange={setRetention}
					inputMode="numeric"
					isInvalid={invalid.retention}
				/>
			</div>
			<div className="flex flex-col gap-1">
				<Switch isSelected={manual} onChange={setManual}>
					{t("manual")}
				</Switch>
				<p className="ps-15 text-meta text-ink-muted">{t("manualHint")}</p>
				<Switch isSelected={newPatients} onChange={setNewPatients}>
					{t("newPatients")}
				</Switch>
				<Switch isSelected={requirePhone} onChange={setRequirePhone}>
					{t("requirePhone")}
				</Switch>
				<Switch isSelected={askFirstVisit} onChange={setAskFirstVisit}>
					{t("askFirstVisit")}
				</Switch>
			</div>
			<TextAreaField
				label={t("instructions")}
				description={t("instructionsHint")}
				value={instructions}
				onChange={setInstructions}
				maxLength={1000}
			/>
			<div>
				<Button type="submit" intent="ink" isPending={update.isPending}>
					{t("save")}
				</Button>
			</div>
			<ActionStatus result={result} />
		</Form>
	);
}

function FeedSettings({
	organizationId,
	calendar,
	onChanged,
}: {
	organizationId: string;
	calendar: Calendar;
	onChanged: () => Promise<unknown>;
}) {
	const t = useTranslations("Agenda.settings.feed");
	const tCommon = useTranslations("Agenda.common");
	const format = useFormatter();
	const trpc = useTRPC();
	const rotate = useMutation(trpc.calendar.rotateFeed.mutationOptions());
	const revoke = useMutation(trpc.calendar.revokeFeed.mutationOptions());
	const update = useMutation(trpc.calendar.update.mutationOptions());
	const [url, setUrl] = useState<string | null>(null);
	const [fullNames, setFullNames] = useState(calendar.icsFullNames);
	const [result, setResult] = useState<{ tone: "success" | "error"; text: string } | null>(null);
	const failed = () => setResult({ tone: "error", text: tCommon("failed") });

	return (
		<div className="flex flex-col gap-4">
			<p className="text-body text-ink">
				{calendar.feed.active && calendar.feed.createdAt
					? t("on", {
							date: format.dateTime(new Date(calendar.feed.createdAt), { dateStyle: "long" }),
						})
					: t("off")}
			</p>
			{url ? (
				<TextField
					label={t("url")}
					description={t("urlHint")}
					value={url}
					isReadOnly
					onFocus={(event) => (event.target as HTMLInputElement).select()}
				/>
			) : null}
			<div className="flex flex-wrap gap-3">
				<Button
					intent="ink"
					isPending={rotate.isPending}
					onPress={() => {
						setResult(null);
						rotate.mutate(
							{ organizationId, calendarId: calendar.id },
							{
								onSuccess: (data) => {
									setUrl(data.url);
									void onChanged();
								},
								onError: failed,
							},
						);
					}}
				>
					{calendar.feed.active ? t("rotate") : t("create")}
				</Button>
				{calendar.feed.active ? (
					<Button
						intent="ink"
						isPending={revoke.isPending}
						onPress={() => {
							setResult(null);
							revoke.mutate(
								{ organizationId, calendarId: calendar.id },
								{
									onSuccess: () => {
										setUrl(null);
										setResult({ tone: "success", text: t("revoked") });
										void onChanged();
									},
									onError: failed,
								},
							);
						}}
					>
						{t("revoke")}
					</Button>
				) : null}
			</div>
			<ActionStatus result={result} />
			<div className="flex flex-col gap-1">
				<Switch
					isSelected={fullNames}
					onChange={(value) => {
						setFullNames(value);
						update.mutate(
							{ organizationId, calendarId: calendar.id, settings: { icsFullNames: value } },
							{
								onSuccess: () => {
									setResult({ tone: "success", text: t("saved") });
									void onChanged();
								},
								onError: () => {
									setFullNames(!value);
									failed();
								},
							},
						);
					}}
				>
					{t("fullNames")}
				</Switch>
				<p className="ps-15 text-meta text-ink-muted">{t("fullNamesHint")}</p>
			</div>
		</div>
	);
}
