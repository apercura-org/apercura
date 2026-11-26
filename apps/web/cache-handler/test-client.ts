/**
 * An in-memory stand-in for the Valkey commands the store uses (tests only): it can fail every
 * command, hang, or be disconnected.
 */
import type { CacheClient } from "./store.mjs";

export class FakeClient implements CacheClient {
	status = "ready";
	readonly data = new Map<string, Buffer | string>();
	readonly ttls = new Map<string, number>();
	/** Every command rejects. */
	failing = false;
	/** Every command never settles. */
	hanging = false;
	readonly calls: string[] = [];

	async #run<T>(name: string, run: () => T): Promise<T> {
		this.calls.push(name);
		if (this.hanging) return new Promise<T>(() => {});
		if (this.failing) throw new Error(`${name} failed`);
		return run();
	}

	getBuffer(key: string) {
		return this.#run("GET", () => {
			const value = this.data.get(key);
			if (value === undefined) return null;
			return Buffer.isBuffer(value) ? value : Buffer.from(value);
		});
	}

	set(key: string, value: Buffer | string, ...args: unknown[]) {
		return this.#run("SET", () => {
			this.data.set(key, value);
			if (args[0] === "PX") this.ttls.set(key, Number(args[1]));
			else this.ttls.delete(key);
			return "OK";
		});
	}

	mget(...keys: string[]) {
		return this.#run("MGET", () =>
			keys.map((key) => {
				const value = this.data.get(key);
				return value === undefined ? null : value.toString();
			}),
		);
	}

	mset(...pairs: string[]) {
		return this.#run("MSET", () => {
			for (let index = 0; index < pairs.length; index += 2) {
				this.data.set(pairs[index] as string, pairs[index + 1] as string);
			}
			return "OK";
		});
	}

	ping() {
		return this.#run("PING", () => "PONG");
	}
}
