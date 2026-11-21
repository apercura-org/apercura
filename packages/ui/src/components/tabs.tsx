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

/** Tab strip ruled on its baseline; the selected tab is printed solid, like a booklet tab. */
export function TabList<T extends object>({ className, ...props }: TabListProps<T>) {
	return (
		<RACTabList
			{...props}
			className={composeRenderProps(className, (cls) =>
				cn("flex gap-1 overflow-x-auto border-b-2 border-ink", cls),
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
					"flex min-h-11 cursor-pointer items-center whitespace-nowrap rounded-t-field border-[1.5px] border-b-0 border-transparent px-4",
					"font-display text-meta font-semibold text-ink font-stretch-semi-condensed",
					"hover:border-ink",
					"data-selected:border-ink data-selected:bg-ink data-selected:text-paper",
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
