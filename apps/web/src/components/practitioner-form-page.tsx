import { formatPersonName, parsePractitionerSegment } from "@apercura/core";
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
import { getPractitionerPage } from "~/server/queries/practitioner";
import { TRPCReactProvider } from "~/trpc/client";

/** The practitioner a form page is about (from the read model), or a 404. */
export async function formPractitioner(slug: string) {
	const segment = parsePractitionerSegment(slug);
	if (!segment) notFound();
	const page = await getPractitionerPage(segment.rpps);
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
	children,
}: {
	locale: Locale;
	page: Awaited<ReturnType<typeof formPractitioner>>;
	pathname: "/praticien/[slug]/signaler" | "/praticien/[slug]/retrait";
	title: string;
	lead: string;
	children: ReactNode;
}) {
	const tSite = await getTranslations({ locale, namespace: "Site" });
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
			<BookletPage runningHead={tSite("runningHead")}>
				<div className="flex max-w-[65ch] flex-col gap-3 border-b-2 border-ink pb-5">
					<h1 className="font-display text-headline font-extrabold tracking-[-0.02em] text-ink font-stretch-semi-expanded">
						{title}
					</h1>
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
				<ClientIsland locale={locale} namespaces={GDPR_MESSAGES}>
					<TRPCReactProvider>{children}</TRPCReactProvider>
				</ClientIsland>
			</BookletPage>
		</PublicPage>
	);
}
