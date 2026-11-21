"use client";

import type { ReactNode } from "react";
import {
	Button as RACButton,
	SearchField as RACSearchField,
	type SearchFieldProps as RACSearchFieldProps,
} from "react-aria-components";
import { CloseIcon, SearchIcon } from "../icons";
import { fieldStyles, focusRing } from "../recipes";
import { FieldDescription, FieldError, Input, Label } from "./field";

const styles = fieldStyles();

export interface SearchFieldProps extends Omit<RACSearchFieldProps, "children"> {
	label: ReactNode;
	description?: ReactNode;
	errorMessage?: string;
	placeholder?: string;
	/** Accessible label of the clear button. */
	clearLabel: string;
}

/** Search input with a leading search mark and a clear button once filled. */
export function SearchField({
	label,
	description,
	errorMessage,
	placeholder,
	clearLabel,
	className,
	...props
}: SearchFieldProps) {
	return (
		<RACSearchField
			{...props}
			className={styles.root({ className: typeof className === "string" ? className : undefined })}
		>
			{({ isEmpty }) => (
				<>
					<Label>{label}</Label>
					<div className={styles.box()}>
						<SearchIcon className="ms-3.5 size-5 shrink-0 text-ink-muted" />
						<Input placeholder={placeholder} className="ps-2.5" />
						{isEmpty ? null : (
							<RACButton
								aria-label={clearLabel}
								className={`me-0.5 flex size-11 shrink-0 cursor-pointer items-center justify-center text-ink hover:bg-paper-shade ${focusRing}`}
							>
								<CloseIcon className="size-5" />
							</RACButton>
						)}
					</div>
					{description ? <FieldDescription>{description}</FieldDescription> : null}
					<FieldError>{errorMessage}</FieldError>
				</>
			)}
		</RACSearchField>
	);
}
