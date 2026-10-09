/**
 * Seleccion adaptativa de puntos de anclaje para formatos que guardan pocos puntos (.acv).
 *
 * Photoshop vuelve a interpolar los puntos con su propia spline. Se agregan puntos de forma
 * voraz donde la spline cubica natural (aproximacion del comportamiento de Photoshop) mas se
 * aleja de la curva real, hasta bajar del error tolerado o llegar al maximo de puntos.
 */
import { naturalCubic } from '../math/interpolate';

export type Anchor = readonly [input: number, output: number];

export interface AnchorOptions {
	/** Maximo de puntos (Photoshop acepta 2..19; 16 deja margen para editar a mano). */
	maxPoints?: number;
	/** Error maximo tolerado en niveles 0..255. */
	tolerance?: number;
}

export interface AnchorResult {
	anchors: Anchor[];
	/** Error maximo de la spline sobre los 256 niveles, en niveles 0..255. */
	maxError: number;
}

export function selectAnchors(samples: ArrayLike<number>, options: AnchorOptions = {}): AnchorResult {
	const maxPoints = Math.min(Math.max(options.maxPoints ?? 16, 2), 19);
	const tolerance = options.tolerance ?? 0.5;
	if (samples.length !== 256) throw new Error('selectAnchors: se esperan 256 muestras');
	const target = Array.from(samples, (v) => clampByte(v));

	const chosen = new Set<number>([0, 255]);
	let evaluation = evaluate(chosen, target);
	while (evaluation.maxError > tolerance && chosen.size < maxPoints) {
		chosen.add(evaluation.worst);
		evaluation = evaluate(chosen, target);
	}
	const xs = [...chosen].sort((a, b) => a - b);
	return {
		anchors: xs.map((x) => [x, Math.round(target[x]!)] as const),
		maxError: evaluation.maxError
	};
}

function evaluate(chosen: Set<number>, target: readonly number[]): { maxError: number; worst: number } {
	const xs = [...chosen].sort((a, b) => a - b);
	const spline = naturalCubic(
		xs,
		xs.map((x) => Math.round(target[x]!))
	);
	let maxError = 0;
	let worst = 0;
	for (let x = 0; x < 256; x++) {
		if (chosen.has(x)) continue;
		const error = Math.abs(clampByte(spline(x)) - target[x]!);
		if (error > maxError) {
			maxError = error;
			worst = x;
		}
	}
	return { maxError, worst };
}

function clampByte(value: number): number {
	return Math.min(Math.max(value, 0), 255);
}
