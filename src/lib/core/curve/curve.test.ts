import { describe, expect, it } from 'vitest';
import { evenlySpaced, syntheticPatches, syntheticResponse } from '../testing/synthetic';
import { calibrate } from './calibrate';
import { buildCorrection, lightnessToDensity } from './correction';
import { decodeAcvMaster, encodeAcv } from '../export/formats';
import { aggregate, fitResponse, MAX_WEIGHT, TIE_TOLERANCE } from './response';
import { CalibrationError, FIT_METHODS } from './types';

describe('aggregate', () => {
	it('combina repeticiones con su dispersion', () => {
		const points = aggregate([
			{ value: 128, lightness: 50 },
			{ value: 128, lightness: 54 },
			{ value: 0, lightness: 90 }
		]);
		expect(points.map((p) => p.value)).toEqual([0, 128]);
		expect(points[1]!.lightness).toBe(52);
		expect(points[1]!.replicates).toBe(2);
		expect(points[1]!.spread).toBeCloseTo(Math.SQRT2 * 2);
	});
});

describe('fitResponse', () => {
	const points = aggregate(syntheticPatches(evenlySpaced(21)));

	it.each(FIT_METHODS)('%s produce un modelo decreciente y preciso', (method) => {
		const model = fitResponse(points, method);
		const truth = syntheticResponse();
		let prev = Infinity;
		for (let n = 0; n <= 255; n += 0.5) {
			const l = model.evaluate(n);
			expect(l).toBeLessThanOrEqual(prev + 1e-6);
			prev = l;
		}
		const tolerance = method === 'linear' ? 1.5 : 0.6;
		for (let n = 0; n <= 255; n += 5) expect(Math.abs(model.evaluate(n) - truth(n))).toBeLessThan(tolerance);
		expect(model.looRmse).not.toBeNull();
	});

	it('rechaza datos con muy pocos valores', () => {
		expect(() => fitResponse(aggregate(syntheticPatches([0, 128, 255])), 'pchip')).toThrow(CalibrationError);
	});

	it('rechaza una respuesta creciente (escaneo o polaridad invertidos)', () => {
		const inverted = syntheticPatches(evenlySpaced(11)).map((p) => ({ ...p, lightness: 120 - p.lightness }));
		try {
			fitResponse(aggregate(inverted), 'smooth');
			expect.unreachable();
		} catch (error) {
			expect((error as CalibrationError).code).toBe('NOT_DECREASING');
		}
	});
});

describe('buildCorrection', () => {
	const model = fitResponse(aggregate(syntheticPatches(evenlySpaced(51))), 'smooth');
	const curve = buildCorrection(model);

	it('produce una curva creciente, continua y acotada', () => {
		for (let p = 1; p < 256; p++) {
			expect(curve.samples[p]!).toBeGreaterThanOrEqual(curve.samples[p - 1]! - 1e-9);
			expect(curve.samples[p]! - curve.samples[p - 1]!).toBeLessThan(12);
		}
		expect(curve.samples[0]!).toBeGreaterThanOrEqual(0);
		expect(curve.samples[255]!).toBeLessThanOrEqual(255);
	});

	it('linealiza la respuesta en L*', () => {
		const truth = syntheticResponse();
		const { white, black } = curve.lightness;
		for (let p = 0; p <= 255; p += 15) {
			const printed = truth(curve.negative[p]!);
			const expected = black + ((white - black) * p) / 255;
			expect(Math.abs(printed - expected)).toBeLessThan(0.6);
		}
	});

	it('recorta las mesetas en vez de desperdiciar rango del negativo', () => {
		// La sigmoide sintetica ya esta saturada mas alla de ~250 y antes de ~20.
		expect(curve.usable.whiteEdge).toBeGreaterThan(0);
		expect(curve.usable.blackEdge).toBeLessThan(255);
		expect(curve.negative[255]).toBeCloseTo(curve.usable.whiteEdge, 0);
		expect(curve.negative[0]).toBeCloseTo(curve.usable.blackEdge, 0);
	});

	it('acepta una respuesta objetivo distinta de la lineal', () => {
		const gamma = buildCorrection(model, { target: (t) => t ** 2 });
		expect(gamma.samples[128]!).toBeLessThan(curve.samples[128]!);
	});

	it('rechaza un rango tonal insuficiente', () => {
		const flat = fitResponse(aggregate(syntheticPatches(evenlySpaced(21), { paper: 60, dmax: 52 })), 'pchip');
		expect(() => buildCorrection(flat)).toThrow(CalibrationError);
	});
});

