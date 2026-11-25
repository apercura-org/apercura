import { linkStyles, Notice } from "@apercura/ui";
import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PractitionerContactForm } from "~/components/practitioner-contact-form";
import { formPractitioner, PractitionerFormPage } from "~/components/practitioner-form-page";
import { Link } from "~/i18n/navigation";
import { type Locale, routing } from "~/i18n/routing";

/** Never a valid RPPS (bad Luhn check): answers 404 without touching the database. */
export function generateStaticParams() {
	return [{ slug: "exemple-10000000008" }];
}

export const instant = false;

type Props = PageProps<"/[locale]/praticien/[slug]/c-est-moi">;

async function localeOf(params: Props["params"]) {
	const { locale, slug } = await params;
	return {
		locale: (hasLocale(routing.locales, locale) ? locale : routing.defaultLocale) as Locale,
		slug,
	};
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { locale } = await localeOf(params);
	const t = await getTranslations({ locale, namespace: "Gdpr.contact" });
	return { title: t("metaTitle"), robots: { index: false, follow: false } };
}

/**
 * "I am this practitioner, contact me", for those who cannot claim their page with Pro Santé
 * Connect, the registry email or a document. A claimed page already has its verified owner:
 * the claim (and its contest) is the way, not this form.
 */
export default async function PractitionerContactPage({ params }: Props) {
	const { locale, slug } = await localeOf(params);
	setRequestLocale(locale);
	const page = await formPractitioner(slug);
	const t = await getTranslations({ locale, namespace: "Gdpr.contact" });
	const rpps = page.payload.nationalId;
	return (
		<PractitionerFormPage
			locale={locale}
			page={page}
			pathname="/praticien/[slug]/c-est-moi"
			title={t("title")}
			lead={t("lead")}
			extraNamespaces={["booking.panel.altcha"]}
		>
			{page.payload.claimStatus === "claimed" ? (
				<Notice tone="info" title={t("claimedTitle")}>
					<span className="flex flex-col gap-2">
						<span>{t("claimedBody")}</span>
						<Link href={{ pathname: "/pro/revendiquer", query: { rpps } }} className={linkStyles()}>
							{t("claimedLink")}
						</Link>
					</span>
				</Notice>
			) : page.payload.withheld ? (
				<Notice tone="info" title={t("withheldTitle")}>
					{t("withheldBody")}
				</Notice>
			) : (
				<div className="flex flex-col gap-6">
					<Notice tone="info" title={t("patientsTitle")} role="none">
						{t("patientsBody")}
					</Notice>
					<p className="max-w-[65ch] text-body text-ink">
						{t("claimFirst")}{" "}
						<Link href={{ pathname: "/pro/revendiquer", query: { rpps } }} className={linkStyles()}>
							{t("claimFirstLink")}
						</Link>
					</p>
					<PractitionerContactForm rpps={rpps} />
				</div>
			)}
		</PractitionerFormPage>
	);
}
