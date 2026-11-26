import type { Metadata } from "next";
import { RootNotFound, rootNotFoundMetadata } from "~/components/root-not-found";

/**
 * Above both root layouts: what a URL outside every locale gets once the locales' layout has
 * answered notFound() for its first segment (`/missing.txt`).
 */
export function generateMetadata(): Promise<Metadata> {
	return rootNotFoundMetadata();
}

export default function RootNotFoundPage() {
	return <RootNotFound />;
}
