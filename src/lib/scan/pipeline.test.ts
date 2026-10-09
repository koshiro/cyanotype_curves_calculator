import { encode } from 'fast-png';
import { describe, expect, it } from 'vitest';
import { buildTargetLayout } from '../core/target/layout';
import { simulateScan } from '../core/testing/simulate';
import { runScanJob } from './pipeline';

const layout = buildTargetLayout({ dpi: 100, steps: 21, seed: 5 });

function scanPng(options: Parameters<typeof simulateScan>[1]): ArrayBuffer {
	const image = simulateScan(layout, options);
	const data = Uint16Array.from(image.data, (v) => Math.round(v * 65535));
	const png = encode({ width: image.width, height: image.height, data, channels: 3, depth: 16 });
	return png.slice().buffer;
}

describe('runScanJob', () => {
	it('analiza un PNG de 16 bits y prepara miniatura y superposiciones', async () => {
		const outcome = await runScanJob({
			bytes: scanPng({ rotationDegrees: 90, noise: 0.005 }),
			fileName: 'scan.png',
			layout,
			flatField: 'off'
		});
		expect(outcome.ok).toBe(true);
		if (!outcome.ok) return;
		expect(outcome.bitDepth).toBe(16);
		expect(outcome.patches).toHaveLength(layout.patches.length);
		expect(outcome.overlays).toHaveLength(layout.patches.length);
		expect(outcome.markers).toHaveLength(4);
		expect(outcome.preview.rgba.length).toBe(outcome.preview.width * outcome.preview.height * 4);
		// Las superposiciones caen dentro de la miniatura.
		for (const overlay of outcome.overlays) {
			for (const [x, y] of overlay.corners) {
				expect(x).toBeGreaterThanOrEqual(0);
				expect(y).toBeLessThanOrEqual(outcome.preview.height);
			}
		}
	});

	it('devuelve un codigo estable cuando no encuentra el negativo', async () => {
		const blank = new Uint8Array(200 * 200).fill(230);
		const png = encode({ width: 200, height: 200, data: blank, channels: 1, depth: 8 });
		const outcome = await runScanJob({
			bytes: png.slice().buffer,
			fileName: 'blanco.png',
			layout,
			flatField: 'off'
		});
		expect(outcome).toMatchObject({ ok: false, code: 'MARKERS_NOT_FOUND' });
	});

	it('sin decodificador del navegador, JPEG da UNSUPPORTED_FORMAT', async () => {
		const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]).buffer;
		expect(await runScanJob({ bytes: jpeg, fileName: 'x.jpg', layout, flatField: 'off' })).toMatchObject({
			ok: false,
			code: 'UNSUPPORTED_FORMAT'
		});
	});
});
