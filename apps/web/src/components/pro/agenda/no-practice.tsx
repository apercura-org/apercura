import { buttonStyles, EmptyState } from "@apercura/ui";
import { getTranslations } from "next-intl/server";
import { Link } from "~/i18n/navigation";
import type { Locale } from "~/i18n/routing";
import { PRO_ROUTES } from "~/lib/pro-routes";

/** The agenda pages before the person has any practice (no verified page, no team yet). */
export async function NoPractice({ locale }: { locale: Locale }) {
	const t = await getTranslations({ locale, namespace: "Agenda.common.noPractice" });
	return (
		<EmptyState
			title={t("title")}
			description={t("body")}
			action={
				<Link href={PRO_ROUTES.home} className={buttonStyles({ intent: "ink" })}>
					{t("action")}
				</Link>
			}
		/>
	);
}
