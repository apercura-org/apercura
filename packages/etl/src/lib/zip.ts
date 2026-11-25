/**
 * Minimal ZIP reader for the open-data archives (a shapefile in a ZIP): reads
 * the central directory and inflates the entries asked for. No streaming: the
 * archives the import reads are a few megabytes at most, and the caller
 * checks their size before reading them. `zipEntries` inflates one entry at a time.
 */
import { inflateRawSync } from "node:zlib";

export type ZipEntry = { name: string; data: Buffer };

/** Size limit of one entry once inflated: a zip bomb stops here. */
const MAX_ENTRY_BYTES = 200 * 1024 * 1024;

const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const CENTRAL_FILE_HEADER = 0x02014b50;
const LOCAL_FILE_HEADER = 0x04034b50;

/**
 * Entries of a ZIP archive whose name matches `wanted`, inflated. Throws on an
 * archive that is not a ZIP, uses another compression than stored or deflate,
 * or holds an entry over the size limit.
 */
export function readZipEntries(archive: Buffer, wanted: (name: string) => boolean): ZipEntry[] {
	return [...zipEntries(archive, wanted)];
}

/**
 * The same entries one at a time, each inflated only when the caller reaches it: an
 * archive of many entries (OS Open Names, 800 CSV files) never sits inflated in memory.
 */
export function* zipEntries(
	archive: Buffer,
	wanted: (name: string) => boolean,
): Generator<ZipEntry> {
	// The end-of-central-directory record: 22 bytes plus a comment of up to 64 KiB.
	let end = -1;
	for (let offset = archive.length - 22; offset >= Math.max(0, archive.length - 65_557); offset--) {
		if (archive.readUInt32LE(offset) === END_OF_CENTRAL_DIRECTORY) {
			end = offset;
			break;
		}
	}
	if (end < 0) throw new Error("Not a ZIP archive (no end of central directory)");
	const count = archive.readUInt16LE(end + 10);
	let offset = archive.readUInt32LE(end + 16);
	for (let index = 0; index < count; index++) {
		if (archive.readUInt32LE(offset) !== CENTRAL_FILE_HEADER) {
			throw new Error("Corrupt ZIP central directory");
		}
		const method = archive.readUInt16LE(offset + 10);
		const compressedSize = archive.readUInt32LE(offset + 20);
		const size = archive.readUInt32LE(offset + 24);
		const nameLength = archive.readUInt16LE(offset + 28);
		const extraLength = archive.readUInt16LE(offset + 30);
		const commentLength = archive.readUInt16LE(offset + 32);
		const localOffset = archive.readUInt32LE(offset + 42);
		const name = archive.toString("utf8", offset + 46, offset + 46 + nameLength);
		offset += 46 + nameLength + extraLength + commentLength;
		if (!wanted(name)) continue;
		if (size > MAX_ENTRY_BYTES) throw new Error(`ZIP entry ${name} is too large (${size} bytes)`);
		if (archive.readUInt32LE(localOffset) !== LOCAL_FILE_HEADER) {
			throw new Error(`Corrupt ZIP local header for ${name}`);
		}
		const start =
			localOffset +
			30 +
			archive.readUInt16LE(localOffset + 26) +
			archive.readUInt16LE(localOffset + 28);
		const raw = archive.subarray(start, start + compressedSize);
		let data: Buffer;
		if (method === 0) data = Buffer.from(raw);
		else if (method === 8) data = inflateRawSync(raw, { maxOutputLength: MAX_ENTRY_BYTES });
		else throw new Error(`ZIP entry ${name} uses unsupported compression method ${method}`);
		if (data.length !== size) throw new Error(`ZIP entry ${name} is truncated`);
		yield { name, data };
	}
}

/** CRC-32 (IEEE), for writing stored ZIP archives (test fixtures). */
function crc32(data: Buffer): number {
	let crc = 0xffffffff;
	for (const byte of data) {
		crc ^= byte;
		for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
	}
	return (crc ^ 0xffffffff) >>> 0;
}

/** Writes a ZIP archive of stored (uncompressed) entries: fixtures only. */
export function writeStoredZip(entries: readonly ZipEntry[]): Buffer {
	const locals: Buffer[] = [];
	const centrals: Buffer[] = [];
	let offset = 0;
	for (const entry of entries) {
		const name = Buffer.from(entry.name, "utf8");
		const crc = crc32(entry.data);
		const local = Buffer.alloc(30);
		local.writeUInt32LE(LOCAL_FILE_HEADER, 0);
		local.writeUInt16LE(20, 4);
		local.writeUInt16LE(0x0800, 6);
		local.writeUInt32LE(crc, 14);
		local.writeUInt32LE(entry.data.length, 18);
		local.writeUInt32LE(entry.data.length, 22);
		local.writeUInt16LE(name.length, 26);
		locals.push(local, name, entry.data);
		const central = Buffer.alloc(46);
		central.writeUInt32LE(CENTRAL_FILE_HEADER, 0);
		central.writeUInt16LE(20, 4);
		central.writeUInt16LE(20, 6);
		central.writeUInt16LE(0x0800, 8);
		central.writeUInt32LE(crc, 16);
		central.writeUInt32LE(entry.data.length, 20);
		central.writeUInt32LE(entry.data.length, 24);
		central.writeUInt16LE(name.length, 28);
		central.writeUInt32LE(offset, 42);
		centrals.push(central, name);
		offset += 30 + name.length + entry.data.length;
	}
	const directory = Buffer.concat(centrals);
	const end = Buffer.alloc(22);
	end.writeUInt32LE(END_OF_CENTRAL_DIRECTORY, 0);
	end.writeUInt16LE(entries.length, 8);
	end.writeUInt16LE(entries.length, 10);
	end.writeUInt32LE(directory.length, 12);
	end.writeUInt32LE(offset, 16);
	return Buffer.concat([...locals, directory, end]);
}
