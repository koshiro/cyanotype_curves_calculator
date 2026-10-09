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

/** Agrupa repeticiones del mismo valor (redondeado a 1/100) con media ponderada. */
export function aggregate(patches: readonly MeasuredPatch[]): AggregatedPoint[] {
	const groups = new Map<number, MeasuredPatch[]>();
	for (const patch of patches) {
		if (!Number.isFinite(patch.value) || !Number.isFinite(patch.lightness)) continue;
		const key = Math.round(Math.min(Math.max(patch.value, 0), 255) * 100) / 100;
		const list = groups.get(key);
		if (list) list.push(patch);
		else groups.set(key, [patch]);
	}
	return [...groups.entries()]
		.sort(([a], [b]) => a - b)
		.map(([value, list]) => {
			const weights = list.map((p) => p.weight ?? 1);
			const total = weights.reduce((s, w) => s + w, 0);
			const mean = list.reduce((s, p, i) => s + p.lightness * weights[i]!, 0) / total;
			const variance =
				list.length > 1 ? list.reduce((s, p) => s + (p.lightness - mean) ** 2, 0) / (list.length - 1) : 0;
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
}

function fitEvaluator(method: FitMethod, { xs, ys, ws }: FitInput, lambda?: number): Fitted {
	if (method === 'smooth') {
		const segments = Math.min(24, Math.max(6, Math.round(xs.length * 0.6)));
		const options = { segments, direction: 'decreasing' as const };
		const fit =
			lambda === undefined
				? fitPSplineAuto(xs, ys, ws, options)
				: fitPSpline(xs, ys, ws, { ...options, lambda });
		return { evaluate: fit.evaluate, lambda: fit.lambda };
	}
	// PCHIP y lineal interpolan: primero se proyectan los datos al conjunto monotono.
	const monotone = isotonic(ys, ws, 'decreasing');
	return { evaluate: method === 'pchip' ? pchip(xs, monotone) : linear(xs, monotone) };
}

function rmse(errors: readonly number[], weights: readonly number[]): number {
	const total = weights.reduce((s, w) => s + w, 0);
	return Math.sqrt(errors.reduce((s, e, i) => s + weights[i]! * e * e, 0) / total);
}

/** Validacion cruzada dejando fuera cada punto interior (los extremos no se pueden predecir). */
function leaveOneOut(method: FitMethod, input: FitInput, lambda?: number): number | null {
	const { xs, ys, ws } = input;
	if (xs.length < MIN_UNIQUE_VALUES + 1) return null;
	const errors: number[] = [];
	const weights: number[] = [];
	for (let k = 1; k < xs.length - 1; k++) {
		const keep = (_: number, i: number) => i !== k;
		const { evaluate } = fitEvaluator(
			method,
			{ xs: xs.filter(keep), ys: ys.filter(keep), ws: ws.filter(keep) },
			lambda
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

	const { evaluate: raw, lambda } = fitEvaluator(method, input);
	const domain = [input.xs[0]!, input.xs.at(-1)!] as const;
	const evaluate = (value: number) => raw(Math.min(Math.max(value, domain[0]), domain[1]));
	const fitRmse = rmse(
		input.xs.map((x, i) => evaluate(x) - input.ys[i]!),
		input.ws
	);
	const looRmse = options.crossValidate === false ? null : leaveOneOut(method, input, lambda);
	return { method, evaluate, domain, fitRmse, looRmse };
}

/** Ajusta todos los metodos y los ordena por error de validacion cruzada. */
export function fitAllResponses(points: readonly AggregatedPoint[]): ResponseModel[] {
	const models = FIT_METHODS.map((method) => fitResponse(points, method));
	const score = (m: ResponseModel) => m.looRmse ?? m.fitRmse;
	// Empate tecnico (< 0.05 ΔL*): se prefiere el orden de FIT_METHODS (smooth primero).
	return models
		.map((model, order) => ({ model, order }))
		.sort((a, b) => {
			const diff = score(a.model) - score(b.model);
			return Math.abs(diff) < 0.05 ? a.order - b.order : diff;
		})
		.map(({ model }) => model);
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
