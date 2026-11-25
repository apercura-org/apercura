import type { ReactNode } from "react";
import { BookletPage } from "~/components/booklet-page";
import { ClientIsland } from "~/components/client-island";
import { SiteFooter } from "~/components/site-footer";
import { SiteHeader } from "~/components/site-header";
import type { Locale } from "~/i18n/routing";
import type { ProRoute } from "~/lib/pro-routes";
import { TRPCReactProvider } from "~/trpc/client";

interface AuthFrameProps {
	locale: Locale;
	/** Current page (for the language switch). */
	pathname: ProRoute;
	title: string;
	lead?: string;
	children: ReactNode;
}

/** Sign-in, sign-up and confirmation pages: the title on the quiet shade, the form on a booklet page. */
export async function AuthFrame({ locale, pathname, title, lead, children }: AuthFrameProps) {
	// The practitioner space is never indexed and full of forms: it gets the whole catalogue and the API client.
	return (
		<ClientIsland locale={locale} namespaces="all">
			<TRPCReactProvider>
				<SiteHeader locale={locale} href={pathname} />
				<main id="main" tabIndex={-1} className="flex-1 outline-none">
					<div className="surface-shade border-b border-rule-soft">
						<div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-5 pt-10 pb-10 sm:px-8 sm:pb-12">
							<h1 className="max-w-[20ch] type-headline">{title}</h1>
							{lead ? <p className="max-w-[58ch] text-lead text-ink">{lead}</p> : null}
						</div>
					</div>
					<BookletPage>{children}</BookletPage>
				</main>
				<SiteFooter locale={locale} />
			</TRPCReactProvider>
		</ClientIsland>
	);
}

/** Two columns from 768 px: a short explanation on the left, the form on the right. */
export function AuthColumns({ aside, children }: { aside: ReactNode; children: ReactNode }) {
	return (
		<div className="grid gap-10 md:grid-cols-12">
			<div className="flex max-w-[65ch] flex-col gap-3 text-body text-ink md:col-span-5">
				{aside}
			</div>
			<div className="flex max-w-xl flex-col gap-6 md:col-span-7">{children}</div>
		</div>
	);
}
