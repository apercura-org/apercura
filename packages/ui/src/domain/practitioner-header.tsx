import type { ReactNode } from "react";
import { Badge } from "../components/badge";
import { CheckIcon } from "../icons";
import { cn } from "../recipes";
import { Seal } from "../seal/seal";

export type PageStatus = "unclaimed" | "claimed" | "verified";

export interface PractitionerHeaderProps {
	/** Display name, e.g. "Dr Exemple Martin". */
	name: string;
	/** Profession and specialty line, e.g. "Médecin généraliste". */
	profession: string;
	rpps: string;
	/** "RPPS", or its local name, printed before the number. */
	rppsLabel: string;
	status: PageStatus;
	/** Badge text for the status ("Unclaimed page", "Verified page"). */
	statusLabel: string;
	/** One sentence that explains the status to a patient. */
	statusNote?: ReactNode;
	/** The page title is an `h1`; previews inside another page use a lower level. */
	headingLevel?: 1 | 2 | 3;
	/**
	 * The owner's photo, printed like an identity photo pasted in the booklet
	 * (square, ink frame). Without one, the seal stands alone.
	 */
	photo?: { src: string; alt: string } | null;
	/** The owner's one-line headline, under the profession. Plain text. */
	headline?: string | null;
	className?: string;
}

/**
 * The head of a practitioner's booklet page: seal, name, profession, RPPS and
 * an honest page status. Only a verified page is stamped violet.
 */
export function PractitionerHeader({
	name,
	profession,
	rpps,
	rppsLabel,
	status,
	statusLabel,
	statusNote,
	headingLevel = 1,
	photo,
	headline,
	className,
}: PractitionerHeaderProps) {
	const verified = status === "verified";
	const Heading = `h${headingLevel}` as const;
	return (
		<header
			className={cn(
				"flex flex-col gap-4 border-b border-ink pb-5 sm:flex-row sm:items-start sm:gap-6",
				className,
			)}
		>
			{photo ? (
				<div className="relative shrink-0 self-start">
					<img
						src={photo.src}
						alt={photo.alt}
						width={128}
						height={128}
						className="block size-32 border border-field-edge bg-paper-shade object-cover p-1"
					/>
					<Seal
						rpps={rpps}
						verified={verified}
						size={48}
						className="absolute -right-4 -bottom-4 rounded-full bg-paper"
					/>
				</div>
			) : (
				<Seal rpps={rpps} verified={verified} size={96} />
			)}
			<div className="flex min-w-0 flex-col gap-2">
				<Heading className="type-headline text-ink">{name}</Heading>
				<p className="text-lead text-ink">{profession}</p>
				{headline ? <p className="max-w-[60ch] text-body text-ink">{headline}</p> : null}
				<p className="text-meta text-ink-muted">
					<span className="caps me-2 text-ink">{rppsLabel}</span>
					<span className="tabular">{rpps}</span>
				</p>
				<div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-2">
					<Badge tone={verified ? "stamp" : "ink"}>
						{verified ? <CheckIcon className="size-4" strokeWidth={2.5} /> : null}
						{statusLabel}
					</Badge>
					{statusNote ? <p className="text-meta text-ink-muted">{statusNote}</p> : null}
				</div>
			</div>
		</header>
	);
}
