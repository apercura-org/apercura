import { formatPersonName } from "@apercura/core";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { z } from "zod";
import { ClaimWorkspace } from "~/components/pro/claim-workspace";
import { ProShell } from "~/components/pro/pro-shell";
import { ProShellFallback } from "~/components/pro/pro-shell-fallback";
import type { Locale } from "~/i18n/routing";
import { getTaxonomyLabels } from "~/lib/labels";
import { NO_INDEX, resolveLocale } from "~/lib/locale";
import { PRO_ROUTES } from "~/lib/pro-routes";
import { requireProAccess } from "~/server/auth/guard";
import { caller } from "~/trpc/server";

export const instant = false;

type Props = PageProps<"/[locale]/pro/revendiquer/[id]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const locale = resolveLocale((await params).locale);
	const t = await getTranslations({ locale, namespace: "Claim.metadata" });
	return { title: t("claim"), robots: NO_INDEX };
}

const PSC_OUTCOMES = ["verified", "passed", "mismatch", "linkedElsewhere", "error"] as const;
type PscOutcome = (typeof PSC_OUTCOMES)[number];

async function Workspace({
	locale,
	id,
	psc,
}: {
	locale: Locale;
	id: string;
	psc: PscOutcome | null;
}) {
	await requireProAccess(locale, ["ready"]);
	if (!z.uuid().safeParse(id).success) notFound();
	const t = await getTranslations({ locale, namespace: "Claim" });
	const labels = await getTaxonomyLabels(locale);
	const data = await caller.claims.get({ claimId: id }).catch(() => null);
	if (!data) notFound();
	const name = labels.personName({
		...data.practitioner,
		lastName: formatPersonName(data.practitioner.lastName, { familyName: true }),
	});
	return (
		<ProShell
			locale={locale}
			current={PRO_ROUTES.claimStart}
			title={t("workspace.title", { name })}
			lead={t(`workspace.lead.${data.claim.status as "open"}`)}
		>
			<ClaimWorkspace data={data} pscOutcome={psc} locale={locale} />
		</ProShell>
	);
}

export default async function ClaimPage({ params, searchParams }: Props) {
	const { locale: requested, id } = await params;
	const locale = resolveLocale(requested);
	setRequestLocale(locale);
	return (
		<Suspense fallback={<ProShellFallback locale={locale} />}>
			<WithOutcome locale={locale} id={id} searchParams={searchParams} />
		</Suspense>
	);
}

async function WithOutcome({
	locale,
	id,
	searchParams,
}: {
	locale: Locale;
	id: string;
	searchParams: Props["searchParams"];
}) {
	const query = await searchParams;
	const value =
		query.error === "account_already_linked_to_different_user" ? "linkedElsewhere" : query.psc;
	const psc = (PSC_OUTCOMES as readonly string[]).includes(String(value))
		? (value as PscOutcome)
		: null;
	return <Workspace locale={locale} id={id} psc={psc} />;
}
