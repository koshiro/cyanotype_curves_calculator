import { describe, expect, it } from 'vitest';
import { linear, naturalCubic, pchip } from './interpolate';
import { isotonic } from './isotonic';
import { cholesky, choleskySolve } from './linalg';
import { fitPSpline, fitPSplineAuto } from './pspline';

describe('isotonic', () => {
	it('deja intacta una secuencia ya monotona', () => {
		expect(isotonic([1, 2, 3])).toEqual([1, 2, 3]);
	});

	it('promedia los bloques que violan el orden', () => {
		expect(isotonic([1, 3, 2, 4])).toEqual([1, 2.5, 2.5, 4]);
	});

	it('respeta los pesos y el sentido decreciente', () => {
		const out = isotonic([5, 6, 1], [1, 3, 1], 'decreasing');
		expect(out[0]).toBeCloseTo(5.75);
		expect(out[1]).toBeCloseTo(5.75);
		expect(out[2]).toBe(1);
	});
});

describe('interpoladores', () => {
	const xs = [0, 1, 2, 4];
	const ys = [0, 1, 1, 5];

	it('pasan por los nodos', () => {
		for (const f of [linear(xs, ys), pchip(xs, ys), naturalCubic(xs, ys)]) {
			xs.forEach((x, i) => expect(f(x)).toBeCloseTo(ys[i]!));
		}
	});

	it('PCHIP no sobreoscila en una meseta', () => {
		const f = pchip(xs, ys);
		for (let x = 1; x <= 2; x += 0.05) expect(f(x)).toBeCloseTo(1, 10);
	});

	it('PCHIP conserva la monotonia de los datos', () => {
		const f = pchip([0, 10, 20, 30, 40], [100, 99, 50, 3, 2]);
		let prev = Infinity;
		for (let x = 0; x <= 40; x += 0.25) {
			const y = f(x);
			expect(y).toBeLessThanOrEqual(prev + 1e-12);
			prev = y;
		}
	});

	it('la spline natural reproduce una recta exactamente', () => {
		const f = naturalCubic([0, 3, 7, 10], [1, 7, 15, 21]);
		expect(f(5)).toBeCloseTo(11);
	});

	it('rechazan abscisas no crecientes', () => {
		expect(() => linear([0, 0], [1, 2])).toThrow();
	});
});

describe('cholesky', () => {
	it('resuelve un sistema SPD', () => {
		const a = [
			[4, 2, 0],
			[2, 5, 1],
			[0, 1, 3]
		];
		const x = choleskySolve(cholesky(a), [2, 9, 5]);
		const b = a.map((row) => row.reduce((s, v, j) => s + v * x[j]!, 0));
		expect(b[0]).toBeCloseTo(2);
		expect(b[1]).toBeCloseTo(9);
		expect(b[2]).toBeCloseTo(5);
	});
});

describe('P-spline monotona', () => {
	const xs = Array.from({ length: 30 }, (_, i) => i * 8);
	// Recta decreciente con un "diente" que la viola.
	const ys = xs.map((x) => 100 - x * 0.3 + (x === 120 ? 6 : 0));

	it('impone el sentido pedido aunque los datos lo violen', () => {
		const fit = fitPSpline(
			xs,
			ys,
			xs.map(() => 1),
			{ segments: 12, lambda: 0.01, direction: 'decreasing' }
		);
		let prev = Infinity;
		for (let x = 0; x <= 232; x += 0.5) {
			const y = fit.evaluate(x);
			expect(y).toBeLessThanOrEqual(prev + 1e-6);
			prev = y;
		}
	});

	it('GCV elige un ajuste que sigue la tendencia', () => {
		const fit = fitPSplineAuto(
			xs,
			ys,
			xs.map(() => 1),
			{ segments: 12, direction: 'decreasing' }
		);
		expect(fit.evaluate(40)).toBeCloseTo(88, 0);
		expect(fit.effectiveDf).toBeGreaterThan(1.5);
		expect(fit.effectiveDf).toBeLessThan(xs.length);
	});
});