describe('calibrate', () => {
	it('recomienda el metodo con menor error de validacion y diagnostica mesetas', () => {
		const patches = syntheticPatches(evenlySpaced(51), { noise: 0.4, seed: 7, center: 90, width: 18 });
		const result = calibrate(patches);
		expect(result.candidates).toHaveLength(3);
		const [best] = result.candidates;
		expect(best!.model.method).toBe(result.recommended);
		const scores = result.candidates.map((c) => c.model.looRmse!);
		expect(scores[0]! - Math.min(...scores)).toBeLessThan(TIE_TOLERANCE);
		const codes = best!.report.diagnostics.map((d) => d.code);
		expect(codes).toContain('BLACK_PLATEAU');
		expect(best!.report.densityRange).toBeGreaterThan(0.5);
	});

	it('combina rondas concatenando mediciones', () => {
		const round1 = syntheticPatches(evenlySpaced(21), { seed: 1, noise: 0.3 });
		const round2 = syntheticPatches([30, 60, 90, 120, 150, 180], { seed: 2, noise: 0.3 });
		const result = calibrate([...round1, ...round2]);
		expect(result.data.uniqueValues).toBeGreaterThan(21);
	});

	it('avisa de repeticiones dispares (iluminacion despareja)', () => {
		const patches = [
			...syntheticPatches(evenlySpaced(21)),
			{ value: 128, lightness: 40 },
			{ value: 128, lightness: 70 }
		];
		const codes = calibrate(patches).data.diagnostics.map((d) => d.code);
		expect(codes).toContain('HIGH_REPLICATE_SPREAD');
	});

	it('con rango insuficiente devuelve los modelos con el error en vez de lanzar', () => {
		const flat = syntheticPatches(evenlySpaced(21), { paper: 60, dmax: 52 });
		const result = calibrate(flat);
		expect(result.recommended).toBeNull();
		for (const candidate of result.candidates) {
			expect(candidate.curve).toBeNull();
			expect(candidate.report.diagnostics[0]).toMatchObject({ code: 'LOW_RANGE', severity: 'error' });
		}
	});

	it('avisa cuando las mediciones no cubren todo el rango del negativo', () => {
		const partial = syntheticPatches([60, 80, 100, 120, 140, 160, 180, 200]);
		const codes = calibrate(partial).data.diagnostics.map((d) => d.code);
		expect(codes).toContain('PARTIAL_COVERAGE');
	});
});

describe('mediciones invalidas y pesos', () => {
	const base = syntheticPatches(evenlySpaced(21));

	it.each([
		['valor fuera de rango', { value: 300, lightness: 50 }],
		['L* no finito', { value: 10, lightness: Number.NaN }],
		['peso negativo', { value: 10, lightness: 80, weight: -1 }]
	])('%s produce INVALID_MEASUREMENT', (_, patch) => {
		try {
			aggregate([...base, patch]);
			expect.unreachable();
		} catch (error) {
			expect((error as CalibrationError).code).toBe('INVALID_MEASUREMENT');
		}
	});

	it('peso 0 ignora el parche', () => {
		const without = aggregate(base).find((p) => p.value === 128)!;
		const withZero = aggregate([...base, { value: 128, lightness: 5, weight: 0 }]).find(
			(p) => p.value === 128
		)!;
		expect(withZero.replicates).toBe(1);
		expect(withZero.lightness).toBe(without.lightness);
	});

	it('peso infinito (parche saturado) se acota y la calibracion funciona', () => {
		const patches = base.map((p, i) => (i === 3 ? { ...p, weight: Infinity } : p));
		expect(aggregate(patches).every((p) => p.weight <= MAX_WEIGHT)).toBe(true);
		expect(calibrate(patches).recommended).not.toBeNull();
	});
});

