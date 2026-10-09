/**
 * Conversiones de color para medir copias de cianotipo.
 *
 * - L* (CIE 1976, D65) desde sRGB: la respuesta objetivo es lineal en L*.
 * - Densidad roja: el azul de Prusia absorbe sobre todo en el rojo, por lo que la densidad
 *   del canal R tiene mas rango que L* (equivalente aproximado a densitometria Status A roja).
 */

export function srgbToLinear(value: number): number {
	return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

export function linearToSrgb(value: number): number {
	const v = Math.min(Math.max(value, 0), 1);
	return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
}

/** Luminancia relativa Y (0..1) desde sRGB codificado. */
export function srgbToY(r: number, g: number, b: number): number {
	return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

export function yToLightness(y: number): number {
	const e = 216 / 24389;
	const k = 24389 / 27;
	return y > e ? 116 * Math.cbrt(y) - 16 : k * y;
}

export function lightnessToY(lightness: number): number {
	const f = (lightness + 16) / 116;
	return lightness > 8 ? f * f * f : (lightness * 27) / 24389;
}

export function srgbToLightness(r: number, g: number, b: number): number {
	return yToLightness(srgbToY(r, g, b));
}

/** Densidad optica del canal rojo (−log10 de la reflectancia lineal). */
export function redDensity(r: number): number {
	return -Math.log10(Math.max(srgbToLinear(r), 1e-5));
}
