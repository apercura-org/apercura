"use client";

import { Button } from "@apercura/ui";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

/** Back (ink) and the step's forward action (stamp), kept in reach at the bottom of the sheet. */
export function StepActions({
	onBack,
	primary,
}: {
	onBack: (() => void) | null;
	primary: ReactNode;
}) {
	const t = useTranslations("booking.panel");
	return (
		<div className="sticky -bottom-5 z-40 -mx-5 flex flex-wrap-reverse items-center justify-between gap-3 border-t-[1.5px] border-ink bg-paper px-5 py-3">
			{onBack ? (
				<Button intent="ink" size="lg" onPress={onBack}>
					{t("back")}
				</Button>
			) : (
				<span />
			)}
			{primary}
		</div>
	);
}
