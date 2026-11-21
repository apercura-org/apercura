"use client";

import type { AltchaWidgetElement } from "altcha/types/generic";
import type {} from "altcha/types/react";
import { useLocale, useTranslations } from "next-intl";
import { type Ref, useEffect, useImperativeHandle, useRef } from "react";
import { useTRPCClient } from "~/trpc/client";

export interface AltchaHandle {
	/** The solved proof, solving it first when the widget has not finished yet. */
	solve: () => Promise<string | null>;
	/** A solved challenge buys one hold: forget it and fetch a new one on the next solve. */
	reset: () => void;
}

const STRING_KEYS = [
	"ariaLinkLabel",
	"cancel",
	"enterCode",
	"enterCodeAria",
	"enterCodeFromImage",
	"error",
	"expired",
	"getAudioChallenge",
	"label",
	"loading",
	"reload",
	"verify",
	"verificationRequired",
	"verified",
	"verifying",
	"waitAlert",
] as const;

/**
 * The ALTCHA proof of work (self-hosted widget, no third-party request): a checkbox that ticks
 * itself while the browser solves a challenge signed by our server (`booking.challenge`). It
 * starts when the details step shows, so it is usually done before the patient submits.
 */
export function AltchaCheck({ ref }: { ref?: Ref<AltchaHandle> }) {
	const t = useTranslations("booking.panel.altcha");
	const locale = useLocale();
	const client = useTRPCClient();
	const widget = useRef<AltchaWidgetElement | null>(null);
	const payload = useRef<string | null>(null);
	const ready = useRef<Promise<void> | null>(null);
	const waiters = useRef<((value: string | null) => void)[]>([]);

	useEffect(() => {
		const element = widget.current;
		if (!element) {
			return;
		}
		const onState = (event: Event) => {
			const detail = (event as CustomEvent<{ state: string; payload?: string }>).detail;
			payload.current = detail.state === "verified" ? (detail.payload ?? null) : null;
			if (detail.state === "verified" || detail.state === "error" || detail.state === "expired") {
				for (const resolve of waiters.current.splice(0)) {
					resolve(payload.current);
				}
			}
		};
		element.addEventListener("statechange", onState);
		const language = `apercura-${locale}`;
		const strings = Object.fromEntries(STRING_KEYS.map((key) => [key, t(key)]));
		ready.current = (async () => {
			await import("altcha");
			await customElements.whenDefined("altcha-widget");
			globalThis.$altcha.i18n.set(language, strings);
			await element.configure({
				// Never fetched as is: the custom fetch asks our tRPC endpoint for a signed challenge.
				challenge: "/api/trpc/booking.challenge",
				fetch: Object.assign(
					async () =>
						new Response(JSON.stringify(await client.booking.challenge.query()), {
							headers: { "content-type": "application/json" },
						}),
					{ preconnect: () => undefined },
				),
				language,
				hideFooter: true,
				hideLogo: true,
				humanInteractionSignature: false,
				// Solved as soon as the details step shows: usually done before the patient submits.
				auto: "onload",
				type: "checkbox",
			});
		})();
		return () => element.removeEventListener("statechange", onState);
	}, [client, locale, t]);

	useImperativeHandle(
		ref,
		() => ({
			solve: async () => {
				await ready.current;
				const element = widget.current;
				if (payload.current || !element) {
					return payload.current;
				}
				const done = new Promise<string | null>((resolve) => {
					waiters.current.push(resolve);
					window.setTimeout(() => resolve(null), 60_000);
				});
				if (String(element.getState()) !== "verifying") {
					void element.verify();
				}
				return done;
			},
			reset: () => {
				payload.current = null;
				widget.current?.reset();
			},
		}),
		[],
	);

	return (
		<div className="altcha-booklet">
			{/*
			 * `form` names no form on purpose: the widget's checkbox must not block the native
			 * submit while it is still solving; `solve()` waits for it instead.
			 */}
			<altcha-widget ref={widget} form="altcha-detached" suppressHydrationWarning />
		</div>
	);
}
