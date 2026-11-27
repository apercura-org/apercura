import { Children, isValidElement, type ReactNode } from "react";

/**
 * The text a screen reader would read in `node`: Astryx names its controls with a string
 * (`label`), where React Aria took the content. Parts hidden from assistive technology
 * (`aria-hidden`, decorative icons) are left out.
 */
export function textOf(node: ReactNode): string {
	if (node == null || typeof node === "boolean") return "";
	if (typeof node === "string" || typeof node === "number") return String(node);
	if (Array.isArray(node)) return node.map(textOf).join("");
	if (isValidElement<{ children?: ReactNode; "aria-hidden"?: unknown }>(node)) {
		const hidden = node.props["aria-hidden"];
		if (hidden === true || hidden === "true") return "";
		return Children.toArray(node.props.children).map(textOf).join("");
	}
	return "";
}
