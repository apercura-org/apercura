import { BookletSearch, buttonStyles } from "@apercura/ui";
import { getTranslations } from "next-intl/server";
import { getPathname } from "~/i18n/navigation";
import type { Locale } from "~/i18n/routing";
import { searchFormId } from "~/lib/search-form-id";
import { ClientIsland, SEARCH_FORM_MESSAGES } from "./client-island";
import { DeferredSearchForm } from "./deferred-search-form";
import { NearMeButton } from "./near-me-button";

/**
 * The home page search: the `<search>` landmark, the form and "near me". The
 * form is printed as the plain GET form and becomes `SearchForm` (suggestions)
 * on first interaction, see `DeferredSearchForm`; "near me" hydrates with the
 * page and drives either.
 */
export async function HomeSearch({ locale, idPrefix }: { locale: Locale; idPrefix: string }) {
	const t = await getTranslations({ locale, namespace: "Search" });
	const tForm = await getTranslations({ locale, namespace: "SearchForm" });
	const formId = searchFormId(idPrefix);

	return (
		<search aria-label={t("label")} className="flex flex-col gap-3">
			<ClientIsland locale={locale} namespaces={SEARCH_FORM_MESSAGES}>
				<DeferredSearchForm idPrefix={idPrefix}>
					<BookletSearch
						landmark={false}
						formId={formId}
						idPrefix={idPrefix}
						action={getPathname({ href: "/recherche", locale })}
						label={t("label")}
						submitLabel={t("submit")}
						fields={[
							{ name: "quoi", label: t("who"), hint: t("whoHint") },
							{
								name: "ou",
								label: t("where"),
								hint: t("whereHint"),
								autoComplete: "address-level2",
							},
						]}
					/>
				</DeferredSearchForm>
			</ClientIsland>
			<NearMeButton
				formId={formId}
				className={buttonStyles({
					intent: "ink",
					size: "md",
					className: "normal-case tracking-normal",
				})}
				labels={{
					nearMe: tForm("nearMe"),
					locating: tForm("locating"),
					geoDenied: tForm("geoDenied"),
					geoUnavailable: tForm("geoUnavailable"),
				}}
			/>
		</search>
	);
}
