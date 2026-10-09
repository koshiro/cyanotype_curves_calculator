/**
 * Punto de entrada de alto nivel: mediciones → modelos → curva recomendada + diagnosticos.
 */
import { buildCorrection, type CorrectionCurve, type CorrectionOptions } from './correction';
import { assessData, assessModel, estimateNoise, type DataReport, type ModelReport } from './diagnostics';
import { aggregate, fitAllResponses } from './response';
import { CalibrationError, type FitMethod, type MeasuredPatch, type ResponseModel } from './types';

export interface CalibrationCandidate {
	model: ResponseModel;
	/** null si la curva no se pudo construir; el motivo esta en `report.diagnostics`. */
	curve: CorrectionCurve | null;
	report: ModelReport;
}

export interface Calibration {
	/** Diagnosticos de las mediciones, comunes a todos los candidatos. */
	data: DataReport;
	/** Candidatos ordenados de mejor a peor segun validacion cruzada. */
	candidates: CalibrationCandidate[];
	/** Mejor candidato con curva valida, o null si ninguno la tiene. */
	recommended: FitMethod | null;
}

/**
 * Calibra a partir de mediciones de una o varias rondas: como `value` es siempre el valor
 * realmente enviado al negativo, las rondas se combinan simplemente concatenando parches.
 *
 * Lanza `CalibrationError` solo cuando no se puede ajustar ningun modelo (mediciones
 * invalidas, muy pocos valores o respuesta no decreciente). Si los modelos existen pero la
 * curva no se puede construir, devuelve los candidatos con su diagnostico para que la
 * interfaz pueda graficar por que fallo.
 */
export function calibrate(patches: readonly MeasuredPatch[], options: CorrectionOptions = {}): Calibration {
	const points = aggregate(patches);
	const models = fitAllResponses(points);
	// El ruido se estima una vez, con el modelo suave: los interpolantes dejan residuos casi
	// nulos y subestimarian el ruido real.
	const reference = models.find((m) => m.method === 'smooth') ?? models[0]!;
	const noise = options.noise ?? estimateNoise(points, reference);
	const data = assessData(points, noise);

	const candidates = models.map((model): CalibrationCandidate => {
		try {
			const curve = buildCorrection(model, { ...options, noise });
			return { model, curve, report: assessModel(model, curve) };
		} catch (error) {
			if (!(error instanceof CalibrationError)) throw error;
			const failure = { code: error.code, severity: 'error' as const, params: error.params };
			return { model, curve: null, report: assessModel(model, null, failure) };
		}
	});
	const recommended = candidates.find((c) => c.curve !== null)?.model.method ?? null;
	return { data, candidates, recommended };
}
