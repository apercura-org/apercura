import "server-only";

import { paletteHex } from "@apercura/ui/tokens";
import { cacheLife, cacheTag } from "next/cache";
import { ImageResponse } from "next/og";
import { getTranslations } from "next-intl/server";
import { MARKET_LOCALES } from "~/i18n/locales";
import { lockupHeightFor, OgLockup } from "~/lib/brand-image";
import { genderOf, getTaxonomyLabels } from "~/lib/labels";
import { professionSlugOf } from "~/lib/market";
import { displayId, marketSegmentOf, type PractitionerKey } from "~/lib/practitioner-key";
import { type OwnOgImage, practitionerOgImageUrl, shortPlaceName } from "~/lib/seo";
import { cacheTags } from "~/server/cache-tags";
import { getPractitionerPage } from "~/server/queries/practitioner";
import { getStorage, storageConfigured } from "~/server/storage";
import { OG_FONT_FAMILY } from "./font-files";
import { ogFonts } from "./fonts";

/**
 * The Open Graph image of one practitioner page (`/og/praticien/{slug}.png`, 1200 × 630):
 * name, profession or specialty, commune and the Apercura lockup, in French like the profession
 * images. The photo only when the owner published one on the page. Rendered once and cached
 * with the page's own tags, so an import or an owner's edit that changes the page renders it
 * again.
 *
 * Colours: graphite ink (`ink`, about 15:1) and the muted ink (`inkMuted`, ≥ 4.5:1) on white
 * paper and its shade, the site's own pairs.
 */

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

const {
	paper: PAPER,
	paperShade: SHADE,
	ink: INK,
	inkMuted: INK_MUTED,
	ruleSoft: RULE,
} = paletteHex;

/** The identity of a page in its market (what an image URL names). */
export type OgKey = Pick<PractitionerKey, "country" | "idScheme" | "nationalId">;

/** What the image prints, and its text alternative. */
export type PractitionerCard = {
	name: string;
	occupation: string;
	place: string | null;
	rpps: string;
	photoKey: string | null;
};

/**
 * The card of a practitioner page, or null when there is no page to share: unknown, removed,
 * or withheld while a removal request is checked.
 */
export async function practitionerCard(key: OgKey): Promise<PractitionerCard | null> {
	const page = await getPractitionerPage(key);
	if (!page || page.payload.withheld) return null;
	const { payload } = page;
	const locale = MARKET_LOCALES[key.country];
	const labels = await getTaxonomyLabels(locale);
	const t = await getTranslations({ locale, namespace: "PractitionerPage" });
	const gender = genderOf(payload.civilityCode);
	const profession =
		labels.profession(professionSlugOf(payload.professionCode), gender) ?? t("unknownProfession");
	return {
		name: labels.personName(payload),
		occupation: labels.occupation(payload.listingSlug, gender) ?? profession,
		place: (() => {
			// A London practice is listed in its borough, without a town.
			const locality = page.commune ?? (payload.country === "GB" ? page.department : null);
			return locality ? shortPlaceName(locality.name) : null;
		})(),
		rpps: displayId(payload),
		photoKey: payload.profile?.photoKey ?? null,
	};
}

/**
 * The page's own image for its metadata: the card's URL and its text alternative (in French,
 * as printed), or null when there is no card (the page then shows its profession's image).
 */
export async function practitionerOgImageOf(key: OgKey, slug: string): Promise<OwnOgImage | null> {
	const card = await practitionerCard(key);
	if (!card) return null;
	const t = await getTranslations({ locale: MARKET_LOCALES[key.country], namespace: "OgImage" });
	const values = { name: card.name, occupation: card.occupation, place: card.place ?? "" };
	return {
		url: practitionerOgImageUrl(marketSegmentOf(key.country, slug)),
		alt: card.place ? t("practitioner.alt", values) : t("practitioner.altNoPlace", values),
	};
}

