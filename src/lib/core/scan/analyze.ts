/**
 * Analisis completo de un escaneo: ubicar el target, medir parches, estimar el campo plano y
 * reunir avisos. Es la llamada que usa la interfaz (dentro de un Web Worker).
 */
import type { Diagnostic, MeasuredPatch } from '../curve/types';
import type { RasterImage } from '../image/types';
import type { TargetLayout } from '../target/layout';
import { locateTarget, type TargetLocation } from './detect';
import { applyFlatField, estimateFlatField, type FlatField } from './flatfield';
import { measurePatches, toMeasuredPatches, type MeasureOptions, type PatchMeasurement } from './measure';

export type ScanDiagnosticCode = 'MIRRORED' | 'UNEVEN_EXPOSURE' | 'LOW_SCAN_RESOLUTION' | 'EIGHT_BIT_SCAN';

export interface ScanDiagnostic extends Omit<Diagnostic, 'code'> {
	code: ScanDiagnosticCode;
}

export interface ScanAnalysisOptions extends MeasureOptions {
	/** 'auto' corrige el campo plano si supera `flatFieldThreshold`; 'off' solo lo informa. */
	flatField?: 'auto' | 'off';
	/** Diferencia de L* entre extremos de la hoja a partir de la cual se avisa (por defecto 2). */
	flatFieldThreshold?: number;
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

	if (location.mirrored) diagnostics.push({ code: 'MIRRORED', severity: 'info' });
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

	const flatField = estimateFlatField(raw, [layout.paper.widthMm, layout.paper.heightMm]);
	const threshold = options.flatFieldThreshold ?? 2;
	const uneven = flatField !== null && flatField.spanL > threshold;
	if (uneven) {
		diagnostics.push({
			code: 'UNEVEN_EXPOSURE',
			severity: 'warning',
			params: { spanL: flatField.spanL, referenceValue: flatField.referenceValue }
		});
	}
	const apply = uneven && (options.flatField ?? 'auto') === 'auto';
	return {
		location,
		measurements,
		patches: apply ? applyFlatField(raw, flatField!) : raw,
		flatField,
		flatFieldApplied: apply,
		diagnostics
	};
}
