import { SkeletonText } from "@apercura/ui";
import { getTranslations } from "next-intl/server";
import type { Locale } from "~/i18n/routing";

/** Printed while the session is read: an empty opening on the quiet shade and ruled lines. */
export async function ProShellFallback({ locale }: { locale: Locale }) {
	const t = await getTranslations({ locale, namespace: "auth.common" });
	return (
		<>
			<div className="surface-shade min-h-56 border-b border-rule-soft" />
			<div className="mx-auto w-full max-w-6xl flex-1 px-5 py-10 sm:px-8">
				<SkeletonText lines={4} label={t("loading")} />
			</div>
		</>
	);
}
