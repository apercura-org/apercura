"use client";

import { formatPhoneFr } from "@apercura/core";
import {
	Badge,
	Button,
	buttonStyles,
	Dialog,
	EmptyState,
	FieldList,
	FieldRow,
	linkStyles,
	Notice,
	SkeletonText,
} from "@apercura/ui";
import { useMutation } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "~/i18n/navigation";
import { slotParts, slotTime } from "~/lib/slot-format";
import { useTRPCClient } from "~/trpc/client";
import { bookingErrorCode, type ManagedAppointment, siteAddress } from "./booking-types";
import { SlotWindow } from "./slot-window";

const TOKEN = /^[A-Za-z0-9_-]{43}$/;

/** The manage token from `#t=…`. Never from the query string: that one reaches server logs. */
function readToken(): string | null {
	const value = new URLSearchParams(window.location.hash.slice(1)).get("t");
	return value && TOKEN.test(value) ? value : null;
}

type Load =
	| { kind: "loading" }
	| { kind: "missing" }
	| { kind: "invalid" }
	| { kind: "error" }
	| { kind: "ready"; appointment: ManagedAppointment };

/**
 * What a patient sees from the email link: the appointment, and what they can still do online
 * (confirm a practice-typed address, move, cancel), each a POST with the token in its body.
 */
export function ManageAppointment() {
	const t = useTranslations("booking.manage");
	const client = useTRPCClient();
	const [token, setToken] = useState<string | null>(null);
	const [load, setLoad] = useState<Load>({ kind: "loading" });

	const fetchAppointment = useCallback(
		async (value: string | null) => {
			if (!value) {
				setLoad({ kind: "missing" });
				return;
			}
			setLoad({ kind: "loading" });
			try {
				const appointment = await client.booking.manage.get.mutate({ token: value });
				setLoad({ kind: "ready", appointment });
			} catch (error) {
				setLoad({ kind: bookingErrorCode(error) === "NOT_FOUND" ? "invalid" : "error" });
			}
		},
		[client],
	);

	useEffect(() => {
		const sync = () => {
			const value = readToken();
			setToken(value);
			void fetchAppointment(value);
		};
		sync();
		window.addEventListener("hashchange", sync);
		return () => window.removeEventListener("hashchange", sync);
	}, [fetchAppointment]);

	switch (load.kind) {
		case "loading":
			return <SkeletonText lines={6} label={t("loading")} />;
		case "missing":
			return (
				<EmptyState
					title={t("missingTitle")}
					description={t("missingBody")}
					action={<SearchLink label={t("searchAction")} />}
				/>
			);
		case "invalid":
			return (
				<EmptyState
					title={t("invalidTitle")}
					description={t("invalidBody")}
					action={<SearchLink label={t("searchAction")} />}
				/>
			);
		case "error":
			return (
				<Notice tone="error" title={t("errorBody")}>
					<Button intent="quiet" onPress={() => void fetchAppointment(token)}>
						{t("retry")}
					</Button>
				</Notice>
			);
		case "ready":
			return token ? (
				<Appointment
					token={token}
					appointment={load.appointment}
					onChanged={(appointment) => setLoad({ kind: "ready", appointment })}
				/>
			) : null;
	}
}

/** The next step when the link leads nowhere: find the practitioner again. */
function SearchLink({ label }: { label: string }) {
	return (
		<Link href="/recherche" className={buttonStyles({ intent: "ink", size: "lg" })}>
			{label}
		</Link>
	);
}

