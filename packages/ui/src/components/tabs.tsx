"use client";

import "../astryx/styles";
import { Tab as AstryxTab, TabList as AstryxTabList } from "@astryxdesign/core/TabList";
import {
	Children,
	createContext,
	isValidElement,
	type Key,
	type ReactElement,
	type ReactNode,
	use,
	useId,
	useState,
} from "react";
import { AstryxIntl } from "../astryx/intl";
import { textOf } from "../astryx/text";
import { cn, focusRing } from "../recipes";

interface TabsState {
	selected: string;
	/** Each tab's text, to name its panel. */
	labels: ReadonlyMap<string, string>;
	select: (key: string) => void;
	/** Prefix of the panels' ids. */
	base: string;
}

const TabsContext = createContext<TabsState | null>(null);

export interface TabsProps {
	selectedKey?: Key;
	defaultSelectedKey?: Key;
	onSelectionChange?: (key: Key) => void;
	className?: string;
	children: ReactNode;
}

/**
 * Tabs with their panels: the strip is Astryx's tab list in the WAI-ARIA tabs pattern
 * (arrow keys move between tabs, each tab controls its panel); the panels are the booklet's.
 */
export function Tabs({
	selectedKey,
	defaultSelectedKey,
	onSelectionChange,
	className,
	children,
}: TabsProps) {
	// The tabs, read from the strip among the children: the first is selected by default.
	const labels = new Map<string, string>();
	for (const child of Children.toArray(children)) {
		if (!isValidElement<{ children?: ReactNode }>(child) || child.type !== TabList) continue;
		for (const tab of Children.toArray(child.props.children)) {
			if (isValidElement<TabProps>(tab) && tab.type === Tab) {
				labels.set(String(tab.props.id), textOf(tab.props.children));
			}
		}
	}
	const [own, setOwn] = useState<string | null>(
		defaultSelectedKey === undefined ? null : String(defaultSelectedKey),
	);
	const selected =
		selectedKey === undefined ? (own ?? labels.keys().next().value ?? "") : String(selectedKey);
	const base = useId();
	return (
		<TabsContext
			value={{
				selected,
				labels,
				select: (key) => {
					setOwn(key);
					onSelectionChange?.(key);
				},
				base,
			}}
		>
			<div className={cn("flex flex-col", className)}>{children}</div>
		</TabsContext>
	);
}

export interface TabProps {
	id: Key;
	children: ReactNode;
	isDisabled?: boolean;
}

/** One tab of a `TabList`: a description the strip renders. */
export function Tab(_props: TabProps): null {
	return null;
}

const panelId = (base: string, key: string) => `${base}-panel-${key}`;

export function TabList({
	"aria-label": ariaLabel,
	className,
	children,
}: {
	"aria-label"?: string;
	className?: string;
	children: ReactNode;
}) {
	const state = use(TabsContext);
	const tabs = Children.toArray(children).filter(
		(child): child is ReactElement<TabProps> => isValidElement(child) && child.type === Tab,
	);
	const value = state?.selected ?? (tabs[0] ? String(tabs[0].props.id) : "");
	return (
		<AstryxIntl>
			<div className={cn("border-b border-rule-soft", className)}>
				<AstryxTabList
					value={value}
					onChange={(next) => state?.select(next)}
					role="tablist"
					aria-label={ariaLabel}
				>
					{tabs.map(({ props }) => (
						<AstryxTab
							key={String(props.id)}
							value={String(props.id)}
							label={textOf(props.children)}
							panelId={state ? panelId(state.base, String(props.id)) : undefined}
						/>
					))}
				</AstryxTabList>
			</div>
		</AstryxIntl>
	);
}

/** The content of a tab; shown while its tab is selected, reachable with Tab. */
export function TabPanel({
	id,
	className,
	children,
}: {
	id: Key;
	className?: string;
	children: ReactNode;
}) {
	const state = use(TabsContext);
	if (!state) return null;
	const key = String(id);
	return (
		<div
			id={panelId(state.base, key)}
			role="tabpanel"
			aria-label={state.labels.get(key)}
			// biome-ignore lint/a11y/noNoninteractiveTabindex: a panel without focusable content is reached with Tab, as the pattern asks.
			tabIndex={0}
			hidden={state.selected !== key}
			className={cn("pt-5 text-body", focusRing, className)}
		>
			{children}
		</div>
	);
}
