import { appIconPng, siteIconPng } from "~/lib/brand-image";

/*
 * Logo files at stable URLs, outside the metadata routes: the Organization logo of the
 * structured data (`/brand/apercura-logo.png`, 512 px) and the maskable icons of the web app
 * manifest (the app icon, its symbol inside the safe zone). Prerendered at build time.
 */
const FILES = {
	"apercura-logo.png": () => siteIconPng(512),
	"apercura-maskable-192.png": () => appIconPng(192),
	"apercura-maskable-512.png": () => appIconPng(512),
} as const;

type FileName = keyof typeof FILES;

const isFile = (file: string): file is FileName => Object.hasOwn(FILES, file);

export function generateStaticParams() {
	return Object.keys(FILES).map((file) => ({ file }));
}

export async function GET(_request: Request, { params }: RouteContext<"/brand/[file]">) {
	const { file } = await params;
	if (!isFile(file)) return new Response("Not found", { status: 404 });
	return FILES[file]();
}
