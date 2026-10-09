import { describe, expect, it } from 'vitest';
import type { MeasuredPatch } from '../curve/types';
import { buildTargetLayout, patchCenterMm } from '../target/layout';
import { mulberry32 } from '../target/random';
import { syntheticResponse } from '../testing/synthetic';
import { applyFlatField, estimateFlatField } from './flatfield';

const layout = buildTargetLayout();
const sheet = [layout.paper.widthMm, layout.paper.heightMm] as const;
const truth = syntheticResponse();

/**
 * Parches con variacion normal entre copias (σ en L*) y un degradado de exposicion opcional,
 * expresado como desplazamiento equivalente del negativo (n por mm a lo ancho).
 */
function patches(seed: number, sigma: number, gradient = 0): MeasuredPatch[] {
	const random = mulberry32(seed);
	const gauss = () => Math.sqrt(-2 * Math.log(Math.max(random(), 1e-12))) * Math.cos(2 * Math.PI * random());
	return layout.patches.map((patch) => {
		const positionMm = patchCenterMm(layout, patch);
		const shifted = patch.value + gradient * (positionMm[0] - sheet[0] / 2);
		return { value: patch.value, lightness: truth(shifted) + sigma * gauss(), positionMm };
	});
}

describe('campo plano', () => {
	it('copias uniformes casi nunca se declaran desparejas (falsos positivos < 5 %)', () => {
		let positives = 0;
		for (let seed = 1; seed <= 100; seed++) {
			const field = estimateFlatField(patches(seed, 0.5));
			if (field?.significant) positives++;
		}
		expect(positives).toBeLessThan(5);
	});

	it('un degradado real se detecta como significativo', () => {
		let detected = 0;
		for (let seed = 1; seed <= 20; seed++) {
			if (estimateFlatField(patches(seed, 0.5, 0.1))?.significant) detected++;
		}
		expect(detected).toBeGreaterThanOrEqual(19);
	});

	it('la correccion mejora los tonos medios sin empeorar blanco ni negro', () => {
		let before = { mid: 0, ends: 0 };
		let after = { mid: 0, ends: 0 };
		for (let seed = 1; seed <= 20; seed++) {
			const measured = patches(seed, 0.3, 0.1);
			const field = estimateFlatField(measured)!;
			const corrected = applyFlatField(measured, field);
			const error = (list: MeasuredPatch[], pick: (v: number) => boolean) =>
				list.filter((p) => pick(p.value)).reduce((s, p) => s + Math.abs(p.lightness - truth(p.value)), 0);
			const mid = (v: number) => v >= 64 && v <= 192;
			const ends = (v: number) => v < 30 || v > 225;
			before = { mid: before.mid + error(measured, mid), ends: before.ends + error(measured, ends) };
			after = { mid: after.mid + error(corrected, mid), ends: after.ends + error(corrected, ends) };
		}
		expect(after.mid).toBeLessThan(before.mid * 0.6);
		expect(after.ends).toBeLessThan(before.ends * 1.1);
	});

	it('las repeticiones de referencia quedan repartidas por la hoja', () => {
		for (const value of [0, 128, 255]) {
			const ys = layout.patches
				.filter((p) => p.role === 'reference' && p.value === value)
				.map((p) => patchCenterMm(layout, p)[1]);
			const xs = layout.patches
				.filter((p) => p.role === 'reference' && p.value === value)
				.map((p) => patchCenterMm(layout, p)[0]);
			expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(sheet[1] * 0.4);
			expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(sheet[0] * 0.4);
		}
	});
});
