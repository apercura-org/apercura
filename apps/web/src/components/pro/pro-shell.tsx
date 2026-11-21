import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { BookletPage } from "~/components/booklet-page";
import { SiteFooter } from "~/components/site-footer";
import { Link } from "~/i18n/navigation";
import type { Locale } from "~/i18n/routing";
import { PRO_ROUTES } from "~/lib/pro-routes";
import { SignOutButton } from "./sign-out-button";

const navLink =
	"inline-flex min-h-11 items-center rounded-field px-1 text-meta text-cover-ink underline decoration-1 underline-offset-[0.25em] hover:decoration-2 aria-[current=page]:font-bold aria-[current=page]:decoration-2";

interface ProShellProps {
	locale: Locale;
	/** Current path, marked in the navigation. */
	current: string;
	title: string;
	lead?: string;
	/** Hidden while the account has no second factor: there is nowhere else to go yet. */
	showNav?: boolean;
	children: ReactNode;
}

/** The signed-in practitioner space: running head with navigation and sign out, then the page. */
export async function ProShell({
	locale,
	current,
	title,
	lead,
	showNav = true,
	children,
}: ProShellProps) {
	const t = await getTranslations({ locale, namespace: "auth" });
	const items = [
		{ href: PRO_ROUTES.home, label: t("app.nav.home") },
		{ href: PRO_ROUTES.security, label: t("app.nav.security") },
	];
	return (
		<>
			<div className="surface-cover">
				<header className="border-b border-cover-rule">
					<div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-5 py-1.5 sm:px-8">
						<Link
							href="/"
							aria-label={t("app.homeLink")}
							className="inline-flex min-h-11 items-center font-display text-lead font-extrabold tracking-[-0.01em] text-cover-ink no-underline font-stretch-expanded"
						>
							{t("email.wordmark")}
						</Link>
						<div className="flex flex-wrap items-center gap-x-5 gap-y-2">
							{showNav ? (
								<nav aria-label={t("app.nav.label")}>
									<ul className="flex flex-wrap items-center gap-x-5">
										{items.map((item) => (
											<li key={item.href}>
												<Link
													href={item.href}
													aria-current={item.href === current ? "page" : undefined}
													className={navLink}
												>
													{item.label}
												</Link>
											</li>
										))}
									</ul>
								</nav>
							) : null}
							<SignOutButton />
						</div>
					</div>
				</header>
			</div>
			<main id="main" tabIndex={-1} className="flex-1 outline-none">
				<div className="surface-cover">
					<div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-5 pt-10 pb-10 sm:px-8">
						<h1 className="max-w-[20ch] font-display text-headline font-black tracking-[-0.02em] font-stretch-expanded">
							{title}
						</h1>
						{lead ? <p className="max-w-[58ch] text-lead text-cover-ink">{lead}</p> : null}
					</div>
				</div>
				<BookletPage runningHead={t("runningHead")}>{children}</BookletPage>
			</main>
			<SiteFooter locale={locale} />
		</>
	);
}
