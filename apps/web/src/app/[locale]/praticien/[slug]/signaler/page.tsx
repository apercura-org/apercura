import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { ReportForm } from "~/components/gdpr-forms";
import { formPractitioner, PractitionerFormPage } from "~/components/practitioner-form-page";

import { type Locale, routing } from "~/i18n/routing";
import { practitionerRefOf } from "~/lib/practitioner-ref";

/** Never a valid RPPS (bad Luhn check): answers 404 without touching the database. */
export function generateStaticParams() {
	return [{ slug: "exemple-10000000008" }];
}

export const instant = false;

type Props = PageProps<"/[locale]/praticien/[slug]/signaler">;

async function localeOf(params: Props["params"]) {
	const { locale, slug } = await params;
	return {
		locale: (hasLocale(routing.locales, locale) ? locale : routing.defaultLocale) as Locale,
		slug,
	};
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { locale } = await localeOf(params);
	const t = await getTranslations({ locale, namespace: "Gdpr.report" });
	return { title: t("metaTitle"), robots: { index: false, follow: false } };
}

export default async function ReportPage({ params }: Props) {
	const { locale, slug } = await localeOf(params);
	setRequestLocale(locale);
	const page = await formPractitioner(slug, locale);
	const t = await getTranslations({ locale, namespace: "Gdpr.report" });
	return (
		<PractitionerFormPage
			locale={locale}
			page={page}
			pathname="/praticien/[slug]/signaler"
			title={t("title")}
			lead={t("lead")}
		>
			<ReportForm reference={practitionerRefOf(page.payload)} />
		</PractitionerFormPage>
	);
}
