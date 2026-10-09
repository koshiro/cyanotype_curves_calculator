/**
 * Dibujo del target como imagen de 8 bits en escala de grises, lista para imprimir como
 * negativo: cada pixel es directamente el valor `n` del negativo (0 = maxima tinta).
 */
import { markerInk, MARKER_MODULES } from './markers';
import type { TargetLayout } from './layout';

/** Valor del fondo: acetato sin tinta (maxima exposicion). */
export const BACKGROUND_VALUE = 255;

export function renderTarget(layout: TargetLayout): Uint8Array {
	const { width, height } = layout;
	const pixels = new Uint8Array(width * height).fill(BACKGROUND_VALUE);

	for (const patch of layout.patches) {
		const [x0, y0, x1, y1] = patch.box;
		for (let y = Math.max(y0, 0); y < Math.min(y1, height); y++) {
			pixels.fill(patch.value, y * width + Math.max(x0, 0), y * width + Math.min(x1, width));
		}
	}

	for (const marker of layout.markers) {
		const half = marker.size / 2;
		const left = marker.center[0] - half;
		const top = marker.center[1] - half;
		const module = marker.size / MARKER_MODULES;
		for (let y = Math.floor(top); y < Math.ceil(top + marker.size); y++) {
			for (let x = Math.floor(left); x < Math.ceil(left + marker.size); x++) {
				if (x < 0 || y < 0 || x >= width || y >= height) continue;
				// Muestreo en el centro del pixel: el borde de cada modulo cae donde corresponde.
				const column = Math.floor((x + 0.5 - left) / module);
				const row = Math.floor((y + 0.5 - top) / module);
				if (row < 0 || column < 0 || row >= MARKER_MODULES || column >= MARKER_MODULES) continue;
				pixels[y * width + x] = markerInk(marker.id, row, column) ? 0 : BACKGROUND_VALUE;
			}
		}
	}
	return pixels;
}
