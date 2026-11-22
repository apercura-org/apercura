"use client";

import type { ReactNode } from "react";
import {
	composeRenderProps,
	Radio as RACRadio,
	RadioGroup as RACRadioGroup,
	type RadioGroupProps as RACRadioGroupProps,
	type RadioProps as RACRadioProps,
} from "react-aria-components";
import { tv } from "../recipes/tv";
import { FieldDescription, FieldError, Label } from "./field";

const radio = tv({
	slots: {
		group: "flex flex-col gap-1.5",
		root: "group flex min-h-11 cursor-pointer items-center gap-3 text-body text-ink data-disabled:cursor-not-allowed data-disabled:text-ink-disabled",
		ring: [
			"flex size-6 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-paper",
			"group-data-invalid:border-error group-data-disabled:border-ink-disabled",
			"group-data-focus-visible:outline-3 group-data-focus-visible:outline-solid group-data-focus-visible:outline-offset-2 group-data-focus-visible:outline-(--focus-ring)",
		],
		dot: "block size-3 scale-0 rounded-full bg-ink transition-transform duration-150 ease-out group-data-selected:scale-100 forced-colors:bg-[CanvasText]",
	},
});

export interface RadioGroupProps extends Omit<RACRadioGroupProps, "children"> {
	label: ReactNode;
	description?: ReactNode;
	errorMessage?: string;
	children: ReactNode;
}

export function RadioGroup({
	label,
	description,
	errorMessage,
	children,
	className,
	...props
}: RadioGroupProps) {
	const styles = radio();
	return (
		<RACRadioGroup
			{...props}
			className={composeRenderProps(className, (cls) => styles.group({ className: cls }))}
		>
			<Label>{label}</Label>
			{description ? <FieldDescription>{description}</FieldDescription> : null}
			<div className="flex flex-col">{children}</div>
			<FieldError>{errorMessage}</FieldError>
		</RACRadioGroup>
	);
}

export interface RadioProps extends Omit<RACRadioProps, "children"> {
	children: ReactNode;
}

export function Radio({ className, children, ...props }: RadioProps) {
	const styles = radio();
	return (
		<RACRadio
			{...props}
			className={composeRenderProps(className, (cls) => styles.root({ className: cls }))}
		>
			<span className={styles.ring()}>
				<span className={styles.dot()} />
			</span>
			<span>{children}</span>
		</RACRadio>
	);
}