/** The owner's published photo as a PNG data URL (the renderer reads no WebP), or null. */
async function photoDataUrl(key: string | null): Promise<string | null> {
	if (!key || !storageConfigured()) return null;
	try {
		const object = await getStorage().get(key);
		if (!object) return null;
		const { default: sharp } = await import("sharp");
		const png = await sharp(object.body).resize(280, 280, { fit: "cover" }).png().toBuffer();
		return `data:image/png;base64,${png.toString("base64")}`;
	} catch {
		// No photo rather than no image.
		return null;
	}
}

/** Long names get a smaller size so they hold on two lines. */
export function nameSize(name: string, withPhoto: boolean): number {
	const room = withPhoto ? 22 : 28;
	if (name.length <= room) return 84;
	if (name.length <= room * 1.4) return 68;
	return 56;
}

/**
 * The PNG of a practitioner's card, cached until the page's tags expire: the practitioner's
 * own (`practitioner:{id}`, or the coarse `practitioner:*`) and those of the page's commune
 * and listing, carried over from `getPractitionerPage`.
 */
export async function practitionerOgImage(key: OgKey): Promise<Uint8Array | null> {
	"use cache";
	cacheTag(cacheTags.coarse.practitioner);
	const card = await practitionerCard(key);
	if (!card) {
		// Same as the page's own miss: a page can appear with the next import.
		cacheLife("days");
		return null;
	}
	cacheLife("max");
	const page = await getPractitionerPage(key);
	if (page) cacheTag(cacheTags.practitioner(page.practitionerId));

	const [t, fonts, photo] = await Promise.all([
		getTranslations({ locale: MARKET_LOCALES[key.country], namespace: "OgImage" }),
		ogFonts(["latin", "latin-ext"]),
		photoDataUrl(card.photoKey),
	]);
	const response = new ImageResponse(
		<div
			style={{
				width: "100%",
				height: "100%",
				display: "flex",
				flexDirection: "column",
				justifyContent: "space-between",
				background: PAPER,
				color: INK,
				fontFamily: OG_FONT_FAMILY,
			}}
		>
			<div style={{ display: "flex", padding: "56px 80px 0" }}>
				<div
					style={{
						display: "flex",
						flexGrow: 1,
						justifyContent: "space-between",
						alignItems: "center",
						paddingBottom: 16,
						borderBottom: `2px solid ${RULE}`,
						fontSize: 26,
						fontWeight: 500,
						color: INK_MUTED,
						letterSpacing: 0,
					}}
				>
					<div style={{ display: "flex" }}>{t("runningHead")}</div>
					<OgLockup height={lockupHeightFor(34)} />
				</div>
			</div>
			<div style={{ display: "flex", alignItems: "center", gap: 48, padding: "0 80px" }}>
				{photo ? (
					// biome-ignore lint/performance/noImgElement: rendered to a PNG by next/og, not a page.
					<img
						src={photo}
						alt=""
						width={240}
						height={240}
						style={{ width: 240, height: 240, borderRadius: 8, border: `2px solid ${RULE}` }}
					/>
				) : null}
				<div style={{ display: "flex", flexDirection: "column", gap: 20, flexShrink: 1 }}>
					<div
						style={{
							display: "flex",
							fontSize: nameSize(card.name, photo !== null),
							fontWeight: 600,
							letterSpacing: -2,
							lineHeight: 1.05,
						}}
					>
						{card.name}
					</div>
					<div style={{ display: "flex", fontSize: 44, fontWeight: 500, lineHeight: 1.2 }}>
						{card.occupation}
					</div>
					{card.place ? (
						<div style={{ display: "flex", fontSize: 38, fontWeight: 500, color: INK_MUTED }}>
							{card.place}
						</div>
					) : null}
				</div>
			</div>
			<div
				style={{
					display: "flex",
					justifyContent: "space-between",
					padding: "28px 80px 32px",
					background: SHADE,
					borderTop: `2px solid ${RULE}`,
					fontSize: 28,
					fontWeight: 500,
					color: INK_MUTED,
				}}
			>
				<div style={{ display: "flex" }}>{t("footer")}</div>
				<div style={{ display: "flex" }}>{t("practitioner.folio", { rpps: card.rpps })}</div>
			</div>
		</div>,
		{ width: OG_WIDTH, height: OG_HEIGHT, fonts },
	);
	return new Uint8Array(await response.arrayBuffer());
}
