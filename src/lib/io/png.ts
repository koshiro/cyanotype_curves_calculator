/**
 * PNG: escritura del target (gris de 8 bits con DPI en `pHYs`) y lectura de escaneos de 8 o
 * 16 bits. fast-png no escribe `pHYs`, asi que el bloque se inserta aqui tras `IHDR`.
 */
import { convertIndexedToRgb, decode, encode } from 'fast-png';
import type { RasterImage } from '../core/image/types';
import { ImageFormatError } from './errors';

const CRC_TABLE = (() => {
	const table = new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		table[n] = c >>> 0;
	}
	return table;
})();

function crc32(bytes: Uint8Array): number {
	let c = 0xffffffff;
	for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, payload: Uint8Array): Uint8Array {
	const out = new Uint8Array(12 + payload.length);
	const view = new DataView(out.buffer);
	view.setUint32(0, payload.length);
	for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
	out.set(payload, 8);
	view.setUint32(8 + payload.length, crc32(out.subarray(4, 8 + payload.length)));
	return out;
}

/** Codifica un plano gris de 8 o 16 bits (segun el tipo del arreglo) como PNG con su resolucion. */
export function encodeGrayPng(
	pixels: Uint8Array | Uint16Array,
	width: number,
	height: number,
	dpi: number
): Uint8Array {
	const depth = pixels instanceof Uint16Array ? 16 : 8;
	const png = encode({ width, height, data: pixels, channels: 1, depth });
	const pixelsPerMetre = Math.round(dpi / 0.0254);
	const payload = new Uint8Array(9);
	const view = new DataView(payload.buffer);
	view.setUint32(0, pixelsPerMetre);
	view.setUint32(4, pixelsPerMetre);
	payload[8] = 1; // unidad: metro
	const phys = chunk('pHYs', payload);
	// Firma (8) + IHDR (4 largo + 4 tipo + 13 datos + 4 CRC = 25).
	const split = 8 + 25;
	const out = new Uint8Array(png.length + phys.length);
	out.set(png.subarray(0, split), 0);
	out.set(phys, split);
	out.set(png.subarray(split), split + phys.length);
	return out;
}

export function decodePng(bytes: Uint8Array): RasterImage {
	let png: ReturnType<typeof decode>;
	try {
		// checkCrc detecta bytes danados que de otro modo se decodificarian sin error.
		png = decode(bytes, { checkCrc: true });
	} catch {
		throw new ImageFormatError('CORRUPT_FILE');
	}
	if (png.palette) {
		png = { ...png, data: convertIndexedToRgb(png), channels: png.transparency ? 4 : 3, depth: 8 };
	}
	if (png.depth !== 8 && png.depth !== 16) {
		throw new ImageFormatError('UNSUPPORTED_BIT_DEPTH', { depth: png.depth });
	}
	if (png.data.length < png.width * png.height * png.channels) throw new ImageFormatError('CORRUPT_FILE');
	const max = png.depth === 16 ? 65535 : 255;
	const colour = png.channels >= 3;
	const channels = colour ? 3 : 1;
	const total = png.width * png.height;
	const data = new Float32Array(total * channels);
	for (let i = 0; i < total; i++) {
		for (let c = 0; c < channels; c++) data[i * channels + c] = png.data[i * png.channels + c]! / max;
	}
	const resolution = png.resolution;
	const dpi = resolution && resolution.unit === 1 ? Math.round(resolution.x * 0.0254) : undefined;
	return { width: png.width, height: png.height, channels, bitDepth: png.depth, data, dpi };
}
