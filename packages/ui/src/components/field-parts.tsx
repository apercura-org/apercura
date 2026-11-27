import type { InputHTMLAttributes, LabelHTMLAttributes, ReactNode } from "react";
import { AlertIcon } from "../icons";
import { cn, fieldStyles } from "../recipes";

/*
 * The printed parts of a field, as plain elements: server components use them for the plain
 * GET forms of public pages (no JavaScript), and the fields built on Astryx use them for the
 * hint and the error under their box.
 */

const styles = fieldStyles();

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
	// biome-ignore lint/a11y/noLabelWithoutControl: the caller gives `htmlFor`.
	return <label {...props} className={styles.label({ className })} />;
}

export function FieldDescription({
	className,
	...props
}: {
	id?: string;
	className?: string;
	children: ReactNode;
}) {
	return <p {...props} className={styles.description({ className })} />;
}

/**
 * Field error: ink red plus an error mark and text, never colour alone. Renders nothing
 * without a message.
 */
export function FieldError({
	className,
	children,
	...props
}: {
	id?: string;
	className?: string;
	children?: ReactNode;
	"aria-hidden"?: boolean | "true";
}) {
	if (children == null || children === "") return null;
	return (
		<p {...props} className={styles.error({ className })}>
			<AlertIcon className="mt-[0.15em] size-[1.15em] shrink-0" />
			<span>{children}</span>
		</p>
	);
}

/** A bare input styled like the inside of a field box, for plain server-rendered forms. */
export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
	return <input {...props} className={cn(styles.input(), className)} />;
}
