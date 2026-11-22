"use client";

import { Button } from "@apercura/ui";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

/**
 * Back (ink) and the step's forward action (stamp), kept in reach at the bottom of the sheet. On a
 * phone they stack full width, the forward action first and Back always last; from `sm` Back sits
 * on the left and the action on the right. Long labels wrap instead of overflowing.
 */
export function StepActions({
	onBack,
	primary,
}: {
	onBack: (() => void) | null;
	primary: ReactNode;
}) {
	const t = useTranslations("booking.panel");
	return (
		<div className="sticky -bottom-5 z-40 -mx-5 flex flex-col-reverse gap-3 border-t-[1.5px] border-ink bg-paper px-5 py-3 sm:flex-row sm:items-center sm:justify-between [&>*]:w-full [&>*]:shrink [&>*]:whitespace-normal [&>*]:px-4 [&>*]:py-2.5 [&>*]:text-center [&>*]:text-balance [&>*]:leading-snug sm:[&>*]:w-auto sm:[&>*]:px-7">
			{onBack ? (
				<Button intent="ink" size="lg" onPress={onBack}>
					{t("back")}
				</Button>
			) : (
				<span aria-hidden="true" className="hidden sm:block" />
			)}
			{primary}
		</div>
	);
}
