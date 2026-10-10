/// <reference lib="webworker" />
/**
 * Ayudas de navegador compartidas por los Web Workers: decodificar formatos de 8 bits con
 * createImageBitmap y comprimir miniaturas a JPEG en data URL.
 */
import type { RasterImage } from '../core/image/types';
import { fromRgba } from '../io/decode';
import { ImageFormatError } from '../io/errors';

export async function decodeWithBrowser(bytes: ArrayBuffer): Promise<RasterImage> {
	let bitmap: ImageBitmap;
	try {
		bitmap = await createImageBitmap(new Blob([bytes]));
	} catch {
		// El navegador no pudo decodificarlo: formato no soportado o archivo danado.
		throw new ImageFormatError('UNSUPPORTED_FORMAT', {});
	}
	// Las dimensiones se leen antes de close(): un ImageBitmap cerrado reporta 0 × 0.
	const { width, height } = bitmap;
	const canvas = new OffscreenCanvas(width, height);
	const context = canvas.getContext('2d');
	if (!context) throw new Error('OffscreenCanvas 2D no disponible');
	context.drawImage(bitmap, 0, 0);
	const { data } = context.getImageData(0, 0, width, height);
	bitmap.close();
	return fromRgba(width, height, data);
}

/** Miniatura comprimida como JPEG en data URL: liviana para mostrarla o guardarla. */
export async function rgbaToJpegDataUrl(
	rgba: Uint8ClampedArray,
	width: number,
	height: number
): Promise<string> {
	const canvas = new OffscreenCanvas(width, height);
	const context = canvas.getContext('2d');
	if (!context) return '';
	context.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);
	const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 });
	const bytes = new Uint8Array(await blob.arrayBuffer());
	let binary = '';
	for (let i = 0; i < bytes.length; i += 0x8000)
		binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	return `data:image/jpeg;base64,${btoa(binary)}`;
}
