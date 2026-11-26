import type { ReactNode } from "react";
import { BuildingIcon, InfoIcon, PhoneIcon } from "../icons";
import { buttonStyles, cn } from "../recipes";

interface ActionBlockBase {
	/** Heading of the block, e.g. "Appointments". */
	title: string;
	/** Heading level so the block fits the page outline. */
	headingLevel?: 2 | 3 | 4;
	className?: string;
}

/** Online booking is open on Apercura. */
export interface BookAction extends ActionBlockBase {
	kind: "book";
	/** What happens, e.g. "Online booking is open. Free, no account needed." */
	statement: ReactNode;
	/** The next free slot, printed under the statement, e.g. "Tuesday 24 November, 09:30". */
	nextSlot?: { label: string; value: ReactNode } | null;
	actionLabel: string;
	href: string;
	/**
	 * Replaces the plain stamp link with an interactive control (the booking panel trigger), which
	 * should render `href` as a link until it hydrates.
	 */
	action?: ReactNode;
	/** Another way to book under the stamp, e.g. "Or call 01 00 00 00 00". */
	secondary?: ReactNode;
}

/** No online booking: the honest next step is calling the practice. */
export interface CallAction extends ActionBlockBase {
	kind: "call";
	statement: ReactNode;
	/** Accessible, visible call label, e.g. "Call 01 23 45 67 89". */
	actionLabel: string;
	/** Phone number in E.164 form, used for the `tel:` link. */
	phone: string;
}

/** Appointments go through the establishment (hospital, health centre). */
export interface EstablishmentAction extends ActionBlockBase {
	kind: "establishment";
	statement: ReactNode;
	actionLabel: string;
	href: string;
	/** Screen-reader suffix for the external link, e.g. "opens another site". */
	externalLabel?: string;
}

/** Locum practitioner: no direct booking exists, say so and point to the alternative. */
export interface LocumAction extends ActionBlockBase {
	kind: "locum";
	statement: ReactNode;
	/** Optional extra guidance (e.g. "Contact the practice where they work"). */
	hint?: ReactNode;
}

/** No action is possible here (no phone published…): say so and what to try instead. */
export interface NoticeAction extends ActionBlockBase {
	kind: "notice";
	statement: ReactNode;
	hint?: ReactNode;
}

export type ActionBlockProps =
	| BookAction
	| CallAction
	| EstablishmentAction
	| LocumAction
	| NoticeAction;

/**
 * "What can I do next?": the first entry of the form, opened by a hairline. Every state says
 * plainly what the patient can actually do; only online booking takes the violet ink.
 */
export function ActionBlock(props: ActionBlockProps) {
	const { title, headingLevel = 2, className } = props;
	const Heading = `h${headingLevel}` as const;
	return (
		<section
			data-kind={props.kind}
			className={cn("rule-t flex flex-col gap-4 pt-4", className)}
			aria-label={title}
		>
			<Heading className="type-title text-ink">{title}</Heading>
			<div className="flex flex-col gap-4">
				<p className="flex items-start gap-3 text-body text-ink">
					{props.kind === "locum" || props.kind === "notice" ? (
						<InfoIcon className="mt-0.5 size-6 shrink-0" />
					) : null}
					<span>{props.statement}</span>
				</p>
				{props.kind === "book" && props.nextSlot ? (
					<p className="flex flex-col gap-0.5 border-y border-rule-soft py-2.5">
						<span className="type-caption text-ink-muted">{props.nextSlot.label}</span>
						<span className="tabular text-lead font-semibold text-ink">{props.nextSlot.value}</span>
					</p>
				) : null}
				{props.kind === "book"
					? (props.action ?? (
							<a
								href={props.href}
								className={buttonStyles({
									intent: "stamp",
									size: "lg",
									className: "self-stretch sm:self-start",
								})}
							>
								{props.actionLabel}
							</a>
						))
					: null}
				{props.kind === "book" && props.secondary ? (
					<p className="text-meta text-ink">{props.secondary}</p>
				) : null}
				{props.kind === "call" ? (
					<a
						href={`tel:${props.phone}`}
						className={buttonStyles({
							intent: "ink",
							size: "lg",
							className: "self-stretch sm:self-start",
						})}
					>
						<PhoneIcon className="size-5" />
						<span className="tabular">{props.actionLabel}</span>
					</a>
				) : null}
				{props.kind === "establishment" ? (
					<a
						href={props.href}
						className={buttonStyles({
							intent: "ink",
							size: "lg",
							className: "self-stretch sm:self-start",
						})}
					>
						<BuildingIcon className="size-5" />
						{props.actionLabel}
						{props.externalLabel ? <span className="sr-only"> ({props.externalLabel})</span> : null}
					</a>
				) : null}
				{(props.kind === "locum" || props.kind === "notice") && props.hint ? (
					<p className="text-meta text-ink-muted">{props.hint}</p>
				) : null}
			</div>
		</section>
	);
}
