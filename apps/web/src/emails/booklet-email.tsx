/**
 * Email layout in the booklet world: a petrol cover band with the wordmark,
 * white paper, ink type and a single violet stamp for the action.
 * Email clients ignore stylesheets and custom fonts, so styles are inline and
 * the faces fall back to Arial.
 */
import {
	Body,
	Button,
	Container,
	Head,
	Hr,
	Html,
	Preview,
	Section,
	Text,
} from "@react-email/components";
import type { ReactNode } from "react";

export const emailColors = {
	paper: "#ffffff",
	ink: "#003851",
	inkMuted: "#3c5d70",
	rule: "#bcced9",
	coverMuted: "#c2d8e5",
	stamp: "#5f38a7",
} as const;

const display = "'Archivo', Arial, Helvetica, sans-serif";
const body = "'Atkinson Hyperlegible Next', Arial, Helvetica, sans-serif";

export interface BookletEmailProps {
	lang: string;
	preview: string;
	wordmark: string;
	runningHead: string;
	footer: string;
	children: ReactNode;
}

export function BookletEmail({
	lang,
	preview,
	wordmark,
	runningHead,
	footer,
	children,
}: BookletEmailProps) {
	return (
		<Html lang={lang}>
			<Head />
			<Preview>{preview}</Preview>
			<Body style={{ backgroundColor: emailColors.paper, margin: 0, padding: 0 }}>
				<Container style={{ maxWidth: "560px", margin: "0 auto" }}>
					<Section style={{ backgroundColor: emailColors.ink, padding: "20px 24px" }}>
						<Text
							style={{
								margin: 0,
								color: emailColors.paper,
								fontFamily: display,
								fontSize: "24px",
								fontWeight: 900,
								letterSpacing: "-0.01em",
							}}
						>
							{wordmark}
						</Text>
					</Section>
					<Section style={{ padding: "24px 24px 8px" }}>
						<Text
							style={{
								margin: 0,
								paddingBottom: "6px",
								borderBottom: `1.5px solid ${emailColors.ink}`,
								color: emailColors.ink,
								fontFamily: display,
								fontSize: "13px",
								fontWeight: 700,
								letterSpacing: "0.07em",
								textTransform: "uppercase",
							}}
						>
							{runningHead}
						</Text>
					</Section>
					<Section style={{ padding: "8px 24px 24px" }}>{children}</Section>
					<Section style={{ padding: "0 24px 32px" }}>
						<Hr style={{ borderColor: emailColors.rule, margin: "0 0 12px" }} />
						<Text
							style={{ margin: 0, color: emailColors.inkMuted, fontFamily: body, fontSize: "14px" }}
						>
							{footer}
						</Text>
					</Section>
				</Container>
			</Body>
		</Html>
	);
}

export function EmailTitle({ children }: { children: ReactNode }) {
	return (
		<Text
			style={{
				margin: "16px 0 8px",
				color: emailColors.ink,
				fontFamily: display,
				fontSize: "26px",
				fontWeight: 900,
				lineHeight: 1.15,
			}}
		>
			{children}
		</Text>
	);
}

export function EmailParagraph({ children, muted }: { children: ReactNode; muted?: boolean }) {
	return (
		<Text
			style={{
				margin: "0 0 16px",
				color: muted ? emailColors.inkMuted : emailColors.ink,
				fontFamily: body,
				fontSize: muted ? "15px" : "17px",
				lineHeight: 1.55,
			}}
		>
			{children}
		</Text>
	);
}

/** The stamp: violet fill, white inner frame, uppercase label. */
export function EmailStamp({ href, children }: { href: string; children: ReactNode }) {
	return (
		<Button
			href={href}
			style={{
				display: "inline-block",
				margin: "8px 0 24px",
				padding: "14px 22px",
				backgroundColor: emailColors.stamp,
				border: `3px solid ${emailColors.stamp}`,
				outline: `1.5px solid ${emailColors.paper}`,
				outlineOffset: "-4.5px",
				borderRadius: "2px",
				color: emailColors.paper,
				fontFamily: display,
				fontSize: "15px",
				fontWeight: 700,
				letterSpacing: "0.05em",
				textTransform: "uppercase",
				textDecoration: "none",
			}}
		>
			{children}
		</Button>
	);
}
