"use client";

import "../astryx/styles";
import { Toast } from "@astryxdesign/core/Toast";
import { useSyncExternalStore } from "react";
import { AstryxIntl } from "../astryx/intl";
import { AlertIcon, CheckIcon, InfoIcon } from "../icons";
import { cn } from "../recipes";

export interface ToastContent {
	title: string;
	description?: string;
	/** `booked` is stamped violet, `error` is ink red, `info` is plain ink. */
	tone?: "info" | "booked" | "error";
}

interface QueuedToast {
	key: string;
	content: ToastContent;
	timeout?: number;
}

/** A small store of the toasts on screen, at most three. */
class ToastQueue {
	private toasts: QueuedToast[] = [];
	private listeners = new Set<() => void>();
	private next = 0;

	add(content: ToastContent, options: { timeout?: number } = {}) {
		const key = `toast-${++this.next}`;
		this.toasts = [...this.toasts, { key, content, timeout: options.timeout }].slice(-3);
		this.emit();
		return key;
	}

	close(key: string) {
		this.toasts = this.toasts.filter((toast) => toast.key !== key);
		this.emit();
	}

	subscribe = (listener: () => void) => {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	};

	snapshot = () => this.toasts;

	private emit() {
		for (const listener of this.listeners) listener();
	}
}

/** App-wide toast queue. Call `toastQueue.add({ title }, { timeout: 6000 })`. */
export const toastQueue = new ToastQueue();

const EMPTY: QueuedToast[] = [];

const toneIcon = {
	info: <InfoIcon className="mt-0.5 size-6 shrink-0" />,
	booked: <CheckIcon className="mt-0.5 size-6 shrink-0 text-stamp" />,
	error: <AlertIcon className="mt-0.5 size-6 shrink-0 text-error" />,
};

const toneEdge = { info: "border-field-edge", booked: "border-stamp", error: "border-error" };

export interface ToastRegionProps {
	/** Accessible label of each toast's close button. */
	closeLabel: string;
	/** Accessible label of the notifications landmark. */
	label: string;
	queue?: ToastQueue;
}

/**
 * Renders queued toasts at the bottom end of the viewport, as a labelled landmark, on Astryx's
 * toast (its own dismiss control and timing; an error stays until dismissed).
 */
export function ToastRegion({ closeLabel, label, queue = toastQueue }: ToastRegionProps) {
	const toasts = useSyncExternalStore(queue.subscribe, queue.snapshot, () => EMPTY);
	return (
		<AstryxIntl extra={{ "@astryx.toast.dismiss": closeLabel }}>
			<section
				aria-label={label}
				className="fixed end-4 bottom-4 z-[60] flex w-[min(26rem,calc(100vw-2rem))] flex-col-reverse gap-2"
			>
				{toasts.map(({ key, content, timeout }) => {
					const tone = content.tone ?? "info";
					return (
						<Toast
							key={key}
							type={tone === "error" ? "error" : "info"}
							isAutoHide={tone === "error" ? false : timeout !== undefined}
							autoHideDuration={timeout ?? 5000}
							onDismiss={() => queue.close(key)}
							body={content.title}
							renderContent={() => (
								<div
									className={cn(
										"flex w-full items-start gap-3 rounded-panel border bg-paper p-4 text-ink",
										toneEdge[tone],
									)}
								>
									{toneIcon[tone]}
									<div className="flex min-w-0 flex-1 flex-col gap-0.5">
										<p className="font-display text-body font-semibold">{content.title}</p>
										{content.description ? (
											<p className="text-meta text-ink-muted">{content.description}</p>
										) : null}
									</div>
								</div>
							)}
						/>
					);
				})}
			</section>
		</AstryxIntl>
	);
}
