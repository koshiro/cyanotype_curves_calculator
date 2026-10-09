/**
 * Ajuste del modelo directo L*(n): como responde el papel a cada valor del negativo.
 *
 * A diferencia de la version Python (que interpolaba directamente la inversa sobre datos
 * crudos), aqui primero se ajusta un modelo monotono y suave de la respuesta y despues se
 * invierte numericamente (ver `correction.ts`). Asi el ruido de medicion no se copia a la curva.
 */
import { isotonic } from '../math/isotonic';
import { linear, pchip } from '../math/interpolate';
import { fitPSpline, fitPSplineAuto } from '../math/pspline';
import {
	CalibrationError,
	FIT_METHODS,
	type AggregatedPoint,
	type FitMethod,
	type MeasuredPatch,
	type ResponseModel
} from './types';

export const MIN_UNIQUE_VALUES = 5;

/**
 * Peso maximo admitido. La deteccion usara el inverso de la varianza como peso: un parche
 * saturado (varianza 0) daria peso infinito, que se acota aqui en vez de romper el ajuste.
 */
export const MAX_WEIGHT = 1e6;

/**
 * Agrupa repeticiones del mismo valor (redondeado a 1/100) con media ponderada.
 * Peso 0 significa "ignorar este parche". Valores fuera de rango, no finitos o pesos negativos
 * son un error de la etapa anterior y se reportan con `INVALID_MEASUREMENT`.
 */
export function aggregate(patches: readonly MeasuredPatch[]): AggregatedPoint[] {
	const groups = new Map<number, { patch: MeasuredPatch; weight: number }[]>();
	for (const [index, patch] of patches.entries()) {
		const weight = patch.weight ?? 1;
		const invalid =
			!Number.isFinite(patch.value) ||
			patch.value < 0 ||
			patch.value > 255 ||
			!Number.isFinite(patch.lightness) ||
			patch.lightness < 0 ||
			patch.lightness > 100 ||
			Number.isNaN(weight) ||
			weight < 0;
		if (invalid) {
			throw new CalibrationError('INVALID_MEASUREMENT', {
				index,
				value: patch.value,
				lightness: patch.lightness,
				weight
			});
		}
		if (weight === 0) continue;
		const key = Math.round(patch.value * 100) / 100;
		const entry = { patch, weight: Math.min(weight, MAX_WEIGHT) };
		const list = groups.get(key);
		if (list) list.push(entry);
		else groups.set(key, [entry]);
	}
	return [...groups.entries()]
		.sort(([a], [b]) => a - b)
		.map(([value, list]) => {
			const total = list.reduce((s, e) => s + e.weight, 0);
			const mean = list.reduce((s, e) => s + e.patch.lightness * e.weight, 0) / total;
			// Desviacion estandar no ponderada de las repeticiones: mide la dispersion fisica
			// (iluminacion, escaneo), independiente de la confianza asignada a cada parche.
			const plainMean = list.reduce((s, e) => s + e.patch.lightness, 0) / list.length;
			const variance =
				list.length > 1
					? list.reduce((s, e) => s + (e.patch.lightness - plainMean) ** 2, 0) / (list.length - 1)
					: 0;
			return {
				value,
				lightness: mean,
				weight: total,
				replicates: list.length,
				spread: Math.sqrt(variance)
			};
		});
}

interface FitInput {
	xs: number[];
	ys: number[];
	ws: number[];
}

interface Fitted {
	evaluate: (value: number) => number;
	/** Suavizado elegido por GCV (solo `smooth`); se reutiliza en la validacion cruzada. */
	lambda?: number;
	/** Segmentos de la base (solo `smooth`); se fijan en la validacion cruzada. */
	segments?: number;
}

function fitEvaluator(
	method: FitMethod,
	{ xs, ys, ws }: FitInput,
	fixed: { lambda?: number; segments?: number } = {}
): Fitted {
	if (method === 'smooth') {
		const segments = fixed.segments ?? Math.min(24, Math.max(6, Math.round(xs.length * 0.6)));
		const options = { segments, direction: 'decreasing' as const };
		const fit =
			fixed.lambda === undefined
				? fitPSplineAuto(xs, ys, ws, options)
				: fitPSpline(xs, ys, ws, { ...options, lambda: fixed.lambda });
		return { evaluate: fit.evaluate, lambda: fit.lambda, segments };
	}
	// PCHIP y lineal interpolan: primero se proyectan los datos al conjunto monotono y cada
	// bloque que la proyeccion iguala se colapsa en un solo punto. Asi el modelo no tiene
	// tramos exactamente planos dentro del rango, que al invertirlos producen saltos en la curva.
	const { xs: cx, ys: cy } = collapseBlocks(xs, isotonic(ys, ws, 'decreasing'), ws);
	if (cx.length < 2) throw new CalibrationError('NOT_DECREASING');
	return { evaluate: method === 'pchip' ? pchip(cx, cy) : linear(cx, cy) };
}

