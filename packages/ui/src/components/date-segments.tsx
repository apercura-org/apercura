"use client";

import { DateInput, type DateInputProps, DateSegment } from "react-aria-components";
import { cn } from "../recipes";

/** Editable date or time segments (day, month, year, hour, minute). */
export function DateSegments({ className, ...props }: Omit<DateInputProps, "children">) {
	return (
		<DateInput
			{...props}
			className={cn(
				"flex flex-1 items-center px-3.5 py-2.5 text-body tabular",
				typeof className === "string" ? className : undefined,
			)}
		>
			{(segment) => (
				<DateSegment
					segment={segment}
					className={cn(
						"min-w-6 rounded-mark px-0.5 text-end text-ink caret-transparent outline-none data-[type=literal]:min-w-0",
						"data-placeholder:text-ink-muted data-[type=literal]:px-0",
						"data-focused:bg-ink data-focused:text-paper",
						"data-invalid:text-error data-invalid:data-focused:bg-error data-invalid:data-focused:text-paper",
						"data-disabled:text-ink-disabled",
					)}
				/>
			)}
		</DateInput>
	);
}
