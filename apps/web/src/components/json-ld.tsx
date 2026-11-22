import type { Graph } from "schema-dts";

/**
 * The page's structured data: one JSON-LD `@graph` per page. `<` is escaped
 * so the payload can never close the script element, whatever the data holds.
 */
export function JsonLd({ data }: { data: Graph }) {
	return (
		<script
			type="application/ld+json"
			// biome-ignore lint/security/noDangerouslySetInnerHtml: serialized JSON with `<` escaped.
			dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
		/>
	);
}