/** Une los puntos consecutivos con el mismo valor isotonico en su centroide ponderado. */
function collapseBlocks(
	xs: readonly number[],
	ys: readonly number[],
	ws: readonly number[]
): { xs: number[]; ys: number[] } {
	const outX: number[] = [];
	const outY: number[] = [];
	let i = 0;
	while (i < xs.length) {
		let j = i;
		let weight = 0;
		let sumX = 0;
		while (j < xs.length && ys[j] === ys[i]) {
			weight += ws[j]!;
			sumX += ws[j]! * xs[j]!;
			j++;
		}
		outX.push(sumX / weight);
		outY.push(ys[i]!);
		i = j;
	}
	return { xs: outX, ys: outY };
}

function rmse(errors: readonly number[], weights: readonly number[]): number {
	const total = weights.reduce((s, w) => s + w, 0);
	return Math.sqrt(errors.reduce((s, e, i) => s + weights[i]! * e * e, 0) / total);
}

/** Validacion cruzada dejando fuera cada punto interior (los extremos no se pueden predecir). */
function leaveOneOut(
	method: FitMethod,
	input: FitInput,
	fixed: { lambda?: number; segments?: number }
): number | null {
	const { xs, ys, ws } = input;
	if (xs.length < MIN_UNIQUE_VALUES + 1) return null;
	const errors: number[] = [];
	const weights: number[] = [];
	for (let k = 1; k < xs.length - 1; k++) {
		const keep = (_: number, i: number) => i !== k;
		const { evaluate } = fitEvaluator(
			method,
			{ xs: xs.filter(keep), ys: ys.filter(keep), ws: ws.filter(keep) },
			fixed
		);
		errors.push(evaluate(xs[k]!) - ys[k]!);
		weights.push(ws[k]!);
	}
	return rmse(errors, weights);
}

export function fitResponse(
	points: readonly AggregatedPoint[],
	method: FitMethod,
	options: { crossValidate?: boolean } = {}
): ResponseModel {
	if (points.length < MIN_UNIQUE_VALUES) {
		throw new CalibrationError('TOO_FEW_VALUES', { found: points.length, required: MIN_UNIQUE_VALUES });
	}
	const input: FitInput = {
		xs: points.map((p) => p.value),
		ys: points.map((p) => p.lightness),
		ws: points.map((p) => p.weight)
	};
	if (slope(input) >= 0) throw new CalibrationError('NOT_DECREASING');

	const { evaluate: raw, lambda, segments } = fitEvaluator(method, input);
	const domain = [input.xs[0]!, input.xs.at(-1)!] as const;
	const evaluate = (value: number) => raw(Math.min(Math.max(value, domain[0]), domain[1]));
	const fitRmse = rmse(
		input.xs.map((x, i) => evaluate(x) - input.ys[i]!),
		input.ws
	);
	const looRmse = options.crossValidate === false ? null : leaveOneOut(method, input, { lambda, segments });
	return { method, evaluate, domain, fitRmse, looRmse };
}

/** Margen en ΔL* dentro del cual dos metodos se consideran empatados. */
export const TIE_TOLERANCE = 0.05;

/**
 * Ajusta todos los metodos y los ordena por error de validacion cruzada. Entre los que quedan
 * a menos de `TIE_TOLERANCE` del mejor se prefiere el orden de FIT_METHODS (smooth primero);
 * el resto va despues por error. El criterio es transitivo e independiente del orden de entrada.
 */
export function fitAllResponses(points: readonly AggregatedPoint[]): ResponseModel[] {
	const models = FIT_METHODS.map((method) => fitResponse(points, method));
	const score = (m: ResponseModel) => m.looRmse ?? m.fitRmse;
	const best = Math.min(...models.map(score));
	const order = (m: ResponseModel) => FIT_METHODS.indexOf(m.method);
	const tied = (m: ResponseModel) => score(m) - best < TIE_TOLERANCE;
	return [...models].sort((a, b) => {
		if (tied(a) !== tied(b)) return tied(a) ? -1 : 1;
		if (tied(a)) return order(a) - order(b);
		return score(a) - score(b) || order(a) - order(b);
	});
}

/** Pendiente de minimos cuadrados ponderados: signo global de la respuesta. */
function slope({ xs, ys, ws }: FitInput): number {
	const total = ws.reduce((s, w) => s + w, 0);
	const mx = xs.reduce((s, x, i) => s + ws[i]! * x, 0) / total;
	const my = ys.reduce((s, y, i) => s + ws[i]! * y, 0) / total;
	let num = 0;
	for (let i = 0; i < xs.length; i++) num += ws[i]! * (xs[i]! - mx) * (ys[i]! - my);
	return num;
}
