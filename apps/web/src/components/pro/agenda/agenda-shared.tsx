"use client";

import {
	Badge,
	Button,
	cn,
	DatePicker,
	Dialog,
	FieldList,
	FieldRow,
	Form,
	ListBoxItem,
	linkStyles,
	Notice,
	Radio,
	RadioGroup,
	Select,
	TextAreaField,
	TextField,
	TimeField,
} from "@apercura/ui";
import { type CalendarDate, parseTime, type Time } from "@internationalized/date";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";
import { Link } from "~/i18n/navigation";
import {
	hhmm,
	instantToLocalDate,
	localMinutes,
	localToInstant,
	minutesOf,
	noonOf,
} from "~/lib/agenda-time";
import { PRO_ROUTES } from "~/lib/pro-routes";
import { useTRPC } from "~/trpc/client";
import type { AppRouter } from "~/trpc/routers/_app";

type Outputs = inferRouterOutputs<AppRouter>;
export type AgendaEntry = Outputs["agenda"]["list"][number];
export type AgendaCalendar = Outputs["agenda"]["calendars"][number];

export const sectionHeading = "type-title text-ink";

/** The printed name of a calendar's place. */
export function placeName(calendar: AgendaCalendar, fallback: string) {
	return calendar.siteName ?? calendar.addressLine ?? fallback;
}

/** "Alexis Martin", or the generic word when the details are gone (purged, still booking). */
export function usePatientName() {
	const t = useTranslations("Agenda.common");
	return (entry: AgendaEntry) =>
		entry.patient
			? [entry.patient.firstName, entry.patient.lastName].filter(Boolean).join(" ") || t("patient")
			: t("patient");
}

/** Statuses printed in the agenda; cancelled and declined entries free their time. */
export const SHOWN_IN_GRID = new Set(["held", "pending", "confirmed", "completed", "no_show"]);

export function useAgendaFormat(timeZone: string) {
	const format = useFormatter();
	return {
		time: (date: Date) =>
			format.dateTime(date, { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }),
		day: (date: Date) =>
			format.dateTime(date, { timeZone, weekday: "long", day: "numeric", month: "long" }),
		dateTime: (date: Date) =>
			format.dateTime(date, {
				timeZone,
				weekday: "long",
				day: "numeric",
				month: "long",
				hour: "2-digit",
				minute: "2-digit",
				hourCycle: "h23",
			}),
		localDay: (date: CalendarDate, style: "long" | "short" = "long") =>
			format.dateTime(
				noonOf(date),
				style === "long"
					? { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }
					: { timeZone: "UTC", weekday: "short", day: "numeric" },
			),
	};
}

/** The discreet line under every page that shows decrypted patient details. */
export function AccessNote({ isOwner }: { isOwner: boolean }) {
	const t = useTranslations("Agenda.common");
	return (
		<p className="max-w-[65ch] text-meta text-ink-muted">
			{t("accessLogged")}
			{isOwner ? (
				<>
					{" "}
					<Link href={PRO_ROUTES.accessLog} className={linkStyles()}>
						{t("accessLogLink")}
					</Link>
				</>
			) : null}
		</p>
	);
}

/** Invalidates every agenda query after a change. */
export function useAgendaRefresh() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	return () => queryClient.invalidateQueries({ queryKey: trpc.agenda.pathKey() });
}

/** The error code of a tRPC failure (`message` carries it), or null. */
export function errorCode(error: unknown): string | null {
	return error && typeof error === "object" && "message" in error
		? String((error as { message: unknown }).message)
		: null;
}

const toTime = (minutes: number): Time => parseTime(hhmm(Math.min(minutes, 23 * 60 + 59)));
const fromTime = (time: Time | null) => (time ? time.hour * 60 + time.minute : null);

/**
 * Adding to the agenda: an appointment taken by phone (patient name required, email and phone
 * optional) or a blocked time. Staff can add outside the opening hours; the overlap constraint
 * still refuses a taken time.
 */
