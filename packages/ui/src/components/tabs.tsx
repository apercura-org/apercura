"use client";

import {
	composeRenderProps,
	Tab as RACTab,
	TabList as RACTabList,
	TabPanel as RACTabPanel,
	Tabs as RACTabs,
	type TabListProps,
	type TabPanelProps,
	type TabProps,
	type TabsProps,
} from "react-aria-components";
import { cn, focusRing } from "../recipes";

export function Tabs({ className, ...props }: TabsProps) {
	return (
		<RACTabs
			{...props}
			className={composeRenderProps(className, (cls) => cn("flex flex-col", cls))}
		/>
	);
}

/** Tab strip on a hairline baseline; the selected tab is underlined in ink. */
export function TabList<T extends object>({ className, ...props }: TabListProps<T>) {
	return (
		<RACTabList
			{...props}
			className={composeRenderProps(className, (cls) =>
				cn("flex gap-1 overflow-x-auto border-b border-rule-soft", cls),
			)}
		/>
	);
}

export function Tab({ className, ...props }: TabProps) {
	return (
		<RACTab
			{...props}
			className={composeRenderProps(className, (cls) =>
				cn(
					"-mb-px flex min-h-11 cursor-pointer items-center whitespace-nowrap border-b-2 border-transparent px-4",
					"font-display text-meta font-medium text-ink-muted transition-colors duration-150",
					"hover:border-field-edge hover:text-ink",
					"data-selected:border-ink data-selected:font-semibold data-selected:text-ink",
					"data-disabled:cursor-not-allowed data-disabled:text-ink-disabled",
					focusRing,
					cls,
				),
			)}
		/>
	);
}

export function TabPanel({ className, ...props }: TabPanelProps) {
	return (
		<RACTabPanel
			{...props}
			className={composeRenderProps(className, (cls) => cn("pt-5 text-body", focusRing, cls))}
		/>
	);
}
