"use client";

import type { ReactNode } from "react";
import {
	TimeField as RACTimeField,
	type TimeFieldProps as RACTimeFieldProps,
	type TimeValue,
} from "react-aria-components";
import { ClockIcon } from "../icons";
import { cn, fieldStyles } from "../recipes";
import { DateSegments } from "./date-segments";
import { FieldDescription, FieldError, Label } from "./field";

const styles = fieldStyles();

export interface TimeFieldProps<T extends TimeValue>
	extends Omit<RACTimeFieldProps<T>, "children"> {
	label: ReactNode;
	description?: ReactNode;
	errorMessage?: string;
}

/** Time typed segment by segment (hours, minutes), 24-hour clock in French. */
export function TimeField<T extends TimeValue>({
	label,
	description,
	errorMessage,
	className,
	...props
}: TimeFieldProps<T>) {
	return (
		<RACTimeField
			{...props}
			className={styles.root({ className: typeof className === "string" ? className : undefined })}
		>
			<Label>{label}</Label>
			<div
				className={cn(
					styles.box(),
					"w-auto max-w-full has-[[data-focused]]:outline-3 has-[[data-focused]]:outline-solid has-[[data-focused]]:outline-offset-2 has-[[data-focused]]:outline-(--focus-ring)",
				)}
			>
				<ClockIcon className="ms-3.5 size-5 shrink-0 text-ink-muted" />
				<DateSegments className="ps-2" />
			</div>
			{description ? <FieldDescription>{description}</FieldDescription> : null}
			<FieldError>{errorMessage}</FieldError>
		</RACTimeField>
	);
}
