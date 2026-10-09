/**
 * Analisis de un archivo de escaneo de punta a punta: decodificar, ubicar el negativo,
 * medir parches y preparar una miniatura para mostrar. Sin DOM: corre en un Web Worker y en
 * tests. La decodificacion de JPEG (u otros formatos de 8 bits) se inyecta porque depende de
 * APIs del navegador (createImageBitmap).
 */
import { ScanError } from '../core/scan/detect';
import { analyzeScan, type ScanDiagnostic } from '../core/scan/analyze';
import type { FlatField } from '../core/scan/flatfield';
import { applyHomography, type Point } from '../core/image/homography';
import type { RasterImage } from '../core/image/types';
import type { MeasuredPatch } from '../core/curve/types';
import type { TargetLayout } from '../core/target/layout';
import { decodeImage, sniffImage } from '../io/decode';
import { ImageFormatError } from '../io/errors';

export interface ScanJob {
	bytes: ArrayBuffer;
	fileName: string;
	layout: TargetLayout;
	flatField: 'auto' | 'off';
}

export interface PreviewImage {
	width: number;
	height: number;
	/** RGBA de 8 bits. */
	rgba: Uint8ClampedArray;
	/** Factor escaneo → miniatura. */
	scale: number;
}

export interface PatchOverlay {
	value: number;
	/** Esquinas del parche en coordenadas de la miniatura. */
	corners: Point[];
	outlier: boolean;
	lightness: number;
}

export interface ScanSuccess {
	ok: true;
	fileName: string;
	width: number;
	height: number;
	bitDepth: number;
	dpi?: number;
	patches: MeasuredPatch[];
	overlays: PatchOverlay[];
	markers: Point[][];
	mirrored: boolean;
	rotationDegrees: number;
	reprojectionError: number;
	flatField: FlatField | null;
	flatFieldApplied: boolean;
	diagnostics: ScanDiagnostic[];
	preview: PreviewImage;
}

export interface ScanFailure {
	ok: false;
	code: string;
	params: Record<string, number | string>;
}

export type ScanOutcome = ScanSuccess | ScanFailure;

export type BrowserDecoder = (bytes: ArrayBuffer) => Promise<RasterImage>;

const PREVIEW_MAX_SIDE = 1400;
/** Fraccion del lado del parche que mide `measurePatches` por defecto. */
const MEASURED_FRACTION = 0.6;

export async function runScanJob(job: ScanJob, decodeOther?: BrowserDecoder): Promise<ScanOutcome> {
	try {
		const bytes = new Uint8Array(job.bytes);
		const kind = sniffImage(bytes);
		let image: RasterImage;
		if (kind === 'png' || kind === 'tiff') image = decodeImage(bytes);
		else if (decodeOther) image = await decodeOther(job.bytes);
		else throw new ImageFormatError('UNSUPPORTED_FORMAT', { kind });

		const analysis = analyzeScan(image, job.layout, { flatField: job.flatField });
		const preview = makePreview(image);
		const toPreview = (p: Point): Point => {
			const [x, y] = applyHomography(analysis.location.homography, p);
			return [x * preview.scale, y * preview.scale];
		};
		// Se dibuja el area central que realmente se mide (60 % del lado), no el borde del parche.
		const overlays: PatchOverlay[] = analysis.measurements.map((m, i) => {
			const [bx0, by0, bx1, by1] = m.patch.box;
			const inset = ((bx1 - bx0) * (1 - MEASURED_FRACTION)) / 2;
			const [x0, y0, x1, y1] = [bx0 + inset, by0 + inset, bx1 - inset, by1 - inset];
			return {
				value: m.patch.value,
				corners: (
					[
						[x0, y0],
						[x1, y0],
						[x1, y1],
						[x0, y1]
					] as Point[]
				).map(toPreview),
				outlier: (analysis.patches[i]?.weight ?? 1) < 1,
				lightness: m.lightness
			};
		});
		return {
			ok: true,
			fileName: job.fileName,
			width: image.width,
			height: image.height,
			bitDepth: image.bitDepth,
			dpi: image.dpi,
			patches: analysis.patches,
			overlays,
			markers: analysis.location.markers.map((m) =>
				m.corners.map(([x, y]) => [x * preview.scale, y * preview.scale] as Point)
			),
			mirrored: analysis.location.mirrored,
			rotationDegrees: analysis.location.rotationDegrees,
			reprojectionError: analysis.location.reprojectionError,
			flatField: analysis.flatField,
			flatFieldApplied: analysis.flatFieldApplied,
			diagnostics: analysis.diagnostics,
			preview
		};
	} catch (error) {
		if (error instanceof ScanError || error instanceof ImageFormatError) {
			return { ok: false, code: error.code, params: error.params };
		}
		// El detalle tecnico va a la consola, nunca a la interfaz.
		console.error('Fallo inesperado al analizar el escaneo', error);
		return { ok: false, code: 'UNKNOWN', params: {} };
	}
}

/** Miniatura RGBA de 8 bits (promedio por cajas) para mostrar el escaneo en pantalla. */
export function makePreview(image: RasterImage, maxSide = PREVIEW_MAX_SIDE): PreviewImage {
	const factor = Math.max(1, Math.ceil(Math.max(image.width, image.height) / maxSide));
	const width = Math.floor(image.width / factor);
	const height = Math.floor(image.height / factor);
	const rgba = new Uint8ClampedArray(width * height * 4);
	const { data, channels } = image;
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			let r = 0;
			let g = 0;
			let b = 0;
			for (let dy = 0; dy < factor; dy++) {
				let i = ((y * factor + dy) * image.width + x * factor) * channels;
				for (let dx = 0; dx < factor; dx++, i += channels) {
					r += data[i]!;
					g += data[channels === 3 ? i + 1 : i]!;
					b += data[channels === 3 ? i + 2 : i]!;
				}
			}
			const n = factor * factor;
			const o = (y * width + x) * 4;
			rgba[o] = (r / n) * 255;
			rgba[o + 1] = (g / n) * 255;
			rgba[o + 2] = (b / n) * 255;
			rgba[o + 3] = 255;
		}
	}
	return { width, height, rgba, scale: 1 / factor };
}
