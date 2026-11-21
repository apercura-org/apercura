import { Link } from "@react-email/components";
import { BookletEmail, EmailParagraph, EmailStamp, EmailTitle, emailColors } from "./booklet-email";

export interface VerifyEmailStrings {
	preview: string;
	wordmark: string;
	runningHead: string;
	title: string;
	greeting: string;
	body: string;
	action: string;
	fallback: string;
	expiry: string;
	ignore: string;
	footer: string;
}

export interface VerifyEmailProps {
	lang: string;
	url: string;
	strings: VerifyEmailStrings;
}

/** "Confirm your email address" message sent after sign-up (and on sign-in while unconfirmed). */
export function VerifyEmail({ lang, url, strings }: VerifyEmailProps) {
	return (
		<BookletEmail
			lang={lang}
			preview={strings.preview}
			wordmark={strings.wordmark}
			runningHead={strings.runningHead}
			footer={strings.footer}
		>
			<EmailTitle>{strings.title}</EmailTitle>
			<EmailParagraph>{strings.greeting}</EmailParagraph>
			<EmailParagraph>{strings.body}</EmailParagraph>
			<EmailStamp href={url}>{strings.action}</EmailStamp>
			<EmailParagraph muted>{strings.fallback}</EmailParagraph>
			<EmailParagraph muted>
				<Link href={url} style={{ color: emailColors.ink, wordBreak: "break-all" }}>
					{url}
				</Link>
			</EmailParagraph>
			<EmailParagraph muted>{strings.expiry}</EmailParagraph>
			<EmailParagraph muted>{strings.ignore}</EmailParagraph>
		</BookletEmail>
	);
}
