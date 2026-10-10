/**
 * Escritura de TIFF en gris de 16 bits, sin compresion, con resolucion: el formato que esperan
 * la mayoria de los flujos de impresion (RIP, QuadToneRIP, drivers).
 */
export function encodeGray16Tiff(
	pixels: Uint16Array,
	width: number,
	height: number,
	dpi: number
): Uint8Array {
	const le = true;
	const pixelBytes = width * height * 2;
	const entries: [tag: number, type: number, count: number, value: number][] = [];
	const header = 8;
	const resolutionOffset = header;
	const dataOffset = resolutionOffset + 16;
	entries.push([256, 4, 1, width]); // ImageWidth
	entries.push([257, 4, 1, height]); // ImageLength
	entries.push([258, 3, 1, 16]); // BitsPerSample
	entries.push([259, 3, 1, 1]); // Compression: ninguna
	entries.push([262, 3, 1, 1]); // Photometric: BlackIsZero
	entries.push([273, 4, 1, dataOffset]); // StripOffsets
	entries.push([277, 3, 1, 1]); // SamplesPerPixel
	entries.push([278, 4, 1, height]); // RowsPerStrip
	entries.push([279, 4, 1, pixelBytes]); // StripByteCounts
	entries.push([282, 5, 1, resolutionOffset]); // XResolution
	entries.push([283, 5, 1, resolutionOffset + 8]); // YResolution
	entries.push([296, 3, 1, 2]); // ResolutionUnit: pulgada
	const ifdOffset = dataOffset + pixelBytes;
	const total = ifdOffset + 2 + entries.length * 12 + 4;
	const buffer = new ArrayBuffer(total);
	const view = new DataView(buffer);
	view.setUint8(0, 0x49);
	view.setUint8(1, 0x49);
	view.setUint16(2, 42, le);
	view.setUint32(4, ifdOffset, le);
	for (const offset of [resolutionOffset, resolutionOffset + 8]) {
		view.setUint32(offset, Math.round(dpi), le);
		view.setUint32(offset + 4, 1, le);
	}
	const data = new Uint16Array(buffer, dataOffset, width * height);
	data.set(pixels);
	view.setUint16(ifdOffset, entries.length, le);
	entries.forEach(([tag, type, count, value], k) => {
		const at = ifdOffset + 2 + k * 12;
		view.setUint16(at, tag, le);
		view.setUint16(at + 2, type, le);
		view.setUint32(at + 4, count, le);
		if (type === 3) view.setUint16(at + 8, value, le);
		else view.setUint32(at + 8, value, le);
	});
	view.setUint32(total - 4, 0, le);
	return new Uint8Array(buffer);
}
