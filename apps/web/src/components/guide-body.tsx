import { linkStyles, Notice, tableStyles } from "@apercura/ui";
import type { Token, Tokens } from "marked";
import type { ReactNode } from "react";
import type { AnchoredHeading } from "~/lib/guides/guide";

/**
 * The body of a guide, from its Markdown tokens (~/lib/guides/guide), as plain server-rendered
 * elements styled with the booklet's tokens: no HTML string is ever injected. `##` headings
 * carry the anchors of the table of contents; a blockquote is printed as an information slip
 * (a key point, where to call in an emergency); links to another site say so to screen readers.
 */
export function GuideBody({ tokens, externalLabel }: { tokens: Token[]; externalLabel: string }) {
	return <div className="flex flex-col gap-5">{blocks(tokens, externalLabel)}</div>;
}

const table = tableStyles();
const paragraph = "max-w-[65ch] text-body text-ink";

function blocks(tokens: readonly Token[], external: string): ReactNode[] {
	return tokens.map((token, index) => block(token, index, external));
}

function block(token: Token, key: number, external: string): ReactNode {
	switch (token.type) {
		case "heading": {
			const heading = token as AnchoredHeading;
			const children = inline(heading.tokens, external);
			return heading.depth === 2 ? (
				<h2
					key={key}
					id={heading.anchor}
					className="mt-6 scroll-mt-6 border-t border-rule-soft pt-6 type-title text-ink first:mt-0"
				>
					{children}
				</h2>
			) : (
				<h3 key={key} id={heading.anchor} className="mt-2 scroll-mt-6 type-subtitle text-ink">
					{children}
				</h3>
			);
		}
		case "paragraph":
			return (
				<p key={key} className={paragraph}>
					{inline((token as Tokens.Paragraph).tokens, external)}
				</p>
			);
		case "list":
			return list(token as Tokens.List, key, external);
		case "blockquote":
			return (
				<Notice key={key} role="none" className="max-w-[65ch] [&_p]:text-body">
					<div className="flex flex-col gap-3">
						{blocks((token as Tokens.Blockquote).tokens, external)}
					</div>
				</Notice>
			);
		case "table": {
			const data = token as Tokens.Table;
			return (
				<div key={key} className="max-w-full overflow-x-auto">
					<table className={table.table()}>
						<thead className={table.head()}>
							<tr>
								{data.header.map((cell, index) => (
									<th
										// biome-ignore lint/suspicious/noArrayIndexKey: a column has no other identity.
										key={index}
										scope="col"
										className={table.column()}
									>
										{inline(cell.tokens, external)}
									</th>
								))}
							</tr>
						</thead>
						<tbody>
							{data.rows.map((row, rowIndex) => (
								// biome-ignore lint/suspicious/noArrayIndexKey: rows are static content.
								<tr key={rowIndex} className={table.row()}>
									{row.map((cell, index) =>
										index === 0 ? (
											<th
												// biome-ignore lint/suspicious/noArrayIndexKey: a column has no other identity.
												key={index}
												scope="row"
												className={`${table.cell()} text-left font-semibold`}
											>
												{inline(cell.tokens, external)}
											</th>
										) : (
											// biome-ignore lint/suspicious/noArrayIndexKey: a column has no other identity.
											<td key={index} className={table.cell()}>
												{inline(cell.tokens, external)}
											</td>
										),
									)}
								</tr>
							))}
						</tbody>
					</table>
				</div>
			);
		}
		case "hr":
			return <hr key={key} className="border-rule-soft" />;
		default:
			// `space` and anything the parser already refused.
			return null;
	}
}

function list(token: Tokens.List, key: number, external: string): ReactNode {
	const content = (item: Tokens.ListItem) =>
		item.tokens.map((child, childIndex) =>
			child.type === "text" ? (
				// biome-ignore lint/suspicious/noArrayIndexKey: static content.
				<span key={childIndex}>{inline((child as Tokens.Text).tokens ?? [child], external)}</span>
			) : (
				block(child, childIndex, external)
			),
		);
	if (token.ordered) {
		// Native numbering, so assistive technology announces the steps as it prints them.
		return (
			<ol
				key={key}
				start={Number(token.start || 1)}
				className="max-w-[65ch] list-decimal border-t border-rule-soft ps-7 marker:font-semibold"
			>
				{token.items.map((item, index) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: list items are static content.
					<li key={index} className="border-b border-rule-soft py-2.5 ps-1 text-body text-ink">
						<div className="flex min-w-0 flex-col gap-2">{content(item)}</div>
					</li>
				))}
			</ol>
		);
	}
	return (
		<ul key={key} className="max-w-[65ch] border-t border-rule-soft">
			{token.items.map((item, index) => (
				<li
					// biome-ignore lint/suspicious/noArrayIndexKey: list items are static content.
					key={index}
					className="flex gap-3 border-b border-rule-soft py-2.5 text-body text-ink"
				>
					<span aria-hidden="true" className="mt-[0.8em] h-px w-3 shrink-0 bg-ink" />
					<div className="flex min-w-0 flex-col gap-2">{content(item)}</div>
				</li>
			))}
		</ul>
	);
}

function inline(tokens: readonly Token[] | undefined, external: string): ReactNode[] {
	return (tokens ?? []).map((token, index) => inlineToken(token, index, external));
}

function inlineToken(token: Token, key: number, external: string): ReactNode {
	switch (token.type) {
		case "text": {
			const text = token as Tokens.Text;
			return text.tokens && text.tokens.length > 0 ? (
				<span key={key}>{inline(text.tokens, external)}</span>
			) : (
				text.text
			);
		}
		case "escape":
			return (token as Tokens.Escape).text;
		case "strong":
			return (
				<strong key={key} className="font-semibold">
					{inline((token as Tokens.Strong).tokens, external)}
				</strong>
			);
		case "em":
			return <em key={key}>{inline((token as Tokens.Em).tokens, external)}</em>;
		case "codespan":
			return (
				<code key={key} className="tabular">
					{(token as Tokens.Codespan).text}
				</code>
			);
		case "br":
			return <br key={key} />;
		case "link": {
			const link = token as Tokens.Link;
			const children = inline(link.tokens, external);
			if (link.href.startsWith("https://")) {
				return (
					<a key={key} href={link.href} rel="noopener noreferrer" className={linkStyles()}>
						{children}
						<span className="sr-only"> ({external})</span>
					</a>
				);
			}
			return (
				<a key={key} href={link.href} className={linkStyles()}>
					{children}
				</a>
			);
		}
		default:
			return null;
	}
}
