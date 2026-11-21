import type { HTMLAttributes } from "react";
import type { VariantProps } from "tailwind-variants";
import { badgeStyles } from "../recipes";

export interface BadgeProps
	extends HTMLAttributes<HTMLSpanElement>,
		VariantProps<typeof badgeStyles> {}

/**
 * Printed mark. `tone="stamp"` is only for verified pages and booked slots;
 * every badge carries its meaning in text, never colour alone.
 */
export function Badge({ tone, className, ...props }: BadgeProps) {
	return <span {...props} className={badgeStyles({ tone, className })} />;
}
