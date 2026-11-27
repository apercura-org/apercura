/**
 * Native constraint attributes for an Astryx control: its types leave them out, its input takes
 * them (they reach the element with the rest of its props). The browser checks them on submit.
 */
export function nativeConstraints(attributes: {
	required?: boolean;
	minLength?: number;
	maxLength?: number;
	pattern?: string;
}): object {
	return attributes;
}

/**
 * Marks the controls `selector` finds in `container` required, for assistive technology and the
 * browser's checks, without Astryx's "Required" mark in the label (the booklet prints none).
 */
export function markRequired(container: HTMLElement | null, selector: string, isRequired: boolean) {
	if (!container) return;
	for (const control of container.querySelectorAll<HTMLElement>(selector)) {
		if (isRequired) control.setAttribute("aria-required", "true");
		else control.removeAttribute("aria-required");
		if (control instanceof HTMLInputElement && control.type === "radio")
			control.required = isRequired;
	}
}
