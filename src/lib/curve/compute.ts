/**
 * Calibracion lista para la interfaz: la salida de `calibrate` convertida a datos planos
 * (sin funciones) que pueden cruzar un Web Worker y guardarse.
 */
import { calibrate } from '../core/curve/calibrate';
import type { DataReport, ModelReport } from '../core/curve/diagnostics';
import { CalibrationError, type FitMethod, type MeasuredPatch } from '../core/curve/types';

export interface CandidateSummary {
	method: FitMethod;
	looRmse: number | null;
	fitRmse: number;
	report: ModelReport;
	/** L* del modelo para n = 0..255 (para graficar la respuesta). */
	response: number[];
	curve: {
		/** C(p) para p = 0..255. */
		samples: number[];
		/** n(p) para p = 0..255. */
		negative: number[];
		usable: { whiteEdge: number; blackEdge: number };
		lightness: { white: number; black: number; paper: number; dmax: number };
	} | null;
}

export interface CurveComputation {
	ok: true;
	data: DataReport;
	candidates: CandidateSummary[];
	recommended: FitMethod | null;
	/** Puntos medidos agregados por valor (para graficar). */
	points: { value: number; lightness: number; replicates: number; weight: number }[];
}

export interface CurveFailure {
	ok: false;
	code: string;
	params: Record<string, number | string>;
}

export function computeCurve(patches: readonly MeasuredPatch[]): CurveComputation | CurveFailure {
	try {
		const result = calibrate(patches);
		const byValue = new Map<number, { sum: number; weight: number; replicates: number }>();
		for (const p of patches) {
			const w = p.weight ?? 1;
			if (w <= 0) continue;
			const entry = byValue.get(p.value) ?? { sum: 0, weight: 0, replicates: 0 };
			entry.sum += p.lightness * w;
			entry.weight += w;
			entry.replicates++;
			byValue.set(p.value, entry);
		}
		return {
			ok: true,
			data: result.data,
			recommended: result.recommended,
			points: [...byValue.entries()]
				.sort(([a], [b]) => a - b)
				.map(([value, e]) => ({
					value,
					lightness: e.sum / e.weight,
					replicates: e.replicates,
					weight: e.weight
				})),
			candidates: result.candidates.map((c) => ({
				method: c.model.method,
				looRmse: c.model.looRmse,
				fitRmse: c.model.fitRmse,
				report: c.report,
				response: Array.from({ length: 256 }, (_, n) => c.model.evaluate(n)),
				curve: c.curve
					? {
							samples: Array.from(c.curve.samples),
							negative: Array.from(c.curve.negative),
							usable: { ...c.curve.usable },
							lightness: { ...c.curve.lightness }
						}
					: null
			}))
		};
	} catch (error) {
		if (error instanceof CalibrationError) return { ok: false, code: error.code, params: error.params };
		// El detalle tecnico va a la consola, nunca a la interfaz.
		console.error('Fallo inesperado al calcular la curva', error);
		return { ok: false, code: 'UNKNOWN', params: {} };
	}
}
