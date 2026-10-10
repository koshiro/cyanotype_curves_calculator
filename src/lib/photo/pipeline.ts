/**
 * Negativo de una foto de punta a punta: decodificar, aplicar la curva e invertir en 16 bits,
 * codificar el archivo y preparar miniaturas del positivo y del negativo. Sin DOM.
 */
import { makeNegative } from '../core/print/negative';
import { makePreview } from '../scan/pipeline';
import type { RasterImage } from '../core/image/types';
import { decodeImage, sniffImage } from '../io/decode';
import { ImageFormatError } from '../io/errors';
import { encodeGrayPng } from '../io/png';
import { encodeGray16Tiff } from '../io/tiff-write';

export interface PhotoJob {
	bytes: ArrayBuffer;
	fileName: string;
	/** n(p) para p = 0..255. */
	negative: number[];
	mirror: boolean;
	/** DPI a declarar en el archivo; null conserva el de la foto (o 300 si no trae). */
	dpi: number | null;
	format: 'png' | 'tiff';
}

export interface PhotoSuccess {
	ok: true;
	file: Uint8Array;
	fileName: string;
	width: number;
	height: number;
	dpi: number;
	positive: { rgba: Uint8ClampedArray; width: number; height: number };
	negative: { rgba: Uint8ClampedArray; width: number; height: number };
}

export interface PhotoFailure {
	ok: false;
	code: string;
	params: Record<string, number | string>;
}

export type PhotoOutcome = PhotoSuccess | PhotoFailure;

const PREVIEW_SIDE = 900;

export async function runPhotoJob(
	job: PhotoJob,
	decodeOther?: (bytes: ArrayBuffer) => Promise<RasterImage>
): Promise<PhotoOutcome> {
	try {
		const bytes = new Uint8Array(job.bytes);
		const kind = sniffImage(bytes);
		let image: RasterImage;
		if (kind === 'png' || kind === 'tiff') image = decodeImage(bytes);
		else if (decodeOther) image = await decodeOther(job.bytes);
		else throw new ImageFormatError('UNSUPPORTED_FORMAT', { kind });

		const negative = makeNegative(image, job.negative, { mirror: job.mirror });
		const dpi = job.dpi ?? image.dpi ?? 300;
		const file =
			job.format === 'tiff'
				? encodeGray16Tiff(negative.data, negative.width, negative.height, dpi)
				: encodeGrayPng(negative.data, negative.width, negative.height, dpi);
		const base = job.fileName.replace(/\.[^.]+$/, '') || 'foto';
		const negativeRaster: RasterImage = {
			width: negative.width,
			height: negative.height,
			channels: 1,
			bitDepth: 16,
			data: Float32Array.from(negative.data, (v) => v / 65535)
		};
		const positivePreview = makePreview(image, PREVIEW_SIDE);
		const negativePreview = makePreview(negativeRaster, PREVIEW_SIDE);
		return {
			ok: true,
			file,
			fileName: `${base}-negativo.${job.format === 'tiff' ? 'tif' : 'png'}`,
			width: negative.width,
			height: negative.height,
			dpi,
			positive: positivePreview,
			negative: negativePreview
		};
	} catch (error) {
		if (error instanceof ImageFormatError) return { ok: false, code: error.code, params: error.params };
		console.error('Fallo inesperado al generar el negativo', error);
		return { ok: false, code: 'UNKNOWN', params: {} };
	}
}
