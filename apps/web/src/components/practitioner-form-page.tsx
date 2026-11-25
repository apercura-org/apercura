import { formatPersonName } from "@apercura/core";
import { linkStyles } from "@apercura/ui";
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

/** A short public form about one page: title, the page it is about, the form. */
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
				<div className="flex max-w-[65ch] flex-col gap-3 border-b border-rule-soft pb-5">
					<h1 className="type-headline text-ink">{title}</h1>
					<p className="text-lead text-ink">{lead}</p>
					{name ? (
						<p className="text-body text-ink">
							{t("about")}{" "}
							<Link
								href={{ pathname: "/praticien/[slug]", params: { slug: page.slug } }}
								className={linkStyles()}
							>
								{name}
							</Link>{" "}
							<span className="text-ink-muted tabular">({page.payload.nationalId})</span>
						</p>
					) : null}
				</div>
				<ClientIsland locale={locale} namespaces={[...GDPR_MESSAGES, ...extraNamespaces]}>
					<TRPCReactProvider>{children}</TRPCReactProvider>
				</ClientIsland>
			</BookletPage>
		</PublicPage>
	);
}
