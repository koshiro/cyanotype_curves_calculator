/**
 * Metricas fisicas y diagnosticos accionables de una calibracion.
 * Reemplaza el "data score" ponderado arbitrario de la version Python.
 *
 * Hay dos informes separados:
 * - `DataReport` describe las **mediciones** y es unico por calibracion: no cambia segun el
 *   metodo de ajuste que se mire (retrocesos, huecos, dispersion, cobertura, ruido).
 * - `ModelReport` describe cada **modelo** y su curva (mesetas, rango, error de ajuste).
 */
import { lightnessToDensity, type CorrectionCurve } from './correction';
import type { AggregatedPoint, Diagnostic, ResponseModel } from './types';

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
	/** Distancia maxima (en valores de negativo) entre 0/255 y el primer/ultimo valor medido. */
	coverageMargin: number;
}

export const DEFAULT_THRESHOLDS: DiagnosticThresholds = {
	plateau: 25,
	gap: 8,
	reversal: 2,
	replicateSpread: 1.5,
	poorFit: 2,
	coverageMargin: 10
};

export interface DataReport {
	patches: number;
	uniqueValues: number;
	/** σ robusta del ruido de medicion en L* (MAD de los residuos de un modelo suave). */
	noise: number;
	/** Rango de valores de negativo medidos. */
	coverage: readonly [number, number];
	/** Mayor salto de L* entre valores consecutivos del target. */
	largestGap: { from: number; to: number; deltaL: number };
	diagnostics: Diagnostic[];
}

export interface ModelReport {
	/** L* del blanco de papel y del negro maximo segun el modelo. */
	paperLightness: number;
	dmaxLightness: number;
	/** Rango de densidad util del proceso (log10); null si no se pudo construir la curva. */
	densityRange: number | null;
	/** Fraccion del rango del negativo (0..255) que realmente modula tono. */
	usableFraction: number | null;
	fitRmse: number;
	looRmse: number | null;
	diagnostics: Diagnostic[];
}

/** σ robusta (1.4826 · MAD) de los residuos de un modelo. */
export function estimateNoise(points: readonly AggregatedPoint[], model: ResponseModel): number {
	const residuals = points.map((p) => p.lightness - model.evaluate(p.value));
	const center = median(residuals);
	return 1.4826 * median(residuals.map((r) => Math.abs(r - center)));
}

export function assessData(
	points: readonly AggregatedPoint[],
	noise: number,
	thresholds: DiagnosticThresholds = DEFAULT_THRESHOLDS
): DataReport {
	const diagnostics: Diagnostic[] = [];
	const coverage = [points[0]!.value, points.at(-1)!.value] as const;
	if (coverage[0] > thresholds.coverageMargin || coverage[1] < 255 - thresholds.coverageMargin) {
		diagnostics.push({
			code: 'PARTIAL_COVERAGE',
			severity: 'warning',
			params: { from: coverage[0], to: coverage[1] }
		});
	}

	// Un retroceso solo cuenta si supera tanto el umbral fijo como el ruido observado
	// (3σ de la diferencia de dos mediciones); si no, es ruido normal de escaneo.
	const reversalLimit = Math.max(thresholds.reversal, 3 * Math.SQRT2 * noise);
	let reversals = 0;
	let largestGap = { from: coverage[0], to: coverage[0], deltaL: 0 };
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

	return {
		patches: points.reduce((s, p) => s + p.replicates, 0),
		uniqueValues: points.length,
		noise: Math.round(noise * 100) / 100,
		coverage,
		largestGap,
		diagnostics
	};
}

/**
 * Informe de un modelo. `curve` es null cuando no se pudo construir (p. ej. rango
 * insuficiente); en ese caso `failure` trae el diagnostico de error correspondiente.
 */
export function assessModel(
	model: ResponseModel,
	curve: CorrectionCurve | null,
	failure: Diagnostic | null = null,
	thresholds: DiagnosticThresholds = DEFAULT_THRESHOLDS
): ModelReport {
	const diagnostics: Diagnostic[] = failure ? [failure] : [];
	const [domainMin, domainMax] = model.domain;
	const paper = model.evaluate(domainMin);
	const dmax = model.evaluate(domainMax);

	if (curve) {
		const { whiteEdge, blackEdge } = curve.usable;
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
	}

	const cv = model.looRmse ?? model.fitRmse;
	if (cv > thresholds.poorFit) {
		diagnostics.push({ code: 'POOR_FIT', severity: 'warning', params: { rmse: round(cv) } });
	}

	return {
		paperLightness: round(paper),
		dmaxLightness: round(dmax),
		densityRange: curve
			? Math.round(
					(lightnessToDensity(curve.lightness.dmax) - lightnessToDensity(curve.lightness.paper)) * 100
				) / 100
			: null,
		usableFraction: curve
			? Math.round(((curve.usable.blackEdge - curve.usable.whiteEdge) / 255) * 1000) / 1000
			: null,
		fitRmse: round(model.fitRmse),
		looRmse: model.looRmse === null ? null : round(model.looRmse),
		diagnostics
	};
}

function median(values: readonly number[]): number {
	const sorted = [...values].sort((a, b) => a - b);
	const mid = sorted.length >> 1;
	return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function round(value: number): number {
	return Math.round(value * 10) / 10;
}
