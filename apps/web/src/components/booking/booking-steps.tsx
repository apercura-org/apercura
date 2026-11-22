"use client";

import {
	Badge,
	Button,
	FieldList,
	FieldRow,
	Form,
	Notice,
	OtpField,
	Radio,
	RadioGroup,
	TextField,
} from "@apercura/ui";
import { useLocale, useTranslations } from "next-intl";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { buildIcs } from "~/lib/ics";
import { slotParts, slotTime } from "~/lib/slot-format";
import { useTRPCClient } from "~/trpc/client";
import { AltchaCheck, type AltchaHandle } from "./altcha-check";
import type { BookingResult, HeldSlot, PatientDetails } from "./booking-state";
import {
	type BookingCalendar,
	type BookingType,
	bookingErrorCode,
	siteAddress,
} from "./booking-types";
import { StepActions } from "./step-actions";

const RESEND_COOLDOWN_MS = 60_000;

/** Practitioner, place, reason and time of the booking, printed as booklet field rows. */
export function BookingSummary({
	calendar,
	type,
	practitionerName,
	slotMs,
}: {
	calendar: BookingCalendar;
	type: BookingType;
	practitionerName: string;
	slotMs: number;
}) {
	const t = useTranslations("booking.panel.summary");
	const tP = useTranslations("Practitioner");
	const locale = useLocale();
	const parts = slotParts(slotMs, calendar.timeZone, locale);
	const place = [calendar.siteName, siteAddress(calendar)].filter(Boolean).join(", ");
	return (
		<FieldList>
			<FieldRow label={t("with")} value={practitionerName} emptyLabel={tP("notProvided")} />
			<FieldRow label={t("reason")} value={type.name} emptyLabel={tP("notProvided")} />
			<FieldRow label={t("date")} value={parts.date} emptyLabel={tP("notProvided")} />
			<FieldRow
				label={t("time")}
				value={<span className="tabular">{slotTime(parts)}</span>}
				emptyLabel={tP("notProvided")}
			/>
			<FieldRow label={t("place")} value={place} emptyLabel={tP("notProvided")} />
		</FieldList>
	);
}

export function ReasonStep({
	calendars,
	calendarId,
	typeId,
	onSubmit,
}: {
	calendars: BookingCalendar[];
	calendarId: string | null;
	typeId: string | null;
	onSubmit: (calendarId: string, typeId: string) => void;
}) {
	const t = useTranslations("booking.panel");
	const [place, setPlace] = useState(calendarId ?? calendars[0]?.id ?? "");
	const [reason, setReason] = useState(typeId ?? "");
	const calendar = calendars.find((item) => item.id === place) ?? calendars[0];
	const audience = (value: string) =>
		value === "new" ? t("reason.newOnly") : value === "existing" ? t("reason.existingOnly") : null;

	const submit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (calendar?.types.some((type) => type.id === reason)) {
			onSubmit(calendar.id, reason);
		}
	};

	return (
		<Form onSubmit={submit}>
			{calendars.length > 1 ? (
				<RadioGroup
					label={t("reason.place")}
					value={place || null}
					onChange={(value) => {
						setPlace(value);
						setReason("");
					}}
					isRequired
				>
					{calendars.map((item) => (
						<Radio key={item.id} value={item.id}>
							<span className="flex flex-col">
								<span className="font-semibold">{item.siteName ?? siteAddress(item)}</span>
								{item.siteName ? (
									<span className="text-meta text-ink-muted">{siteAddress(item)}</span>
								) : null}
							</span>
						</Radio>
					))}
				</RadioGroup>
			) : null}
			{calendar ? (
				<RadioGroup
					key={calendar.id}
					label={t("reason.type")}
					value={reason || null}
					onChange={setReason}
					isRequired
					errorMessage={t("reason.required")}
				>
					{calendar.types.map((type) => (
						<Radio key={type.id} value={type.id}>
							<span className="flex flex-col">
								<span className="font-semibold">{type.name}</span>
								<span className="tabular text-meta text-ink-muted">
									{[t("reason.duration", { minutes: type.durationMin }), audience(type.audience)]
										.filter(Boolean)
										.join(" · ")}
								</span>
							</span>
						</Radio>
					))}
				</RadioGroup>
			) : null}
			{calendar?.publicInstructions ? (
				<Notice tone="info" role="none" title={t("reason.instructions")}>
					<p className="whitespace-pre-line">{calendar.publicInstructions}</p>
				</Notice>
			) : null}
			{calendar && (!calendar.acceptsNewPatients || calendar.manualValidation) ? (
				<p className="text-meta text-ink">
					{calendar.acceptsNewPatients ? t("done.pendingNote") : t("reason.noNewPatients")}
				</p>
			) : null}
			<StepActions
				onBack={null}
				primary={
					<Button type="submit" intent="stamp" size="lg">
						{t("continue")}
					</Button>
				}
			/>
		</Form>
	);
}

