/**
 * Email layout in the booklet world: a white running head closed by a hairline,
 * white paper, graphite type and a single muted violet stamp for the action.
 * Email clients ignore stylesheets and custom fonts, so styles are inline and
 * the faces fall back to Arial.
 */

import { paletteHex } from "@apercura/ui/tokens";
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

/** The design tokens as hex (email clients cannot parse OKLCH). */
export const emailColors = {
	paper: paletteHex.paper,
	ink: paletteHex.ink,
	inkMuted: paletteHex.inkMuted,
	rule: paletteHex.ruleSoft,
	stamp: paletteHex.stamp,
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
					<Section
						style={{ borderBottom: `1px solid ${emailColors.rule}`, padding: "20px 24px 16px" }}
					>
						<Text
							style={{
								margin: 0,
								color: emailColors.ink,
								fontFamily: display,
								fontSize: "22px",
								fontWeight: 600,
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
								borderBottom: `1px solid ${emailColors.ink}`,
								color: emailColors.ink,
								fontFamily: display,
								fontSize: "13px",
								fontWeight: 600,
								letterSpacing: "0.045em",
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
				fontSize: "24px",
				fontWeight: 600,
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

/** The stamp: muted violet fill, a hairline white inner frame, sentence-case label. */
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
				outline: `1px solid ${emailColors.paper}`,
				outlineOffset: "-4px",
				borderRadius: "2px",
				color: emailColors.paper,
				fontFamily: display,
				fontSize: "15px",
				fontWeight: 600,
				textDecoration: "none",
			}}
		>
			{children}
		</Button>
	);
}
