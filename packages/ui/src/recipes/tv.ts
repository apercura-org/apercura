import { createTV, extendTailwindMerge } from "tailwind-variants/config";

/**
 * The class merger only knows Tailwind's default scales. Teach it the booklet's
 * own type roles and font families, otherwise `text-body text-ink` would be
 * read as two conflicting colours and one of them dropped.
 */
const twMergeConfig = {
	extend: {
		theme: {
			text: ["folio", "meta", "body", "lead", "title", "headline", "display"],
			font: ["display", "body"],
			radius: ["mark", "field", "panel", "full"],
		},
	},
};

export const tv = createTV({ twMergeConfig });

const merge = extendTailwindMerge(twMergeConfig);

type ClassValue = string | false | null | undefined;

/** Joins class names, skipping falsy values and resolving Tailwind conflicts (last wins). */
export function cn(...classes: ClassValue[]): string {
	return merge(classes.filter(Boolean).join(" "));
}
