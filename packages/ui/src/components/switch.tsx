"use client";

import type { ReactNode } from "react";
import {
	composeRenderProps,
	Switch as RACSwitch,
	type SwitchProps as RACSwitchProps,
} from "react-aria-components";
import { tv } from "../recipes/tv";

const switchStyles = tv({
	slots: {
		root: "group flex min-h-11 cursor-pointer items-center gap-3 text-body text-ink data-disabled:cursor-not-allowed data-disabled:text-ink-disabled",
		track: [
			"relative flex h-7 w-12 shrink-0 items-center rounded-full border-2 border-ink bg-paper px-0.5 transition-colors duration-150",
			"group-data-selected:bg-ink group-data-disabled:border-ink-disabled",
			"group-data-focus-visible:outline-3 group-data-focus-visible:outline-solid group-data-focus-visible:outline-offset-2 group-data-focus-visible:outline-(--focus-ring)",
		],
		knob: [
			"block size-5 rounded-full bg-ink transition-transform duration-150 ease-out",
			"group-data-selected:translate-x-5 group-data-selected:bg-paper group-data-disabled:bg-ink-disabled",
			"forced-colors:bg-[CanvasText]",
		],
	},
});

export interface SwitchProps extends Omit<RACSwitchProps, "children"> {
	children: ReactNode;
}

/** On/off setting that applies immediately. State shows by knob position, not colour. */
export function Switch({ className, children, ...props }: SwitchProps) {
	const styles = switchStyles();
	return (
		<RACSwitch
			{...props}
			className={composeRenderProps(className, (cls) => styles.root({ className: cls }))}
		>
			<span className={styles.track()}>
				<span className={styles.knob()} />
			</span>
			<span>{children}</span>
		</RACSwitch>
	);
}
