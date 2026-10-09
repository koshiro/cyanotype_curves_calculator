import { decode, encode } from 'fast-png';
import { describe, expect, it } from 'vitest';
import { locateTarget } from '../core/scan/detect';
import { buildTargetLayout } from '../core/target/layout';
import { renderTarget } from '../core/target/render';
import { decodeImage, fromRgba, sniffImage } from './decode';
import { ImageFormatError } from './errors';
import { encodeGrayPng } from './png';

/** TIFF minimo sin comprimir (gris o RGB, 8 o 16 bits) para tests. */
function makeTiff(options: {
	width: number;
	height: number;
	samples: 1 | 3;
	bits: 8 | 16;
	littleEndian: boolean;
	values: (i: number, c: number) => number;
	dpi?: number;
}): Uint8Array {
	const { width, height, samples, bits, littleEndian: le } = options;
	const bytesPerSample = bits / 8;
	const pixelBytes = width * height * samples * bytesPerSample;
	const entries: [number, number, number, number][] = []; // tag, tipo, cantidad, valor
	const bitsOffset = 8;
	const resolutionOffset = bitsOffset + 8;
	const dataOffset = resolutionOffset + 8;
	entries.push([256, 3, 1, width]);
	entries.push([257, 3, 1, height]);
	entries.push([258, 3, samples, samples === 1 ? bits : bitsOffset]);
	entries.push([259, 3, 1, 1]);
	entries.push([262, 3, 1, samples === 3 ? 2 : 1]);
	entries.push([273, 4, 1, dataOffset]);
	entries.push([277, 3, 1, samples]);
	entries.push([278, 3, 1, height]);
	entries.push([279, 4, 1, pixelBytes]);
	entries.push([282, 5, 1, resolutionOffset]);
	entries.push([284, 3, 1, 1]);
	entries.push([296, 3, 1, 2]);
	const ifdOffset = dataOffset + pixelBytes;
	const total = ifdOffset + 2 + entries.length * 12 + 4;
	const view = new DataView(new ArrayBuffer(total));
	view.setUint8(0, le ? 0x49 : 0x4d);
	view.setUint8(1, le ? 0x49 : 0x4d);
	view.setUint16(2, 42, le);
	view.setUint32(4, ifdOffset, le);
	for (let k = 0; k < 3; k++) view.setUint16(bitsOffset + k * 2, bits, le);
	view.setUint32(resolutionOffset, options.dpi ?? 300, le);
	view.setUint32(resolutionOffset + 4, 1, le);
	for (let i = 0; i < width * height; i++) {
		for (let c = 0; c < samples; c++) {
			const offset = dataOffset + (i * samples + c) * bytesPerSample;
			if (bits === 16) view.setUint16(offset, options.values(i, c), le);
			else view.setUint8(offset, options.values(i, c));
		}
	}
	view.setUint16(ifdOffset, entries.length, le);
	entries.forEach(([tag, type, count, value], k) => {
		const at = ifdOffset + 2 + k * 12;
		view.setUint16(at, tag, le);
		view.setUint16(at + 2, type, le);
		view.setUint32(at + 4, count, le);
		if (type === 3 && count === 1) view.setUint16(at + 8, value, le);
		else view.setUint32(at + 8, value, le);
	});
	view.setUint32(total - 4, 0, le);
	return new Uint8Array(view.buffer);
}

describe('PNG', () => {
	it('el target se codifica con su DPI y se vuelve a leer igual', () => {
		const pixels = Uint8Array.from({ length: 12 * 8 }, (_, i) => (i * 7) % 256);
		const png = encodeGrayPng(pixels, 12, 8, 300);
		expect(sniffImage(png)).toBe('png');
		const raw = decode(png, { checkCrc: true });
		expect(Math.round(raw.resolution!.x * 0.0254)).toBe(300);
		const image = decodeImage(png);
		expect(image.dpi).toBe(300);
		expect(image.channels).toBe(1);
		expect(Array.from(image.data, (v) => Math.round(v * 255))).toEqual(Array.from(pixels));
	});

	it('conserva la precision de 16 bits', () => {
		const data = Uint16Array.from({ length: 4 * 3 }, (_, i) => 1000 + i * 3001);
		const png = encode({ width: 2, height: 2, data, channels: 3, depth: 16 });
		const image = decodeImage(png);
		expect(image.bitDepth).toBe(16);
		expect(image.data[5]).toBeCloseTo(data[5]! / 65535, 6);
	});

	it('un target renderizado y leido desde PNG se ubica correctamente', () => {
		const layout = buildTargetLayout({ dpi: 100, steps: 21 });
		const png = encodeGrayPng(renderTarget(layout), layout.width, layout.height, layout.dpi);
		const location = locateTarget(decodeImage(png), layout);
		expect(location.reprojectionError).toBeLessThan(1);
		expect(location.mirrored).toBe(false);
	});
});

describe('TIFF', () => {
	it.each([true, false])('lee RGB de 16 bits (little-endian: %s)', (littleEndian) => {
		const tiff = makeTiff({
			width: 3,
			height: 2,
			samples: 3,
			bits: 16,
			littleEndian,
			values: (i, c) => i * 10000 + c * 111
		});
		expect(sniffImage(tiff)).toBe('tiff');
		const image = decodeImage(tiff);
		expect(image).toMatchObject({ width: 3, height: 2, channels: 3, bitDepth: 16, dpi: 300 });
		expect(image.data[4 * 3 + 2]).toBeCloseTo((40000 + 222) / 65535, 6);
	});

	it('lee gris de 8 bits', () => {
		const tiff = makeTiff({
			width: 4,
			height: 1,
			samples: 1,
			bits: 8,
			littleEndian: true,
			values: (i) => i * 60,
			dpi: 600
		});
		const image = decodeImage(tiff);
		expect(image.channels).toBe(1);
		expect(image.dpi).toBe(600);
		expect(Array.from(image.data, (v) => Math.round(v * 255))).toEqual([0, 60, 120, 180]);
	});
});

describe('formatos', () => {
	it('JPEG y desconocidos se rechazan con codigo estable', () => {
		try {
			decodeImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]));
			expect.unreachable();
		} catch (error) {
			expect(error).toBeInstanceOf(ImageFormatError);
			expect((error as ImageFormatError).code).toBe('UNSUPPORTED_FORMAT');
		}
	});

	it('fromRgba descarta el alfa', () => {
		const image = fromRgba(1, 1, [255, 128, 0, 10]);
		expect(Array.from(image.data, (v) => Math.round(v * 255))).toEqual([255, 128, 0]);
	});
});
