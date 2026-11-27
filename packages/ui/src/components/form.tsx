"use client";

import {
	createContext,
	type FormHTMLAttributes,
	type RefObject,
	use,
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { cn } from "../recipes";

/**
 * The form layer over Astryx's fields. Astryx's controls take a string label and a controlled
 * value and leave validation to the app; this gives every field built on them what React Aria's
 * `Form` gave:
 *
 * - native constraints (`required`, `type="email"`, `minLength`, `pattern`…) checked on submit,
 *   with the browser's own message in the page's language, no browser bubble;
 * - errors from the server matched to fields by name (`validationErrors`), shown until the field
 *   changes;
 * - the focus sent to the first invalid field, in the order of the page;
 * - errors shown from the first submit on, then kept up to date as the person corrects them;
 * - values that live in the DOM, so a plain GET or POST form submits without any state.
 *
 * `validationBehavior="aria"` leaves the checks to the caller (`isInvalid`), as React Aria did.
 */

export type ValidationBehavior = "native" | "aria";

/** What a field tells its form: where it is, and whether it is valid now. */
export interface FormFieldEntry {
	element: () => HTMLElement | null;
	/** Checks the field, shows the result, and returns the error (or null). */
	commit: () => string | null;
}

interface FormContextValue {
	behavior: ValidationBehavior;
	/** Incremented on each submit attempt: fields show their errors from the first one on. */
	attempt: number;
	serverErrors: Readonly<Record<string, readonly string[]>>;
	register: (entry: FormFieldEntry) => () => void;
}

const FormContext = createContext<FormContextValue | null>(null);

export interface FormProps extends Omit<FormHTMLAttributes<HTMLFormElement>, "noValidate"> {
	/** `native` (default): constraints are checked on submit. `aria`: the caller marks fields invalid. */
	validationBehavior?: ValidationBehavior;
	/** Errors from the server, by field name. */
	validationErrors?: Readonly<Record<string, string | readonly string[]>>;
}

function byDocumentOrder(a: HTMLElement, b: HTMLElement) {
	return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
}

/** Form with native-feeling validation: errors are shown after submit and announced. */
export function Form({
	validationBehavior = "native",
	validationErrors,
	onSubmit,
	className,
	children,
	...props
}: FormProps) {
	const entries = useRef(new Set<FormFieldEntry>());
	const [attempt, setAttempt] = useState(0);
	const register = useCallback((entry: FormFieldEntry) => {
		entries.current.add(entry);
		return () => {
			entries.current.delete(entry);
		};
	}, []);
	const serverErrors = useMemo(() => {
		const out: Record<string, readonly string[]> = {};
		for (const [name, value] of Object.entries(validationErrors ?? {})) {
			out[name] = typeof value === "string" ? [value] : value;
		}
		return out;
	}, [validationErrors]);
	const context = useMemo(
		() => ({ behavior: validationBehavior, attempt, serverErrors, register }),
		[validationBehavior, attempt, serverErrors, register],
	);

	const submit = (event: Parameters<NonNullable<FormProps["onSubmit"]>>[0]) => {
		if (validationBehavior === "native") {
			const invalid: HTMLElement[] = [];
			for (const entry of entries.current) {
				const element = entry.element();
				if (entry.commit() !== null && element) invalid.push(element);
			}
			// Plain controls of the form that no field wraps (a honeypot, a hidden time) count too.
			for (const element of event.currentTarget.elements) {
				if (
					element instanceof HTMLElement &&
					"validity" in element &&
					!(element as HTMLInputElement).validity.valid
				) {
					invalid.push(element);
				}
			}
			setAttempt((count) => count + 1);
			if (invalid.length > 0) {
				event.preventDefault();
				event.stopPropagation();
				invalid.sort(byDocumentOrder)[0]?.focus();
				return;
			}
		}
		onSubmit?.(event);
	};

	return (
		<form {...props} noValidate onSubmit={submit} className={cn("flex flex-col gap-6", className)}>
			<FormContext value={context}>{children}</FormContext>
		</form>
	);
}

/** What a field reports to `errorMessage` when it is a function, as React Aria did. */
export interface ValidationResult {
	isInvalid: boolean;
	validationErrors: string[];
	validationDetails: ValidityState | null;
}

export interface FieldValidationOptions<V> {
	/** The control the browser checks and the focus goes to (an input, a button). */
	element: RefObject<HTMLElement | null>;
	name?: string;
	value: V;
	isInvalid?: boolean;
	errorMessage?: string | ((validation: ValidationResult) => string);
	/** A check of the field's own beyond the native ones; returns an error or nothing. */
	validate?: (value: V) => string | string[] | true | null | undefined;
	/**
	 * For a control the browser cannot check (a custom select): returns the message of a
	 * missing required value, or null when the value is there.
	 */
	checkRequired?: () => string | null;
}

function nativeCheck(element: HTMLElement | null): {
	message: string | null;
	validity: ValidityState | null;
} {
	if (!element || !("checkValidity" in element)) return { message: null, validity: null };
	const control = element as HTMLInputElement;
	control.setCustomValidity("");
	// `validity`, not `checkValidity()`: no `invalid` event, so no control shows a message of its
	// own; the field prints the one error.
	return control.validity.valid
		? { message: null, validity: control.validity }
		: { message: control.validationMessage, validity: control.validity };
}

/**
 * A field's validation state inside a `Form` (or alone): the error to show, if any. The field
 * renders it and marks itself invalid; the form asks it on submit.
 */
export function useFieldValidation<V>({
	element,
	name,
	value,
	isInvalid,
	errorMessage,
	validate,
	checkRequired,
}: FieldValidationOptions<V>): { error: string | null } {
	const form = use(FormContext);
	const behavior = form?.behavior ?? "aria";
	const [shown, setShown] = useState<string | null>(null);
	const [revealed, setRevealed] = useState(false);
	// A server error holds until the value it was about changes.
	const serverError = name ? form?.serverErrors[name]?.join(" ") : undefined;
	const [serverValue, setServerValue] = useState<{ error?: string; value?: V }>({});
	if (serverValue.error !== serverError) setServerValue({ error: serverError, value });
	const activeServerError =
		serverValue.error && Object.is(serverValue.value, value) ? serverValue.error : null;

	const message = useCallback(
		(errors: string[], validity: ValidityState | null) =>
			typeof errorMessage === "function"
				? errorMessage({ isInvalid: true, validationErrors: errors, validationDetails: validity })
				: (errorMessage ?? errors.join(" ")),
		[errorMessage],
	);

	const check = useCallback((): string | null => {
		const control = element.current;
		const { message: native, validity } = nativeCheck(control);
		// The field's own check speaks first, as with React Aria: its words say what is wrong
		// better than the browser's ("Saisissez votre nom." rather than "Fill out this field.").
		const own = validate?.(value);
		const errors = typeof own === "string" ? [own] : Array.isArray(own) ? [...own] : [];
		if (errors.length === 0 && native) errors.push(native);
		if (errors.length === 0 && checkRequired) {
			const missing = checkRequired();
			if (missing) errors.push(missing);
		}
		if (errors.length === 0) return null;
		return message(errors, validity);
	}, [element, checkRequired, validate, value, message]);

	// The form asks each field on submit; from then on the field keeps its error up to date.
	const commit = useCallback(() => {
		const error = check();
		setRevealed(true);
		setShown(error);
		return error;
	}, [check]);
	useEffect(() => {
		if (!form) return;
		return form.register({ element: () => element.current, commit });
	}, [form, element, commit]);
	useEffect(() => {
		if (revealed && behavior === "native") setShown(check());
	}, [revealed, behavior, check]);

	const forced = isInvalid ? message([], null) || " " : null;
	const error = forced ?? activeServerError ?? (behavior === "native" && revealed ? shown : null);

	// Keep the control's own validity in step, so `:invalid` and the form's check agree.
	useLayoutEffect(() => {
		const control = element.current as HTMLInputElement | null;
		if (!control || !("setCustomValidity" in control)) return;
		control.setCustomValidity(
			forced || activeServerError ? (forced ?? activeServerError ?? "") : "",
		);
	});

	return { error: error && error.trim() !== "" ? error : forced ? "" : error };
}
