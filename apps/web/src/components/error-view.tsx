import { BrandLogo } from "@apercura/ui";

/*
 * The error boundaries load with every page, so this view leaves the style recipes out (their
 * runtime would join every page's JavaScript): the classes are those of
 * `buttonStyles({ intent: "stamp", size: "lg" })` and `linkStyles()`, written out.
 */
const STAMP_BUTTON =
	"ink-press focus-ring relative inline-flex min-h-13 min-w-44 max-w-full cursor-pointer select-none items-center justify-center gap-2 rounded-field border border-stamp bg-stamp px-6 font-display text-body font-semibold tracking-[-0.003em] text-paper no-underline hover:border-stamp-strong hover:bg-stamp-strong forced-colors:border-2 forced-colors:border-[ButtonText]";
const TEXT_LINK = "link-base focus-ring inline-flex min-h-11 items-center text-body text-ink";
const LOGO_LINK =
	"focus-ring -ms-1 inline-flex min-h-11 items-center rounded-field px-1 text-ink no-underline";

/** The digest Next.js gives an error from the server, the only part of it a visitor sees. */
export function errorDigest(error: unknown): string | null {
	if (typeof error !== "object" || error === null || !("digest" in error)) return null;
	return typeof error.digest === "string" && error.digest.length > 0 ? error.digest : null;
}

export interface ErrorViewText {
	title: string;
	body: string;
	retry: string;
	home: string;
	reference: string;
}

/**
 * What a visitor sees when a page fails: the logo back home over a hairline, what happened
 * in a sentence, "try again" as the stamp button (it presses like every primary action), the way
 * home, and the digest of a server error as a reference for support, never the error itself.
 */
export function ErrorView({
	text,
	retry,
	digest,
	home,
	homeLabel,
}: {
	text: ErrorViewText;
	retry: () => void;
	digest: string | null;
	/**
	 * The home of the page's locale. A plain link: leaving a failed page reloads the app, so
	 * this view needs neither the router nor the localized paths.
	 */
	home: string;
	/** Accessible name of the logo link. */
	homeLabel: string;
}) {
	return (
		<>
			<header className="surface-paper rule-b">
				<div className="mx-auto flex min-h-16 max-w-6xl items-center px-5 py-2 sm:px-8">
					<a href={home} aria-label={homeLabel} className={LOGO_LINK}>
						<BrandLogo height={24} />
					</a>
				</div>
			</header>
			<main id="main" tabIndex={-1} className="flex-1 outline-none">
				<div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-5 pt-10 pb-14 sm:px-8 sm:pt-14 lg:pt-16">
					<div className="flex flex-col gap-4 lg:w-2/3">
						<h1 className="type-display text-balance">{text.title}</h1>
						<p className="max-w-[52ch] text-lead text-ink-muted">{text.body}</p>
					</div>
					<div className="flex flex-wrap items-center gap-x-6 gap-y-3">
						<button type="button" onClick={retry} className={STAMP_BUTTON}>
							{text.retry}
						</button>
						<a href={home} className={TEXT_LINK}>
							{text.home}
						</a>
					</div>
					{digest ? (
						<p className="tabular border-t border-rule-soft pt-4 text-meta text-ink-muted lg:w-2/3">
							{text.reference.replace("{digest}", digest)}
						</p>
					) : null}
				</div>
			</main>
		</>
	);
}