const PHONE = /^\+?[0-9][0-9 .\-()]{5,20}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function DetailsStep({
	calendar,
	type,
	practitionerName,
	slotMs,
	details,
	notice,
	onBack,
	onDetails,
	onHeld,
	onTaken,
}: {
	calendar: BookingCalendar;
	type: BookingType;
	practitionerName: string;
	slotMs: number;
	details: PatientDetails;
	notice: string | null;
	onBack: () => void;
	onDetails: (details: PatientDetails) => void;
	onHeld: (hold: HeldSlot) => void;
	onTaken: (alternatives: Date[]) => void;
}) {
	const t = useTranslations("booking.panel");
	const locale = useLocale();
	const client = useTRPCClient();
	const altcha = useRef<AltchaHandle>(null);
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const set = (patch: Partial<PatientDetails>) => onDetails({ ...details, ...patch });

	const submit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const website = new FormData(event.currentTarget).get("website");
		setPending(true);
		setError(null);
		try {
			const proof = await altcha.current?.solve();
			if (!proof) {
				setError("PROOF_REQUIRED");
				return;
			}
			const outcome = await client.booking.hold.mutate({
				calendarId: calendar.id,
				typeId: type.id,
				startsAt: new Date(slotMs),
				patient: {
					firstName: details.firstName,
					lastName: details.lastName,
					email: details.email,
					phone: details.phone.trim() ? details.phone : null,
					isNew: details.firstVisit === "" ? null : details.firstVisit === "yes",
				},
				locale: locale === "en" ? "en" : "fr",
				idempotencyKey: crypto.randomUUID(),
				altcha: proof,
				...(typeof website === "string" && website ? { website } : {}),
			});
			if (outcome.status === "slot_taken") {
				onTaken(outcome.alternatives);
				return;
			}
			onHeld({
				holdId: outcome.holdId,
				holdToken: outcome.holdToken,
				expiresAt: new Date(outcome.expiresAt),
				sentAt: Date.now(),
			});
		} catch (caught) {
			setError(bookingErrorCode(caught));
		} finally {
			// A solved challenge buys one hold: the next attempt solves a new one.
			altcha.current?.reset();
			setPending(false);
		}
	};

	return (
		<Form onSubmit={(event) => void submit(event)}>
			{notice ? <Notice tone="info">{notice}</Notice> : null}
			<BookingSummary
				calendar={calendar}
				type={type}
				practitionerName={practitionerName}
				slotMs={slotMs}
			/>
			<p className="max-w-[60ch] text-body text-ink">{t("details.lead")}</p>
			<div className="grid gap-6 sm:grid-cols-2">
				<TextField
					name="given-name"
					label={t("details.firstName")}
					autoComplete="given-name"
					value={details.firstName}
					onChange={(firstName) => set({ firstName })}
					isRequired
					maxLength={100}
					validate={(value) => (value.trim() ? null : t("details.requiredFirstName"))}
				/>
				<TextField
					name="family-name"
					label={t("details.lastName")}
					autoComplete="family-name"
					value={details.lastName}
					onChange={(lastName) => set({ lastName })}
					isRequired
					maxLength={100}
					validate={(value) => (value.trim() ? null : t("details.requiredLastName"))}
				/>
			</div>
			<TextField
				name="email"
				type="email"
				label={t("details.email")}
				description={t("details.emailHint")}
				autoComplete="email"
				inputMode="email"
				value={details.email}
				onChange={(email) => set({ email })}
				isRequired
				maxLength={254}
				validate={(value) => (EMAIL.test(value.trim()) ? null : t("details.invalidEmail"))}
			/>
			<TextField
				name="tel"
				type="tel"
				label={calendar.requirePhone ? t("details.phone") : t("details.phoneOptional")}
				description={t("details.phoneHint")}
				autoComplete="tel"
				inputMode="tel"
				value={details.phone}
				onChange={(phone) => set({ phone })}
				isRequired={calendar.requirePhone}
				maxLength={32}
				validate={(value) =>
					!value.trim() && !calendar.requirePhone
						? null
						: PHONE.test(value.trim())
							? null
							: t("details.invalidPhone")
				}
			/>
			{calendar.askFirstVisit ? (
				<RadioGroup
					label={t("details.firstVisit")}
					value={details.firstVisit || null}
					onChange={(value) => set({ firstVisit: value === "yes" ? "yes" : "no" })}
					isRequired
					errorMessage={t("details.requiredFirstVisit")}
				>
					<Radio value="yes">{t("details.firstVisitYes")}</Radio>
					<Radio value="no">{t("details.firstVisitNo")}</Radio>
				</RadioGroup>
			) : null}
			{/* Honeypot: out of sight and out of the tab order, filled only by naive bots. */}
			<div aria-hidden="true" className="absolute -start-[200vw] h-px w-px overflow-hidden">
				<label>
					{t("details.website")}
					<input type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
				</label>
			</div>
			<AltchaCheck ref={altcha} />
			<p className="text-meta text-ink-muted">{t("details.privacy")}</p>
			{error ? <Notice tone="error" title={t(`errors.${error}` as "errors.generic")} /> : null}
			<StepActions
				onBack={onBack}
				primary={
					<Button
						type="submit"
						intent="stamp"
						size="lg"
						isPending={pending}
						pendingLabel={t("pending")}
					>
						{t("details.submit")}
					</Button>
				}
			/>
		</Form>
	);
}

