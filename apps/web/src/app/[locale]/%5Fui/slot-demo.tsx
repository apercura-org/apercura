"use client";

import { type SlotDay, SlotPicker } from "@apercura/ui";
import { useLocale, useTranslations } from "next-intl";
import { useMemo } from "react";
import { SAMPLE_DAYS, SAMPLE_NOW } from "./fixtures";

/** Client wrapper: formats the fictitious slots for the page locale and wires the announcements. */
export function SlotDemo({ defaultValue = null }: { defaultValue?: string | null }) {
	const t = useTranslations("Practitioner.slots");
	const locale = useLocale();

	const days = useMemo<SlotDay[]>(() => {
		const short = new Intl.DateTimeFormat(locale, {
			weekday: "short",
			day: "numeric",
			month: "short",
			timeZone: "Europe/Paris",
		});
		const long = new Intl.DateTimeFormat(locale, {
			weekday: "long",
			day: "numeric",
			month: "long",
			timeZone: "Europe/Paris",
		});
		return SAMPLE_DAYS.map((day) => {
			const date = new Date(`${day.date}T12:00:00+01:00`);
			return {
				date: day.date,
				label: short.format(date),
				// The printed 24-hour time is part of the spoken label, so both read the same (WCAG 2.5.3).
				slots: day.slots.map((slot) => ({
					...slot,
					accessibleLabel: t("slotLabel", { day: long.format(date), time: slot.time }),
				})),
			};
		});
	}, [locale, t]);

	return (
		<SlotPicker
			days={days}
			label={t("label")}
			defaultValue={defaultValue}
			initialNow={SAMPLE_NOW}
			nowLabel={t("now")}
			unavailableLabel={t("unavailable")}
			pastLabel={t("past")}
			emptyDayLabel={t("emptyDay")}
			announceSelection={(slot) => t("selected", { slot: slot.accessibleLabel })}
		/>
	);
}