export function AddEntryDialog({
	organizationId,
	calendar,
	initial,
	isOpen,
	onOpenChange,
	defaultKind = "appointment",
}: {
	organizationId: string;
	calendar: AgendaCalendar;
	/** Date and start (minutes since midnight) the dialog opens on. */
	initial: { date: CalendarDate; minute: number };
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
	defaultKind?: "appointment" | "block";
}) {
	const t = useTranslations("Agenda.add");
	const tCommon = useTranslations("Agenda.common");
	const locale = useLocale();
	const trpc = useTRPC();
	const refresh = useAgendaRefresh();
	const activeTypes = calendar.types.filter((type) => type.active);
	const types = activeTypes.length > 0 ? activeTypes : calendar.types;
	const [kind, setKind] = useState<"appointment" | "block">(defaultKind);
	const [date, setDate] = useState<CalendarDate | null>(initial.date);
	const [start, setStart] = useState<Time | null>(toTime(initial.minute));
	const [end, setEnd] = useState<Time | null>(toTime(initial.minute + 30));
	const [typeId, setTypeId] = useState<string | null>(types[0]?.id ?? null);
	const [firstName, setFirstName] = useState("");
	const [lastName, setLastName] = useState("");
	const [email, setEmail] = useState("");
	const [phone, setPhone] = useState("");
	const [problem, setProblem] = useState<string | null>(null);
	const [submitted, setSubmitted] = useState(false);
	const create = useMutation(trpc.agenda.create.mutationOptions());
	const block = useMutation(trpc.agenda.block.mutationOptions());
	const pending = create.isPending || block.isPending;

	const startMin = fromTime(start);
	const endMin = fromTime(end);
	const emailInvalid = email.trim() !== "" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
	const phoneInvalid = phone.trim() !== "" && phone.replace(/[^\d]/g, "").length < 9;
	const endInvalid = kind === "block" && startMin !== null && endMin !== null && endMin <= startMin;

	const onSubmit = (event: FormEvent) => {
		event.preventDefault();
		setSubmitted(true);
		setProblem(null);
		if (!date || startMin === null) {
			setProblem(t("invalid"));
			return;
		}
		const startsAt = new Date(localToInstant(date, startMin, calendar.timeZone));
		const done = (result: { status: string }) => {
			if (result.status === "slot_taken") {
				setProblem(t("taken"));
				return;
			}
			void refresh();
			onOpenChange(false);
		};
		const failed = (error: unknown) =>
			setProblem(errorCode(error) === "INVALID_INPUT" ? t("invalid") : tCommon("failed"));
		if (kind === "block") {
			if (endMin === null || endInvalid) {
				setProblem(t("invalid"));
				return;
			}
			block.mutate(
				{
					organizationId,
					calendarId: calendar.id,
					startsAt,
					endsAt: new Date(localToInstant(date, endMin, calendar.timeZone)),
				},
				{ onSuccess: done, onError: failed },
			);
			return;
		}
		if (!typeId || !firstName.trim() || !lastName.trim() || emailInvalid || phoneInvalid) {
			setProblem(t("invalid"));
			return;
		}
		create.mutate(
			{
				organizationId,
				calendarId: calendar.id,
				typeId,
				startsAt,
				patient: {
					firstName: firstName.trim(),
					lastName: lastName.trim(),
					email: email.trim() || null,
					phone: phone.trim() || null,
				},
				locale,
				idempotencyKey: crypto.randomUUID(),
			},
			{ onSuccess: done, onError: failed },
		);
	};

	return (
		<Dialog
			title={t("title")}
			closeLabel={tCommon("close")}
			isOpen={isOpen}
			onOpenChange={onOpenChange}
		>
			<Form onSubmit={onSubmit} className="flex flex-col gap-5" validationBehavior="aria">
				<RadioGroup
					label={t("kindLabel")}
					value={kind}
					onChange={(value) => setKind(value as "appointment" | "block")}
				>
					<Radio value="appointment">{t("kindAppointment")}</Radio>
					<Radio value="block">{t("kindBlock")}</Radio>
				</RadioGroup>
				<div className="grid gap-4 sm:grid-cols-2">
					<DatePicker
						label={t("date")}
						value={date}
						onChange={setDate}
						isRequired
						granularity="day"
						className="sm:col-span-2"
					/>
					<TimeField
						label={t("start")}
						value={start}
						onChange={setStart}
						isRequired
						hourCycle={24}
					/>
					{kind === "block" ? (
						<TimeField
							label={t("end")}
							value={end}
							onChange={setEnd}
							isRequired
							hourCycle={24}
							isInvalid={submitted && endInvalid}
							errorMessage={t("endBeforeStart")}
						/>
					) : (
						<Select
							label={t("type")}
							selectedKey={typeId}
							onSelectionChange={(key) => setTypeId(key === null ? null : String(key))}
							isRequired
						>
							{types.map((type) => (
								<ListBoxItem key={type.id} id={type.id} textValue={type.name}>
									{t("typeOption", { name: type.name, minutes: type.durationMin })}
								</ListBoxItem>
							))}
						</Select>
					)}
				</div>
				{kind === "appointment" ? (
					<div className="grid gap-4 sm:grid-cols-2">
						<TextField
							label={t("firstName")}
							value={firstName}
							onChange={setFirstName}
							isRequired
							maxLength={100}
							autoComplete="off"
							isInvalid={submitted && !firstName.trim()}
							errorMessage={t("required")}
						/>
						<TextField
							label={t("lastName")}
							value={lastName}
							onChange={setLastName}
							isRequired
							maxLength={100}
							autoComplete="off"
							isInvalid={submitted && !lastName.trim()}
							errorMessage={t("required")}
						/>
						<TextField
							label={t("email")}
							description={t("emailHint")}
							type="email"
							value={email}
							onChange={setEmail}
							maxLength={254}
							autoComplete="off"
							isInvalid={submitted && emailInvalid}
							errorMessage={t("invalidEmail")}
							className="sm:col-span-2"
						/>
						<TextField
							label={t("phone")}
							type="tel"
							value={phone}
							onChange={setPhone}
							maxLength={32}
							autoComplete="off"
							isInvalid={submitted && phoneInvalid}
							errorMessage={t("invalidPhone")}
						/>
					</div>
				) : null}
				{problem ? <Notice tone="error">{problem}</Notice> : null}
				<div className="flex flex-wrap gap-3">
					<Button intent="stamp" type="submit" isPending={pending} pendingLabel={t("pending")}>
						{kind === "block" ? t("submitBlock") : t("submit")}
					</Button>
				</div>
			</Form>
		</Dialog>
	);
}

