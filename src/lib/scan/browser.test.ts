import { afterEach, describe, expect, it, vi } from 'vitest';
import { decodeWithBrowser } from './browser';

/** ImageBitmap simulado que, como el real, reporta 0 × 0 despues de close(). */
class FakeBitmap {
	width = 3;
	height = 2;
	close() {
		this.width = 0;
		this.height = 0;
	}
}

class FakeCanvas {
	constructor(
		readonly width: number,
		readonly height: number
	) {}
	getContext() {
		return {
			drawImage: () => {},
			getImageData: (_x: number, _y: number, w: number, h: number) => ({
				data: new Uint8ClampedArray(w * h * 4).fill(200)
			})
		};
	}
}

describe('decodeWithBrowser', () => {
	afterEach(() => vi.unstubAllGlobals());

	it('conserva las dimensiones aunque el bitmap se cierre (regresion del JPEG de 0 × 0)', async () => {
		vi.stubGlobal('createImageBitmap', async () => new FakeBitmap());
		vi.stubGlobal('OffscreenCanvas', FakeCanvas);
		const image = await decodeWithBrowser(new ArrayBuffer(4));
		expect(image).toMatchObject({ width: 3, height: 2, channels: 3, bitDepth: 8 });
		expect(image.data).toHaveLength(3 * 2 * 3);
	});

	it('un archivo que el navegador no decodifica da UNSUPPORTED_FORMAT', async () => {
		vi.stubGlobal('createImageBitmap', async () => {
			throw new Error('The source image could not be decoded.');
		});
		await expect(decodeWithBrowser(new ArrayBuffer(4))).rejects.toMatchObject({ code: 'UNSUPPORTED_FORMAT' });
	});
});
