import { decode, encode } from 'fast-png';
import { describe, expect, it } from 'vitest';
import { locateTarget } from '../core/scan/detect';
import { buildTargetLayout } from '../core/target/layout';
import { renderTarget } from '../core/target/render';
import { decodeImage, fromRgba, sniffImage } from './decode';
import { ImageFormatError } from './errors';
import { encodeGrayPng } from './png';

/** TIFF minimo sin comprimir para tests (gris, RGB o RGBA; 8 o 16 bits). */
function makeTiff(options: {
	width: number;
	height: number;
	samples: 1 | 3 | 4;
	bits: 8 | 16;
	littleEndian: boolean;
	values: (i: number, c: number) => number;
	photometric?: number;
	resolution?: [number, number];
	unit?: number;
	orientation?: number;
}): Uint8Array {
	const { width, height, samples, bits, littleEndian: le } = options;
	const bytesPerSample = bits / 8;
	const pixelBytes = width * height * samples * bytesPerSample;
	const bitsOffset = 8;
	const resolutionOffset = bitsOffset + 8;
	const dataOffset = resolutionOffset + 8;
	const entries: [number, number, number, number][] = [
		[256, 3, 1, width],
		[257, 3, 1, height],
		[258, 3, samples, samples === 1 ? bits : bitsOffset],
		[259, 3, 1, 1],
		[262, 3, 1, options.photometric ?? (samples === 1 ? 1 : 2)],
		[273, 4, 1, dataOffset],
		[277, 3, 1, samples],
		[278, 3, 1, height],
		[279, 4, 1, pixelBytes],
		[282, 5, 1, resolutionOffset],
		[284, 3, 1, 1],
		[296, 3, 1, options.unit ?? 2]
	];
	if (options.orientation) entries.splice(5, 0, [274, 3, 1, options.orientation]);
	if (samples === 4) entries.push([338, 3, 1, 2]);
	entries.sort((a, b) => a[0] - b[0]);
	const ifdOffset = dataOffset + pixelBytes;
	const total = ifdOffset + 2 + entries.length * 12 + 4;
	const view = new DataView(new ArrayBuffer(total));
	view.setUint8(0, le ? 0x49 : 0x4d);
	view.setUint8(1, le ? 0x49 : 0x4d);
	view.setUint16(2, 42, le);
	view.setUint32(4, ifdOffset, le);
	for (let k = 0; k < 4; k++)
		if (bitsOffset + k * 2 < resolutionOffset) view.setUint16(bitsOffset + k * 2, bits, le);
	const [num, den] = options.resolution ?? [300, 1];
	view.setUint32(resolutionOffset, num, le);
	view.setUint32(resolutionOffset + 4, den, le);
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

function expectCode(run: () => unknown, code: string): void {
	try {
		run();
		expect.unreachable();
	} catch (error) {
		expect(error).toBeInstanceOf(ImageFormatError);
		expect((error as ImageFormatError).code).toBe(code);
	}
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
			resolution: [600, 1]
		});
		const image = decodeImage(tiff);
		expect(image.channels).toBe(1);
		expect(image.dpi).toBe(600);
		expect(Array.from(image.data, (v) => Math.round(v * 255))).toEqual([0, 60, 120, 180]);
	});
});

describe('TIFF: variantes', () => {
	it('descarta el alfa (muestra extra) en RGBA de 16 bits', () => {
		const tiff = makeTiff({
			width: 2,
			height: 1,
			samples: 4,
			bits: 16,
			littleEndian: true,
			values: (i, c) => (c === 3 ? 0 : 20000 + i * 1000 + c)
		});
		const image = decodeImage(tiff);
		expect(image.channels).toBe(3);
		expect(image.data[3]).toBeCloseTo(21000 / 65535, 6);
	});

	it('gris de 16 bits y WhiteIsZero', () => {
		const gray = decodeImage(
			makeTiff({ width: 2, height: 1, samples: 1, bits: 16, littleEndian: false, values: (i) => i * 65535 })
		);
		expect(Array.from(gray.data)).toEqual([0, 1]);
		const inverted = decodeImage(
			makeTiff({
				width: 2,
				height: 1,
				samples: 1,
				bits: 8,
				littleEndian: true,
				photometric: 0,
				values: (i) => i * 255
			})
		);
		expect(Array.from(inverted.data)).toEqual([1, 0]);
	});

	it('resolucion racional, en centimetros o sin unidad', () => {
		const base = {
			width: 1,
			height: 1,
			samples: 1 as const,
			bits: 8 as const,
			littleEndian: true,
			values: () => 0
		};
		expect(decodeImage(makeTiff({ ...base, resolution: [1200, 2] })).dpi).toBe(600);
		expect(decodeImage(makeTiff({ ...base, resolution: [118, 1], unit: 3 })).dpi).toBe(300);
		expect(decodeImage(makeTiff({ ...base, resolution: [72, 1], unit: 1 })).dpi).toBeUndefined();
	});

	it('informa la orientacion declarada', () => {
		const image = decodeImage(
			makeTiff({
				width: 1,
				height: 1,
				samples: 1,
				bits: 8,
				littleEndian: true,
				values: () => 0,
				orientation: 2
			})
		);
		expect(image.orientation).toBe(2);
	});
});

describe('archivos danados', () => {
	const png = encodeGrayPng(new Uint8Array(64).fill(128), 8, 8, 300);

	it('PNG truncado', () => {
		expectCode(() => decodeImage(png.subarray(0, png.length - 20)), 'CORRUPT_FILE');
	});

	it('PNG con un byte alterado en los datos', () => {
		const damaged = png.slice();
		damaged[damaged.length - 20] = damaged[damaged.length - 20]! ^ 0xff;
		expectCode(() => decodeImage(damaged), 'CORRUPT_FILE');
	});

	it('TIFF truncado', () => {
		const tiff = makeTiff({ width: 4, height: 4, samples: 3, bits: 16, littleEndian: true, values: () => 1 });
		expectCode(() => decodeImage(tiff.subarray(0, 40)), 'CORRUPT_FILE');
	});
});

describe('PNG: variantes', () => {
	it('gris con alfa y paleta', () => {
		const grayAlpha = encode({
			width: 2,
			height: 1,
			data: new Uint8Array([10, 255, 200, 0]),
			channels: 2,
			depth: 8
		});
		const image = decodeImage(grayAlpha);
		expect(image.channels).toBe(1);
		expect(Math.round(image.data[1]! * 255)).toBe(200);
		const indexed = encode({
			width: 2,
			height: 1,
			data: new Uint8Array([0, 1]),
			channels: 1,
			depth: 8,
			palette: [
				[255, 0, 0],
				[0, 0, 255]
			]
		});
		const rgb = decodeImage(indexed);
		expect(rgb.channels).toBe(3);
		expect(Array.from(rgb.data, (v) => Math.round(v * 255))).toEqual([255, 0, 0, 0, 0, 255]);
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
