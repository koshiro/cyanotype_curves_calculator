/**
 * Punto de entrada de alto nivel: mediciones → modelos → curva recomendada + diagnosticos.
 */
import { buildCorrection, type CorrectionCurve, type CorrectionOptions } from './correction';
import { assessQuality, type QualityReport } from './diagnostics';
import { aggregate, fitAllResponses } from './response';
import type { FitMethod, MeasuredPatch, ResponseModel } from './types';

export interface CalibrationCandidate {
	model: ResponseModel;
	curve: CorrectionCurve;
	quality: QualityReport;
}

export interface Calibration {
	/** Candidatos ordenados de mejor a peor segun validacion cruzada. */
	candidates: CalibrationCandidate[];
	recommended: FitMethod;
}

/**
 * Calibra a partir de mediciones de una o varias rondas: como `value` es siempre el valor
 * realmente enviado al negativo, las rondas se combinan simplemente concatenando parches.
 */
export function calibrate(patches: readonly MeasuredPatch[], options: CorrectionOptions = {}): Calibration {
	const points = aggregate(patches);
	const candidates = fitAllResponses(points).map((model) => {
		const curve = buildCorrection(model, options);
		return { model, curve, quality: assessQuality(points, model, curve) };
	});
	return { candidates, recommended: candidates[0]!.model.method };
}
