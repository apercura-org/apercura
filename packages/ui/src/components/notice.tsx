import type { ReactNode } from "react";
import { AlertIcon, CheckIcon, InfoIcon } from "../icons";
import { tv } from "../recipes/tv";

const notice = tv({
	base: "flex items-start gap-3 border bg-paper px-4 py-3.5 text-body text-ink",
	variants: {
		tone: {
			/** Plain information: a quiet edge on the neutral shade. */
			info: "border-field-edge bg-paper-shade",
			/** Something worked (a factor enrolled, an email sent): ink edge and a tick. */
			success: "border-ink",
			/** Errors only: red edge and the boxed exclamation, the words stay ink. */
			error: "border-error bg-error-tint",
		},
	},
	defaultVariants: { tone: "info" },
});

const icons = {
	info: <InfoIcon className="mt-0.5 size-6 shrink-0" />,
	success: <CheckIcon className="mt-0.5 size-6 shrink-0" />,
	error: <AlertIcon className="mt-0.5 size-6 shrink-0 text-error" />,
};

export interface NoticeProps {
	tone?: "info" | "success" | "error";
	/** Short first line, printed in bold. */
	title?: string;
	children?: ReactNode;
	/**
	 * Live region role. Errors default to `alert`, other tones to `status`, so a
	 * notice that appears after an action is announced.
	 */
	role?: "alert" | "status" | "none";
	className?: string;
}

/**
 * A printed slip that tells the reader what just happened and what to do next.
 * Meaning is carried by the icon and the words, never by colour alone.
 */
export function Notice({ tone = "info", title, children, role, className }: NoticeProps) {
	const liveRole = role ?? (tone === "error" ? "alert" : "status");
	return (
		<div role={liveRole === "none" ? undefined : liveRole} className={notice({ tone, className })}>
			{icons[tone]}
			<div className="flex min-w-0 flex-col gap-1">
				{title ? <p className="font-display text-meta font-semibold text-ink">{title}</p> : null}
				{children ? <div className="text-meta text-ink">{children}</div> : null}
			</div>
		</div>
	);
}
