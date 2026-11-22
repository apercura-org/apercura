import { ChevronRightIcon, cn, linkStyles } from "@apercura/ui";
import { getTranslations } from "next-intl/server";
import { getPathname, type Href } from "~/i18n/navigation";
import type { Locale } from "~/i18n/routing";
import { siteOrigin } from "~/lib/site-url";

export type TrailItem = { label: string; href: Href };

/** The trail with the home page first, as names and absolute URLs (BreadcrumbList). */
export async function trailEntries(
	locale: Locale,
	items: readonly TrailItem[],
): Promise<{ name: string; url: string }[]> {
	const t = await getTranslations({ locale, namespace: "Site" });
	return [{ label: t("home"), href: "/" as Href }, ...items].map((item) => ({
		name: item.label,
		url: `${siteOrigin()}${getPathname({ href: item.href, locale })}`,
	}));
}

const crumb = cn(
	linkStyles({ tone: "muted" }),
	"inline-flex min-h-11 items-center",
	"data-current:cursor-default data-current:font-semibold data-current:text-ink data-current:no-underline",
);

/**
 * The breadcrumb trail (Home › Specialty › Department › Commune › Page). The
 * last item is the current page, printed unlinked. Plain server-rendered
 * links (no client JavaScript); its structured data is the page graph's
 * `BreadcrumbList` (see `trailEntries`).
 */
export async function Trail({ locale, items }: { locale: Locale; items: TrailItem[] }) {
	const t = await getTranslations({ locale, namespace: "Site" });
	const all: TrailItem[] = [{ label: t("home"), href: "/" }, ...items];
	return (
		<nav aria-label={t("breadcrumbs")}>
			<ol className="flex flex-wrap items-center gap-x-1 gap-y-1 text-meta">
				{all.map((item, index) => {
					const path = getPathname({ href: item.href, locale });
					const current = index === all.length - 1;
					return (
						<li key={path} className="group flex items-center gap-1">
							{current ? (
								<span aria-current="page" data-current="true" className={crumb}>
									{item.label}
								</span>
							) : (
								<a href={path} className={crumb}>
									{item.label}
								</a>
							)}
							<ChevronRightIcon className="size-4 text-ink-muted group-last:hidden" />
						</li>
					);
				})}
			</ol>
		</nav>
	);
}
