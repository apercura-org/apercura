import { linkStyles, Notice } from "@apercura/ui";
import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { RemovalForm } from "~/components/gdpr-forms";
import { formPractitioner, PractitionerFormPage } from "~/components/practitioner-form-page";
import { Link } from "~/i18n/navigation";
import { type Locale, routing } from "~/i18n/routing";

/** Never a valid RPPS (bad Luhn check): answers 404 without touching the database. */
export function generateStaticParams() {
	return [{ slug: "exemple-10000000008" }];
}

export const instant = false;

type Props = PageProps<"/[locale]/praticien/[slug]/retrait">;

async function localeOf(params: Props["params"]) {
	const { locale, slug } = await params;
	return {
		locale: (hasLocale(routing.locales, locale) ? locale : routing.defaultLocale) as Locale,
		slug,
	};
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { locale } = await localeOf(params);
	const t = await getTranslations({ locale, namespace: "Gdpr.removal" });
	return { title: t("metaTitle"), robots: { index: false, follow: false } };
}

export default async function RemovalPage({ params }: Props) {
	const { locale, slug } = await localeOf(params);
	setRequestLocale(locale);
	const page = await formPractitioner(slug);
	const t = await getTranslations({ locale, namespace: "Gdpr.removal" });
	return (
		<PractitionerFormPage
			locale={locale}
			page={page}
			pathname="/praticien/[slug]/retrait"
			title={t("title")}
			lead={t("lead")}
		>
			{page.payload.claimStatus === "claimed" ? (
				<Notice tone="info" title={t("claimedTitle")}>
					<span className="flex flex-col gap-2">
						<span>{t("claimedBody")}</span>
						{/* Signed in, the owner lands on the editor, whose last section removes the page;
						    signed out, the practitioner space asks to sign in first. */}
						<Link href={{ pathname: "/pro/page", hash: "editor-remove" }} className={linkStyles()}>
							{t("claimedLink")}
						</Link>
					</span>
				</Notice>
			) : page.payload.withheld ? (
				<Notice tone="info" title={t("alreadyTitle")}>
					{t("alreadyBody")}
				</Notice>
			) : (
				<RemovalForm rpps={page.payload.nationalId} />
			)}
		</PractitionerFormPage>
	);
}
