"use client";

import {
	Button as RACButton,
	UNSTABLE_Toast as RACToast,
	UNSTABLE_ToastContent as RACToastContent,
	UNSTABLE_ToastQueue as RACToastQueue,
	UNSTABLE_ToastRegion as RACToastRegion,
	Text,
} from "react-aria-components";
import { AlertIcon, CheckIcon, CloseIcon, InfoIcon } from "../icons";
import { cn, focusRing } from "../recipes";
import { tv } from "../recipes/tv";

export interface ToastContent {
	title: string;
	description?: string;
	/** `booked` is stamped violet, `error` is ink red, `info` is plain ink. */
	tone?: "info" | "booked" | "error";
}

/** App-wide toast queue. Call `toastQueue.add({ title }, { timeout: 6000 })`. */
export const toastQueue = new RACToastQueue<ToastContent>({ maxVisibleToasts: 3 });

const toast = tv({
	base: "flex w-full items-start gap-3 border-2 bg-paper p-4 text-ink outline-none data-focus-visible:outline-3 data-focus-visible:outline-offset-2 data-focus-visible:outline-(--focus-ring) forced-colors:border-[CanvasText]",
	variants: {
		tone: {
			info: "border-ink",
			booked: "border-stamp",
			error: "border-error",
		},
	},
	defaultVariants: { tone: "info" },
});

const toneIcon = {
	info: <InfoIcon className="mt-0.5 size-6 shrink-0" />,
	booked: <CheckIcon className="mt-0.5 size-6 shrink-0 text-stamp" />,
	error: <AlertIcon className="mt-0.5 size-6 shrink-0 text-error" />,
};

export interface ToastRegionProps {
	/** Accessible label of each toast's close button. */
	closeLabel: string;
	/** Accessible label of the notifications landmark. */
	label: string;
	queue?: RACToastQueue<ToastContent>;
}

/** Renders queued toasts at the bottom end of the viewport, as a labelled landmark. */
export function ToastRegion({ closeLabel, label, queue = toastQueue }: ToastRegionProps) {
	return (
		<RACToastRegion
			queue={queue}
			aria-label={label}
			className="fixed end-4 bottom-4 z-[60] flex w-[min(26rem,calc(100vw-2rem))] flex-col-reverse gap-2 outline-none"
		>
			{({ toast: item }) => {
				const tone = item.content.tone ?? "info";
				return (
					<RACToast toast={item} className={toast({ tone })}>
						{toneIcon[tone]}
						<RACToastContent className="flex min-w-0 flex-1 flex-col gap-0.5">
							<Text slot="title" className="font-display text-body font-bold">
								{item.content.title}
							</Text>
							{item.content.description ? (
								<Text slot="description" className="text-meta text-ink-muted">
									{item.content.description}
								</Text>
							) : null}
						</RACToastContent>
						<RACButton
							slot="close"
							aria-label={closeLabel}
							className={cn(
								"-me-2 -mt-2 flex size-11 shrink-0 cursor-pointer items-center justify-center text-ink hover:bg-paper-shade",
								focusRing,
							)}
						>
							<CloseIcon className="size-5" />
						</RACButton>
					</RACToast>
				);
			}}
		</RACToastRegion>
	);
}
