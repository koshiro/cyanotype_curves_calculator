/**
 * Negativo digital de una foto: tono positivo → curva de correccion → inversion.
 *
 * Trabaja en 16 bits para no introducir bandas: el tono positivo se interpola sobre las 256
 * muestras de la curva. La foto se pasa a gris con la luminancia (codificada sRGB), que es lo
 * que haria un editor al convertir a escala de grises antes de aplicar la curva.
 */
import { linearToSrgb, srgbToLinear } from '../image/color';
import type { RasterImage } from '../image/types';

export interface NegativeOptions {
	/** Espejar horizontalmente (para exponer con la tinta del acetato contra el papel). */
	mirror?: boolean;
}

export interface NegativeImage {
	width: number;
	height: number;
	/** Gris de 16 bits: valor del negativo n escalado a 0..65535. */
	data: Uint16Array;
}

/** Interpola n(p) para un tono positivo continuo p en 0..255 a partir de 256 muestras. */
export function negativeAt(negative: ArrayLike<number>, p: number): number {
	const x = Math.min(Math.max(p, 0), 255);
	const i = Math.min(Math.floor(x), 254);
	const t = x - i;
	return negative[i]! + t * (negative[i + 1]! - negative[i]!);
}

/** Tono positivo (0..255, sRGB) de un pixel a partir de su luminancia. */
export function positiveTone(image: RasterImage, index: number): number {
	const { data, channels } = image;
	if (channels === 1) return data[index]! * 255;
	const o = index * 3;
	const y =
		0.2126 * srgbToLinear(data[o]!) +
		0.7152 * srgbToLinear(data[o + 1]!) +
		0.0722 * srgbToLinear(data[o + 2]!);
	return linearToSrgb(y) * 255;
}

/**
 * Convierte una foto positiva en el negativo listo para imprimir. `negative` son las 256
 * muestras n(p) de la curva (valor del negativo para cada tono positivo).
 */
export function makeNegative(
	image: RasterImage,
	negative: ArrayLike<number>,
	options: NegativeOptions = {}
): NegativeImage {
	if (negative.length !== 256) throw new Error('makeNegative: se esperan 256 muestras de la curva');
	const { width, height } = image;
	const out = new Uint16Array(width * height);
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const source = y * width + x;
			const target = y * width + (options.mirror ? width - 1 - x : x);
			const n = negativeAt(negative, positiveTone(image, source));
			out[target] = Math.round((Math.min(Math.max(n, 0), 255) / 255) * 65535);
		}
	}
	return { width, height, data: out };
}
