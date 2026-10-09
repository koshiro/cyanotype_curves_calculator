/**
 * TIFF: lectura de escaneos de 8 o 16 bits (gris o RGB, sin comprimir, LZW, deflate o
 * PackBits) con utif2. utif2 deja los datos de 16 bits en orden little-endian.
 */
import * as UTIF from 'utif2';
import type { RasterImage } from '../core/image/types';
import { ImageFormatError } from './errors';

function tag(ifd: UTIF.IFD, id: number): number[] | undefined {
	const value = ifd[`t${id}`];
	return Array.isArray(value) ? (value as number[]) : undefined;
}

export function decodeTiff(bytes: Uint8Array): RasterImage {
	const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
	let ifds: UTIF.IFD[];
	try {
		ifds = UTIF.decode(buffer);
	} catch {
		throw new ImageFormatError('CORRUPT_FILE');
	}
	const ifd = ifds[0];
	if (!ifd) throw new ImageFormatError('CORRUPT_FILE');
	UTIF.decodeImage(buffer, ifd);
	const { width, height } = ifd;
	const bits = tag(ifd, 258)?.[0] ?? 1;
	const samples = tag(ifd, 277)?.[0] ?? tag(ifd, 258)?.length ?? 1;
	const photometric = tag(ifd, 262)?.[0] ?? 1;
	const planar = tag(ifd, 284)?.[0] ?? 1;
	if (planar !== 1) throw new ImageFormatError('UNSUPPORTED_LAYOUT', { planar });

	const direct = (bits === 8 || bits === 16) && (photometric === 0 || photometric === 1 || photometric === 2);
	let image: RasterImage;
	if (direct) {
		const channels: 1 | 3 = photometric === 2 ? 3 : 1;
		if (samples < channels) throw new ImageFormatError('UNSUPPORTED_LAYOUT', { samples });
		const total = width * height;
		const data = new Float32Array(total * channels);
		const raw = ifd.data;
		const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
		const max = bits === 16 ? 65535 : 255;
		for (let i = 0; i < total; i++) {
			for (let c = 0; c < channels; c++) {
				const index = i * samples + c;
				const value = bits === 16 ? view.getUint16(index * 2, true) : raw[index]!;
				// WhiteIsZero (0) invierte el gris.
				data[i * channels + c] = photometric === 0 ? 1 - value / max : value / max;
			}
		}
		image = { width, height, channels, bitDepth: bits, data };
	} else {
		// Otros casos (paleta, JPEG interno, 1 bit): se usa la conversion de utif2 a 8 bits.
		const rgba = UTIF.toRGBA8(ifd);
		const data = new Float32Array(width * height * 3);
		for (let i = 0; i < width * height; i++) {
			for (let c = 0; c < 3; c++) data[i * 3 + c] = rgba[i * 4 + c]! / 255;
		}
		image = { width, height, channels: 3, bitDepth: 8, data };
	}

	// XResolution es RATIONAL: utif2 lo entrega como [[numerador, denominador]].
	const rational = ifd['t282'] as unknown;
	const pair = Array.isArray(rational) ? (rational[0] as unknown) : undefined;
	const resolution = Array.isArray(pair) ? Number(pair[0]) / Number(pair[1] || 1) : Number(pair);
	const unit = tag(ifd, 296)?.[0] ?? 2;
	if (Number.isFinite(resolution) && resolution > 0) {
		image.dpi = Math.round(unit === 3 ? resolution * 2.54 : resolution);
	}
	return image;
}
