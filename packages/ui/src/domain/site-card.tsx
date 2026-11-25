import type { ReactNode } from "react";
import { ArrowOutIcon, PinIcon } from "../icons";
import { cn, focusRing } from "../recipes";
import { type Coordinates, directionsLinks } from "./directions";

export interface SiteCardProps {
	/** Name of the place, e.g. "Cabinet médical de l'Exemple". */
	name: string;
	/** Address lines, street first. */
	address: string[];
	coordinates?: Coordinates;
	/** "Directions", in the page language. */
	directionsLabel: string;
	/** Link texts for each map app. */
	providers: { openStreetMap: string; appleMaps: string; googleMaps: string };
	/** Screen-reader suffix for external links, e.g. "opens another site". */
	externalLabel: string;
	/** Extra facts about the place (phone, access), usually a `FieldList`. */
	children?: ReactNode;
	headingLevel?: 2 | 3 | 4;
	className?: string;
}

/**
 * One place of practice: name, postal address, optional facts and directions
 * links that open the visitor's own map app. Set as a ruled section, not a card.
 */
export function SiteCard({
	name,
	address,
	coordinates,
	directionsLabel,
	providers,
	externalLabel,
	children,
	headingLevel = 3,
	className,
}: SiteCardProps) {
	const Heading = `h${headingLevel}` as const;
	const links = coordinates ? directionsLinks(coordinates) : null;
	return (
		<section className={cn("flex flex-col gap-4 border-t border-rule-soft pt-4", className)}>
			<div className="flex items-start gap-3">
				<PinIcon className="mt-1 size-6 shrink-0 text-ink" />
				<div className="flex flex-col gap-1">
					<Heading className="type-subtitle text-ink">{name}</Heading>
					<address className="text-body not-italic text-ink">
						{address.map((line) => (
							<span key={line} className="block">
								{line}
							</span>
						))}
					</address>
				</div>
			</div>
			{children}
			{links ? (
				<div className="flex flex-col gap-2">
					<p className="type-caption text-ink">{directionsLabel}</p>
					<ul className="flex flex-wrap gap-2">
						{(["openStreetMap", "appleMaps", "googleMaps"] as const).map((provider) => (
							<li key={provider}>
								<a
									href={links[provider]}
									rel="noopener noreferrer"
									className={cn(
										"inline-flex min-h-11 items-center gap-1.5 rounded-field border border-field-edge px-3.5 text-meta font-semibold text-ink no-underline hover:border-ink hover:bg-paper-shade",
										focusRing,
									)}
								>
									{providers[provider]}
									<ArrowOutIcon className="size-4" />
									<span className="sr-only"> ({externalLabel})</span>
								</a>
							</li>
						))}
					</ul>
				</div>
			) : null}
		</section>
	);
}
