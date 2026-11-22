import type { Graph } from "schema-dts";

/**
 * JSON for an inline `<script>`: `<`, `>` and `&` become `\u` escapes, so the
 * payload can never close the element (`</script>`) or open a comment
 * (`<!--`), whatever the data holds; U+2028 and U+2029 are escaped too, as
 * older parsers read them as line ends. The value parses back unchanged.
 */
export function serializeJsonLd(data: unknown): string {
	return JSON.stringify(data).replace(
		/[<>&\u2028\u2029]/g,
		(character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`,
	);
}

/** The page's structured data: one JSON-LD `@graph` per page. */
export function JsonLd({ data }: { data: Graph }) {
	return (
		<script
			type="application/ld+json"
			// biome-ignore lint/security/noDangerouslySetInnerHtml: escaped JSON, see serializeJsonLd.
			dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
		/>
	);
}
