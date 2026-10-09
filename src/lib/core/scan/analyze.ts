/**
 * Analisis completo de un escaneo: ubicar el target, medir parches, estimar el campo plano y
 * reunir avisos. Es la llamada que usa la interfaz (dentro de un Web Worker).
 */
import type { Diagnostic, MeasuredPatch } from '../curve/types';
import { orientationMirrors, type RasterImage } from '../image/types';
import type { TargetLayout } from '../target/layout';
import { locateTarget, type TargetLocation } from './detect';
import { applyFlatField, estimateFlatField, type FlatField } from './flatfield';
import { measurePatches, toMeasuredPatches, type MeasureOptions, type PatchMeasurement } from './measure';

export type ScanDiagnosticCode =
	'MIRRORED' | 'UNEVEN_EXPOSURE' | 'LOW_SCAN_RESOLUTION' | 'EIGHT_BIT_SCAN' | 'LAYOUT_MISMATCH';

export interface ScanDiagnostic extends Omit<Diagnostic, 'code'> {
	code: ScanDiagnosticCode;
}

export interface ScanAnalysisOptions extends MeasureOptions {
	/**
	 * 'off' (por defecto) solo informa el campo plano; 'auto' lo corrige cuando la prueba
	 * estadistica lo declara significativo. Queda desactivado hasta validarlo con copias reales.
	 */
	flatField?: 'auto' | 'off';
}

export interface ScanAnalysis {
	location: TargetLocation;
	measurements: PatchMeasurement[];
	/** Parches listos para `calibrate` (con campo plano corregido si corresponde). */
	patches: MeasuredPatch[];
	flatField: FlatField | null;
	flatFieldApplied: boolean;
	diagnostics: ScanDiagnostic[];
}

/** Lado minimo de un parche en el escaneo, en pixeles, para una medicion confiable. */
const MIN_PATCH_PIXELS = 20;

export function analyzeScan(
	image: RasterImage,
	layout: TargetLayout,
	options: ScanAnalysisOptions = {}
): ScanAnalysis {
	const location = locateTarget(image, layout);
	const measurements = measurePatches(image, layout, location.homography, options);
	const raw = toMeasuredPatches(measurements);
	const diagnostics: ScanDiagnostic[] = [];

	// Si el archivo declara una orientacion espejada, el espejo detectado viene del archivo y no
	// de la copia.
	const mirrored = location.mirrored !== orientationMirrors(image.orientation);
	if (mirrored) diagnostics.push({ code: 'MIRRORED', severity: 'info' });
	if (image.bitDepth < 16)
		diagnostics.push({ code: 'EIGHT_BIT_SCAN', severity: 'info', params: { bits: image.bitDepth } });
	const patchPixels = (layout.patchSizeMm / 25.4) * layout.dpi * location.scale;
	if (patchPixels < MIN_PATCH_PIXELS) {
		diagnostics.push({
			code: 'LOW_SCAN_RESOLUTION',
			severity: 'warning',
			params: { patchPixels: Math.round(patchPixels), required: MIN_PATCH_PIXELS }
		});
	}

	// Con el layout correcto, L* cae fuertemente al subir n. Una correlacion de rangos debil
	// indica que el escaneo no corresponde a este layout (otra semilla, otro target).
	const correlation = spearman(
		raw.map((p) => p.value),
		raw.map((p) => p.lightness)
	);
	if (!(correlation < -0.6)) {
		diagnostics.push({
			code: 'LAYOUT_MISMATCH',
			severity: 'error',
			params: { correlation: Math.round(correlation * 100) / 100 }
		});
	}

	const flatField = estimateFlatField(raw);
	if (flatField?.significant) {
		diagnostics.push({
			code: 'UNEVEN_EXPOSURE',
			severity: 'warning',
			params: { spanL: flatField.spanL, spanN: flatField.spanN }
		});
	}
	const apply = Boolean(flatField?.significant) && options.flatField === 'auto';
	return {
		location,
		measurements,
		patches: apply ? applyFlatField(raw, flatField!) : raw,
		flatField,
		flatFieldApplied: apply,
		diagnostics
	};
}

/** Correlacion de Spearman (rangos promedio en empates). */
export function spearman(xs: readonly number[], ys: readonly number[]): number {
	const rank = (values: readonly number[]) => {
		const order = values.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]);
		const ranks = new Array<number>(values.length);
		for (let i = 0; i < order.length;) {
			let j = i;
			while (j + 1 < order.length && order[j + 1]![0] === order[i]![0]) j++;
			for (let k = i; k <= j; k++) ranks[order[k]![1]] = (i + j) / 2;
			i = j + 1;
		}
		return ranks;
	};
	const rx = rank(xs);
	const ry = rank(ys);
	const mean = (rx.length - 1) / 2;
	let num = 0;
	let dx = 0;
	let dy = 0;
	for (let i = 0; i < rx.length; i++) {
		num += (rx[i]! - mean) * (ry[i]! - mean);
		dx += (rx[i]! - mean) ** 2;
		dy += (ry[i]! - mean) ** 2;
	}
	return dx > 0 && dy > 0 ? num / Math.sqrt(dx * dy) : 0;
}
