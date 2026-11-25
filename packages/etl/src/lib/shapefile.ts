/**
 * Reading the attribute table (.dbf, dBASE III) and the point geometries
 * (.shp) of a point shapefile, the format the Land Steiermark publishes its
 * doctors list in. Records of the two files are in the same order.
 */

export type DbfField = { name: string; type: string; length: number };

export type DbfTable = { fields: DbfField[]; records: Record<string, string>[] };

/**
 * Parses a .dbf file. Text is decoded as UTF-8 (the `.cpg` of the source says
 * so) and trimmed; deleted records are dropped. Throws on a header that does
 * not add up, so a truncated file never yields a partial table.
 */
export function readDbf(data: Buffer): DbfTable {
	if (data.length < 33) throw new Error("DBF file too short");
	const count = data.readUInt32LE(4);
	const headerLength = data.readUInt16LE(8);
	const recordLength = data.readUInt16LE(10);
	const fields: DbfField[] = [];
	for (let offset = 32; offset < headerLength - 1 && data[offset] !== 0x0d; offset += 32) {
		const name = data.toString("latin1", offset, offset + 11).replace(/\0.*$/s, "");
		fields.push({
			name,
			type: String.fromCharCode(data[offset + 11] ?? 0),
			length: data[offset + 16] ?? 0,
		});
	}
	const width = 1 + fields.reduce((sum, field) => sum + field.length, 0);
	if (width !== recordLength)
		throw new Error(`DBF record length ${recordLength} ≠ fields ${width}`);
	if (headerLength + count * recordLength > data.length) {
		throw new Error(`DBF file truncated: ${count} records announced`);
	}
	const decoder = new TextDecoder("utf-8", { fatal: true });
	const records: Record<string, string>[] = [];
	for (let index = 0; index < count; index++) {
		const start = headerLength + index * recordLength;
		if (data[start] === 0x2a) continue; // deleted
		const record: Record<string, string> = {};
		let offset = start + 1;
		for (const field of fields) {
			record[field.name] = decoder.decode(data.subarray(offset, offset + field.length)).trim();
			offset += field.length;
		}
		records.push(record);
	}
	return { fields, records };
}

/** A point of a .shp file, or null for a record without geometry (null shape). */
export type ShpPoint = { x: number; y: number } | null;

/**
 * Parses the records of a point .shp file (shape type 1). A null shape or a
 * point at (0, 0) reads as null: the source has no location for that record.
 */
export function readShpPoints(data: Buffer): ShpPoint[] {
	if (data.length < 100 || data.readInt32BE(0) !== 9994) throw new Error("Not a shapefile");
	const fileLength = data.readInt32BE(24) * 2;
	if (fileLength > data.length) throw new Error("Shapefile truncated");
	const shapeType = data.readInt32LE(32);
	if (shapeType !== 1 && shapeType !== 0) throw new Error(`Shapefile of shape type ${shapeType}`);
	const points: ShpPoint[] = [];
	let offset = 100;
	while (offset + 8 <= fileLength) {
		const contentLength = data.readInt32BE(offset + 4) * 2;
		const type = data.readInt32LE(offset + 8);
		if (type === 1) {
			const x = data.readDoubleLE(offset + 12);
			const y = data.readDoubleLE(offset + 20);
			points.push(x === 0 && y === 0 ? null : { x, y });
		} else if (type === 0) {
			points.push(null);
		} else {
			throw new Error(`Shapefile record of shape type ${type}`);
		}
		offset += 8 + contentLength;
	}
	return points;
}

/** Writes a .dbf of text fields: fixtures only. */
export function writeDbf(fields: readonly DbfField[], records: readonly Record<string, string>[]) {
	const headerLength = 32 + fields.length * 32 + 1;
	const recordLength = 1 + fields.reduce((sum, field) => sum + field.length, 0);
	const data = Buffer.alloc(headerLength + records.length * recordLength + 1, 0x20);
	data.fill(0, 0, headerLength);
	data[0] = 0x03;
	data.writeUInt32LE(records.length, 4);
	data.writeUInt16LE(headerLength, 8);
	data.writeUInt16LE(recordLength, 10);
	fields.forEach((field, index) => {
		const offset = 32 + index * 32;
		data.write(field.name, offset, "latin1");
		data[offset + 11] = field.type.charCodeAt(0);
		data[offset + 16] = field.length;
	});
	data[headerLength - 1] = 0x0d;
	records.forEach((record, index) => {
		let offset = headerLength + index * recordLength + 1;
		for (const field of fields) {
			const value = Buffer.from(record[field.name] ?? "", "utf8").subarray(0, field.length);
			value.copy(data, offset);
			offset += field.length;
		}
	});
	data[data.length - 1] = 0x1a;
	return data;
}

/** Writes a point .shp: fixtures only. */
export function writeShpPoints(points: readonly ShpPoint[]): Buffer {
	const records = points.map((point) => {
		const record = Buffer.alloc(point ? 28 : 12);
		record.writeInt32BE(0, 0);
		record.writeInt32BE(point ? 10 : 2, 4);
		record.writeInt32LE(point ? 1 : 0, 8);
		if (point) {
			record.writeDoubleLE(point.x, 12);
			record.writeDoubleLE(point.y, 20);
		}
		return record;
	});
	records.forEach((record, index) => {
		record.writeInt32BE(index + 1, 0);
	});
	const header = Buffer.alloc(100);
	const length = 100 + records.reduce((sum, record) => sum + record.length, 0);
	header.writeInt32BE(9994, 0);
	header.writeInt32BE(length / 2, 24);
	header.writeInt32LE(1000, 28);
	header.writeInt32LE(1, 32);
	return Buffer.concat([header, ...records]);
}
