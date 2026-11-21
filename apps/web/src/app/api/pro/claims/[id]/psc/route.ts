import { connection } from "next/server";
import { z } from "zod";
import { getPathname } from "~/i18n/navigation";
import { resolveLocale } from "~/lib/locale";
import { createTRPCContext } from "~/trpc/context";
import { appRouter } from "~/trpc/routers/_app";

/**
 * Where Pro Santé Connect returns after linking the identity to the account
 * (Better Auth's callback redirects here): records the result on the claim,
 * which verifies it when the identity is `8` + the claimed RPPS, then goes
 * back to the claim page with the outcome.
 */
export async function GET(request: Request, context: RouteContext<"/api/pro/claims/[id]/psc">) {
	// Per-request: never prerendered at build time.
	await connection();
	const { id } = await context.params;
	const url = new URL(request.url);
	const locale = resolveLocale(url.searchParams.get("locale") ?? "fr");
	const back = (outcome: string) =>
		Response.redirect(
			new URL(
				`${getPathname({ href: { pathname: "/pro/revendiquer/[id]", params: { id } }, locale })}?psc=${outcome}`,
				url,
			),
			303,
		);
	if (!z.uuid().safeParse(id).success) return back("error");
	const caller = appRouter.createCaller(await createTRPCContext({ headers: request.headers }));
	try {
		const result = await caller.claims.pscResult({ claimId: id });
		return back(result.verified ? "verified" : "passed");
	} catch (error) {
		const message = error instanceof Error ? error.message : "";
		return back(message === "PSC_MISMATCH" ? "mismatch" : "error");
	}
}
