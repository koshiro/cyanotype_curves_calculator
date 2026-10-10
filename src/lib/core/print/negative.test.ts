import { describe, expect, it } from 'vitest';
import { buildCorrection } from '../curve/correction';
import { aggregate, fitResponse } from '../curve/response';
import { createImage } from '../image/types';
import { evenlySpaced, syntheticPatches, syntheticResponse } from '../testing/synthetic';
import { makeNegative, negativeAt, positiveTone } from './negative';

const identityNegative = Array.from({ length: 256 }, (_, p) => 255 - p);

describe('makeNegative', () => {
	it('sin curva (identidad) invierte el gris', () => {
		const image = createImage(3, 1, 1);
		image.data.set([0, 0.5, 1]);
		const neg = makeNegative(image, identityNegative);
		expect(Array.from(neg.data)).toEqual([65535, Math.round((127.5 / 255) * 65535), 0]);
	});

	it('interpola en 16 bits sin escalones de 8 bits', () => {
		expect(negativeAt(identityNegative, 100.25)).toBeCloseTo(154.75, 6);
		const image = createImage(256, 1, 1);
		for (let i = 0; i < 256; i++) image.data[i] = i / 255 / 4 + 0.3; // rango estrecho de tonos
		const values = new Set(makeNegative(image, identityNegative).data);
		expect(values.size).toBeGreaterThan(200);
	});

	it('espeja horizontalmente cuando se pide', () => {
		const image = createImage(2, 1, 1);
		image.data.set([0, 1]);
		expect(Array.from(makeNegative(image, identityNegative, { mirror: true }).data)).toEqual([0, 65535]);
	});

	it('una foto en color se convierte por luminancia (un gris neutro da el mismo tono)', () => {
		const image = createImage(1, 1, 3);
		image.data.set([0.5, 0.5, 0.5]);
		expect(positiveTone(image, 0)).toBeCloseTo(127.5, 3);
	});

	it('con la curva calibrada, la copia queda lineal en L*', () => {
		const truth = syntheticResponse();
		const curve = buildCorrection(fitResponse(aggregate(syntheticPatches(evenlySpaced(51))), 'smooth'));
		const image = createImage(11, 1, 1);
		for (let i = 0; i <= 10; i++) image.data[i] = (i * 25.5) / 255;
		const neg = makeNegative(image, curve.negative);
		const { white, black } = curve.lightness;
		for (let i = 0; i <= 10; i++) {
			const printed = truth((neg.data[i]! / 65535) * 255);
			expect(Math.abs(printed - (black + ((white - black) * i) / 10))).toBeLessThan(0.7);
		}
	});
});
