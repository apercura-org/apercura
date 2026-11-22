import { ClientIsland } from "~/components/client-island";
import { resolveLocale } from "~/lib/locale";
import { TRPCReactProvider } from "~/trpc/client";

/** The component gallery (development only) shows every client component: whole catalogue and API client. */
export default async function GalleryLayout({ children, params }: LayoutProps<"/[locale]/_ui">) {
	const locale = resolveLocale((await params).locale);
	return (
		<ClientIsland locale={locale} namespaces="all">
			<TRPCReactProvider>{children}</TRPCReactProvider>
		</ClientIsland>
	);
}
