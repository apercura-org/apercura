import QRCode from "qrcode";

/** Quiet zone around the code, in modules (the standard asks for 4). */
export const QR_MARGIN = 4;

/** The dark modules of a QR code as one SVG path, and the side of its square (quiet zone included). */
export function qrPath(value: string): { d: string; size: number } {
	const { modules } = QRCode.create(value, { errorCorrectionLevel: "M" });
	let d = "";
	for (let row = 0; row < modules.size; row++) {
		for (let col = 0; col < modules.size; col++) {
			if (modules.get(row, col)) d += `M${col + QR_MARGIN} ${row + QR_MARGIN}h1v1h-1z`;
		}
	}
	return { d, size: modules.size + QR_MARGIN * 2 };
}

const escapeXml = (text: string) =>
	text.replace(/[<>&"']/g, (char) =>
		char === "<"
			? "&lt;"
			: char === ">"
				? "&gt;"
				: char === "&"
					? "&amp;"
					: char === '"'
						? "&quot;"
						: "&apos;",
	);

/** A standalone SVG file of the code: black on white, crisp at any size, titled. */
export function qrSvgDocument(value: string, title: string): string {
	const { d, size } = qrPath(value);
	return [
		'<?xml version="1.0" encoding="UTF-8"?>',
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size * 10}" height="${size * 10}" shape-rendering="crispEdges" role="img">`,
		`<title>${escapeXml(title)}</title>`,
		`<rect width="${size}" height="${size}" fill="#ffffff"/>`,
		`<path d="${d}" fill="#000000"/>`,
		"</svg>",
	].join("");
}

export { escapeXml };
