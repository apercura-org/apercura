import type { ReactNode } from "react";
import { CheckIcon } from "../icons";
import { cn } from "../recipes";
import { Stamp, StampFoot, stampInkOf } from "./stamp";

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
	/** The status in words, printed on the stamp ("Unclaimed page", "Verified page"). */
	statusLabel: string;
	/** One sentence that explains the status to a patient. */
	statusNote?: ReactNode;
	/** The page title is an `h1`; previews inside another page use a lower level. */
	headingLevel?: 1 | 2 | 3;
	/** The owner's photo, square with rounded corners, beside the stamp. */
	photo?: { src: string; alt: string } | null;
	/** The owner's one-line headline, under the stamp. Plain text. */
	headline?: string | null;
	/** The first place of practice, on one line, as a stamp carries it. */
	address?: string | null;
	className?: string;
}

/**
 * The head of a practitioner's page: the practitioner's stamp (name, profession, address,
 * register number and the page's state, inked outlined, solid or hatched), with the owner's
 * photo beside it when there is one, then the owner's headline and one sentence on what the
 * state means. The stamp is the page's only mark: it starts on the column's edge, like the
 * lines under it.
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
	address,
	className,
}: PractitionerHeaderProps) {
	const verified = status === "verified";
	const Heading = `h${headingLevel}` as const;
	return (
		<header className={cn("flex flex-col gap-4", className)}>
			<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
				{photo ? (
					<img
						src={photo.src}
						alt={photo.alt}
						width={128}
						height={128}
						className="block size-32 shrink-0 self-start rounded-field border border-rule-soft bg-paper-shade object-cover sm:self-center"
					/>
				) : null}
				<Stamp ink={stampInkOf(status)} className="w-full min-w-0 sm:w-fit sm:min-w-[22rem]">
					<div className="flex flex-col gap-1 px-4 pt-3 pb-3.5 sm:px-5 sm:pt-4">
						<Heading className="type-headline">{name}</Heading>
						<p className="text-lead">{profession}</p>
						{address ? <p className="text-meta">{address}</p> : null}
					</div>
					<StampFoot>
						<span>
							<span className="me-1.5">{rppsLabel}</span>
							<span>{rpps}</span>
						</span>
						<span className="inline-flex items-center gap-1.5">
							{verified ? <CheckIcon className="size-4" strokeWidth={2.5} /> : null}
							{statusLabel}
						</span>
					</StampFoot>
				</Stamp>
			</div>
			{headline || statusNote ? (
				<div className="flex flex-col gap-1.5">
					{headline ? <p className="max-w-[60ch] text-body text-ink">{headline}</p> : null}
					{statusNote ? (
						<p className="max-w-[65ch] text-meta text-ink-muted">{statusNote}</p>
					) : null}
				</div>
			) : null}
		</header>
	);
}
