"use client";

import type { ReactNode } from "react";
import {
	Button as RACButton,
	Select as RACSelect,
	type SelectProps as RACSelectProps,
	SelectValue,
} from "react-aria-components";
import { ChevronDownIcon } from "../icons";
import { cn, fieldStyles } from "../recipes";
import { FieldDescription, FieldError, Label } from "./field";
import { ListBox } from "./list-box";
import { Popover } from "./popover";

const styles = fieldStyles();

export interface SelectProps<T extends object> extends Omit<RACSelectProps<T>, "children"> {
	label: ReactNode;
	description?: ReactNode;
	errorMessage?: string;
	items?: Iterable<T>;
	children: React.ReactNode | ((item: T) => React.ReactNode);
}

/** Single choice from a short list. The trigger reads like a filled form field. */
export function Select<T extends object>({
	label,
	description,
	errorMessage,
	children,
	items,
	className,
	...props
}: SelectProps<T>) {
	return (
		<RACSelect
			{...props}
			className={styles.root({ className: typeof className === "string" ? className : undefined })}
		>
			<Label>{label}</Label>
			<RACButton
				className={cn(
					styles.box(),
					"cursor-pointer justify-between gap-2 px-3.5 py-2.5 text-start text-body",
					"data-focus-visible:outline-3 data-focus-visible:outline-solid data-focus-visible:outline-offset-2 data-focus-visible:outline-(--focus-ring)",
					"data-pressed:border-ink",
				)}
			>
				<SelectValue className="flex-1 truncate data-placeholder:text-ink-muted" />
				<ChevronDownIcon className="size-5 shrink-0" />
			</RACButton>
			{description ? <FieldDescription>{description}</FieldDescription> : null}
			<FieldError>{errorMessage}</FieldError>
			<Popover placement="bottom start">
				<ListBox items={items}>{children}</ListBox>
			</Popover>
		</RACSelect>
	);
}
