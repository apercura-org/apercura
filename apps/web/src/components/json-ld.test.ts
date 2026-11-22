import { describe, expect, it } from "vitest";
import { serializeJsonLd } from "./json-ld";

describe("serializeJsonLd", () => {
	const hostile = {
		name: "Dr </script><script>alert(1)</script> <!-- & -->",
		description: "line\u2028separator\u2029paragraph",
	};

	it("can never close the script element or open a comment", () => {
		const json = serializeJsonLd(hostile);
		expect(json).not.toMatch(/[<>&\u2028\u2029]/);
		expect(json.toLowerCase()).not.toContain("</script");
	});

	it("parses back to the same value", () => {
		expect(JSON.parse(serializeJsonLd(hostile))).toEqual(hostile);
	});
});
