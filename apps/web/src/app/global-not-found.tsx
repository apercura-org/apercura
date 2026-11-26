import type { Metadata } from "next";
import { RootNotFound, rootNotFoundMetadata } from "~/components/root-not-found";

/** A URL that matches no route at all (enabled by `experimental.globalNotFound`). */
export function generateMetadata(): Promise<Metadata> {
	return rootNotFoundMetadata();
}

export default function GlobalNotFound() {
	return <RootNotFound />;
}