/**
 * One entry: details, then what can be done with it now (accept or decline a request, mark a
 * no-show after the start, cancel with an optional message to the patient, remove a block).
 */
export function EntryDialog({
	organizationId,
	entry,
	timeZone,
	isOpen,
	onOpenChange,
	nowMs,
}: {
	organizationId: string;
	entry: AgendaEntry;
	timeZone: string;
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
	nowMs: number;
}) {
	const t = useTranslations("Agenda.entry");
	const tCommon = useTranslations("Agenda.common");
	const trpc = useTRPC();
	const refresh = useAgendaRefresh();
	const patientName = usePatientName();
	const when = useAgendaFormat(timeZone);
	const [message, setMessage] = useState("");
	const [confirming, setConfirming] = useState(false);
	const [problem, setProblem] = useState<string | null>(null);
	const cancel = useMutation(trpc.agenda.cancel.mutationOptions());
	const decide = useMutation(trpc.agenda.decide.mutationOptions());
	const noShow = useMutation(trpc.agenda.noShow.mutationOptions());
	const isBlock = entry.kind === "block";
	const active = entry.status === "confirmed" || entry.status === "pending";
	const started = entry.startsAt.getTime() <= nowMs;

	const settle = {
		onSuccess: () => {
			void refresh();
			onOpenChange(false);
		},
		onError: (error: unknown) =>
			setProblem(
				errorCode(error) === "TRANSITION_REFUSED" ? tCommon("refused") : tCommon("failed"),
			),
	};

	const title = isBlock
		? tCommon("block")
		: `${entry.typeName ?? tCommon("patient")} · ${patientName(entry)}`;

	return (
		<Dialog title={title} closeLabel={tCommon("close")} isOpen={isOpen} onOpenChange={onOpenChange}>
			<div className="flex flex-col gap-5">
				<FieldList>
					<FieldRow
						label={t("when")}
						value={`${when.day(entry.startsAt)}, ${tCommon("timeRange", {
							start: when.time(entry.startsAt),
							end: when.time(entry.endsAt),
						})}`}
						emptyLabel="—"
					/>
					{isBlock ? null : (
						<>
							<FieldRow label={t("type")} value={entry.typeName} emptyLabel="—" />
							<FieldRow label={t("patient")} value={patientName(entry)} emptyLabel="—" />
							<FieldRow
								label={t("phone")}
								value={
									entry.patient?.phone ? (
										<a href={`tel:${entry.patient.phone}`} className={linkStyles()}>
											{entry.patient.phone}
										</a>
									) : null
								}
								emptyLabel={tCommon("noPhone")}
							/>
							<FieldRow
								label={t("email")}
								value={entry.patient?.email ?? null}
								emptyLabel={tCommon("noEmail")}
							/>
							<FieldRow
								label={t("status")}
								value={tCommon(`status.${entry.status}`)}
								emptyLabel="—"
							/>
							<FieldRow
								label={t("source")}
								value={tCommon(`source.${entry.source as "online" | "practice"}`)}
								emptyLabel="—"
							/>
						</>
					)}
				</FieldList>
				<div className="flex flex-wrap gap-2">
					{entry.patient?.isNew ? <Badge>{tCommon("newPatient")}</Badge> : null}
					{entry.patient?.email && !entry.patient.emailConfirmed ? (
						<Badge>{tCommon("emailUnconfirmed")}</Badge>
					) : null}
				</div>
				{entry.unreachable ? <Notice tone="error">{tCommon("unreachable")}</Notice> : null}
				{problem ? <Notice tone="error">{problem}</Notice> : null}

				{entry.status === "pending" && !isBlock ? (
					<div className="flex flex-wrap gap-3">
						<Button
							intent="stamp"
							isPending={decide.isPending && decide.variables?.decision === "approve"}
							onPress={() =>
								decide.mutate(
									{ organizationId, appointmentId: entry.id, decision: "approve" },
									settle,
								)
							}
						>
							{t("approve")}
						</Button>
						<Button
							intent="ink"
							isPending={decide.isPending && decide.variables?.decision === "decline"}
							onPress={() =>
								decide.mutate(
									{ organizationId, appointmentId: entry.id, decision: "decline" },
									settle,
								)
							}
						>
							{t("decline")}
						</Button>
					</div>
				) : null}

				{entry.status === "confirmed" && !isBlock && started ? (
					<div>
						<Button
							intent="ink"
							isPending={noShow.isPending}
							onPress={() => noShow.mutate({ organizationId, appointmentId: entry.id }, settle)}
						>
							{t("noShow")}
						</Button>
					</div>
				) : null}

				{active && isBlock ? (
					<div>
						<Button
							intent="ink"
							isPending={cancel.isPending}
							onPress={() => cancel.mutate({ organizationId, appointmentId: entry.id }, settle)}
						>
							{t("removeBlock")}
						</Button>
					</div>
				) : null}

				{active && !isBlock ? (
					confirming ? (
						<div className="flex flex-col gap-4 border-t border-ink pt-4">
							<p className="type-subtitle text-ink">{t("cancelTitle")}</p>
							<p className="text-body text-ink">{t("cancelBody")}</p>
							<TextAreaField
								label={t("message")}
								description={t("messageHint")}
								value={message}
								onChange={setMessage}
								maxLength={500}
							/>
							<div className="flex flex-wrap gap-3">
								<Button
									intent="ink"
									isPending={cancel.isPending}
									onPress={() =>
										cancel.mutate(
											{
												organizationId,
												appointmentId: entry.id,
												message: message.trim() || null,
											},
											settle,
										)
									}
								>
									{t("confirmCancel")}
								</Button>
								<Button intent="ink" onPress={() => setConfirming(false)}>
									{tCommon("keep")}
								</Button>
							</div>
						</div>
					) : (
						<div>
							<Button intent="ink" onPress={() => setConfirming(true)}>
								{t("cancel")}
							</Button>
						</div>
					)
				) : null}
			</div>
		</Dialog>
	);
}