describe('continuidad de la curva con datos ruidosos', () => {
	// Antes del arreglo (bloques isotonicos planos y meseta fija de 0.5 L*) habia saltos de
	// 25-47 niveles y la copia hecha con el .acv se desviaba hasta 5 L*.
	it('smooth no salta, los interpolantes saltan poco y el .acv recomendado imprime fiel', () => {
		const truth = syntheticResponse();
		const worst: Record<string, number> = { smooth: 0, pchip: 0, linear: 0 };
		let worstPrint = 0;
		for (let seed = 1; seed <= 40; seed++) {
			const result = calibrate(syntheticPatches(evenlySpaced(51), { noise: 0.8, seed }));
			for (const candidate of result.candidates) {
				const samples = candidate.curve!.samples;
				for (let p = 1; p < 256; p++) {
					worst[candidate.model.method] = Math.max(
						worst[candidate.model.method]!,
						samples[p]! - samples[p - 1]!
					);
				}
				if (candidate.model.method !== result.recommended) continue;
				// Error en la copia (L*) entre usar el .acv re-interpolado y la curva exacta.
				const viaAcv = decodeAcvMaster(encodeAcv(samples)).samples;
				for (let p = 0; p < 256; p++) {
					const exact = truth(255 - Math.round(samples[p]!));
					worstPrint = Math.max(worstPrint, Math.abs(truth(255 - viaAcv[p]!) - exact));
				}
			}
		}
		expect(worst.smooth).toBeLessThan(8);
		expect(worst.pchip).toBeLessThan(25);
		expect(worst.linear).toBeLessThan(25);
		expect(worstPrint).toBeLessThan(1);
	});
});

describe('lightnessToDensity', () => {
	it('blanco ideal tiene densidad 0 y es monotona', () => {
		expect(lightnessToDensity(100)).toBeCloseTo(0, 6);
		expect(lightnessToDensity(50)).toBeGreaterThan(lightnessToDensity(80));
	});
});

describe('diagnosticos y ruido', () => {
	it('el ruido normal de escaneo no se reporta como medicion no monotona', () => {
		const patches = syntheticPatches(evenlySpaced(256), { noise: 0.8, seed: 3 });
		const result = calibrate(patches);
		expect(result.data.diagnostics.map((d) => d.code)).not.toContain('NON_MONOTONIC_MEASUREMENTS');
	});

	it('los diagnosticos de las mediciones no dependen del metodo', () => {
		// Antes, pchip/lineal estimaban ruido ~0 desde sus propios residuos y avisaban en falso.
		for (let seed = 1; seed <= 20; seed++) {
			const result = calibrate(syntheticPatches(evenlySpaced(51), { noise: 1, seed }));
			expect(result.data.diagnostics.map((d) => d.code)).not.toContain('NON_MONOTONIC_MEASUREMENTS');
			for (const candidate of result.candidates) {
				expect(candidate.report.diagnostics.map((d) => d.code)).not.toContain('NON_MONOTONIC_MEASUREMENTS');
			}
		}
	});

	it('un parche intercambiado si se reporta', () => {
		const patches = syntheticPatches(evenlySpaced(21));
		const swapped = patches.map((p) => (p.value === 102 ? { ...p, lightness: p.lightness - 25 } : p));
		const codes = calibrate(swapped).data.diagnostics.map((d) => d.code);
		expect(codes).toContain('NON_MONOTONIC_MEASUREMENTS');
	});

	it('256 pasos se calibran en tiempo interactivo (guarda contra regresiones graves)', () => {
		const start = performance.now();
		calibrate(syntheticPatches(evenlySpaced(256), { noise: 0.8 }));
		expect(performance.now() - start).toBeLessThan(3000);
	});
});
