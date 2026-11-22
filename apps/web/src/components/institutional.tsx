import { Badge, FieldRow, linkStyles } from "@apercura/ui";
import type { ReactNode } from "react";

/** Text of one section of an institutional page, as stored in the messages. */
export type ProseContent = {
	heading: string;
	/** Paragraphs, in order. */
	body?: string[];
	/** A ruled list printed after the paragraphs. */
	list?: string[];
};

/**
 * The opening of an institutional page, on the quiet shade: title, a short lead and,
 * for drafts, a printed mark saying what is still to be completed.
 */
export function InstitutionalCover({
	title,
	lead,
	mark,
	note,
}: {
	title: string;
	lead: string;
	/** e.g. "Draft: to be completed before launch". */
	mark?: string;
	/** A short line under the lead, e.g. what the `{{…}}` placeholders mean. */
	note?: string | null;
}) {
	return (
		<div className="surface-shade border-b border-rule-soft">
			<div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-5 pt-10 pb-10 sm:px-8 sm:pb-12">
				{mark ? (
					<p>
						<Badge tone="ink">{mark}</Badge>
					</p>
				) : null}
				<h1 className="max-w-[22ch] type-headline">{title}</h1>
				<p className="max-w-[60ch] text-lead text-ink">{lead}</p>
				{note ? <p className="max-w-[65ch] text-meta text-ink">{note}</p> : null}
			</div>
		</div>
	);
}

/**
 * One section of an institutional page: heading and intro on the left, the
 * facts on the right from 768 px (the booklet's 5/7 split), stacked below.
 */
export function ProseSection({
	id,
	content,
	children,
	aside,
}: {
	id: string;
	content: ProseContent;
	/** Facts printed after the paragraphs (field list, table, link…). */
	children?: ReactNode;
	/** Extra content under the heading, in the left column. */
	aside?: ReactNode;
}) {
	const headingId = `${id}-heading`;
	return (
		<section
			id={id}
			aria-labelledby={headingId}
			className="grid scroll-mt-6 gap-5 border-t border-ink pt-6 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:gap-12"
		>
			<div className="flex flex-col gap-3">
				<h2 id={headingId} className="type-title text-ink">
					{content.heading}
				</h2>
				{aside}
			</div>
			<div className="flex min-w-0 flex-col gap-4">
				{content.body?.map((paragraph) => (
					<p key={paragraph} className="max-w-[65ch] text-body text-ink">
						{paragraph}
					</p>
				))}
				{content.list && content.list.length > 0 ? (
					<ul className="max-w-[65ch] border-t border-rule-soft">
						{content.list.map((item) => (
							<li
								key={item}
								className="flex gap-3 border-b border-rule-soft py-2.5 text-body text-ink"
							>
								<span aria-hidden="true" className="mt-[0.7em] h-px w-3 shrink-0 bg-ink" />
								<span>{item}</span>
							</li>
						))}
					</ul>
				) : null}
				{children}
			</div>
		</section>
	);
}

/** A link to another site, with its screen-reader suffix ("opens another site"). */
export function ExternalLink({
	href,
	children,
	externalLabel,
	className,
}: {
	href: string;
	children: ReactNode;
	externalLabel: string;
	className?: string;
}) {
	return (
		<a href={href} rel="noopener noreferrer" className={linkStyles({ className })}>
			{children}
			<span className="sr-only"> ({externalLabel})</span>
		</a>
	);
}

/**
 * A fact of the legal pages (publisher, host, contacts) as configured, or its `{{…}}`
 * placeholder while it is unknown, printed as such (see lib/legal.ts). Email addresses link.
 */
export function LegalFactValue({
	fact,
	email = false,
}: {
	fact: { value: string; missing: boolean };
	email?: boolean;
}) {
	if (fact.missing) {
		return (
			<span data-legal-placeholder="" className="break-all text-ink-muted">
				{fact.value}
			</span>
		);
	}
	return email ? (
		<a href={`mailto:${fact.value}`} className={linkStyles()}>
			{fact.value}
		</a>
	) : (
		fact.value
	);
}

/** A field row whose value is a legal fact (see LegalFactValue). */
export function LegalFactRow({
	label,
	fact,
	email,
	emptyLabel,
}: {
	label: string;
	fact: { value: string; missing: boolean };
	email?: boolean;
	emptyLabel: string;
}) {
	return (
		<FieldRow
			label={label}
			value={<LegalFactValue fact={fact} email={email} />}
			emptyLabel={emptyLabel}
		/>
	);
}
