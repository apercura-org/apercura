import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import type { Locale } from "~/i18n/routing";

interface BookletPageProps {
	locale: Locale;
	/** Running head text printed at the top left of the page. */
	runningHead: string;
	folio: number;
	children: ReactNode;
	id?: string;
}

/** One page of the booklet: running head with folio, then the page's content on white paper. */
export async function BookletPage({ locale, runningHead, folio, children, id }: BookletPageProps) {
	const t = await getTranslations({ locale, namespace: "Site" });
	return (
		<div id={id} className="mx-auto w-full max-w-6xl px-5 sm:px-8">
			<div
				className="flex items-baseline justify-between gap-4 border-b-[1.5px] border-ink pt-6 pb-2"
				aria-hidden="true"
			>
				<span className="caps text-ink">{runningHead}</span>
				<span className="caps tabular whitespace-nowrap text-ink">
					{t("folio", { number: folio })}
				</span>
			</div>
			<div className="flex flex-col gap-14 py-10 sm:py-14">{children}</div>
		</div>
	);
}
