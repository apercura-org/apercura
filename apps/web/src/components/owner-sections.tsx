import { type Fees, feesStated } from "@apercura/core";
import { FieldList, FieldRow, linkStyles } from "@apercura/ui";
import { useFormatter, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import type { Accessibility, OwnerContent } from "~/lib/owner-content";

/*
 * The parts of a practitioner page that the owner completes, shared by the
 * public page (a Server Component) and the editor's live preview (a Client
 * Component): both print exactly the same booklet sections. Synchronous on
 * purpose, so they render in both worlds with next-intl's hooks.
 */

export const sectionHeading = "type-title text-ink";

const AMELI_URL = "https://annuairesante.ameli.fr/";

/** The owner's presentation: plain text, paragraphs kept, nothing interpreted. */
export function PresentationSection({ bio, headingId }: { bio: string | null; headingId: string }) {
	const t = useTranslations("Profile");
	if (!bio) return null;
	const paragraphs = bio.split(/\n{2,}/);
	return (
		<section aria-labelledby={headingId} className="flex flex-col gap-4">
			<h2 id={headingId} className={sectionHeading}>
				{t("presentationHeading")}
			</h2>
			<div className="flex max-w-[65ch] flex-col gap-3 border-t border-ink pt-4">
				{paragraphs.map((paragraph, index) => (
					// Paragraph order is the text's own order; index keys are stable here.
					// biome-ignore lint/suspicious/noArrayIndexKey: static text split
					<p key={index} className="whitespace-pre-line text-body text-ink">
						{paragraph}
					</p>
				))}
			</div>
		</section>
	);
}

export function languageList(
	codes: readonly string[],
	label: (code: string) => string,
): string | null {
	return codes.length > 0 ? codes.map(label).join(", ") : null;
}

function accessibilityText(
	value: Accessibility | null,
	t: ReturnType<typeof useTranslations<"Profile">>,
): ReactNode {
	if (!value) return null;
	const facts = [
		value.stepFree ? t("accessibility.stepFree") : null,
		value.lift ? t("accessibility.lift") : null,
		value.parking ? t("accessibility.parking") : null,
	].filter(Boolean);
	if (facts.length === 0 && !value.notes) return null;
	return (
		<span className="flex flex-col gap-1 @md:items-end">
			{facts.length > 0 ? <span>{facts.join(" · ")}</span> : null}
			{value.notes ? <span className="text-meta text-ink-muted">{value.notes}</span> : null}
		</span>
	);
}

/** Languages, accessibility and website, printed as field rows. */
export function PracticalSection({
	content,
	headingId,
	emptyLabel,
	externalLabel,
}: {
	content: Pick<OwnerContent, "languages" | "accessibility" | "website">;
	headingId: string;
	emptyLabel: string;
	externalLabel: string;
}) {
	const t = useTranslations("Profile");
	const website = content.website ? hostOf(content.website) : null;
	return (
		<section aria-labelledby={headingId} className="flex flex-col gap-4">
			<h2 id={headingId} className={sectionHeading}>
				{t("practicalHeading")}
			</h2>
			<FieldList>
				<FieldRow
					label={t("fields.languages")}
					value={languageList(content.languages, (code) => t(`languages.${code}` as never))}
					emptyLabel={emptyLabel}
				/>
				<FieldRow
					label={t("fields.accessibility")}
					value={accessibilityText(content.accessibility, t)}
					emptyLabel={emptyLabel}
				/>
				<FieldRow
					label={t("fields.website")}
					value={
						content.website && website ? (
							<a
								href={content.website}
								rel="nofollow noopener noreferrer"
								className={`${linkStyles()} break-all`}
							>
								{website}
								<span className="sr-only"> ({externalLabel})</span>
							</a>
						) : null
					}
					emptyLabel={emptyLabel}
				/>
			</FieldList>
		</section>
	);
}

function hostOf(url: string): string | null {
	try {
		const parsed = new URL(url);
		return `${parsed.hostname.replace(/^www\./, "")}${parsed.pathname === "/" ? "" : parsed.pathname}`;
	} catch {
		return null;
	}
}

/** "30 €", "30 à 50 €": amounts in the page's locale, always in euros. */
export function useFeeAmount() {
	const format = useFormatter();
	const t = useTranslations("Profile");
	const euros = (value: number) =>
		format.number(value, {
			style: "currency",
			currency: "EUR",
			minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
		});
	return (item: Fees["items"][number]) =>
		item.maxAmount
			? t("fees.range", { min: euros(item.amount), max: euros(item.maxAmount) })
			: euros(item.amount);
}

/**
 * Agreement sector, OPTAM, Carte Vitale, fees and payment methods, then the
 * regulatory pointer to ameli.fr. R.4127-53 II: a practitioner who presents
 * their activity online states their fees and the payment methods accepted.
 * Professions without sectors (`hasBillingSectors`: dentists, midwives,
 * nurses) print whether they are contracted, and no OPTAM.
 */
export function FeesSection({
	content,
	headingId,
	emptyLabel,
	externalLabel,
	provenance,
	sectors = true,
}: {
	content: Pick<OwnerContent, "billing" | "fees" | "paymentMethods">;
	headingId: string;
	emptyLabel: string;
	externalLabel: string;
	/** The provenance imprint (source and date), when the page knows it. */
	provenance?: ReactNode;
	/** The profession's fees come in sectors (physicians). */
	sectors?: boolean;
}) {
	const t = useTranslations("PractitionerPage");
	const tProfile = useTranslations("Profile");
	const tTaxonomy = useTranslations("taxonomy");
	const amount = useFeeAmount();
	const { billing } = content;
	const label = (key: string) => (tTaxonomy.has(key as never) ? tTaxonomy(key as never) : null);
	const sector = billing.sector
		? ((sectors ? null : label(`billingAgreement.${billing.sector}`)) ??
			label(`billingSector.${billing.sector}`))
		: null;
	const optam = billing.optam
		? tTaxonomy.has(`optam.${billing.optam}` as never)
			? tTaxonomy(`optam.${billing.optam}` as never)
			: null
		: billing.sector
			? t("fees.optamNo")
			: null;
	const fees = feesStated(content.fees) ? content.fees : null;
	return (
		<section aria-labelledby={headingId} className="flex flex-col gap-4">
			<h2 id={headingId} className={sectionHeading}>
				{t("fees.heading")}
			</h2>
			<FieldList>
				<FieldRow
					label={sectors ? t("fees.sector") : t("fees.agreement")}
					value={sector}
					emptyLabel={emptyLabel}
				/>
				{sectors ? (
					<FieldRow label={t("fees.optam")} value={optam} emptyLabel={emptyLabel} />
				) : null}
				<FieldRow
					label={t("fees.carteVitale")}
					value={
						billing.carteVitale === true
							? t("fees.accepted")
							: billing.carteVitale === false
								? t("fees.notAccepted")
								: null
					}
					emptyLabel={emptyLabel}
				/>
				{fees ? (
					fees.items.map((item) => (
						<FieldRow
							key={`${item.label}-${item.amount}`}
							label={item.label}
							value={<span className="tabular">{amount(item)}</span>}
							emptyLabel={emptyLabel}
						/>
					))
				) : (
					<FieldRow label={tProfile("fields.fees")} emptyLabel={emptyLabel} />
				)}
				<FieldRow
					label={tProfile("fields.paymentMethods")}
					value={
						content.paymentMethods.length > 0
							? content.paymentMethods
									.map((method) => tProfile(`paymentMethods.${method}` as never))
									.join(", ")
							: null
					}
					emptyLabel={emptyLabel}
				/>
			</FieldList>
			{fees?.note ? <p className="max-w-[65ch] text-meta text-ink">{fees.note}</p> : null}
			<p className="max-w-[65ch] text-body text-ink">
				{billing.source === "owner"
					? tProfile("fees.fromOwner")
					: billing.source === "ameli"
						? t("fees.fromAmeli")
						: t("fees.notMatched")}{" "}
				{/* Placeholder: replace with the verbatim wording required by the order of
				    30 May 2018 (art. 5) once the legal review (M6) provides it. */}
				{sectors ? t("fees.regulatoryNotice") : t("fees.regulatoryNoticeAgreement")}{" "}
				<a href={AMELI_URL} className={linkStyles()}>
					{t("fees.ameliLink")}
					<span className="sr-only"> ({externalLabel})</span>
				</a>
				.
			</p>
			{provenance}
		</section>
	);
}
