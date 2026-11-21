import { Link, Section, Text } from "@react-email/components";
import { BookletEmail, EmailParagraph, EmailStamp, EmailTitle, emailColors } from "./booklet-email";

const display = "'Archivo', Arial, Helvetica, sans-serif";
const body = "'Atkinson Hyperlegible Next', Arial, Helvetica, sans-serif";

export interface BookingEmailProps {
	lang: string;
	preview: string;
	wordmark: string;
	runningHead: string;
	footer: string;
	title: string;
	paragraphs: string[];
	/** Label/value rows of the slip: practitioner, date, time, address. */
	details?: { label: string; value: string }[];
	/** A one-time code, printed large. */
	code?: string | null;
	action?: { href: string; label: string; fallback: string } | null;
	notes?: string[];
}

/**
 * Every booking email, in the booklet world: a title, a few sentences, the appointment slip
 * (label/value rows ruled like the printed booklet), an optional code or stamp. Patient emails
 * stay minimal: practitioner, date, time, address and the manage link, never a specialty or a
 * reason.
 */
export function BookingEmail(props: BookingEmailProps) {
	return (
		<BookletEmail
			lang={props.lang}
			preview={props.preview}
			wordmark={props.wordmark}
			runningHead={props.runningHead}
			footer={props.footer}
		>
			<EmailTitle>{props.title}</EmailTitle>
			{props.paragraphs.map((paragraph) => (
				<EmailParagraph key={paragraph}>{paragraph}</EmailParagraph>
			))}
			{props.code ? (
				<Text
					style={{
						margin: "8px 0 24px",
						padding: "12px 16px",
						display: "inline-block",
						border: `1.5px solid ${emailColors.ink}`,
						color: emailColors.ink,
						fontFamily: display,
						fontSize: "32px",
						fontWeight: 900,
						letterSpacing: "0.3em",
					}}
				>
					{props.code}
				</Text>
			) : null}
			{props.details && props.details.length > 0 ? (
				<Section
					style={{
						margin: "8px 0 24px",
						borderTop: `1.5px solid ${emailColors.ink}`,
					}}
				>
					{props.details.map((row) => (
						<Text
							key={row.label}
							style={{
								margin: 0,
								padding: "8px 0",
								borderBottom: `1px solid ${emailColors.rule}`,
								color: emailColors.ink,
								fontFamily: body,
								fontSize: "16px",
								lineHeight: 1.45,
							}}
						>
							<span
								style={{
									display: "inline-block",
									minWidth: "96px",
									color: emailColors.inkMuted,
									fontFamily: display,
									fontSize: "13px",
									fontWeight: 700,
									letterSpacing: "0.06em",
									textTransform: "uppercase",
								}}
							>
								{row.label}
							</span>{" "}
							{row.value}
						</Text>
					))}
				</Section>
			) : null}
			{props.action ? (
				<>
					<EmailStamp href={props.action.href}>{props.action.label}</EmailStamp>
					<EmailParagraph muted>{props.action.fallback}</EmailParagraph>
					<EmailParagraph muted>
						<Link
							href={props.action.href}
							style={{ color: emailColors.ink, wordBreak: "break-all" }}
						>
							{props.action.href}
						</Link>
					</EmailParagraph>
				</>
			) : null}
			{(props.notes ?? []).map((note) => (
				<EmailParagraph key={note} muted>
					{note}
				</EmailParagraph>
			))}
		</BookletEmail>
	);
}
