/**
 * Validation of the page editor's input, shared by the client (inline
 * errors) and the server (the only one trusted). Every text is plain text:
 * normalized, length-limited, and refused when it contains markup.
 */
import {
	BILLING_SECTORS,
	HIDEABLE_FIELDS,
	hasMarkup,
	LIMITS,
	normalizePlainText,
	normalizeWebsite,
	OPTAM_VALUES,
	PAYMENT_METHODS,
	PROFILE_LANGUAGES,
} from "@apercura/core";
import { z } from "zod";

export const plainText = (max: number, multiline = false) =>
	z
		.string()
		.max(max * 2)
		.transform((value) => normalizePlainText(value, { multiline }))
		.refine((value) => value.length <= max, { message: "tooLong" })
		.refine((value) => !hasMarkup(value), { message: "markup" });

const optionalText = (max: number, multiline = false) =>
	plainText(max, multiline)
		.nullable()
		.transform((value) => (value ? value : null));

const amount = z.number().min(0).max(10_000).multipleOf(0.01);

export const feeItemSchema = z
	.object({
		label: plainText(LIMITS.feeLabel).refine((value) => value.length > 0, { message: "required" }),
		amount,
		maxAmount: amount.nullable().default(null),
	})
	.refine((item) => item.maxAmount === null || item.maxAmount > item.amount, {
		message: "range",
		path: ["maxAmount"],
	});

export const profileInputSchema = z.object({
	headline: optionalText(LIMITS.headline),
	bio: optionalText(LIMITS.bio, true),
	languages: z.array(z.enum(PROFILE_LANGUAGES)).max(12),
	billingSector: z.enum(BILLING_SECTORS).nullable(),
	optam: z.enum(OPTAM_VALUES).nullable(),
	carteVitale: z.boolean().nullable(),
	fees: z.object({
		items: z.array(feeItemSchema).max(LIMITS.fees),
		note: optionalText(LIMITS.feesNote),
	}),
	paymentMethods: z.array(z.enum(PAYMENT_METHODS)),
	accessibility: z.object({
		stepFree: z.boolean().nullable(),
		lift: z.boolean().nullable(),
		parking: z.boolean().nullable(),
		notes: optionalText(LIMITS.accessibilityNotes),
	}),
	website: z
		.string()
		.max(LIMITS.website)
		.nullable()
		.transform((value, context) => {
			if (!value?.trim()) return null;
			const normalized = normalizeWebsite(value);
			if (!normalized) {
				context.addIssue({ code: "custom", message: "website" });
				return z.NEVER;
			}
			return normalized;
		}),
	showPhone: z.boolean(),
	hiddenFields: z.array(z.enum(HIDEABLE_FIELDS)),
});

export type ProfileInput = z.input<typeof profileInputSchema>;
export type ProfileData = z.output<typeof profileInputSchema>;

export const ownerSiteSchema = z.object({
	name: plainText(LIMITS.siteName).refine((value) => value.length > 0, { message: "required" }),
	addressLine: plainText(LIMITS.addressLine).refine((value) => value.length > 0, {
		message: "required",
	}),
	// Five digits in France and Spain, four in Austria, a UK postcode (`TS18 1HU`), five digits in
	// Czechia written `110 00` or `11000`: the service checks the practitioner's market.
	postcode: z
		.string()
		.trim()
		.regex(/^(?:\d{4,5}|\d{3} \d{2}|[A-Za-z]{1,2}\d[A-Za-z\d]? ?\d[A-Za-z]{2})$/, {
			message: "postcode",
		}),
	city: plainText(80).refine((value) => value.length > 0, { message: "required" }),
	phone: z
		.string()
		.trim()
		.max(20)
		.nullable()
		.transform((value) => value || null),
});

export type OwnerSiteInput = z.input<typeof ownerSiteSchema>;
export type OwnerSiteData = z.output<typeof ownerSiteSchema>;
