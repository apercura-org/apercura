"use client";

import "../astryx/styles";
import { Dialog as AstryxDialog } from "@astryxdesign/core/Dialog";
import { Drawer as AstryxDrawer } from "@astryxdesign/core/Drawer";
import {
	Children,
	cloneElement,
	createContext,
	isValidElement,
	type ReactElement,
	type ReactNode,
	useCallback,
	useContext,
	useId,
	useRef,
	useState,
} from "react";
import { UNSAFE_PortalProvider } from "react-aria";
import { textOf } from "../astryx/text";
import { CloseIcon } from "../icons";
import { cn } from "../recipes";
import { Button } from "./button";

interface OverlayState {
	isOpen: boolean;
	setOpen: (open: boolean) => void;
}

/** The open state a `DialogTrigger` hands to the dialog it holds. */
const OverlayContext = createContext<OverlayState | null>(null);

export interface DialogTriggerProps {
	/** The trigger (a `Button`), then the `Dialog` or `Sheet` it opens. */
	children: ReactNode;
	defaultOpen?: boolean;
	isOpen?: boolean;
	onOpenChange?: (open: boolean) => void;
}

/**
 * Opens the dialog among its children from the other child, a `Button`: a press opens it, and
 * the button says it opens a dialog and whether it is open. Closing gives the focus back to it.
 */
export function DialogTrigger({
	children,
	defaultOpen = false,
	isOpen: isOpenProp,
	onOpenChange,
}: DialogTriggerProps) {
	const [isOpenState, setOpenState] = useState(defaultOpen);
	const isOpen = isOpenProp ?? isOpenState;
	const setOpen = useCallback(
		(open: boolean) => {
			setOpenState(open);
			onOpenChange?.(open);
		},
		[onOpenChange],
	);
	let triggered = false;
	const content = Children.map(children, (child) => {
		if (triggered || !isValidElement(child) || child.type === Dialog || child.type === Sheet) {
			return child;
		}
		triggered = true;
		const trigger = child as ReactElement<{ onPress?: () => void }>;
		return cloneElement(trigger, {
			onPress: () => {
				trigger.props.onPress?.();
				setOpen(true);
			},
			"aria-haspopup": "dialog",
			"aria-expanded": isOpen,
		} as Record<string, unknown>);
	});
	return <OverlayContext value={{ isOpen, setOpen }}>{content}</OverlayContext>;
}

/** The sheet opens from the same trigger as a dialog. */
export const SheetTrigger = DialogTrigger;

interface DialogFrameProps {
	/** Visible title, also the dialog's accessible name. */
	title: ReactNode;
	/** Accessible label of the close button. */
	closeLabel: string;
	children: ReactNode | ((opts: { close: () => void }) => ReactNode);
	/**
	 * Dialogs that must be answered (confirmations) hide the close button and ignore presses
	 * outside them; Escape still cancels.
	 */
	role?: "dialog" | "alertdialog";
	/** Controlled open state; inside a `DialogTrigger`, the trigger holds it. */
	isOpen?: boolean;
	onOpenChange?: (open: boolean) => void;
	defaultOpen?: boolean;
}

function useOverlayState({ isOpen, onOpenChange, defaultOpen }: DialogFrameProps) {
	const fromTrigger = useContext(OverlayContext);
	const [isOpenState, setOpenState] = useState(defaultOpen ?? false);
	const open = isOpen ?? fromTrigger?.isOpen ?? isOpenState;
	const setOpen = useCallback(
		(next: boolean) => {
			setOpenState(next);
			fromTrigger?.setOpen(next);
			onOpenChange?.(next);
		},
		[fromTrigger, onOpenChange],
	);
	return { open, setOpen, close: useCallback(() => setOpen(false), [setOpen]) };
}

/**
 * A modal `<dialog>` sits in the top layer and makes the rest of the page inert: the React Aria
 * overlays opened from inside it (a select's list, a date picker) are portalled into it, at its
 * end, so they show above it and can be used.
 */