export function CodeStep({
	calendar,
	type,
	practitionerName,
	slotMs,
	email,
	hold,
	onResent,
	onBack,
	onRestart,
	onDone,
	onTaken,
}: {
	calendar: BookingCalendar;
	type: BookingType;
	practitionerName: string;
	slotMs: number;
	email: string;
	hold: HeldSlot;
	onResent: (sentAt: number) => void;
	onBack: () => void;
	onRestart: () => void;
	onDone: (result: BookingResult) => void;
	onTaken: (alternatives: Date[]) => void;
}) {
	const t = useTranslations("booking.panel");
	const locale = useLocale();
	const client = useTRPCClient();
	const [code, setCode] = useState("");
	const [pending, setPending] = useState(false);
	const [fieldError, setFieldError] = useState<string | null>(null);
	/** A dead end for this hold (expired, too many attempts…): only "choose again" remains. */
	const [fatal, setFatal] = useState<string | null>(null);
	const [info, setInfo] = useState<string | null>(null);
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		const timer = window.setInterval(() => setNow(Date.now()), 1_000);
		return () => window.clearInterval(timer);
	}, []);
	const waitSeconds = Math.max(0, Math.ceil((hold.sentAt + RESEND_COOLDOWN_MS - now) / 1_000));
	const heldUntil = slotParts(hold.expiresAt.getTime(), calendar.timeZone, locale).time;
	const ref = { holdId: hold.holdId, holdToken: hold.holdToken };

	const submit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!/^\d{6}$/.test(code)) {
			setFieldError(t("code.required"));
			return;
		}
		setPending(true);
		setFieldError(null);
		setInfo(null);
		try {
			const outcome = await client.booking.verify.mutate({ ...ref, code });
			if (outcome.status === "invalid_code") {
				if (outcome.attemptsLeft === 0) {
					setFatal("TOO_MANY_ATTEMPTS");
				} else {
					setFieldError(t("code.invalid", { count: outcome.attemptsLeft }));
				}
				return;
			}
			if (outcome.status === "slot_taken") {
				onTaken(outcome.alternatives);
				return;
			}
			onDone({
				status: outcome.status,
				appointmentId: hold.holdId,
				startsAt: new Date(outcome.startsAt),
				pendingUntil: outcome.pendingUntil ? new Date(outcome.pendingUntil) : null,
			});
		} catch (caught) {
			const code = bookingErrorCode(caught);
			if (["CODE_EXPIRED", "TOO_MANY_ATTEMPTS", "NOT_FOUND", "TRANSITION_REFUSED"].includes(code)) {
				setFatal(code);
			} else {
				setInfo(t(`errors.${code}` as "errors.generic"));
			}
		} finally {
			setPending(false);
		}
	};

	const resend = async () => {
		setInfo(null);
		try {
			const result = await client.booking.resendCode.mutate(ref);
			onResent(Date.now());
			setInfo(`${t("code.resent", { email })} ${t("code.sendsLeft", { count: result.sendsLeft })}`);
		} catch (caught) {
			const code = bookingErrorCode(caught);
			if (code === "RESEND_LIMIT" || code === "TRANSITION_REFUSED") {
				setFatal(code);
			} else {
				setInfo(t(`errors.${code}` as "errors.generic"));
			}
		}
	};

	if (fatal) {
		return (
			<div className="flex flex-col gap-6">
				<Notice tone="error" title={t(`errors.${fatal}` as "errors.generic")} />
				<StepActions
					onBack={null}
					primary={
						<Button intent="stamp" size="lg" onPress={onRestart}>
							{t("errors.restart")}
						</Button>
					}
				/>
			</div>
		);
	}

	return (
		<Form onSubmit={(event) => void submit(event)}>
			<p className="max-w-[60ch] text-body text-ink">{t("code.lead", { email })}</p>
			<OtpField
				name="code"
				label={t("code.field")}
				description={t("code.hint")}
				value={code}
				onChange={(value) => {
					setCode(value);
					setFieldError(null);
				}}
				isRequired
				isInvalid={fieldError !== null}
				errorMessage={fieldError ?? undefined}
			/>
			<p className="tabular text-meta text-ink">{t("code.held", { time: heldUntil })}</p>
			<div className="flex flex-col items-start gap-2">
				<Button intent="ink" isDisabled={waitSeconds > 0} onPress={() => void resend()}>
					{waitSeconds > 0 ? t("code.resendIn", { seconds: waitSeconds }) : t("code.resend")}
				</Button>
				{info ? (
					<p role="status" className="text-meta text-ink">
						{info}
					</p>
				) : null}
			</div>
			<BookingSummary
				calendar={calendar}
				type={type}
				practitionerName={practitionerName}
				slotMs={slotMs}
			/>
			<StepActions
				onBack={onBack}
				primary={
					<Button
						type="submit"
						intent="stamp"
						size="lg"
						isPending={pending}
						pendingLabel={t("pending")}
					>
						{t("code.submit")}
					</Button>
				}
			/>
		</Form>
	);
}

