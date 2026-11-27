import { Children, isValidElement, type Key, type ReactElement, type ReactNode } from "react";

export type { Key };

export interface ListBoxItemProps {
	/** The option's key, given back on selection. */
	id: Key;
	/** Its text: what a screen reader reads, what a combo box writes. Defaults to `children` text. */
	textValue?: string;
	children: ReactNode;
	isDisabled?: boolean;
	className?: string;
}

/**
 * One option of a `Select` or a `ComboBox`: a description the field renders (on Astryx's
 * selector, or the suggestion list), as React Aria's `ListBoxItem` was used.
 */
export function ListBoxItem(_props: ListBoxItemProps): null {
	return null;
}

/** A list of `ListBoxItem`s, for the fields that take one. */
export function ListBox({ children }: { children: ReactNode }) {
	return <>{children}</>;
}

export interface CollectedItem {
	id: string;
	key: Key;
	textValue: string;
	label: ReactNode;
	isDisabled: boolean;
}

function plainText(node: ReactNode): string {
	if (node == null || typeof node === "boolean") return "";
	if (typeof node === "string" || typeof node === "number") return String(node);
	if (Array.isArray(node)) return node.map(plainText).join("");
	if (isValidElement<{ children?: ReactNode }>(node)) return plainText(node.props.children);
	return "";
}

/** The options of a field, from `ListBoxItem` children or a function of `items`. */
export function collectItems<T>(
	children: ReactNode | ((item: T) => ReactNode),
	items?: Iterable<T>,
): CollectedItem[] {
	const nodes =
		typeof children === "function"
			? [...(items ?? [])].map((item) => (children as (item: T) => ReactNode)(item))
			: Children.toArray(children);
	const out: CollectedItem[] = [];
	for (const node of nodes) {
		if (!isValidElement(node) || node.type !== ListBoxItem) continue;
		const props = (node as ReactElement<ListBoxItemProps>).props;
		out.push({
			id: String(props.id),
			key: props.id,
			textValue: props.textValue ?? plainText(props.children),
			label: props.children,
			isDisabled: props.isDisabled === true,
		});
	}
	return out;
}
