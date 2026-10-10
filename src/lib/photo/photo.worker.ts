/// <reference lib="webworker" />
/** Web Worker que genera el negativo de una foto (decodificar, curva, inversion, archivo). */
import { decodeWithBrowser, rgbaToJpegDataUrl } from '../scan/browser';
import { runPhotoJob, type PhotoJob } from './pipeline';

self.onmessage = async (event: MessageEvent<PhotoJob>) => {
	const outcome = await runPhotoJob(event.data, decodeWithBrowser);
	if (!outcome.ok) {
		self.postMessage(outcome);
		return;
	}
	const [positive, negative] = await Promise.all([
		rgbaToJpegDataUrl(outcome.positive.rgba, outcome.positive.width, outcome.positive.height),
		rgbaToJpegDataUrl(outcome.negative.rgba, outcome.negative.width, outcome.negative.height)
	]);
	const file = outcome.file;
	self.postMessage(
		{
			ok: true,
			file,
			fileName: outcome.fileName,
			width: outcome.width,
			height: outcome.height,
			dpi: outcome.dpi,
			positive,
			negative
		},
		[file.buffer]
	);
};
