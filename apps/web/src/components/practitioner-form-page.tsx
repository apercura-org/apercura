import { formatPersonName } from "@apercura/core";
import { linkStyles, Stamp, stampInkOf } from "@apercura/ui";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { BookletPage } from "~/components/booklet-page";
import { ClientIsland, GDPR_MESSAGES } from "~/components/client-island";
import { PublicPage } from "~/components/public-page";
import { Link } from "~/i18n/navigation";
import type { Locale } from "~/i18n/routing";
import { getTaxonomyLabels } from "~/lib/labels";
import { identityOf, parsePractitionerKey } from "~/lib/practitioner-key";
import { getPractitionerPage } from "~/server/queries/practitioner";
import { TRPCReactProvider } from "~/trpc/client";

/** The practitioner a form page is about (from the read model, in the locale's market), or a 404. */
export async function formPractitioner(slug: string, locale: Locale) {
	const segment = parsePractitionerKey(locale, slug);
	if (!segment) notFound();
	const page = await getPractitionerPage(identityOf(segment));
	if (!page || page.slug !== slug) notFound();
	return page;
}

/** A short public form about one page: title, the page it is about (its stamp), the form. */
export async function PractitionerFormPage({
	locale,
	page,
	pathname,
	title,
	lead,
	extraNamespaces = [],
	children,
}: {
	locale: Locale;
	page: Awaited<ReturnType<typeof formPractitioner>>;
	pathname:
		| "/praticien/[slug]/signaler"
		| "/praticien/[slug]/retrait"
		| "/praticien/[slug]/c-est-moi";
	title: string;
	lead: string;
	/** Messages the form needs beyond `Gdpr` (the ALTCHA widget's). */
	extraNamespaces?: readonly string[];
	children: ReactNode;
}) {
	const t = await getTranslations({ locale, namespace: "Gdpr" });
	const tP = await getTranslations({ locale, namespace: "Practitioner" });
	const claimStatus = page.payload.claimStatus;
	const status =
		claimStatus === "claimed" ? "verified" : claimStatus === "pending" ? "claimed" : "unclaimed";
	const labels = await getTaxonomyLabels(locale);
	const name = page.payload.withheld
		? null
		: labels.personName({
				...page.payload,
				lastName: formatPersonName(page.payload.lastName, { familyName: true }),
			});
	return (
		<PublicPage locale={locale} href={{ pathname, params: { slug: page.slug } }}>
			<BookletPage>
				<div className="rule-b flex flex-col gap-4 pb-6">
					<div className="flex max-w-[65ch] flex-col gap-3">
						<h1 className="type-headline text-ink">{title}</h1>
						<p className="text-lead text-ink">{lead}</p>
					</div>
					{name ? (
						// The page it is about, as its stamp: inked as the page's state, which it prints in words.
						<Stamp ink={stampInkOf(status)} className="w-fit max-w-full">
							<p className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-4 py-2.5 text-body">
								<span>{t("about")}</span>
								<Link
									href={{ pathname: "/praticien/[slug]", params: { slug: page.slug } }}
									className={linkStyles({ className: "font-semibold text-current" })}
								>
									{name}
								</Link>
								<span className="tabular text-meta">{page.payload.nationalId}</span>
								<span className="type-caption">{tP(`status.${status}`)}</span>
							</p>
						</Stamp>
					) : null}
				</div>
				<ClientIsland locale={locale} namespaces={[...GDPR_MESSAGES, ...extraNamespaces]}>
					<TRPCReactProvider>{children}</TRPCReactProvider>
				</ClientIsland>
			</BookletPage>
		</PublicPage>
	);
}
