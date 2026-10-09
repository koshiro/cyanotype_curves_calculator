/**
 * Medicion de los parches en el escaneo ya ubicado.
 *
 * Cada parche se muestrea en su zona central (para evitar bordes y sangrado) siguiendo la
 * homografia, se convierte a L* y a densidad roja, y se resume con la mediana (robusta a
 * polvo y rayas). El peso refleja la uniformidad interna del parche respecto del resto.
 */
import { redDensity, srgbToLightness } from '../image/color';
import { applyHomography, type Homography } from '../image/homography';
import { sampleBilinear, type RasterImage } from '../image/types';
import type { MeasuredPatch } from '../curve/types';
import { patchCenterMm, type LayoutPatch, type TargetLayout } from '../target/layout';

export interface PatchMeasurement {
	patch: LayoutPatch;
	lightness: number;
	redDensity: number;
	/** Dispersion robusta (1.4826·MAD) de L* dentro del parche. */
	spread: number;
	samples: number;
	centerMm: [number, number];
}

export interface MeasureOptions {
	/** Fraccion del lado del parche que se mide, centrada (por defecto 0.6). */
	innerFraction?: number;
	/** Muestras por lado (por defecto segun el tamano del parche en el escaneo, 6..24). */
	grid?: number;
}

export function measurePatches(
	image: RasterImage,
	layout: TargetLayout,
	homography: Homography,
	options: MeasureOptions = {}
): PatchMeasurement[] {
	const inner = options.innerFraction ?? 0.6;
	if (!(inner > 0 && inner <= 1)) throw new RangeError('innerFraction debe estar en (0, 1]');
	const { width, height, channels, data } = image;

	return layout.patches.map((patch) => {
		// Los parches son cuadrados: el lado sale del ancho de la caja.
		const [x0, y0, x1] = patch.box;
		const side = x1 - x0;
		const [ax, ay] = applyHomography(homography, [x0, y0]);
		const [bx, by] = applyHomography(homography, [x1, y0]);
		const sidePx = Math.hypot(bx - ax, by - ay);
		const grid = options.grid ?? Math.min(24, Math.max(6, Math.round((sidePx * inner) / 2)));
		const shrink = (side * (1 - inner)) / 2;

		const lightness: number[] = [];
		const red: number[] = [];
		for (let i = 0; i < grid; i++) {
			for (let j = 0; j < grid; j++) {
				const lx = x0 + shrink + ((j + 0.5) / grid) * side * inner;
				const ly = y0 + shrink + ((i + 0.5) / grid) * side * inner;
				const [sx, sy] = applyHomography(homography, [lx, ly]);
				if (channels === 1) {
					const g = sampleBilinear(data, width, height, sx, sy);
					lightness.push(srgbToLightness(g, g, g));
					red.push(redDensity(g));
				} else {
					const r = sampleBilinear(data, width, height, sx, sy, 3, 0);
					const g = sampleBilinear(data, width, height, sx, sy, 3, 1);
					const b = sampleBilinear(data, width, height, sx, sy, 3, 2);
					lightness.push(srgbToLightness(r, g, b));
					red.push(redDensity(r));
				}
			}
		}
		const center = median(lightness);
		return {
			patch,
			lightness: center,
			redDensity: median(red),
			spread: 1.4826 * median(lightness.map((v) => Math.abs(v - center))),
			samples: lightness.length,
			centerMm: patchCenterMm(layout, patch)
		};
	});
}

/**
 * Convierte mediciones en parches para calibrar. El peso es relativo: 1 para un parche con
 * la dispersion interna tipica, menor para uno ruidoso (polvo, raya), acotado a [0.25, 4].
 */
export function toMeasuredPatches(measurements: readonly PatchMeasurement[]): MeasuredPatch[] {
	const typical = Math.max(median(measurements.map((m) => m.spread)), 1e-3);
	return measurements.map((m) => ({
		value: m.patch.value,
		lightness: Math.min(Math.max(m.lightness, 0), 100),
		weight: Math.min(Math.max((typical / Math.max(m.spread, 1e-3)) ** 2, 0.25), 4),
		positionMm: m.centerMm
	}));
}

export function median(values: readonly number[]): number {
	if (values.length === 0) return Number.NaN;
	const sorted = [...values].sort((a, b) => a - b);
	const mid = sorted.length >> 1;
	return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}