/** Today's date in a calendar's time zone, and the minute it is there now. */
export function localNow(nowMs: number, timeZone: string) {
	return { date: instantToLocalDate(nowMs, timeZone), minute: localMinutes(nowMs, timeZone) };
}

/** A calendar picker when the practice has several places. */
export function CalendarSelect({
	calendars,
	value,
	onChange,
}: {
	calendars: readonly AgendaCalendar[];
	value: string;
	onChange: (id: string) => void;
}) {
	const t = useTranslations("Agenda.common");
	if (calendars.length < 2) {
		return null;
	}
	return (
		<Select
			label={t("placeLabel")}
			selectedKey={value}
			onSelectionChange={(key) => key !== null && onChange(String(key))}
			className="max-w-sm"
		>
			{calendars.map((calendar) => {
				const name = placeName(calendar, t("placeLabel"));
				const label = calendar.placeName
					? t("placeOption", { place: name, city: calendar.placeName })
					: name;
				return (
					<ListBoxItem key={calendar.id} id={calendar.id} textValue={label}>
						{label}
					</ListBoxItem>
				);
			})}
		</Select>
	);
}

export { minutesOf };

/**
 * The outcome of a form, printed after its submit button in a polite live region whose space
 * is reserved, so the button never moves when the message appears.
 */
export function ActionStatus({
	result,
	className,
}: {
	result: { tone: "success" | "error"; text: string } | null;
	className?: string;
}) {
	return (
		<div aria-live="polite" aria-atomic="true" className={cn("min-h-[3.75rem]", className)}>
			{result ? (
				<Notice tone={result.tone} role="none">
					{result.text}
				</Notice>
			) : null}
		</div>
	);
}
