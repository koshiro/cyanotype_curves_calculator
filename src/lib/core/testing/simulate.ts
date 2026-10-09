/**
 * Simulacion del ciclo fisico para tests: negativo → copia de cianotipo → escaneo.
 *
 * La copia se colorea con un tinte azul de Prusia que conserva exactamente la luminancia del
 * L* simulado, de modo que lo medido se puede comparar con la verdad.
 */
import { lightnessToY, linearToSrgb } from '../image/color';
import { createImage, sampleBilinear, type RasterImage } from '../image/types';
import type { TargetLayout } from '../target/layout';
import { mulberry32 } from '../target/random';
import { renderTarget } from '../target/render';
import { syntheticResponse } from './synthetic';

export interface ScanSimulation {
	/** Respuesta L*(n) del papel. Por defecto la sigmoide sintetica de los tests. */
	response?: (value: number) => number;
	/** Gradiente de exposicion: ΔL* por mm a lo ancho de la hoja (solo afecta tonos medios). */
	exposureGradient?: number;
	rotationDegrees?: number;
	/** Pixeles de escaneo por pixel del target. */
	scale?: number;
	mirror?: boolean;
	/** σ del ruido gaussiano en valores sRGB 0..1. */
	noise?: number;
	seed?: number;
	/** Escanear el negativo en vez de la copia (polaridad normal, gris neutro). */
	scanNegative?: boolean;
}

/** Tinte de Prusia (proporciones lineales R:G:B) normalizado a luminancia 1. */
const TINT = (() => {
	const raw = [0.55, 0.92, 1];
	const y = 0.2126 * raw[0]! + 0.7152 * raw[1]! + 0.0722 * raw[2]!;
	return raw.map((v) => v / y);
})();

export function simulateScan(layout: TargetLayout, options: ScanSimulation = {}): RasterImage {
	const response = options.response ?? syntheticResponse();
	const negative = renderTarget(layout);
	const mmPerPx = 25.4 / layout.dpi;

	// Plano de L* de la copia (o del negativo escaneado) en resolucion del target.
	const plane = new Float32Array(layout.width * layout.height);
	for (let y = 0; y < layout.height; y++) {
		for (let x = 0; x < layout.width; x++) {
			const n = negative[y * layout.width + x]!;
			if (options.scanNegative) {
				plane[y * layout.width + x] = 20 + (n / 255) * 75;
				continue;
			}
			const base = response(n);
			// El gradiente pesa mas en tonos medios: el papel blanco y Dmax casi no responden.
			const sensitivity = 1 - Math.abs((base - 60) / 35) ** 2;
			const shift = (options.exposureGradient ?? 0) * (x * mmPerPx - (layout.width * mmPerPx) / 2);
			plane[y * layout.width + x] = base - Math.max(sensitivity, 0) * shift;
		}
	}

	const scale = options.scale ?? 1;
	const angle = ((options.rotationDegrees ?? 0) * Math.PI) / 180;
	const cos = Math.cos(angle);
	const sin = Math.sin(angle);
	const w = Math.abs(layout.width * cos) + Math.abs(layout.height * sin);
	const h = Math.abs(layout.width * sin) + Math.abs(layout.height * cos);
	const pad = 40;
	const outW = Math.ceil(w * scale) + 2 * pad;
	const outH = Math.ceil(h * scale) + 2 * pad;
	const image = createImage(outW, outH, 3, 16);
	const random = mulberry32(options.seed ?? 1);
	const gauss = () => {
		const u = Math.max(random(), 1e-12);
		return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random());
	};
	const lidL = 96; // tapa del escaner, algo mas clara que el papel

	for (let sy = 0; sy < outH; sy++) {
		for (let sx = 0; sx < outW; sx++) {
			// Escaneo → coordenadas del target (inversa de: espejo, giro y escala sobre el centro).
			const dx = (sx + 0.5 - outW / 2) / scale;
			const dy = (sy + 0.5 - outH / 2) / scale;
			let tx = cos * dx + sin * dy;
			const ty = -sin * dx + cos * dy;
			if (options.mirror) tx = -tx;
			const px = tx + layout.width / 2;
			const py = ty + layout.height / 2;
			const inside = px >= 0 && py >= 0 && px < layout.width && py < layout.height;
			const lightness = inside ? sampleBilinear(plane, layout.width, layout.height, px, py) : lidL;
			const yLin = lightnessToY(lightness);
			const i = (sy * outW + sx) * 3;
			for (let c = 0; c < 3; c++) {
				const linear = options.scanNegative || !inside ? yLin : yLin * TINT[c]!;
				const noisy = linearToSrgb(linear) + (options.noise ?? 0) * gauss();
				image.data[i + c] = Math.min(Math.max(noisy, 0), 1);
			}
		}
	}
	return image;
}
