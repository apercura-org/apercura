import { type Ref, type RefCallback, useCallback, useRef } from "react";

/** One ref callback that fills every ref given (the caller's and the component's own). */
export function useMergedRef<T>(...refs: (Ref<T> | undefined)[]): RefCallback<T> {
	const latest = useRef(refs);
	latest.current = refs;
	return useCallback((node: T | null) => {
		for (const ref of latest.current) {
			if (typeof ref === "function") ref(node);
			else if (ref) (ref as { current: T | null }).current = node;
		}
	}, []);
}