export function TakenStep({
	timeZone,
	alternatives,
	onPick,
	onAgenda,
}: {
	timeZone: string;
	alternatives: Date[];
	onPick: (slotMs: number, notice: string) => void;
	onAgenda: () => void;
}) {
	const t = useTranslations("booking.panel.taken");
	const locale = useLocale();
	const label = (ms: number) => {
		const parts = slotParts(ms, timeZone, locale);
		return `${parts.dateNoYear}, ${slotTime(parts)}`;
	};
	return (
		<div className="flex flex-col gap-6">
			<Notice tone="info" role="alert">
				{alternatives.length > 0 ? t("body") : t("none")}
			</Notice>
			{alternatives.length > 0 ? (
				<ul className="flex flex-col border-t border-ink">
					{alternatives.map((start) => {
						const ms = new Date(start).getTime();
						return (
							<li key={ms} className="border-b border-rule-soft py-2">
								<Button
									intent="ink"
									size="lg"
									className="w-full justify-start py-2.5 leading-snug tabular sm:w-auto"
									onPress={() => onPick(ms, t("picked", { slot: label(ms) }))}
								>
									{t("choose", { slot: label(ms) })}
								</Button>
							</li>
						);
					})}
				</ul>
			) : null}
			<div>
				<Button intent="quiet" onPress={onAgenda}>
					{t("other")}
				</Button>
			</div>
		</div>
	);
}

export function DoneStep({
	calendar,
	type,
	practitionerName,
	email,
	result,
	onClose,
}: {
	calendar: BookingCalendar;
	type: BookingType;
	practitionerName: string;
	email: string;
	result: BookingResult;
	onClose: () => void;
}) {
	const t = useTranslations("booking.panel.done");
	const tEmail = useTranslations("booking.email");
	const locale = useLocale();
	const startMs = result.startsAt.getTime();
	const pending = result.status === "pending";

	const download = () => {
		const ics = buildIcs({
			method: "PUBLISH",
			uid: `${result.appointmentId}@${window.location.hostname}`,
			sequence: 0,
			startsAt: result.startsAt,
			endsAt: new Date(startMs + type.durationMin * 60_000),
			stampedAt: new Date(),
			// Same minimal title as the emails: the practitioner, never the reason.
			summary: tEmail("summary", { practitioner: practitionerName }),
			location: [calendar.siteName, siteAddress(calendar)].filter(Boolean).join(", "),
		});
		const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
		const link = document.createElement("a");
		link.href = url;
		link.download = "rendez-vous.ics";
		document.body.append(link);
		link.click();
		link.remove();
		window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
	};

	const deadline = result.pendingUntil
		? (() => {
				const parts = slotParts(result.pendingUntil.getTime(), calendar.timeZone, locale);
				return `${parts.dateNoYear}, ${slotTime(parts)}`;
			})()
		: "";

	return (
		<div className="flex flex-col gap-6">
			<div role="status" className="flex flex-col items-start gap-3">
				<Badge tone={pending ? "ink" : "stamp"}>
					{pending ? t("pendingMark") : t("bookedMark")}
				</Badge>
				<p className="max-w-[60ch] text-body text-ink">
					{pending ? t("pendingBody", { deadline, email }) : t("confirmedBody", { email })}
				</p>
				{pending ? <p className="text-meta text-ink">{t("pendingNote")}</p> : null}
			</div>
			<BookingSummary
				calendar={calendar}
				type={type}
				practitionerName={practitionerName}
				slotMs={startMs}
			/>
			{pending ? null : (
				<div className="flex flex-col items-start gap-2">
					<Button intent="ink" size="lg" onPress={download}>
						{t("calendar")}
					</Button>
					<p className="text-meta text-ink-muted">{t("calendarHint")}</p>
				</div>
			)}
			<StepActions
				onBack={null}
				primary={
					<Button intent="ink" size="lg" onPress={onClose}>
						{t("close")}
					</Button>
				}
			/>
		</div>
	);
}
