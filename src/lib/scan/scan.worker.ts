/// <reference lib="webworker" />
/**
 * Web Worker del analisis de escaneos: mantiene la interfaz fluida con archivos grandes.
 * JPEG y otros formatos de 8 bits se decodifican con createImageBitmap + OffscreenCanvas.
 */
import { decodeWithBrowser, rgbaToJpegDataUrl } from './browser';
import { runScanJob, type ScanJob } from './pipeline';

self.onmessage = async (event: MessageEvent<ScanJob>) => {
	const outcome = await runScanJob(event.data, decodeWithBrowser);
	if (!outcome.ok) {
		self.postMessage(outcome);
		return;
	}
	const { width, height, scale, rgba } = outcome.preview;
	const dataUrl = await rgbaToJpegDataUrl(rgba, width, height);
	// Solo viajan las dimensiones y el JPEG: los pixeles RGBA no se devuelven a la interfaz.
	self.postMessage({ ...outcome, preview: { width, height, scale, dataUrl } });
};