function OverlayLayer({ children }: { children: ReactNode }) {
	const layer = useRef<HTMLDivElement>(null);
	return (
		<UNSAFE_PortalProvider getContainer={() => layer.current}>
			{children}
			<div ref={layer} data-overlay-layer="" />
		</UNSAFE_PortalProvider>
	);
}

function Header({
	id,
	title,
	closeLabel,
	close,
	showClose,
}: {
	id: string;
	title: ReactNode;
	closeLabel: string;
	close: () => void;
	showClose: boolean;
}) {
	return (
		<header className="surface-shade flex min-h-14 shrink-0 items-center justify-between gap-4 border-b border-rule-soft ps-5 pe-1.5">
			{/* The title takes the focus when the dialog opens (Astryx's `data-autofocus`), so a
			    screen reader reads it first; it is not in the Tab order. */}
			<h2
				id={id}
				tabIndex={-1}
				data-autofocus="dialog-title"
				className="type-subtitle py-3 outline-none"
			>
				{title}
			</h2>
			{showClose ? (
				<Button
					intent="quiet"
					size="icon"
					onPress={close}
					aria-label={closeLabel}
					className="shrink-0 rounded-field px-0 text-ink no-underline hover:bg-rule-soft"
				>
					<CloseIcon className="size-6" />
				</Button>
			) : null}
		</header>
	);
}

/** Modal dialog, built on Astryx's (a native `<dialog>`): a panel with its title strip on the quiet shade. */
export function Dialog(props: DialogFrameProps) {
	const { title, closeLabel, children, role = "dialog" } = props;
	const { open, setOpen, close } = useOverlayState(props);
	const titleId = useId();
	const isAlert = role === "alertdialog";
	return (
		<AstryxDialog
			isOpen={open}
			onOpenChange={setOpen}
			purpose={isAlert ? "form" : "info"}
			width="min(32rem, calc(100vw - 2rem))"
			maxHeight="calc(100dvh - 2rem)"
			padding={0}
			aria-labelledby={titleId}
			role={role}
			className="overflow-hidden rounded-panel border border-rule-soft bg-paper text-ink shadow-overlay forced-colors:border-[CanvasText]"
		>
			<Header
				id={titleId}
				title={title}
				closeLabel={closeLabel}
				close={close}
				showClose={!isAlert}
			/>
			<OverlayLayer>
				<div className="overflow-auto p-5 text-body">
					{typeof children === "function" ? children({ close }) : children}
				</div>
			</OverlayLayer>
		</AstryxDialog>
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
 * Side sheet (end edge), full height, built on Astryx's drawer: filters, a practitioner's other
 * sites, agenda details, the booking panel. On a phone it is a full-screen page. Escape and the
 * close button dismiss it; focus is trapped inside and returns to where it was.
 */
export function Sheet(props: SheetProps) {
	const { title, closeLabel, children, size = "md" } = props;
	const { open, setOpen, close } = useOverlayState(props);
	const titleId = useId();
	return (
		<AstryxDrawer
			isOpen={open}
			onOpenChange={setOpen}
			label={textOf(title)}
			side="end"
			width={size === "lg" ? "44rem" : "28rem"}
			padding={0}
			experimental={{ isFullWidthOnMobile: true }}
			className={cn(
				"border-0 border-rule-soft bg-paper text-ink shadow-overlay sm:border-s forced-colors:border-[CanvasText]",
			)}
		>
			<OverlayLayer>
				<div className="flex h-full flex-col">
					<Header id={titleId} title={title} closeLabel={closeLabel} close={close} showClose />
					<div data-sheet-body="" className="flex-1 overflow-auto p-5 text-body">
						{typeof children === "function" ? children({ close }) : children}
					</div>
				</div>
			</OverlayLayer>
		</AstryxDrawer>
	);
}
