import { buttonStyles, CheckIcon, linkStyles } from "@apercura/ui";
import { getTranslations } from "next-intl/server";
import { Link } from "~/i18n/navigation";
import type { Locale } from "~/i18n/routing";
import { PageViewBeacon } from "./page-view-beacon";

const sideLink = "inline-flex min-h-11 items-center";

/**
 * The "Is this you?" block of a practitioner page's sidebar. Unclaimed: what claiming gives
 * (factual, no promise beyond what the product does), the claim, the contact path for those who
 * cannot claim, and the objection to the page. Claimed: who manages the page, and the same
 * objection path (the owner removes the page from their space). A claimed page also counts its
 * views for its owner (an empty beacon, no cookie: ~/server/stats/page-views.ts).
 */
export async function OwnerBlock({
	locale,
	claimed,
	rpps,
	slug,
	practitionerId,
}: {
	locale: Locale;
	claimed: boolean;
	rpps: string;
	slug: string;
	practitionerId: number;
}) {
	const t = await getTranslations({ locale, namespace: "PractitionerPage.claim" });
	const optOut = (
		<Link
			href={{ pathname: "/praticien/[slug]/retrait", params: { slug } }}
			className={`${linkStyles({ tone: "muted" })} ${sideLink} text-meta`}
		>
			{t("optOutLink")}
		</Link>
	);
	if (claimed) {
		return (
			<section
				aria-labelledby="claim-heading"
				className="flex flex-col gap-2 border-t border-ink pt-4"
			>
				<h2 id="claim-heading" className="type-subtitle text-ink">
					{t("claimedHeading")}
				</h2>
				<p className="text-body text-ink">{t("claimedBody")}</p>
				{optOut}
				<PageViewBeacon practitionerId={practitionerId} />
			</section>
		);
	}
	const benefits = t.raw("benefits") as string[];
	return (
		<section
			aria-labelledby="claim-heading"
			className="flex flex-col gap-3 border-t border-ink pt-4"
		>
			<h2 id="claim-heading" className="type-subtitle text-ink">
				{t("heading")}
			</h2>
			<p className="text-body text-ink">{t("body")}</p>
			<ul className="flex flex-col gap-1.5">
				{benefits.map((benefit) => (
					<li key={benefit} className="flex items-baseline gap-2 text-meta text-ink">
						<CheckIcon aria-hidden="true" className="size-4 shrink-0 translate-y-0.5" />
						<span>{benefit}</span>
					</li>
				))}
			</ul>
			<div className="pt-1">
				<Link
					href={{ pathname: "/pro/revendiquer", query: { rpps } }}
					className={buttonStyles({
						intent: "stamp",
						className: "w-full whitespace-normal py-2 sm:w-auto",
					})}
				>
					{t("link")}
				</Link>
			</div>
			<Link
				href={{ pathname: "/praticien/[slug]/c-est-moi", params: { slug } }}
				className={`${linkStyles()} ${sideLink} text-body`}
			>
				{t("contactLink")}
			</Link>
			{optOut}
		</section>
	);
}