function Appointment({
	token,
	appointment,
	onChanged,
}: {
	token: string;
	appointment: ManagedAppointment;
	onChanged: (appointment: ManagedAppointment) => void;
}) {
	const t = useTranslations("booking.manage");
	const tEmail = useTranslations("booking.email");
	const tTaxonomy = useTranslations("taxonomy");
	const tP = useTranslations("Practitioner");
	const locale = useLocale();
	const client = useTRPCClient();
	const [mode, setMode] = useState<"view" | "reschedule">("view");
	const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
	const [confirmingCancel, setConfirmingCancel] = useState(false);
	const [newSlot, setNewSlot] = useState<number | null>(null);
	const messageRef = useRef<HTMLDivElement>(null);

	const { timeZone, practitioner, site } = appointment;
	const startMs = new Date(appointment.startsAt).getTime();
	const parts = slotParts(startMs, timeZone, locale);
	const title =
		practitioner?.titleCode && tTaxonomy.has(`title.${practitioner.titleCode}` as never)
			? tTaxonomy(`title.${practitioner.titleCode}` as never)
			: null;
	const practitionerName = practitioner
		? [title, practitioner.firstName, practitioner.lastName].filter(Boolean).join(" ")
		: null;
	// A home visit prints its commune, never the street ("À domicile — Lyon").
	const address =
		appointment.location === "home"
			? appointment.homeCommune
				? tEmail("atHomeIn", { commune: appointment.homeCommune })
				: tEmail("atHome")
			: site
				? [site.name, siteAddress(site)].filter(Boolean).join(", ")
				: null;
	const phone = site?.phone ? formatPhoneFr(site.phone) : null;
	const patient = [appointment.patient.firstName, appointment.patient.lastName]
		.filter(Boolean)
		.join(" ");
	const live = appointment.status === "confirmed" || appointment.status === "pending";

	const refresh = async (text: string) => {
		const next = await client.booking.manage.get.mutate({ token });
		onChanged(next);
		setMessage({ tone: "success", text });
		setMode("view");
		setNewSlot(null);
		requestAnimationFrame(() => messageRef.current?.focus());
	};
	const fail = (error: unknown) => {
		const code = bookingErrorCode(error);
		const known = [
			"TRANSITION_REFUSED",
			"RATE_LIMITED",
			"NOT_FOUND",
			"INVALID_SLOT",
			"BOOKING_DISABLED",
		];
		setMessage({
			tone: "error",
			text: t(`errors.${known.includes(code) ? code : "generic"}` as "errors.generic"),
		});
		requestAnimationFrame(() => messageRef.current?.focus());
	};

	const cancel = useMutation({
		mutationFn: () => client.booking.manage.cancel.mutate({ token }),
		onSuccess: () => refresh(t("cancelled")),
		onError: fail,
		onSettled: () => setConfirmingCancel(false),
	});
	const confirmEmail = useMutation({
		mutationFn: () => client.booking.manage.confirm.mutate({ token }),
		onSuccess: () => refresh(t("confirmEmail.done")),
		onError: fail,
	});
	const [taken, setTaken] = useState<Date[] | null>(null);
	const reschedule = useMutation({
		mutationFn: (slotMs: number) =>
			client.booking.manage.reschedule.mutate({ token, startsAt: new Date(slotMs) }),
		onSuccess: (result) => {
			if (result.status === "slot_taken") {
				setTaken(result.alternatives);
				setNewSlot(null);
				return;
			}
			setTaken(null);
			return refresh(t("rescheduled"));
		},
		onError: fail,
	});

	const cutoffHours = appointment.cancellationCutoffMin / 60;
	const cutoffText = Number.isInteger(cutoffHours)
		? t("cutoffPassed", { hours: cutoffHours })
		: t("cutoffPassedMinutes", { minutes: appointment.cancellationCutoffMin });
	const label = (ms: number) => {
		const p = slotParts(ms, timeZone, locale);
		return `${p.dateNoYear}, ${slotTime(p)}`;
	};

	return (
		<div className="flex flex-col gap-8">
			<div ref={messageRef} tabIndex={-1} className="outline-none">
				{message ? (
					<Notice
						tone={message.tone}
						title={message.text}
						role={message.tone === "error" ? "alert" : "status"}
					/>
				) : null}
			</div>

			<section aria-labelledby="appointment-status" className="flex flex-col gap-4">
				<div className="flex flex-wrap items-center gap-3">
					<h2 id="appointment-status" className="type-caption text-ink">
						{t("status.label")}
					</h2>
					{/* Stamp Law: a confirmed appointment is booked; every other state is ink. */}
					<Badge tone={appointment.status === "confirmed" ? "stamp" : "ink"}>
						{t(`status.${appointment.status}` as "status.confirmed")}
					</Badge>
				</div>
				{appointment.status === "pending" && appointment.pendingUntil ? (
					<p className="text-body text-ink">
						{t("pendingUntil", { deadline: label(new Date(appointment.pendingUntil).getTime()) })}
					</p>
				) : null}
				<FieldList>
					<FieldRow
						label={t("rows.with")}
						value={
							practitioner && practitionerName ? (
								<Link
									href={{ pathname: "/praticien/[slug]", params: { slug: practitioner.slug } }}
									className={linkStyles()}
								>
									{practitionerName}
								</Link>
							) : null
						}
						emptyLabel={tP("notProvided")}
					/>
					<FieldRow label={t("rows.date")} value={parts.date} emptyLabel={tP("notProvided")} />
					<FieldRow
						label={t("rows.time")}
						value={<span className="tabular">{slotTime(parts)}</span>}
						emptyLabel={tP("notProvided")}
					/>
					<FieldRow
						label={t("rows.reason")}
						value={appointment.typeName}
						emptyLabel={tP("notProvided")}
					/>
					<FieldRow label={t("rows.place")} value={address} emptyLabel={tP("notProvided")} />
					<FieldRow label={t("rows.patient")} value={patient} emptyLabel={tP("notProvided")} />
				</FieldList>
			</section>

			{appointment.needsConfirmation && live ? (
				<section aria-labelledby="confirm-email" className="flex flex-col gap-3">
					<h2 id="confirm-email" className="type-title text-ink">
						{t("confirmEmail.title")}
					</h2>
					<p className="max-w-[60ch] text-body text-ink">{t("confirmEmail.body")}</p>
					<div>
						<Button
							intent="stamp"
							size="lg"
							isPending={confirmEmail.isPending}
							pendingLabel={t("loading")}
							onPress={() => confirmEmail.mutate()}
						>
							{t("confirmEmail.action")}
						</Button>
					</div>
				</section>
			) : null}

			{live ? (
				<section aria-labelledby="manage-actions" className="flex flex-col gap-4">
					<h2 id="manage-actions" className="type-title text-ink">
						{mode === "reschedule" ? t("rescheduleHeading") : t("actions")}
					</h2>
					{!appointment.canCancel ? (
						<Notice tone="info" role="none" title={t("closedNote")}>
							{cutoffText}
							{phone && site?.phone ? (
								<>
									{" "}
									<a href={`tel:${site.phone}`} className={`${linkStyles()} tabular`}>
										{t("call", { phone })}
									</a>
								</>
							) : null}
						</Notice>
					) : mode === "view" ? (
						<div className="flex flex-wrap gap-3">
							{appointment.canReschedule ? (
								<Button intent="ink" size="lg" onPress={() => setMode("reschedule")}>
									{t("reschedule")}
								</Button>
							) : null}
							<Button intent="ink" size="lg" onPress={() => setConfirmingCancel(true)}>
								{t("cancel")}
							</Button>
						</div>
					) : (
						<div className="flex flex-col gap-5">
							{taken ? (
								<Notice tone="info" role="alert" title={t("errors.INVALID_SLOT")}>
									{taken.length > 0 ? (
										<span className="flex flex-wrap gap-2 pt-1">
											{taken.map((start) => {
												const ms = new Date(start).getTime();
												return (
													<Button
														key={ms}
														intent="ink"
														className="tabular"
														onPress={() => {
															setNewSlot(ms);
															setTaken(null);
														}}
													>
														{label(ms)}
													</Button>
												);
											})}
										</span>
									) : null}
								</Notice>
							) : null}
							<p className="text-meta text-ink">{t("currentLegend", { slot: label(startMs) })}</p>
							<SlotWindow
								current={{
									startMs,
									short: t("currentShort"),
									spoken: t("currentSpoken"),
								}}
								queryKey={["manage", appointment.appointmentId]}
								timeZone={timeZone}
								load={(fromDate, days) =>
									client.booking.manage.slots.mutate({ token, fromDate, days })
								}
								value={newSlot}
								onChange={setNewSlot}
							/>
							<div className="flex flex-wrap-reverse items-center justify-between gap-3 border-t border-rule-soft pt-3">
								<Button
									intent="ink"
									size="lg"
									onPress={() => {
										setMode("view");
										setNewSlot(null);
										setTaken(null);
									}}
								>
									{t("rescheduleCancel")}
								</Button>
								{newSlot !== null ? (
									<Button
										intent="stamp"
										size="lg"
										isPending={reschedule.isPending}
										pendingLabel={t("loading")}
										onPress={() => reschedule.mutate(newSlot)}
									>
										{t("rescheduleSubmit", { slot: label(newSlot) })}
									</Button>
								) : null}
							</div>
						</div>
					)}
				</section>
			) : practitioner ? (
				<p>
					<Link
						href={{ pathname: "/praticien/[slug]", params: { slug: practitioner.slug } }}
						className={`${linkStyles()} inline-flex min-h-11 items-center text-body font-semibold`}
					>
						{t("bookAgain")}
					</Link>
				</p>
			) : null}

			<Dialog
				role="alertdialog"
				isOpen={confirmingCancel}
				onOpenChange={setConfirmingCancel}
				title={t("cancelConfirmTitle")}
				closeLabel={t("cancelKeep")}
			>
				<div className="flex flex-col gap-5">
					<p className="text-body text-ink">{t("cancelConfirmBody")}</p>
					<p className="text-body font-semibold text-ink">
						{parts.dateNoYear}, <span className="tabular">{slotTime(parts)}</span>
					</p>
					<div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between [&>*]:w-full [&>*]:justify-center sm:[&>*]:w-auto">
						<Button intent="ink" size="lg" autoFocus onPress={() => setConfirmingCancel(false)}>
							{t("cancelKeep")}
						</Button>
						<Button
							intent="ink"
							size="lg"
							isPending={cancel.isPending}
							pendingLabel={t("loading")}
							onPress={() => cancel.mutate()}
						>
							{t("cancelConfirm")}
						</Button>
					</div>
				</div>
			</Dialog>
		</div>
	);
}
