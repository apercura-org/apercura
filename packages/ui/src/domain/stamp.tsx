import type { ReactNode } from "react";
import { cn } from "../recipes";

/** The page's state, as an ink treatment of its stamp. */
export type StampInk = "outlined" | "solid" | "hatched";

/** What a page's status looks like as a stamp: unclaimed, claimed (being checked), verified. */
export function stampInkOf(status: "unclaimed" | "claimed" | "verified"): StampInk {
	return status === "verified" ? "solid" : status === "claimed" ? "hatched" : "outlined";
}

export interface StampProps {
	ink: StampInk;
	/** The stamp's face: name, profession, address, register number. */
	children: ReactNode;
	className?: string;
}

/**
 * The practitioner's stamp: a single violet rule with soft corners, set in type. Outlined while
 * the page is unclaimed, solid ink once claimed and verified, a dashed rule over a faint hatch
 * while a claim is checked. The state is always printed in words on the face too, never left to the ink.
 * Styles in `styles/theme.css` (`.stamp`), so a page of stamps costs a few bytes each.
 */
export function Stamp({ ink, children, className }: StampProps) {
	return (
		<div data-ink={ink} className={cn("stamp", className)}>
			<div className="stamp-face">{children}</div>
		</div>
	);
}

/** The foot of a stamp's face: its register number, and the page's state in words. */
export function StampFoot({ children, className }: { children: ReactNode; className?: string }) {
	return (
		<div
			className={cn(
				"type-caption tabular flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 border-t border-current/35 px-4 py-2.5",
				className,
			)}
		>
			{children}
		</div>
	);
}
