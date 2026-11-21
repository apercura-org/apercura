import "server-only";
import { redirect } from "~/i18n/navigation";
import type { Locale } from "~/i18n/routing";
import { PRO_ROUTES } from "~/lib/pro-routes";
import { getProAccess, type ProAccess } from "./session";

const HOME_FOR: Record<ProAccess["state"], string> = {
	"signed-out": PRO_ROUTES.signIn,
	enrol: PRO_ROUTES.security,
	challenge: PRO_ROUTES.challenge,
	ready: PRO_ROUTES.home,
};

/**
 * Lets the page render only in the given access states and sends everyone else
 * where they belong (sign in, enrol a second factor, confirm it). This is
 * navigation, not the security boundary: every procedure checks again.
 */
export async function requireProAccess<State extends ProAccess["state"]>(
	locale: Locale,
	allowed: readonly State[],
): Promise<Extract<ProAccess, { state: State }>> {
	const access = await getProAccess();
	if ((allowed as readonly string[]).includes(access.state)) {
		return access as Extract<ProAccess, { state: State }>;
	}
	return redirect({ href: HOME_FOR[access.state], locale });
}
