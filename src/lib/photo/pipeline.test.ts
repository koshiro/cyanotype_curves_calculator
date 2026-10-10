import { encode } from 'fast-png';
import { describe, expect, it } from 'vitest';
import { decodeImage } from '../io/decode';
import { runPhotoJob } from './pipeline';

const identity = Array.from({ length: 256 }, (_, p) => 255 - p);

function photoPng(): ArrayBuffer {
	const data = Uint8Array.from({ length: 8 * 4 * 3 }, (_, i) => (Math.floor(i / 3) * 8) % 256);
	return encode({ width: 8, height: 4, data, channels: 3, depth: 8 }).slice().buffer;
}

describe('runPhotoJob', () => {
	it.each(['png', 'tiff'] as const)(
		'genera un negativo de 16 bits en %s con el DPI pedido',
		async (format) => {
			const outcome = await runPhotoJob({
				bytes: photoPng(),
				fileName: 'retrato.png',
				negative: identity,
				mirror: false,
				dpi: 360,
				format
			});
			expect(outcome.ok).toBe(true);
			if (!outcome.ok) return;
			expect(outcome.fileName).toBe(`retrato-negativo.${format === 'tiff' ? 'tif' : 'png'}`);
			const decoded = decodeImage(outcome.file);
			expect(decoded).toMatchObject({ width: 8, height: 4, channels: 1, bitDepth: 16, dpi: 360 });
			// Identidad: el primer pixel negro de la foto es el blanco del negativo.
			expect(decoded.data[0]).toBeCloseTo(1, 4);
			expect(outcome.positive.width).toBe(8);
		}
	);

	it('sin decodificador del navegador, JPEG da UNSUPPORTED_FORMAT', async () => {
		const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]).buffer;
		expect(
			await runPhotoJob({
				bytes: jpeg,
				fileName: 'x.jpg',
				negative: identity,
				mirror: false,
				dpi: null,
				format: 'png'
			})
		).toMatchObject({
			ok: false,
			code: 'UNSUPPORTED_FORMAT'
		});
	});
});
