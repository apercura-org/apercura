type Messages = Record<string, unknown>;

const isObject = (value: unknown): value is Messages =>
	typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * The part of a catalogue named by `paths` (`"taxonomy"`, `"booking.panel"`),
 * with the same nesting, so client components get only the messages they read.
 */
export function pickMessages(messages: Messages, paths: readonly string[]): Messages {
	const result: Messages = {};
	for (const path of paths) {
		const keys = path.split(".");
		let source: unknown = messages;
		for (const key of keys) source = isObject(source) ? source[key] : undefined;
		if (source === undefined) continue;
		let target = result;
		for (const key of keys.slice(0, -1)) {
			const next = isObject(target[key]) ? (target[key] as Messages) : {};
			target[key] = next;
			target = next;
		}
		target[keys.at(-1) as string] = source;
	}
	return result;
}
