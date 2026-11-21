import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

const navigation = createNavigation(routing);

export const { Link, usePathname, useRouter, getPathname } = navigation;

// Explicit annotations, so TypeScript narrows after these never-returning calls.
export const redirect: typeof navigation.redirect = navigation.redirect;
export const permanentRedirect: typeof navigation.permanentRedirect = navigation.permanentRedirect;

/** A typed internal link target: a known pathname, with its params when dynamic. */
export type Href = Parameters<typeof getPathname>[0]["href"];
