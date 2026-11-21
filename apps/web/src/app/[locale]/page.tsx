import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "~/i18n/navigation";
import { routing } from "~/i18n/routing";

const PILLARS = ["free", "openSource", "hostedInFrance", "selfHostable"] as const;

export default async function HomePage({ params }: PageProps<"/[locale]">) {
	const { locale: requested } = await params;
	const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
	setRequestLocale(locale);

	const t = await getTranslations({ locale, namespace: "HomePage" });
	const tLocale = await getTranslations({ locale, namespace: "LocaleSwitcher" });

	return (
		<>
			<header className="p-4">
				<nav aria-label={tLocale("label")}>
					<ul className="flex gap-4">
						{routing.locales.map((other) => (
							<li key={other}>
								<Link
									href="/"
									locale={other}
									hrefLang={other}
									aria-current={other === locale ? "page" : undefined}
								>
									{tLocale("locale", { locale: other })}
								</Link>
							</li>
						))}
					</ul>
				</nav>
			</header>
			<main className="mx-auto max-w-2xl p-4">
				<h1 className="text-3xl font-bold">{t("title")}</h1>
				<p>{t("tagline")}</p>
				<section aria-labelledby="pillars-heading" className="mt-8">
					<h2 id="pillars-heading" className="text-xl font-semibold">
						{t("pillarsHeading")}
					</h2>
					<ul className="mt-4 space-y-4">
						{PILLARS.map((pillar) => (
							<li key={pillar}>
								<h3 className="font-semibold">{t(`pillars.${pillar}.title`)}</h3>
								<p>{t(`pillars.${pillar}.description`)}</p>
							</li>
						))}
					</ul>
				</section>
				<p className="mt-8">{t("status")}</p>
			</main>
		</>
	);
}
