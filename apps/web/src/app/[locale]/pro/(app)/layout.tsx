import type { Metadata } from "next";
import { type ReactNode, Suspense } from "react";
import { ProShellFallback } from "~/components/pro/pro-shell-fallback";
import type { Locale } from "~/i18n/routing";
import { NO_INDEX, resolveLocale } from "~/lib/locale";
import { requireProAccess } from "~/server/auth/guard";

// Personal, per-request pages: they read the session and may redirect, so they
// are never part of an instant (prefetched) navigation.
export const instant = false;

export const metadata: Metadata = { robots: NO_INDEX };

/**
 * The practitioner space. Until the account has a second factor (and this
 * session has proved it), every page here sends the visitor to sign in, to
 * confirm the factor or to enrol one. Pages check again (layouts are not
 * re-rendered on client navigation), and so does every tRPC procedure.
 */
async function Gate({ locale, children }: { locale: Locale; children: ReactNode }) {
	await requireProAccess(locale, ["ready"]);
	return children;
}

export default async function ProAppLayout({
	children,
	params,
}: {
	children: ReactNode;
	params: Promise<{ locale: string }>;
}) {
	const locale = resolveLocale((await params).locale);
	return (
		<Suspense fallback={<ProShellFallback locale={locale} />}>
			<Gate locale={locale}>{children}</Gate>
		</Suspense>
	);
}
