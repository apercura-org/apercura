"use client";

import { Button, EmptyState, Notice, Sheet, SkeletonText } from "@apercura/ui";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useTRPC, useTRPCClient } from "~/trpc/client";
import { type BookingResult, type BookingState, EMPTY_DETAILS, type Step } from "./booking-state";
import { CodeStep, DetailsStep, DoneStep, ReasonStep, TakenStep } from "./booking-steps";
import type { BookingCalendar, BookingType } from "./booking-types";
import { SlotWindow } from "./slot-window";
import { StepActions } from "./step-actions";

const initialState: BookingState = {
	step: "reason",
	calendarId: null,
	typeId: null,
	slotMs: null,
	details: EMPTY_DETAILS,
	hold: null,
	result: null,
	alternatives: [],
	notice: null,
};

export interface BookingPanelProps {
	practitionerId: number;
	/** "Dr Exemple Martin". */
	practitionerName: string;
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
	/** "or call 01 00 00 00 00", shown when no time is free. */
	callHint?: string | undefined;
}

/**
 * Booking without leaving the practitioner's page: reason → time → details → 6-digit code →
 * confirmation. A side sheet on desktop, a full-screen page on a phone. Its state survives
 * closing (a patient who closes it to look at the page finds their step again); a finished
 * booking starts over on the next opening.
 */
export function BookingPanel({
	practitionerId,
	practitionerName,
	isOpen,
	onOpenChange,
	callHint,
}: BookingPanelProps) {
	const t = useTranslations("booking.panel");
	const trpc = useTRPC();
	const client = useTRPCClient();
	const [state, setState] = useState<BookingState>(initialState);
	const update = (patch: Partial<BookingState>) =>
		setState((current) => ({ ...current, ...patch }));

	const options = useQuery({
		...trpc.booking.options.queryOptions({ practitionerId }),
		enabled: isOpen,
		staleTime: 60_000,
	});
	const calendars = options.data?.calendars ?? [];
	const calendar: BookingCalendar | undefined =
		calendars.find((item) => item.id === state.calendarId) ?? undefined;
	const type: BookingType | undefined = calendar?.types.find((item) => item.id === state.typeId);
	const onlyChoice =
		calendars.length === 1 && calendars[0]?.types.length === 1 ? calendars[0] : undefined;

	// One calendar with one reason: nothing to choose, start at the time.
	useEffect(() => {
		const only = onlyChoice?.types[0];
		if (onlyChoice && only && state.step === "reason" && state.calendarId === null) {
			setState((current) => ({
				...current,
				calendarId: onlyChoice.id,
				typeId: only.id,
				step: "slot",
			}));
		}
	}, [onlyChoice, state.step, state.calendarId]);

	// Each step announces itself: focus moves to its heading.
	const heading = useRef<HTMLHeadingElement>(null);
	const previousStep = useRef<Step | null>(null);
	useEffect(() => {
		if (!isOpen) {
			previousStep.current = null;
			return;
		}
		// The code step puts the focus straight into the code field (its label says what to type).
		if (
			previousStep.current !== null &&
			previousStep.current !== state.step &&
			state.step !== "code"
		) {
			heading.current?.focus();
		}
		previousStep.current = state.step;
	}, [state.step, isOpen]);

	const steps: Step[] = onlyChoice
		? ["slot", "details", "code"]
		: ["reason", "slot", "details", "code"];
	const stepIndex = steps.indexOf(state.step === "taken" ? "slot" : state.step);
	const stepName: Record<Step, string> = {
		reason: t("steps.reason"),
		slot: t("steps.slot"),
		details: t("steps.details"),
		code: t("steps.code"),
		done: t("steps.done"),
		taken: t("steps.slot"),
	};

	const releaseHold = () => {
		if (state.hold) {
			const { holdId, holdToken } = state.hold;
			// Going back frees the time at once; a failure only leaves it to expire on its own.
			void client.booking.release.mutate({ holdId, holdToken }).catch(() => undefined);
		}
	};

	const restart = () => {
		releaseHold();
		update({ step: "slot", slotMs: null, hold: null, alternatives: [], notice: null });
	};

	const close = (open: boolean) => {
		if (!open && state.step === "done") {
			setState(initialState);
		}
		onOpenChange(open);
	};

	let body: ReactNode;
	if (options.isError) {
		body = (
			<Notice tone="error" title={t("loadError")}>
				<Button intent="quiet" onPress={() => void options.refetch()}>
					{t("retry")}
				</Button>
			</Notice>
		);
	} else if (!options.data) {
		body = <SkeletonText lines={5} label={t("loading")} />;
	} else if (calendars.length === 0) {
		body = (
			<EmptyState
				title={t("unavailableTitle")}
				description={callHint ? `${t("unavailableBody")} ${callHint}` : t("unavailableBody")}
			/>
		);
	} else if (state.step === "reason") {
		body = (
			<ReasonStep
				calendars={calendars}
				calendarId={state.calendarId}
				typeId={state.typeId}
				onSubmit={(calendarId, typeId) =>
					update({ calendarId, typeId, slotMs: null, step: "slot", notice: null })
				}
			/>
		);
	} else if (state.step === "slot" && calendar && type) {
		body = (
			<SlotStep
				calendar={calendar}
				type={type}
				slotMs={state.slotMs}
				callHint={callHint}
				onChange={(slotMs) => update({ slotMs })}
				onBack={onlyChoice ? null : () => update({ step: "reason" })}
				onSubmit={() => update({ step: "details", notice: null })}
			/>
		);
	} else if (state.step === "details" && calendar && type && state.slotMs !== null) {
		body = (
			<DetailsStep
				calendar={calendar}
				type={type}
				practitionerName={practitionerName}
				slotMs={state.slotMs}
				details={state.details}
				notice={state.notice}
				onBack={() => update({ step: "slot", notice: null })}
				onDetails={(details) => update({ details })}
				onHeld={(hold) => update({ hold, step: "code", notice: null })}
				onTaken={(alternatives) => update({ alternatives, step: "taken", notice: null })}
			/>
		);
	} else if (state.step === "code" && calendar && type && state.slotMs !== null && state.hold) {
		body = (
			<CodeStep
				calendar={calendar}
				type={type}
				practitionerName={practitionerName}
				slotMs={state.slotMs}
				email={state.details.email}
				hold={state.hold}
				onResent={(sentAt) => setState((s) => (s.hold ? { ...s, hold: { ...s.hold, sentAt } } : s))}
				onBack={() => {
					releaseHold();
					update({ step: "details", hold: null });
				}}
				onRestart={restart}
				onDone={(result) => update({ result, step: "done", hold: null })}
				onTaken={(alternatives) =>
					update({ alternatives, step: "taken", hold: null, notice: null })
				}
			/>
		);
	} else if (state.step === "taken" && calendar) {
		body = (
			<TakenStep
				timeZone={calendar.timeZone}
				alternatives={state.alternatives}
				onPick={(slotMs, notice) => update({ slotMs, step: "details", notice })}
				onAgenda={() => update({ step: "slot", slotMs: null, alternatives: [] })}
			/>
		);
	} else if (state.step === "done" && calendar && type && state.result) {
		body = (
			<DoneStep
				calendar={calendar}
				type={type}
				practitionerName={practitionerName}
				email={state.details.email}
				result={state.result}
				onClose={() => close(false)}
			/>
		);
	} else {
		body = <SkeletonText lines={5} label={t("loading")} />;
	}

	return (
		<Sheet
			isOpen={isOpen}
			onOpenChange={close}
			title={t("title")}
			closeLabel={t("close")}
			size="lg"
		>
			<div className="flex flex-col gap-6">
				<div className="flex flex-col gap-1 border-b-[1.5px] border-ink pb-3">
					<p className="font-display text-lead font-bold text-ink">
						{t("with", { practitioner: practitionerName })}
					</p>
					{state.step !== "done" && stepIndex >= 0 && options.data && calendars.length > 0 ? (
						<p className="caps text-ink">
							{t("step", {
								current: stepIndex + 1,
								total: steps.length,
								name: stepName[state.step],
							})}
						</p>
					) : null}
				</div>
				<StepHeading ref={heading} step={state.step} result={state.result} />
				{body}
			</div>
		</Sheet>
	);
}

