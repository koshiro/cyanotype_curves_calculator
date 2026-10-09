import { describe, expect, it } from 'vitest';
import { includedPatches, invalidPrints } from './run';

const patch = (value: number) => ({ value, lightness: 50 });

describe('impresiones incluidas en la curva', () => {
	const rounds = [
		{ scan: { patches: [patch(1)], diagnostics: [] } },
		{ scan: { patches: [patch(2)], diagnostics: [{ severity: 'error' }] } },
		{},
		{ scan: { patches: [patch(4)], diagnostics: [{ severity: 'warning' }] } }
	];

	it('un escaneo con error nunca entra a la curva', () => {
		expect(invalidPrints(rounds)).toEqual([2]);
		expect(includedPatches(rounds).map((p) => p.value)).toEqual([1, 4]);
	});

	it('respeta las exclusiones del usuario', () => {
		expect(includedPatches(rounds, [1]).map((p) => p.value)).toEqual([4]);
	});
});
