import { type RefObject, useLayoutEffect } from "react";

/**
 * Says on the control itself that it is invalid and what describes it, for the fields whose
 * Astryx control would otherwise print its own status box and announce it: the field prints its
 * hint and error under the box, as everywhere in the booklet, and the control reads them.
 */
export function useControlDescription(
	control: RefObject<HTMLElement | null>,
	isInvalid: boolean,
	/** `undefined` leaves the control's own `aria-describedby`. */
	describedBy?: string | null,
) {
	useLayoutEffect(() => {
		const element = control.current;
		if (!element) return;
		if (isInvalid) element.setAttribute("aria-invalid", "true");
		else element.removeAttribute("aria-invalid");
		if (describedBy) element.setAttribute("aria-describedby", describedBy);
		else if (describedBy === null) element.removeAttribute("aria-describedby");
	});
}
