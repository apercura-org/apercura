import { Link } from "@react-email/components";
import { BookletEmail, EmailParagraph, EmailStamp, EmailTitle, emailColors } from "./booklet-email";

export interface NoticeEmailProps {
	lang: string;
	preview: string;
	wordmark: string;
	runningHead: string;
	footer: string;
	title: string;
	paragraphs: string[];
	/** Optional stamped action, with its URL printed below for copying. */
	action?: { label: string; url: string; fallback: string };
	notes?: string[];
}

/** A short booklet message: title, paragraphs, an optional action and muted notes. */
export function NoticeEmail({
	lang,
	preview,
	wordmark,
	runningHead,
	footer,
	title,
	paragraphs,
	action,
	notes = [],
}: NoticeEmailProps) {
	return (
		<BookletEmail
			lang={lang}
			preview={preview}
			wordmark={wordmark}
			runningHead={runningHead}
			footer={footer}
		>
			<EmailTitle>{title}</EmailTitle>
			{paragraphs.map((paragraph) => (
				<EmailParagraph key={paragraph}>{paragraph}</EmailParagraph>
			))}
			{action ? (
				<>
					<EmailStamp href={action.url}>{action.label}</EmailStamp>
					<EmailParagraph muted>{action.fallback}</EmailParagraph>
					<EmailParagraph muted>
						<Link href={action.url} style={{ color: emailColors.ink, wordBreak: "break-all" }}>
							{action.url}
						</Link>
					</EmailParagraph>
				</>
			) : null}
			{notes.map((note) => (
				<EmailParagraph key={note} muted>
					{note}
				</EmailParagraph>
			))}
		</BookletEmail>
	);
}
