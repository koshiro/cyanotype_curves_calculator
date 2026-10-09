/**
 * Lectura de un archivo de escaneo segun su firma. JPEG y otros formatos de 8 bits los
 * decodifica el navegador (createImageBitmap) y entran por `fromRgba`.
 */
import type { RasterImage } from '../core/image/types';
import { ImageFormatError } from './errors';
import { decodePng } from './png';
import { decodeTiff } from './tiff';

export type ImageKind = 'png' | 'tiff' | 'jpeg' | 'unknown';

export function sniffImage(bytes: Uint8Array): ImageKind {
	const b = bytes;
	if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
	if (
		(b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2a && b[3] === 0) ||
		(b[0] === 0x4d && b[1] === 0x4d && b[2] === 0 && b[3] === 0x2a)
	) {
		return 'tiff';
	}
	if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
	return 'unknown';
}

/** Decodifica PNG o TIFF conservando 16 bits. Para JPEG usar el decodificador del navegador. */
export function decodeImage(bytes: Uint8Array): RasterImage {
	const kind = sniffImage(bytes);
	if (kind === 'png') return decodePng(bytes);
	if (kind === 'tiff') return decodeTiff(bytes);
	throw new ImageFormatError('UNSUPPORTED_FORMAT', { kind });
}

/** Convierte pixeles RGBA de 8 bits (p. ej. ImageData del navegador) en RasterImage. */
export function fromRgba(width: number, height: number, rgba: ArrayLike<number>): RasterImage {
	const data = new Float32Array(width * height * 3);
	for (let i = 0; i < width * height; i++) {
		for (let c = 0; c < 3; c++) data[i * 3 + c] = rgba[i * 4 + c]! / 255;
	}
	return { width, height, channels: 3, bitDepth: 8, data };
}
