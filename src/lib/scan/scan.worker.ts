/// <reference lib="webworker" />
/**
 * Web Worker del analisis de escaneos: mantiene la interfaz fluida con archivos grandes.
 * JPEG y otros formatos de 8 bits se decodifican con createImageBitmap + OffscreenCanvas.
 */
import { fromRgba } from '../io/decode';
import { ImageFormatError } from '../io/errors';
import { runScanJob, type ScanJob } from './pipeline';

async function decodeWithBrowser(bytes: ArrayBuffer) {
	let bitmap: ImageBitmap;
	try {
		bitmap = await createImageBitmap(new Blob([bytes]));
	} catch {
		// El navegador no pudo decodificarlo: formato no soportado o archivo danado.
		throw new ImageFormatError('UNSUPPORTED_FORMAT', {});
	}
	const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
	const context = canvas.getContext('2d');
	if (!context) throw new Error('OffscreenCanvas 2D no disponible');
	context.drawImage(bitmap, 0, 0);
	const { data } = context.getImageData(0, 0, bitmap.width, bitmap.height);
	bitmap.close();
	return fromRgba(bitmap.width, bitmap.height, data);
}

/** Miniatura comprimida como JPEG en data URL: liviana para guardarla en el proyecto. */
async function previewDataUrl(preview: { width: number; height: number; rgba: Uint8ClampedArray }) {
	const canvas = new OffscreenCanvas(preview.width, preview.height);
	const context = canvas.getContext('2d');
	if (!context) return '';
	context.putImageData(
		new ImageData(new Uint8ClampedArray(preview.rgba), preview.width, preview.height),
		0,
		0
	);
	const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 });
	const bytes = new Uint8Array(await blob.arrayBuffer());
	let binary = '';
	for (let i = 0; i < bytes.length; i += 0x8000)
		binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	return `data:image/jpeg;base64,${btoa(binary)}`;
}

self.onmessage = async (event: MessageEvent<ScanJob>) => {
	const outcome = await runScanJob(event.data, decodeWithBrowser);
	if (!outcome.ok) {
		self.postMessage(outcome);
		return;
	}
	const dataUrl = await previewDataUrl(outcome.preview);
	// Solo viajan las dimensiones y el JPEG: los pixeles RGBA no se devuelven a la interfaz.
	const { width, height, scale } = outcome.preview;
	self.postMessage({ ...outcome, preview: { width, height, scale, dataUrl } });
};
