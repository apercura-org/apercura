"use client";

import { Button, TextAreaField, TextField } from "@apercura/ui";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { escapeXml, QR_MARGIN, qrPath, qrSvgDocument } from "~/lib/qr";
import { QrCode } from "./qr-code";

/** Saves a blob under a file name, through a temporary link (no server round trip). */
function download(blob: Blob, filename: string) {
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = filename;
	document.body.append(link);
	link.click();
	link.remove();
	window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

/** The code drawn on a canvas, black on white, 1200 px wide: sharp enough for print. */
function pngOf(value: string): Promise<Blob | null> {
	const { d, size } = qrPath(value);
	const pixels = 1200;
	const canvas = document.createElement("canvas");
	canvas.width = pixels;
	canvas.height = pixels;
	const context = canvas.getContext("2d");
	if (!context) return Promise.resolve(null);
	context.fillStyle = "#ffffff";
	context.fillRect(0, 0, pixels, pixels);
	context.scale(pixels / size, pixels / size);
	context.fillStyle = "#000000";
	context.fill(new Path2D(d));
	return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

/** A read-only value with a copy button whose result is announced. */
function CopyField({
	label,
	description,
	value,
	multiline = false,
}: {
	label: string;
	description?: string;
	value: string;
	multiline?: boolean;
}) {
	const t = useTranslations("Share");
	const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
	const timer = useRef<number | undefined>(undefined);
	const copy = async () => {
		try {
			await navigator.clipboard.writeText(value);
			setStatus("copied");
		} catch {
			setStatus("failed");
		}
		window.clearTimeout(timer.current);
		timer.current = window.setTimeout(() => setStatus("idle"), 4_000);
	};
	return (
		<div className="flex flex-col gap-2">
			{multiline ? (
				<TextAreaField
					label={label}
					description={description}
					value={value}
					isReadOnly
					rows={4}
					className="font-mono"
				/>
			) : (
				<TextField label={label} description={description} value={value} isReadOnly />
			)}
			<div className="flex flex-wrap items-center gap-3">
				<Button intent="ink" onPress={copy}>
					{t("copy")}
				</Button>
				<span role="status" className="text-meta text-ink">
					{status === "copied" ? t("copied") : status === "failed" ? t("copyFailed") : ""}
				</span>
			</div>
		</div>
	);
}

/** The page link, its QR code (SVG and PNG files) and the badge snippet, all made in the browser. */
export function ShareKit({
	url,
	badgeUrl,
	badgeAlt,
	badgeWidth,
	badgeHeight,
	fileStem,
}: {
	url: string;
	badgeUrl: string;
	badgeAlt: string;
	badgeWidth: number;
	badgeHeight: number;
	/** File names of the downloads, e.g. `apercura-dr-exemple-martin`. */
	fileStem: string;
}) {
	const t = useTranslations("Share");
	const label = t("qrLabel", { url });
	// Plain HTML, no script: a link and a static image that sets no cookie.
	const snippet = `<a href="${escapeXml(url)}"><img src="${escapeXml(badgeUrl)}" alt="${escapeXml(badgeAlt)}" width="${badgeWidth}" height="${badgeHeight}" loading="lazy" referrerpolicy="no-referrer"></a>`;
	return (
		<div className="flex flex-col gap-10">
			<section aria-labelledby="share-link" className="flex max-w-2xl flex-col gap-3">
				<h2 id="share-link" className="type-title text-ink">
					{t("linkHeading")}
				</h2>
				<p className="text-body text-ink">{t("linkLead")}</p>
				<CopyField label={t("linkLabel")} value={url} />
			</section>

			<section aria-labelledby="share-qr" className="flex flex-col gap-4">
				<h2 id="share-qr" className="type-title text-ink">
					{t("qrHeading")}
				</h2>
				<p className="max-w-[65ch] text-body text-ink">{t("qrLead")}</p>
				<div className="flex flex-col gap-5 sm:flex-row sm:items-start">
					<QrCode value={url} label={label} size={208} />
					<div className="flex flex-col gap-3">
						<Button
							intent="ink"
							onPress={() =>
								download(
									new Blob([qrSvgDocument(url, label)], { type: "image/svg+xml" }),
									`${fileStem}-qr.svg`,
								)
							}
						>
							{t("downloadSvg")}
						</Button>
						<Button
							intent="ink"
							onPress={async () => {
								const blob = await pngOf(url);
								if (blob) download(blob, `${fileStem}-qr.png`);
							}}
						>
							{t("downloadPng")}
						</Button>
						<p className="max-w-[40ch] text-meta text-ink-muted">
							{t("qrHint", { margin: QR_MARGIN })}
						</p>
					</div>
				</div>
			</section>

			<section aria-labelledby="share-badge" className="flex max-w-2xl flex-col gap-4">
				<h2 id="share-badge" className="type-title text-ink">
					{t("badgeHeading")}
				</h2>
				<p className="text-body text-ink">{t("badgeLead")}</p>
				<div className="flex flex-col gap-2">
					<p className="text-meta text-ink-muted">{t("badgePreview")}</p>
					<div className="self-start border border-dashed border-rule-soft p-4">
						{/* biome-ignore lint/performance/noImgElement: the exact image the snippet embeds. */}
						<img src={badgeUrl} alt={badgeAlt} width={badgeWidth} height={badgeHeight} />
					</div>
				</div>
				<CopyField label={t("badgeLabel")} description={t("badgeHint")} value={snippet} multiline />
			</section>
		</div>
	);
}