function StepHeading({
	ref,
	step,
	result,
}: {
	ref: React.Ref<HTMLHeadingElement>;
	step: Step;
	result: BookingResult | null;
}) {
	const t = useTranslations("booking.panel");
	const titles: Record<Step, string> = {
		reason: t("reason.heading"),
		slot: t("slot.heading"),
		details: t("details.heading"),
		code: t("code.heading"),
		taken: t("taken.title"),
		done: result?.status === "pending" ? t("done.pendingTitle") : t("done.confirmedTitle"),
	};
	return (
		<h3
			ref={ref}
			tabIndex={-1}
			className="font-display text-title font-bold text-ink outline-none font-stretch-semi-expanded"
		>
			{titles[step]}
		</h3>
	);
}

function SlotStep({
	calendar,
	type,
	slotMs,
	callHint,
	onChange,
	onBack,
	onSubmit,
}: {
	calendar: BookingCalendar;
	type: BookingType;
	slotMs: number | null;
	callHint?: string | undefined;
	onChange: (slotMs: number) => void;
	onBack: (() => void) | null;
	onSubmit: () => void;
}) {
	const t = useTranslations("booking.panel");
	const client = useTRPCClient();
	const [missing, setMissing] = useState(false);
	return (
		<div className="flex flex-col gap-6">
			<SlotWindow
				queryKey={["booking", calendar.id, type.id]}
				timeZone={calendar.timeZone}
				load={(fromDate, days) =>
					client.booking.slots.query({ calendarId: calendar.id, typeId: type.id, fromDate, days })
				}
				value={slotMs}
				onChange={(ms) => {
					setMissing(false);
					onChange(ms);
				}}
				emptyHint={callHint}
			/>
			{missing ? <Notice tone="error" title={t("slot.required")} /> : null}
			<StepActions
				onBack={onBack}
				primary={
					<Button
						intent="stamp"
						size="lg"
						onPress={() => (slotMs === null ? setMissing(true) : onSubmit())}
					>
						{t("continue")}
					</Button>
				}
			/>
		</div>
	);
}
