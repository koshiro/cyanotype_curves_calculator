/**
 * P-spline monotona (Eilers & Marx 1996; restriccion de forma segun Bollaerts, Eilers y
 * van Mechelen 2006).
 *
 * Base de B-splines cubicas con nudos equiespaciados + penalizacion de segundas diferencias
 * de los coeficientes (suavidad, controlada por `lambda`). La monotonia se impone con una
 * penalizacion asimetrica muy grande sobre las primeras diferencias que violan el sentido
 * pedido; con coeficientes monotonos, la spline resultante es monotona en todo el dominio.
 */
import { cholesky, choleskySolve, zeros, type Matrix } from './linalg';

export type Direction = 'increasing' | 'decreasing';

export interface PSplineOptions {
	/** Segmentos entre nudos en [xmin, xmax]. */
	segments: number;
	/** Peso de la penalizacion de rugosidad (≥ 0). */
	lambda: number;
	direction: Direction;
	/** Peso de la penalizacion de monotonia. */
	kappa?: number;
	maxIterations?: number;
}

export interface PSplineFit {
	evaluate: (x: number) => number;
	coefficients: number[];
	/** Traza de la matriz sombrero: grados de libertad efectivos. */
	effectiveDf: number;
	/** Suma ponderada de residuos al cuadrado. */
	rss: number;
	/** Criterio de validacion cruzada generalizada (menor es mejor). */
	gcv: number;
	lambda: number;
}

const DEGREE = 3;

/** Valores de las B-splines cubicas no nulas en x (base completa de `segments + 3`). */
function basisRow(x: number, xmin: number, xmax: number, segments: number): number[] {
	const count = segments + DEGREE;
	const row = new Array<number>(count).fill(0);
	const dx = (xmax - xmin) / segments;
	const u = Math.min(Math.max((x - xmin) / dx, 0), segments - 1e-12);
	const span = Math.floor(u);
	const t = u - span;
	// B-spline cubica uniforme en coordenada local t del tramo `span`.
	const t2 = t * t;
	const t3 = t2 * t;
	row[span] = (1 - 3 * t + 3 * t2 - t3) / 6;
	row[span + 1] = (4 - 6 * t2 + 3 * t3) / 6;
	row[span + 2] = (1 + 3 * t + 3 * t2 - 3 * t3) / 6;
	row[span + 3] = t3 / 6;
	return row;
}

function differencePenalty(count: number, order: 1 | 2, flags?: readonly number[]): Matrix {
	const p = zeros(count, count);
	if (order === 1) {
		for (let j = 0; j < count - 1; j++) {
			const v = flags ? flags[j]! : 1;
			if (v === 0) continue;
			p[j]![j] = p[j]![j]! + v;
			p[j + 1]![j + 1] = p[j + 1]![j + 1]! + v;
			p[j]![j + 1] = p[j]![j + 1]! - v;
			p[j + 1]![j] = p[j + 1]![j]! - v;
		}
		return p;
	}
	const stencil = [1, -2, 1];
	for (let j = 0; j < count - 2; j++) {
		for (let a = 0; a < 3; a++) {
			for (let b = 0; b < 3; b++) p[j + a]![j + b] = p[j + a]![j + b]! + stencil[a]! * stencil[b]!;
		}
	}
	return p;
}

export function fitPSpline(
	xs: readonly number[],
	ys: readonly number[],
	weights: readonly number[],
	options: PSplineOptions
): PSplineFit {
	const n = xs.length;
	if (n < 3) throw new Error('fitPSpline: se requieren al menos 3 puntos');
	const { segments, lambda, direction } = options;
	// La penalizacion de monotonia escala con el peso medio para dominar siempre al ajuste.
	const meanWeight = weights.reduce((s, w) => s + w, 0) / weights.length;
	const kappa = options.kappa ?? 1e7 * Math.max(meanWeight, 1);
	const maxIterations = options.maxIterations ?? 50;
	const xmin = Math.min(...xs);
	const xmax = Math.max(...xs);
	if (!(xmax > xmin)) throw new Error('fitPSpline: rango de x nulo');
	const count = segments + DEGREE;

	const rows = xs.map((x) => basisRow(x, xmin, xmax, segments));
	const btwb = zeros(count, count);
	const btwy = new Array<number>(count).fill(0);
	for (let i = 0; i < n; i++) {
		const row = rows[i]!;
		const w = weights[i]!;
		for (let a = 0; a < count; a++) {
			const ra = row[a]!;
			if (ra === 0) continue;
			btwy[a] = btwy[a]! + w * ra * ys[i]!;
			for (let b = 0; b < count; b++) {
				const rb = row[b]!;
				if (rb !== 0) btwb[a]![b] = btwb[a]![b]! + w * ra * rb;
			}
		}
	}
	const smooth = differencePenalty(count, 2);
	const sign = direction === 'increasing' ? 1 : -1;

	let flags = new Array<number>(count - 1).fill(0);
	let alpha: number[] = [];
	let factor: Matrix = [];
	for (let iter = 0; iter < maxIterations; iter++) {
		const shape = differencePenalty(count, 1, flags);
		const system = zeros(count, count);
		for (let a = 0; a < count; a++) {
			for (let b = 0; b < count; b++) {
				// Un ridge minimo evita singularidades cuando hay pocos datos por tramo.
				const ridge = a === b ? 1e-9 : 0;
				system[a]![b] = btwb[a]![b]! + lambda * smooth[a]![b]! + kappa * shape[a]![b]! + ridge;
			}
		}
		factor = cholesky(system);
		alpha = choleskySolve(factor, btwy);
		const next = alpha.slice(1).map((value, j) => (sign * (value - alpha[j]!) < 0 ? 1 : 0));
		if (next.every((v, j) => v === flags[j])) break;
		flags = next;
	}

	const evaluate = (x: number): number => {
		const row = basisRow(x, xmin, xmax, segments);
		let sum = 0;
		for (let a = 0; a < count; a++) sum += row[a]! * alpha[a]!;
		return sum;
	};

	let rss = 0;
	for (let i = 0; i < n; i++) {
		const r = ys[i]! - evaluate(xs[i]!);
		rss += weights[i]! * r * r;
	}
	// tr(H) = tr(A⁻¹ BᵀWB), columna por columna.
	let effectiveDf = 0;
	for (let col = 0; col < count; col++) {
		const column = btwb.map((row) => row[col]!);
		effectiveDf += choleskySolve(factor, column)[col]!;
	}
	const denom = Math.max(n - effectiveDf, 1e-6);
	const gcv = (n * rss) / (denom * denom);

	return { evaluate, coefficients: alpha, effectiveDf, rss, gcv, lambda };
}

/** Elige `lambda` por GCV sobre una grilla logaritmica. */
export function fitPSplineAuto(
	xs: readonly number[],
	ys: readonly number[],
	weights: readonly number[],
	options: Omit<PSplineOptions, 'lambda'> & { lambdas?: readonly number[] }
): PSplineFit {
	const lambdas = options.lambdas ?? Array.from({ length: 17 }, (_, i) => 10 ** (-3 + i * 0.5));
	let best: PSplineFit | undefined;
	for (const lambda of lambdas) {
		const fit = fitPSpline(xs, ys, weights, { ...options, lambda });
		if (!best || fit.gcv < best.gcv) best = fit;
	}
	return best!;
}
