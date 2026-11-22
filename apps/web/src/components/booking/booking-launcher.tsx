"use client";

import dynamic from "next/dynamic";
import { type MouseEvent, useCallback, useEffect, useRef, useState } from "react";

/**
 * The panel (forms, slot grid, proof of work) and the API client it needs load
 * only when a patient asks for it, so neither weighs on the page's first load.
 */
const loadPanel = () => import("./booking-panel-loader");
const BookingPanel = dynamic(() => loadPanel().then((module) => module.BookingPanelWithApi), {
	ssr: false,
});

/** `?rdv=1`: the panel is open. Read on the client only, so the page HTML stays cacheable. */
const PARAM = "rdv";

function urlHasPanel() {
	return new URLSearchParams(window.location.search).has(PARAM);
}

function urlWith(open: boolean) {
	const url = new URL(window.location.href);
	if (open) {
		url.searchParams.set(PARAM, "1");
	} else {
		url.searchParams.delete(PARAM);
	}
	return `${url.pathname}${url.search}${url.hash}`;
}

export interface BookingLauncherProps {
	practitionerId: number;
	practitionerName: string;
	label: string;
	/** "Or call 01 00 00 00 00." when the practice publishes a number. */
	callHint?: string | undefined;
	/**
	 * The stamp's classes, computed on the server (`buttonStyles`), so the style
	 * recipes never ship to the browser with this island.
	 */
	className: string;
}

/**
 * The "Book an appointment" stamp of the action block. A plain link to `?rdv=1` until it
 * hydrates; then it opens the booking panel in place and keeps the URL in step (back closes it).
 */
export function BookingLauncher({
	practitionerId,
	practitionerName,
	label,
	callHint,
	className,
}: BookingLauncherProps) {
	const [open, setOpen] = useState(false);
	const [loaded, setLoaded] = useState(false);
	const pushed = useRef(false);
	const trigger = useRef<HTMLAnchorElement>(null);

	useEffect(() => {
		const sync = () => {
			const wanted = urlHasPanel();
			if (wanted) {
				setLoaded(true);
			}
			setOpen(wanted);
			if (!wanted) {
				pushed.current = false;
			}
		};
		sync();
		window.addEventListener("popstate", sync);
		return () => window.removeEventListener("popstate", sync);
	}, []);

	const show = (event: MouseEvent<HTMLAnchorElement>) => {
		if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
			return;
		}
		event.preventDefault();
		setLoaded(true);
		setOpen(true);
		if (!urlHasPanel()) {
			window.history.pushState(window.history.state, "", urlWith(true));
			pushed.current = true;
		}
	};

	const onOpenChange = useCallback((next: boolean) => {
		setOpen(next);
		if (!next) {
			// Opened from the URL, the sheet has no trigger to give the focus back to: once its exit
			// animation is over and the focus fell to the page, give it to the stamp.
			window.setTimeout(() => {
				if (document.activeElement === document.body || document.activeElement === null) {
					trigger.current?.focus();
				}
			}, 400);
		}
		if (next || !urlHasPanel()) {
			return;
		}
		if (pushed.current) {
			pushed.current = false;
			window.history.back();
		} else {
			window.history.replaceState(window.history.state, "", urlWith(false));
		}
	}, []);

	return (
		<>
			<a
				ref={trigger}
				href={`?${PARAM}=1`}
				onClick={show}
				onPointerEnter={() => void loadPanel()}
				onFocus={() => void loadPanel()}
				aria-haspopup="dialog"
				className={className}
			>
				{label}
			</a>
			{loaded ? (
				<BookingPanel
					practitionerId={practitionerId}
					practitionerName={practitionerName}
					isOpen={open}
					onOpenChange={onOpenChange}
					callHint={callHint}
				/>
			) : null}
		</>
	);
}
