"use client";

import type { ReactNode } from "react";
import {
	type DialogTriggerProps,
	Heading,
	Modal,
	ModalOverlay,
	type ModalOverlayProps,
	Button as RACButton,
	Dialog as RACDialog,
	DialogTrigger as RACDialogTrigger,
} from "react-aria-components";
import { CloseIcon } from "../icons";
import { cn, focusRing } from "../recipes";

export function DialogTrigger(props: DialogTriggerProps) {
	return <RACDialogTrigger {...props} />;
}

/** The sheet opens from the same trigger as a dialog. */
export const SheetTrigger = DialogTrigger;

interface DialogFrameProps extends Omit<ModalOverlayProps, "children" | "className"> {
	/** Visible title, also the dialog's accessible name. */
	title: ReactNode;
	/** Accessible label of the close button. */
	closeLabel: string;
	children: ReactNode | ((opts: { close: () => void }) => ReactNode);
	/** Dialogs that must be answered (confirmations) hide the close button and ignore outside clicks. */
	role?: "dialog" | "alertdialog";
}

const overlay =
	"fixed inset-0 z-50 flex bg-ink/45 data-entering:animate-[fade-in_160ms_ease-out] data-exiting:animate-[fade-in_120ms_ease-in_reverse]";

function Header({
	title,
	closeLabel,
	close,
	showClose,
}: {
	title: ReactNode;
	closeLabel: string;
	close: () => void;
	showClose: boolean;
}) {
	return (
		<header className="surface-cover flex min-h-14 items-center justify-between gap-4 ps-5 pe-1.5">
			<Heading
				slot="title"
				className="py-3 font-display text-lead font-bold font-stretch-semi-expanded"
			>
				{title}
			</Heading>
			{showClose ? (
				<RACButton
					onPress={close}
					aria-label={closeLabel}
					className={cn(
						"flex size-11 shrink-0 cursor-pointer items-center justify-center text-cover-ink hover:bg-paper hover:text-ink",
						focusRing,
					)}
				>
					<CloseIcon className="size-6" />
				</RACButton>
			) : null}
		</header>
	);
}

/** Modal dialog: a paper slip with a cover-band title strip. */
export function Dialog({
	title,
	closeLabel,
	children,
	role = "dialog",
	...props
}: DialogFrameProps) {
	const isAlert = role === "alertdialog";
	return (
		<ModalOverlay
			{...props}
			isDismissable={!isAlert}
			className={cn(overlay, "items-center justify-center p-4")}
		>
			<Modal className="w-full max-w-lg border-[1.5px] border-ink bg-paper data-entering:animate-slip-in forced-colors:border-[CanvasText]">
				<RACDialog role={role} className="flex max-h-[calc(100dvh-2rem)] flex-col outline-none">
					{({ close }) => (
						<>
							<Header title={title} closeLabel={closeLabel} close={close} showClose={!isAlert} />
							<div className="overflow-auto p-5 text-body">
								{typeof children === "function" ? children({ close }) : children}
							</div>
						</>
					)}
				</RACDialog>
			</Modal>
		</ModalOverlay>
	);
}

export interface SheetProps extends Omit<DialogFrameProps, "role"> {
	/**
	 * `md` (28 rem) for short forms; `lg` (44 rem) for tasks that need room, such as booking with
	 * the slot grid. Below the width the sheet covers the whole screen.
	 */
	size?: "md" | "lg";
}

/**
 * Side sheet (end edge), full height: filters, a practitioner's other sites, agenda details, the
 * booking panel. On a phone it is a full-screen page. Escape and the close button dismiss it;
 * focus is trapped inside and returns to the trigger.
 */
export function Sheet({ title, closeLabel, children, size = "md", ...props }: SheetProps) {
	return (
		<ModalOverlay {...props} isDismissable className={cn(overlay, "justify-end")}>
			<Modal
				className={cn(
					"h-dvh w-full border-ink bg-paper data-entering:animate-sheet-in sm:border-s-[1.5px] forced-colors:border-[CanvasText]",
					size === "lg" ? "max-w-176" : "max-w-md",
				)}
			>
				<RACDialog className="flex h-full flex-col outline-none">
					{({ close }) => (
						<>
							<Header title={title} closeLabel={closeLabel} close={close} showClose />
							<div className="flex-1 overflow-auto p-5 text-body">
								{typeof children === "function" ? children({ close }) : children}
							</div>
						</>
					)}
				</RACDialog>
			</Modal>
		</ModalOverlay>
	);
}
