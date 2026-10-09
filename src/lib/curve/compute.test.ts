import { describe, expect, it } from 'vitest';
import { evenlySpaced, syntheticPatches } from '../core/testing/synthetic';
import { computeCurve } from './compute';

describe('computeCurve', () => {
	it('devuelve datos planos serializables con todos los candidatos', () => {
		const result = computeCurve(syntheticPatches(evenlySpaced(51), { noise: 0.5, seed: 4 }));
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(structuredClone(result)).toEqual(result);
		expect(result.candidates).toHaveLength(3);
		for (const c of result.candidates) {
			expect(c.response).toHaveLength(256);
			expect(c.curve!.samples).toHaveLength(256);
		}
		expect(result.points).toHaveLength(51);
		expect(result.recommended).toBe(result.candidates[0]!.method);
	});

	it('informa errores con codigo estable', () => {
		expect(computeCurve(syntheticPatches([0, 255]))).toMatchObject({ ok: false, code: 'TOO_FEW_VALUES' });
	});
});
