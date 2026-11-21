import "server-only";
import { redirect } from "~/i18n/navigation";
import type { Locale } from "~/i18n/routing";
import { PRO_ROUTES } from "~/lib/pro-routes";
import { getDb } from "../db";
import { requireProAccess } from "./guard";
import { isPlatformAdmin } from "./membership";

/**
 * Admin pages render only for platform administrators; anyone else is sent
 * to their space (the pages stream, so a late 404 could not set the status).
 * Navigation only: every admin procedure checks the flag again.
 */
export async function requirePlatformAdminPage(locale: Locale) {
	const access = await requireProAccess(locale, ["ready"]);
	if (!(await isPlatformAdmin(getDb(), access.session.user.id))) {
		return redirect({ href: PRO_ROUTES.home, locale });
	}
	return access;
}
