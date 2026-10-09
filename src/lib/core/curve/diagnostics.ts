/**
 * Metricas fisicas y diagnosticos accionables de una calibracion.
 * Reemplaza el "data score" ponderado arbitrario de la version Python.
 */
import { lightnessToDensity, type CorrectionCurve } from './correction';
import type { AggregatedPoint, Diagnostic, ResponseModel } from './types';

export interface QualityReport {
	patches: number;
	uniqueValues: number;
	/** L* del blanco de papel y del negro maximo medidos (modelo). */
	paperLightness: number;
	dmaxLightness: number;
	/** Rango de densidad util del proceso (log10). */
	densityRange: number;
	/** Fraccion del rango del negativo (0..255) que realmente modula tono. */
	usableFraction: number;
	fitRmse: number;
	looRmse: number | null;
	/** Mayor salto de L* entre valores consecutivos del target. */
	largestGap: { from: number; to: number; deltaL: number };
	diagnostics: Diagnostic[];
}

export interface DiagnosticThresholds {
	/** Meseta (en valores de negativo) a partir de la cual se avisa. */
	plateau: number;
	/** ΔL* entre parches consecutivos que se considera poca resolucion. */
	gap: number;
	/** ΔL* minimo de retroceso en datos crudos para avisar (se eleva segun el ruido observado). */
	reversal: number;
	/** Desviacion entre repeticiones que sugiere iluminacion despareja o escaneo ruidoso. */
	replicateSpread: number;
	/** RMSE de validacion cruzada que indica un ajuste poco confiable. */
	poorFit: number;
}

export const DEFAULT_THRESHOLDS: DiagnosticThresholds = {
	plateau: 25,
	gap: 8,
	reversal: 2,
	replicateSpread: 1.5,
	poorFit: 2
};

export function assessQuality(
	points: readonly AggregatedPoint[],
	model: ResponseModel,
	curve: CorrectionCurve,
	thresholds: DiagnosticThresholds = DEFAULT_THRESHOLDS
): QualityReport {
	const diagnostics: Diagnostic[] = [];
	const { whiteEdge, blackEdge } = curve.usable;
	const { paper, dmax } = curve.lightness;
	const [domainMin, domainMax] = model.domain;

	if (whiteEdge - domainMin > thresholds.plateau) {
		diagnostics.push({
			code: 'WHITE_PLATEAU',
			severity: 'warning',
			params: { from: round(domainMin), to: round(whiteEdge) }
		});
	}
	if (domainMax - blackEdge > thresholds.plateau) {
		diagnostics.push({
			code: 'BLACK_PLATEAU',
			severity: 'warning',
			params: { from: round(blackEdge), to: round(domainMax) }
		});
	}

	// Un retroceso solo cuenta si supera tanto el umbral fijo como el ruido observado en el
	// ajuste (3σ de la diferencia de dos mediciones); si no, es ruido normal de escaneo. σ se
	// estima con la MAD de los residuos para que un parche erroneo no infle su propio umbral.
	const reversalLimit = Math.max(thresholds.reversal, 3 * Math.SQRT2 * robustNoise(points, model));
	let reversals = 0;
	let largestGap = { from: points[0]!.value, to: points[0]!.value, deltaL: 0 };
	for (let i = 1; i < points.length; i++) {
		const prev = points[i - 1]!;
		const cur = points[i]!;
		const drop = prev.lightness - cur.lightness;
		if (drop < -reversalLimit) reversals++;
		if (Math.abs(drop) > largestGap.deltaL) {
			largestGap = { from: prev.value, to: cur.value, deltaL: round(Math.abs(drop)) };
		}
	}
	if (reversals > 0) {
		diagnostics.push({
			code: 'NON_MONOTONIC_MEASUREMENTS',
			severity: 'warning',
			params: { count: reversals }
		});
	}
	if (largestGap.deltaL > thresholds.gap) {
		diagnostics.push({
			code: 'SPARSE_REGION',
			severity: 'info',
			params: { from: largestGap.from, to: largestGap.to, deltaL: largestGap.deltaL }
		});
	}

	const replicated = points.filter((p) => p.replicates > 1);
	if (replicated.length > 0) {
		const worst = replicated.reduce((a, b) => (b.spread > a.spread ? b : a));
		if (worst.spread > thresholds.replicateSpread) {
			diagnostics.push({
				code: 'HIGH_REPLICATE_SPREAD',
				severity: 'warning',
				params: { value: worst.value, spread: round(worst.spread) }
			});
		}
	}

	const cv = model.looRmse ?? model.fitRmse;
	if (cv > thresholds.poorFit) {
		diagnostics.push({ code: 'POOR_FIT', severity: 'warning', params: { rmse: round(cv) } });
	}

	return {
		patches: points.reduce((s, p) => s + p.replicates, 0),
		uniqueValues: points.length,
		paperLightness: round(paper),
		dmaxLightness: round(dmax),
		densityRange: Math.round((lightnessToDensity(dmax) - lightnessToDensity(paper)) * 100) / 100,
		usableFraction: Math.round(((blackEdge - whiteEdge) / 255) * 1000) / 1000,
		fitRmse: round(model.fitRmse),
		looRmse: model.looRmse === null ? null : round(model.looRmse),
		largestGap,
		diagnostics
	};
}

/** σ robusta (1.4826 · MAD) de los residuos del modelo. */
function robustNoise(points: readonly AggregatedPoint[], model: ResponseModel): number {
	const residuals = points.map((p) => p.lightness - model.evaluate(p.value));
	const center = median(residuals);
	return 1.4826 * median(residuals.map((r) => Math.abs(r - center)));
}

function median(values: readonly number[]): number {
	const sorted = [...values].sort((a, b) => a - b);
	const mid = sorted.length >> 1;
	return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function round(value: number): number {
	return Math.round(value * 10) / 10;
}
